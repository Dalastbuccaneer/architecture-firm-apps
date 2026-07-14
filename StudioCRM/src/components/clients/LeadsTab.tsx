// Client -> Leads. Read-only-for-now list of this client's opportunities:
// title, stage, whichever fee figures are set (estimatedFee/feeProposed/
// feeWon), and submissionDeadline/decisionDate. Leads are actually created
// and moved through stages on the Pipeline screen (a later phase) — "Add
// lead" here just switches there via AppContext's setView, it doesn't open
// a dialog of its own. See the plan's "Screens" section, Clients bullet.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../AppContext';
import { fullDateLabel } from '../../lib/dates';
import { LEAD_STAGES, LEAD_STAGE_LABEL } from '../../types';
import type { Client, Lead } from '../../types';
import EmptyState from '../EmptyState';

const FEE_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function feeParts(lead: Lead): string[] {
  const parts: string[] = [];
  if (lead.estimatedFee !== undefined) parts.push(`Est. ${FEE_FMT.format(lead.estimatedFee)}`);
  if (lead.feeProposed !== undefined) parts.push(`Proposed ${FEE_FMT.format(lead.feeProposed)}`);
  if (lead.feeWon !== undefined) parts.push(`Won ${FEE_FMT.format(lead.feeWon)}`);
  return parts;
}

function dateParts(lead: Lead): string[] {
  const parts: string[] = [];
  if (lead.submissionDeadline) parts.push(`Submission ${fullDateLabel(lead.submissionDeadline)}`);
  if (lead.decisionDate) parts.push(`Decision ${fullDateLabel(lead.decisionDate)}`);
  return parts;
}

export default function LeadsTab({ client }: { client: Client }) {
  const { setView } = useApp();
  const leads = useLiveQuery(
    () => db.leads.where('clientId').equals(client.id).toArray(),
    [client.id],
  );

  if (leads === undefined) return null; // still loading IndexedDB

  // Group by where it sits in the pipeline (LEAD_STAGES order), not by date —
  // this is a client-scoped opportunity list, so "what stage is each one in"
  // is the useful first glance.
  const sorted = [...leads].sort(
    (a, b) => LEAD_STAGES.indexOf(a.stage) - LEAD_STAGES.indexOf(b.stage) || a.title.localeCompare(b.title),
  );

  const addLeadButton = (
    <button
      type="button"
      onClick={() => setView('pipeline')}
      className="flex min-h-11 cursor-pointer items-center gap-1.5 border border-line px-4 py-2 font-bold transition-colors duration-200 hover:border-ink"
    >
      Add lead
    </button>
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No leads yet"
        hint="Opportunities for this client are created and moved through stages on the Pipeline screen."
        action={addLeadButton}
      />
    );
  }

  return (
    <div>
      <div className="flex justify-end">{addLeadButton}</div>
      <ul className="mt-4 flex flex-col gap-2">
        {sorted.map((lead) => {
          const fees = feeParts(lead);
          const dates = dateParts(lead);
          return (
            <li key={lead.id} className="border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-bold">{lead.title}</span>
                <span className="text-ink-soft">{LEAD_STAGE_LABEL[lead.stage]}</span>
              </div>
              {fees.length > 0 && <p className="mt-1 text-ink-soft">{fees.join(' · ')}</p>}
              {dates.length > 0 && <p className="mt-1 text-ink-soft">{dates.join(' · ')}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
