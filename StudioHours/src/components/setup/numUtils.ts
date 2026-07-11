// Small parsing guards for the number inputs across Setup panels: empty text
// means "clear to null" for optional business fields, and non-numeric junk
// falls back rather than corrupting stored data.

export function numOrNull(raw: string, fallback: number | null): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

export function numOr(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}
