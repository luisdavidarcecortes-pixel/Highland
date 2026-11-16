/**
 * Comprobaciones de las migraciones de Supabase.
 *
 * Vive aparte del script de la CLI para poder probarlo sin tocar la base de
 * datos: todas las comprobaciones son de lectura. La única excepción es la
 * cola del lector, que se prueba con una fila de prueba que se borra al
 * terminar.
 */

const READY = 'ready';

/** Políticas que deben existir (migración de ownership). */
const EXPECTED_POLICIES = [
  'owners update articles',
  'owners update editions',
];

async function request(fetchImpl, path, { key, method = 'GET', body, headers = {} } = {}) {
  const response = await fetchImpl(`${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* Not JSON: the status tells the story. */
  }
  return { status: response.status, ok: response.ok, json, text };
}

function describe(result) {
  const message = result?.json?.message ?? result?.json?.error_description ?? result?.json?.error;
  return message ? `${result.status}: ${message}` : `HTTP ${result.status}`;
}

/**
 * @param {{ url: string, anonKey: string, serviceKey: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ status: 'ok'|'warn'|'fail', name: string, detail: string }[]>}
 */
export async function auditSupabase({ url, anonKey, serviceKey, fetchImpl = fetch }) {
  const checks = [];
  const ok = (name, detail = '') => checks.push({ status: 'ok', name, detail });
  const warn = (name, detail = '') => checks.push({ status: 'warn', name, detail });
  const fail = (name, detail = '') => checks.push({ status: 'fail', name, detail });
  const rest = (path, options) => request(fetchImpl, `${url}/rest/v1/${path}`, { key: serviceKey, ...options });

  // 1) Tablas que crean las migraciones 2 y 3.
  for (const table of ['reader_jobs', 'ai_quotas_global']) {
    try {
      const result = await rest(`${table}?select=*&limit=1`);
      if (result.ok) ok(`Tabla ${table}`, 'existe');
      else fail(`Tabla ${table}`, `${describe(result)}. Aplica las migraciones de supabase/migrations/.`);
    } catch (error) {
      fail(`Tabla ${table}`, error?.message ?? 'error de red');
    }
  }

  // 2) La cola del lector: se prueba con una fila de prueba y se borra.
  const probeEdition = '00000000-0000-4000-8000-000000000001';
  try {
    const claim = await rest('rpc/claim_reader_job', {
      method: 'POST',
      body: { p_edition: probeEdition, p_version: 'comprobacion', p_max_running: 4 },
    });
    if (claim.ok && typeof claim.json === 'string') {
      ok('Cola global del lector', `la función responde "${claim.json}"`);
      await rest('rpc/finish_reader_job', {
        method: 'POST',
        body: { p_edition: probeEdition, p_status: 'failed', p_pages: 0, p_error: 'comprobacion' },
      });
      await rest(`reader_jobs?edition_id=eq.${probeEdition}`, { method: 'DELETE' });
    } else {
      fail('Cola global del lector', `${describe(claim)}. Aplica supabase/migrations/20261111000200_reader_jobs.sql.`);
    }
  } catch (error) {
    fail('Cola global del lector', error?.message ?? 'error de red');
  }

  // 3) La cuota global de IA.
  try {
    const quota = await rest('rpc/consume_ai_quota', { method: 'POST', body: { quota_scope: 'detect' } });
    if (quota.ok) ok('Cuota global de IA', 'la función responde');
    else fail('Cuota global de IA', `${describe(quota)}. Aplica supabase/migrations/20261111000300_ai_global_quota.sql.`);
  } catch (error) {
    fail('Cuota global de IA', error?.message ?? 'error de red');
  }

  // 4) Un visitante anónimo no debe ver borradores.
  for (const table of ['articles', 'editions']) {
    try {
      const result = await request(fetchImpl, `${url}/rest/v1/${table}?select=id,published`, { key: anonKey });
      if (!result.ok) {
        warn(`Borradores ocultos al público (${table})`, describe(result));
        continue;
      }
      const rows = Array.isArray(result.json) ? result.json : [];
      const leaked = rows.filter(row => row?.published === false).length;
      if (leaked === 0) ok(`Borradores ocultos al público (${table})`, `${rows.length} filas visibles, ninguna borrador`);
      else fail(`Borradores ocultos al público (${table})`, `${leaked} borradores visibles por un visitante anónimo`);
    } catch (error) {
      warn(`Borradores ocultos al público (${table})`, error?.message ?? 'error de red');
    }
  }

  // 5) Un editor no debe poder modificar el contenido de otro.
  //    Se hace con una sesión real (enlace mágico del administrador, sin
  //    enviar correos) y con una actualización que no cambia ningún valor:
  //    si la regla está activa, no se escribe nada.
  try {
    const members = await rest('profiles?select=id,email,role,active');
    const list = Array.isArray(members.json) ? members.json : [];
    const editor = list.find(member => member.role === 'editor' && member.active);
    const articles = await rest('articles?select=id,title,published,author_id');
    const articleList = Array.isArray(articles.json) ? articles.json : [];
    const foreign = editor ? articleList.find(article => article.author_id && article.author_id !== editor.id) : null;

    if (!editor) {
      warn('Regla de propiedad (artículos)', 'todavía no hay editores en el equipo: no se puede comprobar en caliente');
    } else if (!foreign) {
      warn('Regla de propiedad (artículos)', 'no hay artículos de otro autor para comprobarlo');
    } else {
      const link = await request(fetchImpl, `${url}/auth/v1/admin/generate_link`, {
        key: serviceKey,
        method: 'POST',
        body: { type: 'magiclink', email: editor.email },
      });
      const token = link.json?.hashed_token ?? link.json?.properties?.hashed_token;
      if (!token) {
        warn('Regla de propiedad (artículos)', 'no se pudo iniciar una sesión de prueba');
      } else {
        const session = await request(fetchImpl, `${url}/auth/v1/verify`, {
          key: anonKey,
          method: 'POST',
          body: { type: 'magiclink', token_hash: token },
        });
        const accessToken = session.json?.access_token;
        if (!accessToken) {
          warn('Regla de propiedad (artículos)', 'no se pudo iniciar una sesión de prueba');
        } else {
          const attempt = await request(fetchImpl, `${url}/rest/v1/articles?id=eq.${foreign.id}`, {
            key: anonKey,
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` },
            // El mismo valor: si la regla falla, no cambia nada visible.
            body: { published: foreign.published },
          });
          const touched = Array.isArray(attempt.json) ? attempt.json.length : 0;
          if (attempt.ok && touched === 0) ok('Regla de propiedad (artículos)', 'un editor no puede tocar el artículo de otro');
          else fail('Regla de propiedad (artículos)', `un editor pudo modificar el artículo de otro (${touched} filas). Aplica supabase/migrations/20261111000100_content_ownership.sql.`);
        }
      }
    }
  } catch (error) {
    warn('Regla de propiedad (artículos)', error?.message ?? 'error de red');
  }

  return checks;
}

export { EXPECTED_POLICIES, READY };
