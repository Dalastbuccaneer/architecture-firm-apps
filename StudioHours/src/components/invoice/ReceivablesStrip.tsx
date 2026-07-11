// "Who owes me money and how old is it?" — one glance, plain nouns, big
// numbers. Fully controlled: Invoices.tsx owns which bucket is selected (it
// also uses the selection to filter the invoice list below), this component
// just renders the summary and reports clicks. Bar/track visual is the same
// h-2 track + colored fill recipe as HBar (components/dashboard/Bar.tsx) and
// the tile shell matches FeeBurnTab's StatTile (border border-line p-3,
// text-2xl font-bold value) — reused idiom, not a new visual language.

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { AgingBucketId, ReceivablesSummary } from '../../lib/receivables';
import { fmtMoney } from '../../lib/rates';

function AgingTile({
  label,
  amount,
  count,
  currency,
  ratio,
  alert,
  selected,
  onClick,
}: {
  label: string;
  amount: number;
  count: number;
  currency: string;
  ratio: number;
  alert: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      type="button"
      disabled={empty}
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 min-w-48 flex-1 border p-3 text-left transition-colors duration-200 ${
        empty
          ? 'cursor-not-allowed border-line text-ink-soft'
          : `cursor-pointer border-line hover:border-ink ${selected ? 'border-ink bg-neutral-50' : ''}`
      }`}
    >
      <div className="text-ink-soft">{label}</div>
      <div className={`text-2xl font-bold ${alert && !empty ? 'text-alert' : ''}`}>{fmtMoney(amount, currency)}</div>
      <div className="text-ink-soft">
        {count} {count === 1 ? 'invoice' : 'invoices'}
      </div>
      <div className="mt-2 h-2 w-full bg-neutral-100" aria-hidden>
        <div
          className={`h-2 transition-all duration-200 ${alert ? 'bg-alert' : 'bg-ink'}`}
          style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
        />
      </div>
      {alert && !empty && (
        <div className="mt-1 flex items-center gap-1 text-alert">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>Longest overdue</span>
        </div>
      )}
    </button>
  );
}

export default function ReceivablesStrip({
  summary,
  currency,
  selectedId,
  onSelect,
}: {
  summary: ReceivablesSummary;
  currency: string;
  /** the ACTIVE selection — null when nothing is filtered, or when the
   *  previously-selected bucket emptied out from under the filter (Invoices.tsx
   *  derives this so a bucket that just got paid off can't keep a dead filter
   *  and its "Show all" chip alive on screen). */
  selectedId: AgingBucketId | null;
  onSelect: (id: AgingBucketId) => void;
}) {
  if (summary.totalCount === 0) {
    return (
      <p role="status" className="flex items-center gap-2 border border-line bg-neutral-50 p-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
        Nothing outstanding — every sent invoice has been paid.
      </p>
    );
  }

  const maxAmount = Math.max(...summary.buckets.map((b) => b.amount), 0);
  const activeBucket = summary.buckets.find((b) => b.id === selectedId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-ink-soft">Owed to you: </span>
        <span className="text-hero font-bold">{fmtMoney(summary.totalOwed, currency)}</span>
      </div>

      <div>
        <p className="mb-3">
          <span className="font-bold">Waiting to be paid</span>
          <span className="text-ink-soft"> — counted from the day you sent each invoice</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {summary.buckets.map((b) => (
            <AgingTile
              key={b.id}
              label={b.label}
              amount={b.amount}
              count={b.count}
              currency={currency}
              ratio={maxAmount > 0 ? b.amount / maxAmount : 0}
              alert={b.id === 'over90'}
              selected={selectedId === b.id}
              onClick={() => onSelect(b.id)}
            />
          ))}
        </div>
      </div>

      {activeBucket && (
        <div className="flex min-h-11 w-fit flex-wrap items-center gap-3 border border-ink bg-neutral-50 py-1 pl-3 pr-1">
          <span>Showing: {activeBucket.label.toLowerCase()}</span>
          <button
            type="button"
            onClick={() => onSelect(activeBucket.id)}
            className="flex min-h-11 cursor-pointer items-center px-3 font-bold underline underline-offset-4 hover:no-underline"
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
