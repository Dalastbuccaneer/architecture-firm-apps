// Safe URL normalization shared by the project file-links section and the note
// photo-link path. Pure (no React, no Dexie) so it is unit-testable straight
// from Node — see test-deadlines.mjs.
//
// Choice (C1): a disallowed scheme is STRIPPED and the remainder re-prefixed
// with https://, rather than rejected with an inline message. This keeps a
// single, consistent code path for both call sites (no validation UI to thread
// through two forms) and guarantees a pasted javascript:/data:/vbscript: value
// can never survive as an executable href.

/** URL schemes safe to keep verbatim on a user-pasted link. */
const SAFE_SCHEMES = ['http', 'https', 'mailto', 'tel', 'file', 'smb'];

/** Normalize a user-pasted link into a safe href:
 *  - no scheme at all  -> prefix `https://` (bare "example.com/x" opens)
 *  - a safe scheme      -> kept as-is (http/https/mailto/tel/file/smb)
 *  - any other scheme   -> stripped and re-prefixed with `https://`, so
 *                          javascript:/data:/vbscript: can never be clickable. */
export function normalizeUrl(raw: string): string {
  const u = raw.trim();
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(u);
  if (!match) return `https://${u}`; // no scheme — existing behavior preserved
  const scheme = match[1].toLowerCase();
  if (SAFE_SCHEMES.includes(scheme)) return u; // safe scheme kept verbatim
  // Disallowed scheme: drop it (and any leading slashes) and re-prefix https://.
  return `https://${u.slice(match[0].length).replace(/^\/+/, '')}`;
}
