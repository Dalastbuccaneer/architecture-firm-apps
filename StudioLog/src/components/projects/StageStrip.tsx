// Horizontal stage-progress strip — simple divs, one segment per stage, equal
// widths. Status is shown by color AND word on every segment (color is never
// the only signal), and labels are always visible — no hover-only meaning.
// `detailed` (project Overview) adds the stage name and end date; the compact
// variant (registry rows) shows code + status word only.

import type { Stage } from '../../types';
import { STAGE_STATUS_LABEL } from '../../types';
import { fullDateLabel } from '../../lib/dates';

const SEGMENT_CLASS: Record<Stage['status'], string> = {
  pending: 'border-line bg-paper',
  in_progress: 'border-warn bg-warn-soft',
  done: 'border-ok bg-ok-soft',
};

export default function StageStrip({ stages, detailed = false }: { stages: Stage[]; detailed?: boolean }) {
  if (stages.length === 0) return null;
  const ordered = [...stages].sort((a, b) => a.stageIndex - b.stageIndex);
  return (
    <div
      data-e2e={detailed ? 'stage-strip' : 'registry-strip'}
      role="list"
      aria-label="Stage progress"
      className="flex flex-wrap gap-1"
    >
      {ordered.map((s) => (
        <div
          key={s.stageIndex}
          role="listitem"
          className={`min-w-24 flex-1 border px-2 py-1 ${SEGMENT_CLASS[s.status]}`}
        >
          <span className="font-bold">{s.code || '—'}</span>{' '}
          <span className={s.status === 'pending' ? 'text-ink-soft' : 'text-ink'}>
            {STAGE_STATUS_LABEL[s.status]}
          </span>
          {detailed && (
            <>
              <div className="text-ink">{s.name}</div>
              <div className="text-ink-soft">{s.endDate ? `due ${fullDateLabel(s.endDate)}` : 'no end date'}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
