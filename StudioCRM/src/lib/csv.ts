// Minimal RFC-4180-ish CSV parser + cell escaper, ported verbatim from
// StudioHours (it is app-agnostic). Nothing imports it yet — it is here for
// the Deliverables agent (drawing-register CSV import/export). Importers must
// match columns BY NAME, never by position (real-world exports vary order).

export interface CsvTable {
  headers: string[]; // original casing, trimmed
  rows: Array<Record<string, string>>; // keys lower-cased
}

export function parseCsv(text: string): CsvTable {
  const cells: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      cells.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); cells.push(row); }

  const nonEmpty = cells.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const keys = headers.map((h) => h.toLowerCase());
  const rows = nonEmpty.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => { rec[k] = (r[i] ?? '').trim(); });
    return rec;
  });
  return { headers, rows };
}

export function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
