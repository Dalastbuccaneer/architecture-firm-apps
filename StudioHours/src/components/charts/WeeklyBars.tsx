// Vertical stacked bars: one column per week, split billable (ink) over
// non-billable (neutral-300). Built from divs so it reflows on narrow screens
// without an SVG viewBox fight. Ships the hover layer the dataviz method asks for
// on any plotted chart: a per-column tooltip, keyboard-focusable for a11y.

import { useState } from 'react';

export interface WeekBar {
  label: string; // short, e.g. "Jun 30"
  billable: number;
  nonBillable: number;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function WeeklyBars({ weeks, height = 168 }: { weeks: WeekBar[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = weeks.map((w) => w.billable + w.nonBillable);
  const max = Math.max(1, ...totals);

  if (weeks.length === 0) return <p className="text-ink-soft">No hours logged in this range.</p>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-5">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-ink" aria-hidden /> <span className="text-ink-soft">Billable</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-neutral-300" aria-hidden />{' '}
          <span className="text-ink-soft">Non-billable</span>
        </span>
      </div>

      <div className="relative flex items-end gap-1.5 border-b border-line" style={{ height }}>
        {weeks.map((w, i) => {
          const total = w.billable + w.nonBillable;
          const billH = (w.billable / max) * height;
          const nonH = (w.nonBillable / max) * height;
          const active = hover === i;
          return (
            <div
              key={i}
              className="group relative flex flex-1 cursor-default flex-col justify-end"
              style={{ height }}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              aria-label={`Week of ${w.label}: ${fmt(total)} hours, ${fmt(w.billable)} billable`}
            >
              {active && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 border border-ink bg-paper px-2 py-1 text-left shadow-sm">
                  <div className="font-bold">Week of {w.label}</div>
                  <div className="text-ink-soft">{fmt(w.billable)} h billable</div>
                  <div className="text-ink-soft">{fmt(w.nonBillable)} h non-billable</div>
                  <div className="tabular-nums">{fmt(total)} h total</div>
                </div>
              )}
              {/* non-billable sits on top of billable; 2px surface gap between them */}
              <div
                className={`w-full bg-neutral-300 transition-opacity duration-200 ${active ? '' : 'opacity-90'}`}
                style={{ height: Math.max(0, nonH), marginBottom: w.billable > 0 && w.nonBillable > 0 ? 2 : 0 }}
              />
              <div
                className={`w-full rounded-t-[3px] bg-ink transition-opacity duration-200 ${active ? '' : 'opacity-90'}`}
                style={{ height: Math.max(0, billH) }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {weeks.map((w, i) => (
          <div key={i} className="flex-1 text-center text-ink-soft">
            {w.label}
          </div>
        ))}
      </div>
    </div>
  );
}
