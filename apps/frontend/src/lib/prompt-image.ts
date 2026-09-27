/** A library image written in Markdown: `![alt](/api/v1/media/<ULID>)`. */
const IMAGE = /!\[([^\]]*)\]\(\/api\/v1\/media\/([0-9A-HJKMNP-TV-Z]{26})\)/;

/**
 * The first library image of a question's prompt, and the prompt without it —
 * what the editor offers to move to the question's media (images are no longer
 * added in the text; one already there still shows). The text is tidied where
 * the image was: no double space mid-line, no run of blank lines; a Markdown
 * line break (two spaces before a new line) is kept. Null without one.
 */
export function promptImage(prompt: string): { mediaId: string; alt: string; rest: string } | null {
  const m = IMAGE.exec(prompt);
  if (!m) return null;
  const rest = (prompt.slice(0, m.index) + prompt.slice(m.index + m[0].length))
    .replace(/(\S) {2,}(\S)/g, '$1 $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { mediaId: m[2], alt: m[1], rest };
}
