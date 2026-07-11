// End-of-service savings rule + the firm's total liability if everyone left
// today. The rule is banded (years-of-service ranges × days of pay per year),
// ships with the KSA statutory preset, and is stored in its OWN kv key
// (KV_EOSB_RULE) — never inside the firm file.
//
// THE MATH (also unit-tested in test-people.mjs):
//   years of service = whole days since start ÷ 365 (prorated)
//   accrued days     = Σ per band: years inside the band × days per year
//   daily pay        = monthly base salary × 12 ÷ 365
//   owed today       = accrued days × daily pay
// KSA preset: 15 days/year for the first 5 years, 30 days/year after.

import { RotateCcw } from 'lucide-react';
import { kvSet, KV_EOSB_RULE } from '../../db';
import type { EosbBand, EosbRule, FirmFile, HrRecord } from '../../types';
import { fmtMoney } from '../../lib/rates';
import { eosbLiability, KSA_EOSB_PRESET, yearsOfService } from '../../lib/hr';
import { todayISO } from '../../lib/dates';
import { NumField } from '../invoice/fields';

export default function EosbCard({
  firm,
  rule,
  hrByPerson,
  currency,
}: {
  firm: FirmFile;
  rule: EosbRule;
  hrByPerson: Map<string, HrRecord>;
  currency: string;
}) {
  const today = todayISO();

  // Every ACTIVE EMPLOYEE with pay set up accrues; contractors never do.
  const employees = firm.people.filter((p) => {
    const hr = hrByPerson.get(p.personId);
    return p.active && hr !== undefined && hr.employmentType === 'employee';
  });
  const total = Math.round(
    employees.reduce((s, p) => {
      const hr = hrByPerson.get(p.personId)!;
      return s + eosbLiability(rule, hr.baseSalary, yearsOfService(hr.startDate, today));
    }, 0) * 100,
  ) / 100;

  const save = (bands: EosbBand[]) => void kvSet(KV_EOSB_RULE, { ...rule, bands });
  const patchBand = (i: number, p: Partial<EosbBand>) =>
    save(rule.bands.map((b, k) => (k === i ? { ...b, ...p } : b)));

  const reset = () => {
    if (window.confirm('Put the end-of-service rule back to the built-in preset (15 days a year for the first 5 years, then 30)?')) {
      void kvSet(KV_EOSB_RULE, KSA_EOSB_PRESET);
    }
  };

  return (
    <section>
      <h2 className="font-bold">End-of-service savings</h2>
      <p className="mb-4 mt-1 text-ink-soft">
        Money that builds up for each employee the longer they stay, paid out when they leave. Rules differ by country
        — <span className="font-bold text-ink">ask your accountant what applies to you</span> and set the years and
        days below to match. The preset is Saudi Arabia's rule.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-64 flex-1 border border-line p-4">
          <h3 className="mb-3 font-bold">The rule</h3>
          <div className="flex flex-col gap-2">
            {rule.bands.map((band, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-ink-soft">From year</span>
                <NumField
                  value={band.yearsFrom}
                  onCommit={(n) => patchBand(i, { yearsFrom: n })}
                  ariaLabel={`Rule band ${i + 1}: from year`}
                  className="w-16 text-right"
                />
                <span className="text-ink-soft">to</span>
                <input
                  type="number"
                  min={0}
                  value={band.yearsTo ?? ''}
                  placeholder="no limit"
                  onChange={(e) => patchBand(i, { yearsTo: e.target.value === '' ? null : Number(e.target.value) })}
                  aria-label={`Rule band ${i + 1}: to year (blank means no limit)`}
                  className="h-11 w-24 border border-line px-2 tabular-nums"
                />
                <span className="text-ink-soft">: each year earns</span>
                <NumField
                  value={band.daysPerYear}
                  onCommit={(n) => patchBand(i, { daysPerYear: n })}
                  ariaLabel={`Rule band ${i + 1}: days of pay per year`}
                  className="w-16 text-right"
                />
                <span className="text-ink-soft">days of pay</span>
                {rule.bands.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove rule band ${i + 1}`}
                    onClick={() => save(rule.bands.filter((_, k) => k !== i))}
                    className="h-11 cursor-pointer px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => {
                const last = rule.bands[rule.bands.length - 1];
                const from = last?.yearsTo ?? (last ? last.yearsFrom + 5 : 0);
                save([...rule.bands.map((b, k) => (k === rule.bands.length - 1 ? { ...b, yearsTo: b.yearsTo ?? from } : b)), { yearsFrom: from, yearsTo: null, daysPerYear: last?.daysPerYear ?? 30 }]);
              }}
              className="flex min-h-11 cursor-pointer items-center py-1 text-ink-soft transition-colors duration-200 hover:text-ink"
            >
              Add a band
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex min-h-11 cursor-pointer items-center gap-1 py-1 text-ink-soft transition-colors duration-200 hover:text-ink"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Back to the preset
            </button>
          </div>
          <p className="mt-3 text-ink-soft">
            How it's counted: years worked × days above = days of pay owed. A day of pay is the monthly base salary ×
            12 ÷ 365. Part-years count in proportion.
          </p>
        </div>

        <div className="min-w-48 border border-line p-3">
          <div className="text-ink-soft">Owed if everyone left today</div>
          <div className="text-2xl font-bold">{fmtMoney(total, currency)}</div>
          <div className="text-ink-soft">
            {employees.length} {employees.length === 1 ? 'employee' : 'employees'} — contractors never accrue
          </div>
        </div>
      </div>
    </section>
  );
}
