// Export/import conventions, ported from StudioHours: every file StudioLog
// writes is JSON with {schemaVersion, exportType} discriminators, and every
// parser throws ParseError with a message a person can act on. Later agents
// add their own exportTypes here (e.g. a drawing-register export) — never
// reuse an existing discriminator for a new shape.

export class ParseError extends Error {}

/** JSON.parse with a readable failure. */
export function parseJsonFile(text: string, fileName: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ParseError(`${fileName}: not valid JSON`);
  }
}

// ---- filenames --------------------------------------------------------------

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}
