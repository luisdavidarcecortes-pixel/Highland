/**
 * Pure helpers for the AI-generated issue description.
 *
 * Gemini does not reliably respect the 22-word request and sometimes stops in
 * the middle of a sentence. Discarding those summaries left the upload form
 * without a description, so the route repairs/trims them instead.
 */

export const DESCRIPTION_MAX_LENGTH = 280;

/** A word that means the model stopped before finishing the sentence. */
const TRAILING_CONNECTOR =
  /(?:^|\s)(?:according to|such as|including|and|or|but|yet|so|to|of|with|for|from|in|on|at|by|as|that|which|who|while|when|where)[\s,;:.!?…–—-]*$/i;

const TRAILING_SEPARATORS = /[\s,;:–—-]+$/;

function collapseWhitespace(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Turns a raw Gemini summary into a usable one-sentence description.
 *
 * Returns null only when there is nothing salvageable, so a complete sentence
 * with 23+ words (or a missing final period) no longer becomes an empty field.
 */
export function normalizeDescription(value: unknown): string | null {
  // Models occasionally wrap the value in quotes despite the JSON mode.
  let text = collapseWhitespace(value).replace(/^["“”]+|["“”]+$/g, '').trim();
  if (!text) return null;

  // Drop a dangling connector ("... literacy. According to") and keep the
  // previous complete sentence. Repeat in case it ends with a chain such as
  // "... for and".
  let previous: string;
  do {
    previous = text;
    text = text.replace(TRAILING_CONNECTOR, '').trim();
  } while (text !== previous && text.length > 0);

  text = text.replace(TRAILING_SEPARATORS, '').trim();
  if (!text) return null;

  if (text.length > DESCRIPTION_MAX_LENGTH) {
    const window = text.slice(0, DESCRIPTION_MAX_LENGTH + 1);
    const sentenceEnd = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? ')
    );
    if (sentenceEnd >= 40) {
      text = text.slice(0, sentenceEnd + 1);
    } else {
      const space = text.lastIndexOf(' ', DESCRIPTION_MAX_LENGTH);
      text = text.slice(0, space > 0 ? space : DESCRIPTION_MAX_LENGTH).trim();
    }
  }

  text = text.replace(TRAILING_SEPARATORS, '').trim();
  if (!text) return null;

  // An ellipsis is not a finished sentence for autofill.
  if (text.endsWith('…')) text = `${text.slice(0, -1).trimEnd()}.`;
  if (!/[.!?]$/.test(text)) text = `${text}.`;
  return text;
}

/**
 * Cuts text for the AI prompt without splitting the middle of a word.
 *
 * Prefers the last complete sentence, then a line break, and only then a
 * space. This keeps Gemini from continuing a sentence the app cut in half.
 */
export function clipAtBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;

  const window = text.slice(0, limit + 1);
  const sentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? ')
  );
  const half = Math.floor(limit / 2);
  if (sentenceEnd >= half) return text.slice(0, sentenceEnd + 1);

  const newline = window.lastIndexOf('\n');
  if (newline >= half) return text.slice(0, newline);

  const space = text.lastIndexOf(' ', limit);
  return text.slice(0, space > 0 ? space : limit);
}
