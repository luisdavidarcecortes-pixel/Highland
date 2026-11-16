import { describe, expect, it } from 'vitest';
import { clipAtBoundary, normalizeDescription } from '../src/lib/edition-description';

describe('normalizeDescription', () => {
  it('keeps a complete sentence that exceeds the old 22-word limit', () => {
    const text =
      'This issue covers the fall play, the solar car project, the volleyball championship, several student clubs, and the new library opening on campus today.';
    expect(normalizeDescription(text)).toBe(text);
  });

  it('drops a dangling connector and keeps the previous sentence', () => {
    expect(
      normalizeDescription('Parton’s generosity extended beyond literacy. According to')
    ).toBe('Parton’s generosity extended beyond literacy.');
  });

  it('adds a missing final period', () => {
    expect(normalizeDescription('The October issue covers student projects')).toBe(
      'The October issue covers student projects.'
    );
  });

  it('removes quotes wrapping the value', () => {
    expect(normalizeDescription('“Students explore fall events.”')).toBe(
      'Students explore fall events.'
    );
  });

  it('caps long summaries at a sentence boundary', () => {
    const long = `${'This issue covers student projects and fall events. '.repeat(10)}`;
    const result = normalizeDescription(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(280);
    expect(result!.endsWith('.')).toBe(true);
  });

  it('returns null when there is nothing to keep', () => {
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription('')).toBeNull();
    expect(normalizeDescription('According to')).toBeNull();
  });
});

describe('clipAtBoundary', () => {
  it('does not split a word when the limit falls inside one', () => {
    expect(clipAtBoundary(`${'a'.repeat(20)} word`, 21)).toBe('a'.repeat(20));
  });

  it('prefers the last complete sentence', () => {
    const text = `${'x'.repeat(100)}. A sentence that would be cut`;
    expect(clipAtBoundary(text, 110)).toBe(`${'x'.repeat(100)}.`);
  });

  it('keeps short text untouched', () => {
    expect(clipAtBoundary('Short text.', 50)).toBe('Short text.');
  });
});
