import { addDaysISO, fromISODate, toISODate, todayISO, weekStartISO } from '../../lib/dates';

export type RangePreset = 'week' | '4weeks' | 'quarter' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

export const PRESET_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = {
  week: 'This week',
  '4weeks': '4 weeks',
  quarter: 'This quarter',
};

/** Concrete [start, end] for a preset (custom ranges are held by the caller). */
export function presetRange(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const today = todayISO();
  const ws = weekStartISO(today);
  if (preset === 'week') return { start: ws, end: addDaysISO(ws, 6) };
  if (preset === '4weeks') return { start: addDaysISO(ws, -21), end: addDaysISO(ws, 6) };
  // quarter
  const d = fromISODate(today);
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return { start: toISODate(new Date(d.getFullYear(), qStartMonth, 1)), end: today };
}

const PRESETS: Array<Exclude<RangePreset, 'custom'>> = ['week', '4weeks', 'quarter'];

export default function RangePicker({
  preset,
  range,
  onPreset,
  onCustom,
}: {
  preset: RangePreset;
  range: DateRange;
  onPreset: (p: Exclude<RangePreset, 'custom'>) => void;
  onCustom: (r: DateRange) => void;
}) {
  const btn = (active: boolean) =>
    `min-h-11 cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
      active ? 'border-ink bg-ink text-paper font-bold' : 'border-line hover:border-ink'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button key={p} type="button" aria-pressed={preset === p} onClick={() => onPreset(p)} className={btn(preset === p)}>
          {PRESET_LABELS[p]}
        </button>
      ))}
      <button type="button" aria-pressed={preset === 'custom'} onClick={() => onCustom(range)} className={btn(preset === 'custom')}>
        Custom
      </button>
      {preset === 'custom' && (
        <span className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="text-ink-soft">From</span>
            <input
              type="date"
              value={range.start}
              max={range.end}
              onChange={(e) => onCustom({ ...range, start: e.target.value || range.start })}
              className="h-11 cursor-pointer border border-line px-2"
              aria-label="Range start date"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-ink-soft">To</span>
            <input
              type="date"
              value={range.end}
              min={range.start}
              onChange={(e) => onCustom({ ...range, end: e.target.value || range.end })}
              className="h-11 cursor-pointer border border-line px-2"
              aria-label="Range end date"
            />
          </label>
        </span>
      )}
    </div>
  );
}
