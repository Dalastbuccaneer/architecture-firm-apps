import { useLiveQuery } from 'dexie-react-hooks';
import { Undo } from 'lucide-react';
import { db } from '../../db';
import { undoImport } from '../../lib/importEngine';
import { monthDayLabel } from '../../lib/dates';

function whenLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ImportLog() {
  const rows = useLiveQuery(() => db.importLog.orderBy('at').reverse().limit(30).toArray(), []);
  const undoable = useLiveQuery(async () => new Set((await db.importUndo.toArray()).map((r) => r.importId)), []);

  if (!rows) return null;

  const onUndo = async (importId: string) => {
    const ok = window.confirm('Undo this import? Entries it added are removed and what it replaced is restored.');
    if (ok) await undoImport(importId);
  };

  return (
    <section data-tour="import-log">
      <h2 className="mb-2 font-bold">Import log</h2>
      {rows.length === 0 ? (
        <p className="text-ink-soft">Nothing imported yet — drop your team's files above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="py-2 pr-4 font-bold">File</th>
                <th className="py-2 pr-4 font-bold">Person</th>
                <th className="py-2 pr-4 font-bold">Period</th>
                <th className="py-2 pr-4 text-right font-bold">Entries</th>
                <th className="py-2 pr-4 text-right font-bold">Replaced</th>
                <th className="py-2 pr-4 font-bold">When</th>
                <th className="py-2 pr-4 font-bold">Status</th>
                <th className="py-2 font-bold" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canUndo = r.status === 'ok' && !r.undone && undoable?.has(r.importId);
                return (
                  <tr
                    key={r.importId}
                    className={`border-b border-line ${r.undone ? 'text-ink-soft line-through' : ''}`}
                  >
                    <td className="py-1.5 pr-4">{r.fileName}</td>
                    <td className="py-1.5 pr-4">{r.personName || '—'}</td>
                    <td className="py-1.5 pr-4">
                      {r.periodStart ? `${monthDayLabel(r.periodStart)} – ${monthDayLabel(r.periodEnd)}` : '—'}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{r.entryCount || ''}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{r.replacedCount || ''}</td>
                    <td className="py-1.5 pr-4">{whenLabel(r.at)}</td>
                    <td className="py-1.5 pr-4">
                      {r.status === 'ok' ? (
                        <span className={r.undone ? '' : 'text-ok'}>{r.undone ? 'Undone' : 'OK'}</span>
                      ) : (
                        <div>
                          <span className="text-alert">Error</span>
                          {r.message && <span className="block text-ink-soft">{r.message}</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5">
                      {canUndo ? (
                        <button
                          type="button"
                          onClick={() => void onUndo(r.importId)}
                          aria-label={`Undo import of ${r.fileName}`}
                          className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-2 py-1 transition-colors duration-200 hover:border-ink"
                        >
                          <Undo className="h-4 w-4" aria-hidden /> Undo
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
