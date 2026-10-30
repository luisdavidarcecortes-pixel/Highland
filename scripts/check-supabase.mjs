#!/usr/bin/env node
/**
 * Preflight for the Supabase setup.
 *
 * Reads the same variables as the app, without printing any key, and checks:
 * project reachability, the public (anon/publishable) key, the secret
 * (service_role) key, the three tables, the storage bucket and the admin API.
 *
 * Usage: npm run supabase:check
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');

function parseEnvFile(path) {
  const values = {};
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

const fileEnv = parseEnvFile(envPath);
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const anonKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
).trim();
const serviceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? ''
).trim();

const checks = [];
const record = (status, name, detail = '') => checks.push({ status, name, detail });
const ok = (name, detail) => record('ok', name, detail);
const fail = (name, detail) => record('fail', name, detail);
const warn = (name, detail) => record('warn', name, detail);

if (!url || !anonKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.');
  console.error('Sigue supabase/SETUP.md y vuelve a ejecutar npm run supabase:check.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`NEXT_PUBLIC_SUPABASE_URL no es una URL válida: ${url}`);
  process.exit(1);
}
if (!parsed.hostname.endsWith('.supabase.co')) {
  warn('URL del proyecto', `no termina en .supabase.co (${parsed.hostname}); puede ser self-hosted.`);
}

function errorDetail(error) {
  return error?.cause?.code ?? error?.code ?? error?.message ?? 'error de red';
}

async function api(path, key, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* Not JSON: the status tells the story. */
  }
  return { response, json, text };
}

function describe(result) {
  const message =
    result?.json?.message ?? result?.json?.error_description ?? result?.json?.error;
  return message ? `${result.response.status}: ${message}` : `HTTP ${result.response.status}`;
}

// 1) Is the project reachable at all?
try {
  const result = await api('/auth/v1/health', anonKey);
  if (result.response.ok) ok('Proyecto accesible', parsed.hostname);
  else fail('Proyecto accesible', describe(result));
} catch (error) {
  fail('Proyecto accesible', `no se pudo conectar (${errorDetail(error)})`);
}

// 2) Public key and schema (anonymous reads go through RLS).
try {
  const result = await api('/rest/v1/editions?select=id&limit=1', anonKey);
  if (result.response.ok) ok('Clave pública (anon/publishable)', 'aceptada');
  else if (result.response.status === 401 || result.response.status === 403) {
    fail('Clave pública (anon/publishable)', `rechazada. ${describe(result)}`);
  } else if (result.response.status === 404) {
    fail('Esquema aplicado', `la tabla editions no existe. ${describe(result)}`);
  } else fail('Clave pública (anon/publishable)', describe(result));
} catch (error) {
  fail('Clave pública (anon/publishable)', errorDetail(error));
}

// 3) Service key: only server-side, but required for invites and cleanups.
if (!serviceKey) {
  warn('Clave secreta (service_role)', 'no configurada; invitar editores y limpiar archivos fallará.');
} else {
  try {
    const result = await api('/rest/v1/profiles?select=id&limit=1', serviceKey);
    if (result.response.ok) ok('Clave secreta (service_role)', 'aceptada');
    else fail('Clave secreta (service_role)', describe(result));
  } catch (error) {
    fail('Clave secreta (service_role)', errorDetail(error));
  }
}

// 4) Tables created by supabase/schema.sql.
if (serviceKey) {
  for (const table of ['profiles', 'editions', 'articles']) {
    try {
      const result = await api(`/rest/v1/${table}?select=id&limit=1`, serviceKey);
      if (result.response.ok) ok(`Tabla ${table}`, 'existe');
      else fail(`Tabla ${table}`, describe(result));
    } catch (error) {
      fail(`Tabla ${table}`, errorDetail(error));
    }
  }
}

// 5) Storage bucket used by covers, PDFs and photos.
if (serviceKey) {
  try {
    const result = await api('/storage/v1/bucket/newspaper', serviceKey);
    if (result.response.ok) ok('Bucket "newspaper"', 'existe');
    else if (result.response.status === 404 || result.response.status === 400) {
      fail('Bucket "newspaper"', 'no existe; vuelve a ejecutar supabase/schema.sql.');
    } else fail('Bucket "newspaper"', describe(result));
  } catch (error) {
    fail('Bucket "newspaper"', errorDetail(error));
  }

  // 6) Admin API: invitations and password resets depend on it.
  try {
    const result = await api('/auth/v1/admin/users?per_page=1', serviceKey);
    if (result.response.ok) ok('API de administración', 'disponible');
    else fail('API de administración', describe(result));
  } catch (error) {
    fail('API de administración', errorDetail(error));
  }
}

for (const check of checks) {
  const icon = check.status === 'ok' ? 'OK  ' : check.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${icon} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
}

const failures = checks.filter((check) => check.status === 'fail');
console.log('');
if (failures.length > 0) {
  console.log(`Quedan ${failures.length} problema(s). Revisa supabase/SETUP.md y vuelve a intentarlo.`);
  process.exit(1);
}
console.log('Supabase está listo: la web ya no arrancará en modo demo.');
console.log('Siguiente paso: crea el primer admin (Authentication → Users) y ejecuta:');
console.log("  update public.profiles set role = 'admin' where email = 'tu-correo';");
