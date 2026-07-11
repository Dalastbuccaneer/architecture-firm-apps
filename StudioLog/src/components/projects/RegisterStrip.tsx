// Drawing-register progress strip — the register's charts-first visual, mirror
// of StageStrip's idiom (colored segments, a status WORD on every one, widths
// proportional to how many drawings sit in that status). Color is never the
// only signal: each segment shows its count AND its status word. Segments with
// no drawings still show, thinner, so the four states always read at a glance.

import type { Deliverable, DeliverableStatus } from '../../types';
import { DELIVERABLE_STATUS_LABEL } from '../../types';

// Same status hues as the register rows (see DeliverableRow), paired here with
// muted fills so dark ink text stays readable on top.
const SEGMENT_CLASS: Record<DeliverableStatus, string> = {
  issued: 'border-ok bg-ok-soft',
  in_progress: 'border-warn bg-warn-soft',
  not_started: 'border-line bg-paper',
  superseded: 'border-line bg-neutral-100',
};

// Display order left-to-right: issued, in progress, not started, superseded.
const ORDER: DeliverableStatus[] = ['issued', 'in_progress', 'not_started', 'superseded'];

export default function RegisterStrip({ deliverables }: { deliverables: Deliverable[] }) {
  if (deliverables.length === 0) return null;
  const counts: Record<DeliverableStatus, number> = {
    issued: 0,
    in_progress: 0,
    not_started: 0,
    superseded: 0,
  };
  for (const d of deliverables) counts[d.status]++;

  return (
    <div
      data-e2e="register-strip"
      role="list"
      aria-label="Drawings by status"
      className="flex flex-wrap gap-1"
    >
      {ORDER.map((status) => (
        <div
          key={status}
          role="listitem"
          style={{ flexGrow: Math.max(counts[status], 1) }}
          className={`min-w-32 basis-0 border px-2 py-1 ${SEGMENT_CLASS[status]}`}
        >
          <span className="font-bold">{counts[status]}</span>{' '}
          <span className={counts[status] === 0 ? 'text-ink-soft' : 'text-ink'}>
            {DELIVERABLE_STATUS_LABEL[status]}
          </span>
        </div>
      ))}
    </div>
  );
}
