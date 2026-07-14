// Pipeline value by stage — one bar per LEAD_STAGE showing rawSum (the
// "how much is sitting in each stage" figure), with a hover/focus tooltip
// surfacing count, rawSum, and weightedSum together. Adapted from
// StudioHours' src/components/charts/WeeklyBars.tsx: same dependency-free
// div-based bar pattern (reflows on narrow screens without an SVG viewBox
// fight), same tooltip/keyboard-focus a11y touches — relabeled for
// stage/value instead of week/hours, and single-series (no stacking) since
// there's only one bar per stage here.

import { useState } from 'react';
import { LEAD_STAGE_LABEL } from '../../types';
import type { StageValue } from '../../lib/reports';

const FEE_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function PipelineValueBars({ stages, height = 168 }: { stages: StageValue[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...stages.map((s) => s.rawSum));

  if (stages.length === 0) return <p className="text-ink-soft">No pipeline data yet.</p>;

  return (
    <div>
      <div className="relative flex items-end gap-1.5 border-b border-line" style={{ height }}>
        {stages.map((s, i) => {
          const barH = (s.rawSum / max) * height;
          const active = hover === i;
          return (
            <div
              key={s.stage}
              className="group relative flex flex-1 cursor-default flex-col justify-end"
              style={{ height }}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              aria-label={`${LEAD_STAGE_LABEL[s.stage]}: ${s.count} ${s.count === 1 ? 'lead' : 'leads'}, ${FEE_FMT.format(
                s.rawSum,
              )} raw value, ${FEE_FMT.format(s.weightedSum)} probability-weighted`}
            >
              {active && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 border border-ink bg-paper px-2 py-1 text-left shadow-sm">
                  <div className="font-bold">{LEAD_STAGE_LABEL[s.stage]}</div>
                  <div className="text-ink-soft">
                    {s.count} {s.count === 1 ? 'lead' : 'leads'}
                  </div>
                  <div className="tabular-nums">{FEE_FMT.format(s.rawSum)} raw</div>
                  <div className="tabular-nums text-ink-soft">{FEE_FMT.format(s.weightedSum)} weighted</div>
                </div>
              )}
              <div
                className={`w-full rounded-t-[3px] bg-ink transition-opacity duration-200 ${active ? '' : 'opacity-90'}`}
                style={{ height: Math.max(0, barH) }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {stages.map((s) => (
          <div key={s.stage} className="flex-1 text-center text-ink-soft">
            {LEAD_STAGE_LABEL[s.stage]}
          </div>
        ))}
      </div>
    </div>
  );
}
