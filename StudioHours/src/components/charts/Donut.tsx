// A hollow ring for a small part-to-whole split (billable vs non-billable, etc.).
// Hand-rolled SVG — no chart lib — and monochrome-forward: segments carry a
// Tailwind text-* token and paint via currentColor, so the ring never introduces
// a colour outside the design system. Identity is carried by the legend text,
// never colour alone (a11y).

export interface DonutSegment {
  label: string;
  value: number;
  /** a text-* token, e.g. 'text-ink' or 'text-neutral-300' — painted via currentColor */
  colorClass: string;
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 148,
  thickness = 18,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const len = Math.max(0, frac * C - gap);
    const arc = { seg, len, dashOffset: -offset };
    offset += frac * C;
    return arc;
  });

  const summary = segments.map((s) => `${s.label}: ${s.value}`).join(', ');

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={summary}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-neutral-100" />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {arcs.map((a, i) =>
              a.len > 0 ? (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  strokeWidth={thickness}
                  stroke="currentColor"
                  className={a.seg.colorClass}
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={a.dashOffset}
                  strokeLinecap="butt"
                />
              ) : null,
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{centerValue}</span>
          <span className="text-ink-soft">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 shrink-0 ${s.colorClass.replace('text-', 'bg-')}`} aria-hidden />
            <span className="text-ink-soft">{s.label}</span>
            <span className="tabular-nums font-bold">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
