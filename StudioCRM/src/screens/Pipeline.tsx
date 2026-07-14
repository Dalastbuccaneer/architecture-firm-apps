// Pipeline — the opportunity board: one flat bordered column per stage (all
// six, always, in LEAD_STAGES order — an empty stage renders as an empty
// column, never disappears), counts + estimatedFee sums in each header. Stage
// changes happen via an inline native <select> per card (no drag-and-drop
// library exists in this stack — deliberately; don't add one), wired to
// db.ts patchLeadStage. Moving a card to Won or Lost first prompts inline for
// the WHY (outcomeReason) and only commits once it's given — win reasons feed
// fee strategy too, not just losses. Fresh screen shape (no StudioLog/
// StudioHours precedent); all aggregation lives in lib/pipeline.ts (pure,
// unit-tested) so this component stays thin.

import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, patchLeadStage } from '../db';
import { useApp } from '../AppContext';
import { fullDateLabel, todayISO } from '../lib/dates';
import {
  decisionDateLabel,
  isClosedStage,
  leadDateDaysLeft,
  leadsByStage,
  submissionDeadlineLabel,
} from '../lib/pipeline';
import { LEAD_STAGES, LEAD_STAGE_LABEL, type Lead, type LeadStage } from '../types';
import EmptyState from '../components/EmptyState';
import AddLeadDialog from '../components/pipeline/AddLeadDialog';

const FEE_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** One watched-date line — "Submission Jul 20, 2026 — Due in 6 days". The
 *  duePhrase words carry the urgency (never color alone); alert/warn color is
 *  only ever added ALONGSIDE them. `label` is null when there's nothing to
 *  flag (closed stage, or still beyond the horizon) — then the plain date
 *  shows on its own. */
function DateLine({
  word,
  date,
  label,
  today,
}: {
  word: string;
  date: string;
  label: string | null;
  today: string;
}) {
  const daysLeft = leadDateDaysLeft(date, today);
  const overdue = daysLeft !== null && daysLeft < 0;
  return (
    <p className="text-ink-soft">
      {word} {fullDateLabel(date)}
      {label && (
        <span className={`font-bold ${overdue ? 'text-alert' : 'text-warn'}`}> — {label}</span>
      )}
    </p>
  );
}

