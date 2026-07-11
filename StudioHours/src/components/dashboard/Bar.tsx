// A single horizontal bar (hours-by-project and phase-burn share it).

export function HBar({
  label,
  sub,
  valueLabel,
  ratio,
  colorClass = 'bg-ink',
}: {
  label: string;
  sub?: string;
  valueLabel: string;
  ratio: number;
  colorClass?: string;
}) {
  const width = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <span className="truncate">
          {label}
          {sub ? <span className="text-ink-soft"> · {sub}</span> : null}
        </span>
        <span className="shrink-0 tabular-nums text-ink-soft">{valueLabel}</span>
      </div>
      <div className="h-2 w-full bg-neutral-100">
        <div className={`h-2 ${colorClass} transition-all duration-200`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
