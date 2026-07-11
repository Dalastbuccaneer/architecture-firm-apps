import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Copy, Flag, Plus, X } from 'lucide-react';
import { db, kvGet, kvSet, kvWeekRows } from '../db';
import { useApp } from '../AppContext';
import type { Activity, TimeEntry, WeekRowKey } from '../types';
import { SCHEMA_VERSION } from '../types';
import { addDaysISO, dayLabel, monthDayLabel, nowISO, todayISO, weekDates, weekRangeLabel, weekStartISO } from '../lib/dates';
import { uid } from '../lib/seeds';

const rowKeyStr = (r: WeekRowKey) => `${r.projectId}|${r.phaseId ?? ''}|${r.activityId ?? ''}`;
const cellKey = (r: WeekRowKey, date: string) => `${date}|${rowKeyStr(r)}`;

/** Parse typed hours; quarter-hour steps; '' or 0 clears the cell. */
function parseHours(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(24, Math.round(n * 4) / 4);
}

export default function WeekGrid() {
  const { firm, me } = useApp();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
  const [selected, setSelected] = useState<{ row: WeekRowKey; date: string } | null>(null);
  const [draft, setDraft] = useState<{ key: string; value: string } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [roundedNotice, setRoundedNotice] = useState<string | null>(null);

  // Quarter-hour rounding is silent by design (see parseHours) — surface it
  // briefly so a typed "6.3" quietly becoming 6.25 is never a surprise.
  useEffect(() => {
    if (!roundedNotice) return;
    const t = setTimeout(() => setRoundedNotice(null), 5000);
    return () => clearTimeout(t);
  }, [roundedNotice]);

  const dates = weekDates(weekStart);
  const personId = me?.personId ?? '';

  const entries = useLiveQuery(
    () => db.entries.where('[personId+date]').anyOf(dates.map((d) => [personId, d])).toArray(),
    [personId, weekStart],
  );
  const savedRows = useLiveQuery(
    async () => (await kvGet<WeekRowKey[]>(kvWeekRows(personId, weekStart))) ?? [],
    [personId, weekStart],
  );

  const projects = useMemo(() => (firm?.projects ?? []).filter((p) => p.status === 'active'), [firm]);
  const buckets = firm?.nonProjectBuckets ?? [];
  const activities = useMemo(() => (firm?.activities ?? []).filter((a) => !a.archived), [firm]);

  // Rows = saved row set ∪ rows implied by entries, plus pinned PTO + Admin buckets.
  const rows = useMemo<WeekRowKey[]>(() => {
    const map = new Map<string, WeekRowKey>();
    for (const r of savedRows ?? []) map.set(rowKeyStr(r), r);
    for (const e of entries ?? []) {
      const r = { projectId: e.projectId, phaseId: e.phaseId, activityId: e.activityId };
      if (!map.has(rowKeyStr(r))) map.set(rowKeyStr(r), r);
    }
    const pinnedIds = ['pto', 'admin'];
    const pinned: WeekRowKey[] = pinnedIds.map((id) => ({ projectId: id, phaseId: null, activityId: null }));
    for (const p of pinned) map.delete(rowKeyStr(p));
    const projectOrder = new Map(projects.map((p, i) => [p.projectId, i]));
    const main = [...map.values()].sort((a, b) => {
      const pa = projectOrder.get(a.projectId) ?? 999;
      const pb = projectOrder.get(b.projectId) ?? 999;
      return pa - pb || rowKeyStr(a).localeCompare(rowKeyStr(b));
    });
    return [...main, ...pinned];
  }, [savedRows, entries, projects]);

  // Cell → entries map (imports can theoretically create >1 per cell; UI edits exactly one).
  const cellEntries = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of entries ?? []) {
      const k = cellKey({ projectId: e.projectId, phaseId: e.phaseId, activityId: e.activityId }, e.date);
      const list = m.get(k) ?? [];
      list.push(e);
      m.set(k, list);
    }
    return m;
  }, [entries]);

  if (!firm || !me) return null;

  const rowLabel = (r: WeekRowKey): { title: string; sub: string } => {
    const bucket = buckets.find((b) => b.id === r.projectId);
    const activity = activities.find((a) => a.activityId === r.activityId);
    if (bucket) return { title: bucket.name, sub: activity?.name ?? '' };
    const project = firm.projects.find((p) => p.projectId === r.projectId);
    const phase = project?.phases.find((ph) => ph.phaseId === r.phaseId);
    // Match the Add-row picker's "code — name" phase format; custom phases can
    // have a blank code, so fall back to just the phase name rather than
    // showing a dangling "— ·".
    const phaseLabel = phase ? (phase.aiaCode ? ` — ${phase.aiaCode} · ${phase.name}` : ` — ${phase.name}`) : '';
    return {
      title: project ? `${project.projectName}${phaseLabel}` : 'Unknown project',
      sub: [project?.clientName, activity?.name].filter(Boolean).join(' · '),
    };
  };

  const billableDefault = (r: WeekRowKey): boolean => {
    const bucket = buckets.find((b) => b.id === r.projectId);
    if (bucket) return bucket.billableDefault;
    const project = firm.projects.find((p) => p.projectId === r.projectId);
    const phase = project?.phases.find((ph) => ph.phaseId === r.phaseId);
    return phase?.billableDefault ?? true;
  };

  const newEntry = (r: WeekRowKey, date: string, hours: number): TimeEntry => {
    const bucket = buckets.find((b) => b.id === r.projectId);
    const project = firm.projects.find((p) => p.projectId === r.projectId);
    const phase = project?.phases.find((ph) => ph.phaseId === r.phaseId);
    const activity = activities.find((a) => a.activityId === r.activityId);
    return {
      id: uid(),
      schemaVersion: SCHEMA_VERSION,
      personId,
      personName: me.name,
      date,
      projectId: r.projectId,
      projectName: bucket?.name ?? project?.projectName ?? 'Unknown',
      phaseId: r.phaseId,
      phaseName: phase?.name ?? null,
      activityId: r.activityId,
      activityName: activity?.name ?? null,
      hours,
      billable: activity ? activity.billableDefault && billableDefault(r) : billableDefault(r),
      outOfScope: false,
      requestedBy: null,
      notes: null,
      source: 'manual',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  };

  const commitCell = async (r: WeekRowKey, date: string, raw: string) => {
    const k = cellKey(r, date);
    const hours = parseHours(raw);
    if (hours === null) {
      // Don't silently discard a fat-fingered "8h"/"eight" — flag the cell and keep
      // the bad text visible so the user knows nothing was saved.
      setErrorKey(k);
      return;
    }
    setDraft(null);
    setErrorKey((prev) => (prev === k ? null : prev));
    const typed = Number(raw.trim().replace(',', '.'));
    setRoundedNotice(
      Number.isFinite(typed) && Math.abs(typed - hours) > 1e-9
        ? `"${raw.trim()}" on ${dayLabel(date)} was rounded to ${hours} h — hours are tracked in quarter-hour steps.`
        : null,
    );
    const list = cellEntries.get(k) ?? [];
    if (list.length > 1) return; // imported duplicates: read-only from the grid
    const existing = list[0];
    if (hours === 0) {
      if (existing) await db.entries.delete(existing.id);
      return;
    }
    if (existing) {
      if (existing.hours !== hours) await db.entries.put({ ...existing, hours, updatedAt: nowISO() });
    } else {
      await db.entries.put(newEntry(r, date, hours));
    }
  };

  const copyLastWeek = async () => {
    const prevStart = addDaysISO(weekStart, -7);
    const prevSaved = (await kvGet<WeekRowKey[]>(kvWeekRows(personId, prevStart))) ?? [];
    const prevEntries = await db.entries
      .where('[personId+date]')
      .anyOf(weekDates(prevStart).map((d) => [personId, d]))
      .toArray();
    const map = new Map<string, WeekRowKey>();
    for (const r of [...(savedRows ?? []), ...prevSaved]) map.set(rowKeyStr(r), r);
    for (const e of prevEntries) {
      const r = { projectId: e.projectId, phaseId: e.phaseId, activityId: e.activityId };
      map.set(rowKeyStr(r), r);
    }
    await kvSet(kvWeekRows(personId, weekStart), [...map.values()]);
  };

  const addRow = async (r: WeekRowKey) => {
    const next = [...(savedRows ?? [])];
    if (!next.some((x) => rowKeyStr(x) === rowKeyStr(r))) next.push(r);
    await kvSet(kvWeekRows(personId, weekStart), next);
    setAdding(false);
  };

  const removeRow = async (r: WeekRowKey) => {
    await kvSet(kvWeekRows(personId, weekStart), (savedRows ?? []).filter((x) => rowKeyStr(x) !== rowKeyStr(r)));
  };

  const rowTotal = (r: WeekRowKey) =>
    dates.reduce((sum, d) => sum + (cellEntries.get(cellKey(r, d)) ?? []).reduce((s, e) => s + e.hours, 0), 0);
  const dayTotal = (d: string) =>
    rows.reduce((sum, r) => sum + (cellEntries.get(cellKey(r, d)) ?? []).reduce((s, e) => s + e.hours, 0), 0);
  const weekTotal = dates.reduce((s, d) => s + dayTotal(d), 0);
  const capacity = me.weeklyCapacityHours || 40;

  const selectedEntries = selected ? cellEntries.get(cellKey(selected.row, selected.date)) ?? [] : [];
  const isPinned = (r: WeekRowKey) => r.projectId === 'pto' || r.projectId === 'admin';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Timesheet</h1>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
            className="flex h-12 w-12 cursor-pointer items-center justify-center border border-line transition-colors duration-200 hover:border-ink">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-44 text-center">{weekRangeLabel(weekStart)}</span>
          <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
            className="flex h-12 w-12 cursor-pointer items-center justify-center border border-line transition-colors duration-200 hover:border-ink">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <button type="button" onClick={copyLastWeek} data-tour="copy-last-week"
          className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink">
          <Copy className="h-4 w-4" aria-hidden /> Copy last week
        </button>
      </div>

      <div className="overflow-x-auto" data-tour="grid">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-ink text-left">
              <th scope="col" className="sticky left-0 z-10 bg-paper py-2 pr-4 font-bold">Project — Phase</th>
              {dates.map((d) => (
                <th key={d} className={`w-20 px-1 py-2 text-center font-bold ${d === todayISO() ? '' : 'text-ink-soft'}`}>
                  {dayLabel(d)}
                  <span className="block font-normal text-ink-soft">{monthDayLabel(d)}</span>
                </th>
              ))}
              <th className="w-16 py-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const { title, sub } = rowLabel(r);
              const pinned = isPinned(r);
              const canRemove = !pinned && rowTotal(r) === 0 && (savedRows ?? []).some((x) => rowKeyStr(x) === rowKeyStr(r));
              return (
                <tr key={rowKeyStr(r)} className={`border-b border-line ${pinned ? 'bg-neutral-50' : ''}`}>
                  <td className={`sticky left-0 z-10 py-1.5 pr-4 ${pinned ? 'bg-neutral-50' : 'bg-paper'}`}>
                    <div className="flex items-center gap-2">
                      <div>
                        <span>{title}</span>
                        {sub && <span className="block text-ink-soft">{sub}</span>}
                      </div>
                      {canRemove && (
                        <button type="button" aria-label={`Remove row ${title}`} onClick={() => removeRow(r)}
                          className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert">
                          <X className="h-4 w-4" aria-hidden /> Remove
                        </button>
                      )}
                    </div>
                  </td>
                  {dates.map((d, di) => {
                    const k = cellKey(r, d);
                    const list = cellEntries.get(k) ?? [];
                    const stored = list.reduce((s, e) => s + e.hours, 0);
                    const isDraft = draft?.key === k;
                    const value = isDraft ? draft.value : stored ? String(stored) : '';
                    const isSelected = selected && cellKey(selected.row, selected.date) === k;
                    const flagged = list.some((e) => e.outOfScope);
                    const isError = errorKey === k;
                    return (
                      <td key={d} className="relative px-1 py-1.5 text-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`${title}, ${dayLabel(d)} ${monthDayLabel(d)}, hours${flagged ? ', flagged out of scope' : ''}${isError ? ', invalid — enter a number' : ''}`}
                          aria-invalid={isError || undefined}
                          data-cell={`${ri}-${di}`}
                          value={value}
                          disabled={list.length > 1}
                          onFocus={() => { setSelected({ row: r, date: d }); if (errorKey === k) setErrorKey(null); }}
                          onChange={(ev) => setDraft({ key: k, value: ev.target.value })}
                          onBlur={(ev) => { if (isDraft) void commitCell(r, d, ev.target.value); }}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') {
                              ev.preventDefault();
                              (ev.target as HTMLInputElement).blur();
                              const below = document.querySelector<HTMLInputElement>(`[data-cell="${ri + 1}-${di}"]`);
                              below?.focus();
                            }
                          }}
                          className={`h-12 w-16 border text-center transition-colors duration-200 ${
                            isError ? 'border-alert' : isSelected ? 'border-ink' : 'border-line hover:border-ink-soft'
                          } ${flagged && !isError ? 'border-b-2 border-b-warn' : ''} disabled:bg-neutral-100`}
                        />
                        {flagged && (
                          <Flag className="pointer-events-none absolute right-1.5 top-1.5 h-3 w-3 text-warn" aria-hidden />
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right font-bold">{rowTotal(r) || ''}</td>
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 bg-paper py-2">
                <button type="button" onClick={() => setAdding(true)}
                  className="flex min-h-11 cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink">
                  <Plus className="h-4 w-4" aria-hidden /> Add row
                </button>
              </td>
              {dates.map((d) => (
                <td key={d} className="px-1 py-2 text-center text-ink-soft">{dayTotal(d) || ''}</td>
              ))}
              <td className="py-2 text-right font-bold">{weekTotal || ''}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {errorKey && (
        <p role="alert" className="mt-3 text-alert">
          That didn't look like a number — type hours like 6 or 6.5.
        </p>
      )}

      {roundedNotice && (
        <p role="status" className="mt-3 text-ink-soft">
          {roundedNotice}
        </p>
      )}

      {!rows.some((r) => !isPinned(r)) && weekTotal === 0 && (
        <p className="mt-3 text-ink-soft">
          No projects on your timesheet yet — click <span className="font-bold">Add row</span> to pick a project and phase,
          or <span className="font-bold">Copy last week</span> to bring back last week's rows.
        </p>
      )}

      {adding && <AddRowForm projects={projects} buckets={buckets} activities={activities} onAdd={addRow} onCancel={() => setAdding(false)} />}

      <div className="mt-6" data-tour="week-total">
        <div className="mb-1 flex justify-between">
          <span className="text-ink-soft">Week total</span>
          <span><span className="font-bold">{weekTotal}</span> / {capacity}h</span>
        </div>
        <div className="h-2 w-full bg-neutral-100">
          <div className="h-2 bg-ink transition-all duration-200" style={{ width: `${Math.min(100, (weekTotal / capacity) * 100)}%` }} />
        </div>
      </div>

      {selected && (
        <CellDetail
          key={cellKey(selected.row, selected.date)}
          entries={selectedEntries}
          activities={activities}
          label={rowLabel(selected.row).title}
          date={selected.date}
        />
      )}
    </div>
  );
}

function AddRowForm({ projects, buckets, activities, onAdd, onCancel }: {
  projects: Array<import('../types').Project>;
  buckets: Array<import('../types').NonProjectBucket>;
  activities: Activity[];
  onAdd: (r: WeekRowKey) => void;
  onCancel: () => void;
}) {
  const [projectId, setProjectId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [activityId, setActivityId] = useState('');
  const project = projects.find((p) => p.projectId === projectId);
  const openPhases = project ? project.phases.filter((ph) => ph.status === 'open') : [];
  const isBucket = buckets.some((b) => b.id === projectId);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border border-line p-3">
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Project</span>
        <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPhaseId(''); }}
          className="h-11 cursor-pointer border border-line px-2">
          <option value="">Select…</option>
          {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
          {buckets.filter((b) => b.id !== 'pto' && b.id !== 'admin').map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      {project && openPhases.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Phase</span>
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="h-11 cursor-pointer border border-line px-2">
            <option value="">Select…</option>
            {openPhases.map((ph) => (
              <option key={ph.phaseId} value={ph.phaseId}>{ph.aiaCode} — {ph.name}</option>
            ))}
          </select>
        </label>
      )}
      {project && openPhases.length === 0 && (
        <div className="flex max-w-96 flex-col gap-1">
          <span className="text-ink-soft">Phase</span>
          <span>
            {project.phases.length === 0
              ? 'This project has no stages yet — add them in Setup → Projects ("Prefill stages…").'
              : "All of this project's stages are closed — reopen one in Setup → Projects."}
          </span>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Activity (optional)</span>
        <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className="h-11 cursor-pointer border border-line px-2">
          <option value="">—</option>
          {activities.map((a) => <option key={a.activityId} value={a.activityId}>{a.name}</option>)}
        </select>
      </label>
      <button type="button" disabled={!projectId || (!!project && !phaseId)}
        onClick={() => onAdd({ projectId, phaseId: isBucket ? null : phaseId || null, activityId: activityId || null })}
        className="h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300">
        Add
      </button>
      <button type="button" onClick={onCancel} className="h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink">
        Cancel
      </button>
    </div>
  );
}

/** Detail editor for the focused cell's entry: activity, billable, out-of-scope
 *  (with hard-required "requested by"), notes. */
function CellDetail({ entries, activities, label, date }: {
  entries: TimeEntry[];
  activities: Activity[];
  label: string;
  date: string;
}) {
  const entry = entries.length === 1 ? entries[0] : null;
  const [requestedBy, setRequestedBy] = useState(entry?.requestedBy ?? '');
  const [oosPending, setOosPending] = useState(false);

  if (entries.length > 1) {
    return (
      <div className="mt-6 border border-line p-4" data-tour="cell-detail">
        <p className="font-bold">{label} · {monthDayLabel(date)}</p>
        <p className="mt-1 text-ink-soft">
          This cell holds {entries.length} imported entries — it's read-only here. Adjust them by re-importing a corrected file.
        </p>
      </div>
    );
  }
  if (!entry) {
    return (
      <div className="mt-6 border border-line p-4 text-ink-soft" data-tour="cell-detail">
        {label} · {monthDayLabel(date)} — type hours in the cell, then add details here.
      </div>
    );
  }

  const patch = (p: Partial<TimeEntry>) => db.entries.put({ ...entry, ...p, updatedAt: nowISO() });

  const wantOos = entry.outOfScope || oosPending;
  const needsRequestedBy = wantOos && !requestedBy.trim();

  const onOosToggle = (checked: boolean) => {
    if (!checked) {
      setOosPending(false);
      void patch({ outOfScope: false });
      return;
    }
    if (requestedBy.trim()) void patch({ outOfScope: true, requestedBy: requestedBy.trim() });
    else setOosPending(true); // don't persist the flag until the evidence field is filled
  };

  const onRequestedBy = (v: string) => {
    setRequestedBy(v);
    if (wantOos && v.trim()) {
      setOosPending(false);
      void patch({ outOfScope: true, requestedBy: v.trim() });
    } else if (entry.outOfScope) {
      void patch({ requestedBy: v.trim() || entry.requestedBy });
    }
  };

  return (
    <div className="mt-6 border border-line p-4" data-tour="cell-detail">
      <p className="mb-3"><span className="font-bold">{label}</span> · {monthDayLabel(date)} · {entry.hours}h</p>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Activity</span>
          <select
            value={entry.activityId ?? ''}
            onChange={(e) => {
              const a = activities.find((x) => x.activityId === e.target.value) ?? null;
              void patch({ activityId: a?.activityId ?? null, activityName: a?.name ?? null });
            }}
            className="h-11 cursor-pointer border border-line px-2"
          >
            <option value="">—</option>
            {activities.map((a) => <option key={a.activityId} value={a.activityId}>{a.name}</option>)}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={entry.billable} onChange={(e) => void patch({ billable: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-ink" />
          Billable
        </label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={wantOos} onChange={(e) => onOosToggle(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-ink" />
          Out of scope / additional services
        </label>
        {wantOos && (
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className={needsRequestedBy ? 'font-bold text-alert' : 'text-ink-soft'}>
              Requested by — required{needsRequestedBy ? ' (who asked for this change?)' : ''}
            </span>
            <input
              type="text"
              value={requestedBy}
              onChange={(e) => onRequestedBy(e.target.value)}
              aria-required={wantOos}
              aria-invalid={needsRequestedBy}
              placeholder="e.g. Client (phone call 7/2) — added skylight, confirming in writing"
              className={`h-11 border px-2 ${needsRequestedBy ? 'border-alert' : 'border-line'}`}
            />
          </label>
        )}
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-ink-soft">Notes{entry.hours > 6 || !entry.billable ? ' — recommended for this entry' : ''}</span>
          <input
            type="text"
            defaultValue={entry.notes ?? ''}
            onBlur={(e) => void patch({ notes: e.target.value.trim() || null })}
            placeholder="One line — it travels straight onto reports"
            className="h-11 border border-line px-2"
          />
        </label>
      </div>
    </div>
  );
}