function LeadCard({
  lead,
  clientName,
  today,
  first,
}: {
  lead: Lead;
  clientName: string;
  today: string;
  /** true on the single first card of the whole board — the only card that
   *  carries the tour's data-tour anchors (duplicates would confuse the
   *  selector, same rule as AddClientDialog's dataTour prop). */
  first: boolean;
}) {
  const { openClient } = useApp();
  // The stage the user picked in the <select> but hasn't committed yet — only
  // ever 'won' or 'lost' (anything else commits immediately). While set, the
  // inline outcome-reason prompt is open and the select shows the pending
  // value; Cancel snaps it back to lead.stage.
  const [pendingStage, setPendingStage] = useState<Extract<LeadStage, 'won' | 'lost'> | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const onStagePick = (next: LeadStage) => {
    if (next === lead.stage) {
      setPendingStage(null); // picked the current stage again — nothing to do
      return;
    }
    if (next === 'won' || next === 'lost') {
      // Do NOT commit yet — require the outcome reason first.
      setPendingStage(next);
      setReason('');
      return;
    }
    setPendingStage(null);
    void patchLeadStage(lead.id, next);
  };

  const confirmOutcome = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!pendingStage || !trimmed) return; // native `required` already blocks blank
    setBusy(true);
    try {
      await patchLeadStage(lead.id, pendingStage, { outcomeReason: trimmed });
      setPendingStage(null);
    } finally {
      setBusy(false);
    }
  };

  const subLabel = submissionDeadlineLabel(lead, today);
  const decLabel = decisionDateLabel(lead, today);

  return (
    <li className="flex flex-col gap-1 border border-line p-3">
      <p className="font-bold">{lead.title}</p>

      <button
        type="button"
        onClick={() => openClient(lead.clientId)}
        aria-label={`Open client ${clientName}`}
        className="flex min-h-11 cursor-pointer items-center self-start text-left text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        {clientName}
      </button>

      {lead.estimatedFee !== undefined && (
        <p className="text-ink-soft">Est. {FEE_FMT.format(lead.estimatedFee)}</p>
      )}

      {(lead.submissionDeadline || lead.decisionDate) && (
        <div data-tour={first ? 'lead-dates' : undefined} className="flex flex-col gap-0.5">
          {lead.submissionDeadline && (
            <DateLine word="Submission" date={lead.submissionDeadline} label={subLabel} today={today} />
          )}
          {lead.decisionDate && (
            <DateLine word="Decision" date={lead.decisionDate} label={decLabel} today={today} />
          )}
        </div>
      )}

      {isClosedStage(lead.stage) && lead.outcomeReason && (
        <p className="text-ink-soft">
          {lead.stage === 'won' ? 'Won' : 'Lost'} because: {lead.outcomeReason}
        </p>
      )}

      <select
        value={pendingStage ?? lead.stage}
        onChange={(e) => onStagePick(e.target.value as LeadStage)}
        aria-label={`Stage for ${lead.title}`}
        data-tour={first ? 'stage-select' : undefined}
        className="mt-1 h-12 w-full cursor-pointer border border-line px-2"
      >
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STAGE_LABEL[s]}
          </option>
        ))}
      </select>

      {pendingStage && (
        <form
          onSubmit={(e) => void confirmOutcome(e)}
          className="mt-1 flex flex-col gap-2 border border-line p-2"
        >
          <label className="flex flex-col gap-1">
            <span>
              Why was this {pendingStage === 'won' ? 'won' : 'lost'}?{' '}
              <span className="text-ink-soft">(required to move it)</span>
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              autoFocus
              placeholder={
                pendingStage === 'won'
                  ? 'e.g. Right fee, strong referral'
                  : 'e.g. Fee too high, went with a larger firm'
              }
              className="h-12 w-full border border-line px-2"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingStage(null)}
              className="min-h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Move to {LEAD_STAGE_LABEL[pendingStage]}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function Pipeline() {
  const { setView } = useApp();
  const clients = useLiveQuery(() => db.clients.toArray(), []);
  const leads = useLiveQuery(() => db.leads.toArray(), []);

  if (clients === undefined || leads === undefined) return null; // still loading IndexedDB

  const today = todayISO();
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const groups = leadsByStage(leads);
  // The one card that carries the tour anchors (see LeadCard's `first`).
  const firstLeadId = groups.flatMap((g) => g.leads)[0]?.id ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <AddLeadDialog dataTour="add-lead" />
      </div>

      {leads.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No leads yet"
            hint={
              clients.length === 0
                ? 'Leads belong to clients — add the organization on the Clients screen first, then log the opportunity here.'
                : 'Log the first opportunity — an inquiry, RFP, or tender. It starts in the Inquiry column and moves through stages from here.'
            }
            action={
              clients.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setView('clients')}
                  className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
                >
                  Go to Clients
                </button>
              ) : (
                <AddLeadDialog variant="plain" />
              )
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <section key={g.stage} aria-label={`${LEAD_STAGE_LABEL[g.stage]} column`} className="border border-line">
              <div className="border-b border-line px-3 py-2">
                <p className="font-bold">{LEAD_STAGE_LABEL[g.stage]}</p>
                <p className="text-ink-soft">
                  {g.count} {g.count === 1 ? 'lead' : 'leads'} · {FEE_FMT.format(g.feeSum)}
                </p>
              </div>
              {g.leads.length === 0 ? (
                <p className="px-3 py-4 text-ink-soft">None yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 p-2">
                  {g.leads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      clientName={clientById.get(lead.clientId)?.name ?? 'Unknown client'}
                      today={today}
                      first={lead.id === firstLeadId}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
