// Create a Lead — the client is picked from EXISTING clients only (v1
// deliberately has no inline client creation here: add the org on the Clients
// screen first, and this dialog says so plainly when the directory is empty).
// The go/no-go fields sit up front so the bid/no-bid call is captured before
// effort goes into a full proposal. New leads always start at stage
// 'inquiry'; every later stage move happens on the board via patchLeadStage.
// projectType/sector are free text with <datalist> suggestions — suggest,
// don't force, same convention as AddClientDialog's type/source. Dialog
// shape/Tailwind classes match ContactFormDialog.tsx exactly.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../AppContext';
import {
  GO_NO_GO_LABEL,
  PROJECT_TYPE_SUGGESTIONS,
  SCHEMA_VERSION,
  SECTOR_SUGGESTIONS,
  type GoNoGoDecision,
  type Lead,
} from '../../types';
import { uid } from '../../lib/ids';
import { nowISO } from '../../lib/dates';

/** '' in a number field means "not set" — never store 0 for an empty input. */
function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function AddLeadDialog({
  variant = 'primary',
  dataTour,
}: {
  variant?: 'primary' | 'plain';
  /** driver.js tour anchor — only pass this on the ONE instance a tour should
   *  target (the Pipeline header; the empty-state instance stays bare, since
   *  duplicate data-tour attributes would confuse the selector). */
  dataTour?: string;
}) {
  const { setView } = useApp();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const projectTypeListId = useId();
  const sectorListId = useId();

  const clients = useLiveQuery(() => db.clients.toArray(), []);

  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState('');
  const [sector, setSector] = useState('');
  const [estimatedFee, setEstimatedFee] = useState('');
  const [probability, setProbability] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [decisionDate, setDecisionDate] = useState('');
  const [goNoGo, setGoNoGo] = useState<'' | GoNoGoDecision>('');
  const [goNoGoNotes, setGoNoGoNotes] = useState('');
  const [leadOwner, setLeadOwner] = useState('');
  const [busy, setBusy] = useState(false);

  const sortedClients = [...(clients ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const openDialog = () => {
    setClientId('');
    setTitle('');
    setProjectType('');
    setSector('');
    setEstimatedFee('');
    setProbability('');
    setSubmissionDeadline('');
    setDecisionDate('');
    setGoNoGo('');
    setGoNoGoNotes('');
    setLeadOwner('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const titleTrim = title.trim();
    if (!clientId || !titleTrim) return; // native `required` already blocks this
    setBusy(true);
    try {
      const now = nowISO();
      const prob = parseOptionalNumber(probability);
      const lead: Lead = {
        schemaVersion: SCHEMA_VERSION,
        id: uid(),
        clientId,
        title: titleTrim,
        stage: 'inquiry', // every new lead starts here — moves happen on the board
        projectType: projectType.trim() || undefined,
        sector: sector.trim() || undefined,
        estimatedFee: parseOptionalNumber(estimatedFee),
        probability: prob === undefined ? undefined : Math.min(100, Math.max(0, prob)),
        submissionDeadline: submissionDeadline || undefined,
        decisionDate: decisionDate || undefined,
        goNoGoDecision: goNoGo || undefined,
        goNoGoNotes: goNoGoNotes.trim() || undefined,
        leadOwner: leadOwner.trim() || undefined,
        stageChangedAt: now, // = createdAt on creation, per the Lead contract
        createdAt: now,
        updatedAt: now,
      };
      await db.leads.add(lead);
      closeDialog();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        data-tour={dataTour}
        className={
          variant === 'primary'
            ? 'flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft'
            : 'flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink'
        }
      >
        <Plus className="h-4 w-4" aria-hidden /> Add lead
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-lg border border-line bg-paper p-6 text-ink backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        {sortedClients.length === 0 ? (
          // No inline client creation in v1 — say so and point at the fix.
          <div className="flex flex-col gap-4">
            <h2 id={titleId} className="font-bold">
              Add lead
            </h2>
            <p className="text-ink-soft">
              Every lead belongs to a client, and there are no clients yet. Add the organization on
              the Clients screen first, then come back here to log the opportunity.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="min-h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  closeDialog();
                  setView('clients');
                }}
                className="min-h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
              >
                Go to Clients
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <div>
              <h2 id={titleId} className="font-bold">
                Add lead
              </h2>
              <p className="mt-1 text-ink-soft">
                Pick the client and name the opportunity — everything else is optional. New leads
                start in the Inquiry column.
              </p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Client</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="h-12 w-full cursor-pointer border border-line px-2"
              >
                <option value="" disabled>
                  Choose a client…
                </option>
                {sortedClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Riverside mixed-use tower RFP"
                className="h-12 w-full border border-line px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Project type (optional)</span>
              <input
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                list={projectTypeListId}
                placeholder="e.g. New build"
                className="h-12 w-full border border-line px-2"
              />
              <datalist id={projectTypeListId}>
                {PROJECT_TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Sector (optional)</span>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                list={sectorListId}
                placeholder="e.g. Residential"
                className="h-12 w-full border border-line px-2"
              />
              <datalist id={sectorListId}>
                {SECTOR_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Estimated fee (optional)</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={estimatedFee}
                onChange={(e) => setEstimatedFee(e.target.value)}
                placeholder="e.g. 120000"
                className="h-12 w-full border border-line px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Probability, 0–100 (optional)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                inputMode="numeric"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                placeholder="e.g. 40"
                className="h-12 w-full border border-line px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Submission deadline (optional)</span>
              <input
                type="date"
                value={submissionDeadline}
                onChange={(e) => setSubmissionDeadline(e.target.value)}
                className="h-12 w-full border border-line px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Decision date (optional)</span>
              <input
                type="date"
                value={decisionDate}
                onChange={(e) => setDecisionDate(e.target.value)}
                className="h-12 w-full border border-line px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Go / no-go (optional)</span>
              <select
                value={goNoGo}
                onChange={(e) => setGoNoGo(e.target.value as '' | GoNoGoDecision)}
                className="h-12 w-full cursor-pointer border border-line px-2"
              >
                <option value="">Not decided yet</option>
                <option value="go">{GO_NO_GO_LABEL.go}</option>
                <option value="no_go">{GO_NO_GO_LABEL.no_go}</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Go / no-go notes (optional)</span>
              <textarea
                value={goNoGoNotes}
                onChange={(e) => setGoNoGoNotes(e.target.value)}
                rows={3}
                placeholder="The reasoning behind the call"
                className="w-full border border-line p-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Lead owner (optional)</span>
              <input
                value={leadOwner}
                onChange={(e) => setLeadOwner(e.target.value)}
                placeholder="Who's leading this response"
                className="h-12 w-full border border-line px-2"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="min-h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Save lead
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
