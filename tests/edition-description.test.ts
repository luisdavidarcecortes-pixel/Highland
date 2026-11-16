import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/analyze-edition/route';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/lib/ai-access', () => ({ requireAiAccess: async () => null }));
vi.mock('@/lib/gemini', () => ({
  generateGeminiJson: generate,
  GEMINI_FALLBACK_MODEL: 'test-fallback',
  GeminiError: class GeminiError extends Error {
    status = 502;
  },
}));
beforeEach(() => generate.mockReset());
afterEach(() => vi.unstubAllEnvs());

function post(text = 'October features student projects and fall events.') {
  vi.stubEnv('GEMINI_API_KEY', 'test');
  return POST(new NextRequest('http://localhost/api/analyze-edition', {
    method: 'POST', body: JSON.stringify({ text }),
  }));
}

it.each([
  ['Parton’s generosity extended beyond literacy. According to', 'Parton’s generosity extended beyond literacy.'],
  ['The October issue covers student projects and fall events.', 'The October issue covers student projects and fall events.'],
  [
    'This issue covers the fall play, the solar car project, the volleyball championship, several student clubs, and the new library opening on campus today.',
    'This issue covers the fall play, the solar car project, the volleyball championship, several student clubs, and the new library opening on campus today.',
  ],
  ['The October issue covers student projects and fall events', 'The October issue covers student projects and fall events.'],
])('repairs an imperfect description instead of dropping it', async (description, expected) => {
  generate.mockResolvedValueOnce(JSON.stringify({ description }));
  const response = await post();
  expect(response.status).toBe(200);
  expect((await response.json()).description).toBe(expected);
});

it('asks Gemini again when the first answer has no description', async () => {
  generate
    .mockResolvedValueOnce(JSON.stringify({ title: 'October', description: null }))
    .mockResolvedValueOnce(JSON.stringify({
      description: 'Students explore projects and fall events in the October issue.',
    }));

  const response = await post();

  expect(response.status).toBe(200);
  expect((await response.json()).description).toBe(
    'Students explore projects and fall events in the October issue.'
  );
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0]).toMatchObject({ models: ['test-fallback'] });
});
