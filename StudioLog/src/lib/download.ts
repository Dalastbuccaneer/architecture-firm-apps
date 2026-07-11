/** Trigger a file download. MUST be called synchronously inside a click handler —
 *  Safari invalidates user activation after an await, and Chrome blocks
 *  non-gesture downloads. Build content BEFORE awaiting anything, or gather the
 *  data first and call this from a plain onClick. (Ported from StudioHours.) */
export function downloadText(fileName: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
