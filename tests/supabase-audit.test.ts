import { describe, expect, it } from 'vitest';
import { auditSupabase } from '../scripts/supabase-audit.mjs';

/**
 * The migration checks must work without touching a real database: the
 * fetch is replaced by a script that answers what each scenario would
 * return.
 */

type Route = { match: (url: string, init?: RequestInit) => boolean; respond: (init?: RequestInit) => { status: number; body: unknown } };

function fakeFetch(routes: Route[]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const impl = async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes.find(candidate => candidate.match(url, init));
    if (!route) return { status: 404, ok: false, text: async () => JSON.stringify({ message: 'not found' }) } as unknown as Response;
    const { status, body } = route.respond(init);
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  };
  return { impl, calls };
}

const URL_BASE = 'https://paper.supabase.co';

function baseRoutes(overrides: Route[] = []): Route[] {
  return [
    {
      match: url => url.includes('/rest/v1/reader_jobs?select='),
      respond: () => ({ status: 200, body: [] }),
    },
    {
      match: url => url.includes('/rest/v1/ai_quotas_global?select='),
      respond: () => ({ status: 200, body: [] }),
    },
    {
      match: url => url.includes('/rest/v1/rpc/claim_reader_job'),
      respond: () => ({ status: 200, body: 'claimed' }),
    },
    {
      match: url => url.includes('/rest/v1/rpc/finish_reader_job'),
      respond: () => ({ status: 200, body: null }),
    },
    {
      match: url => url.includes('/rest/v1/rpc/consume_ai_quota'),
      respond: () => ({ status: 200, body: false }),
    },
    {
      match: url => url.includes('/rest/v1/articles?select=id,published'),
      respond: () => ({ status: 200, body: [{ id: 'a1', published: true }] }),
    },
    {
      match: url => url.includes('/rest/v1/editions?select=id,published'),
      respond: () => ({ status: 200, body: [{ id: 'e1', published: true }] }),
    },
    ...overrides,
  ];
}

const options = { url: URL_BASE, anonKey: 'anon', serviceKey: 'service' };

describe('migration audit', () => {
  it('passes when the tables, the functions and the rules are in place', async () => {
    const { impl } = fakeFetch([
      ...baseRoutes(),
      {
        match: url => url.includes('/rest/v1/profiles?select='),
        respond: () => ({ status: 200, body: [{ id: 'u1', email: 'editor@example.test', role: 'editor', active: true }] }),
      },
      {
        match: url => url.includes('/rest/v1/articles?select=id,title,published,author_id'),
        respond: () => ({ status: 200, body: [{ id: 'a2', published: true, author_id: 'u2' }] }),
      },
      { match: url => url.includes('/auth/v1/admin/generate_link'), respond: () => ({ status: 200, body: { hashed_token: 'tok' } }) },
      { match: url => url.includes('/auth/v1/verify'), respond: () => ({ status: 200, body: { access_token: 'jwt' } }) },
      // La actualización no devuelve filas: la regla está activa.
      { match: url => url.includes('/rest/v1/articles?id=eq.'), respond: () => ({ status: 200, body: [] }) },
    ]);
    const checks = await auditSupabase({ ...options, fetchImpl: impl as unknown as typeof fetch });
    const failures = checks.filter(check => check.status === 'fail');
    expect(failures, JSON.stringify(checks)).toEqual([]);
    expect(checks.find(check => check.name.includes('Regla de propiedad'))?.status).toBe('ok');
    expect(checks.find(check => check.name.includes('Borradores'))?.status).toBe('ok');
  });

  it('fails when an editor manages to change the article of somebody else', async () => {
    const { impl } = fakeFetch([
      ...baseRoutes(),
      {
        match: url => url.includes('/rest/v1/profiles?select='),
        respond: () => ({ status: 200, body: [{ id: 'u1', email: 'editor@example.test', role: 'editor', active: true }] }),
      },
      {
        match: url => url.includes('/rest/v1/articles?select=id,title,published,author_id'),
        respond: () => ({ status: 200, body: [{ id: 'a2', published: true, author_id: 'u2' }] }),
      },
      { match: url => url.includes('/auth/v1/admin/generate_link'), respond: () => ({ status: 200, body: { hashed_token: 'tok' } }) },
      { match: url => url.includes('/auth/v1/verify'), respond: () => ({ status: 200, body: { access_token: 'jwt' } }) },
      // La regla falta: el editor sí pudo tocarlo.
      { match: url => url.includes('/rest/v1/articles?id=eq.'), respond: () => ({ status: 200, body: [{ id: 'a2' }] }) },
    ]);
    const checks = await auditSupabase({ ...options, fetchImpl: impl as unknown as typeof fetch });
    const failure = checks.find(check => check.name.includes('Regla de propiedad'));
    expect(failure?.status).toBe('fail');
    expect(failure?.detail).toContain('20261111000100_content_ownership.sql');
  });

  it('only warns when there is no editor yet to test with', async () => {
    const { impl } = fakeFetch([
      ...baseRoutes(),
      {
        match: url => url.includes('/rest/v1/profiles?select='),
        respond: () => ({ status: 200, body: [{ id: 'u9', email: 'boss@example.test', role: 'admin', active: true }] }),
      },
      {
        match: url => url.includes('/rest/v1/articles?select=id,title,published,author_id'),
        respond: () => ({ status: 200, body: [] }),
      },
    ]);
    const checks = await auditSupabase({ ...options, fetchImpl: impl as unknown as typeof fetch });
    const ownership = checks.find(check => check.name.includes('Regla de propiedad'));
    expect(ownership?.status).toBe('warn');
    expect(checks.filter(check => check.status === 'fail')).toEqual([]);
  });

  it('fails when a draft is visible to an anonymous visitor', async () => {
    const { impl } = fakeFetch([
      // La primera coincidencia gana: aquí se simula un borrador visible.
      {
        match: url => url.includes('/rest/v1/articles?select=id,published'),
        respond: () => ({ status: 200, body: [{ id: 'a1', published: false }] }),
      },
      ...baseRoutes(),
    ]);
    const checks = await auditSupabase({ ...options, fetchImpl: impl as unknown as typeof fetch });
    const leak = checks.find(check => check.name.includes('Borradores ocultos al público (articles)'));
    expect(leak?.status).toBe('fail');
  });

  it('fails when a migration table is missing', async () => {
    const { impl } = fakeFetch([
      ...baseRoutes().filter(route => !route.match(`${URL_BASE}/rest/v1/reader_jobs?select=`)),
      {
        match: url => url.includes('/rest/v1/reader_jobs?select='),
        respond: () => ({ status: 404, body: { message: 'relation does not exist' } }),
      },
    ]);
    const checks = await auditSupabase({ ...options, fetchImpl: impl as unknown as typeof fetch });
    const table = checks.find(check => check.name === 'Tabla reader_jobs');
    expect(table?.status).toBe('fail');
    expect(table?.detail).toContain('supabase/migrations/');
  });

  it('cleans the row it creates while testing the reader queue', async () => {
    const { impl, calls } = fakeFetch(baseRoutes());
    await auditSupabase({ ...options, fetchImpl: impl as unknown as typeof fetch });
    expect(calls.some(call => call.method === 'DELETE' && call.url.includes('reader_jobs'))).toBe(true);
    expect(calls.some(call => call.method === 'POST' && call.url.includes('finish_reader_job'))).toBe(true);
  });
});
