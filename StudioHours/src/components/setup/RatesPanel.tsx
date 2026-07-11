// Billing rates for invoicing. These are what the firm CHARGES clients, never
// what it pays staff — the app holds no compensation data. Everything here is
// optional; a firm that never invoices can ignore the whole section. Resolution
// order (most specific first) is projectRates → personRates → default.
import type { BillingRates, FirmFile } from '../../types';
import { emptyRates } from '../../types';
import type { FirmUpdater } from './types';
import { numOrNull } from './numUtils';

export default function RatesPanel({ firm, update }: { firm: FirmFile; update: FirmUpdater }) {
  const rates = firm.billingRates ?? emptyRates();

  const patchRates = (mut: (r: BillingRates) => void) =>
    update((draft) => {
      draft.billingRates = draft.billingRates ?? emptyRates();
      mut(draft.billingRates);
    });

  const setPersonRate = (personId: string, raw: string) =>
    patchRates((r) => {
      const n = numOrNull(raw, r.personRates[personId] ?? null);
      if (n === null) delete r.personRates[personId];
      else r.personRates[personId] = n;
    });

  const setProjectRate = (projectId: string, raw: string) =>
    patchRates((r) => {
      const n = numOrNull(raw, r.projectRates[projectId] ?? null);
      if (n === null) delete r.projectRates[projectId];
      else r.projectRates[projectId] = n;
    });

  const openProjects = firm.projects.filter((p) => p.status !== 'closed');
  const activePeople = firm.people.filter((p) => p.active);
  const defaultPlaceholder = rates.defaultHourlyRate != null ? String(rates.defaultHourlyRate) : 'default';

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-bold">Billing rates</h2>
      <p className="mb-4 text-ink-soft">
        Optional — only needed for invoicing. What you charge clients per hour, not what you pay staff. Leave a field blank
        to fall back to the default.
      </p>

      <div className="flex flex-wrap items-end gap-4 border border-line p-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Default hourly rate</span>
          <input
            type="number"
            min={0}
            defaultValue={rates.defaultHourlyRate ?? ''}
            onBlur={(e) => void patchRates((r) => { r.defaultHourlyRate = numOrNull(e.target.value, r.defaultHourlyRate); })}
            className="h-11 w-32 border border-line px-2"
            aria-label="Default hourly billing rate"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Currency</span>
          <input
            defaultValue={rates.currency}
            onBlur={(e) => void patchRates((r) => { r.currency = e.target.value.trim().toUpperCase() || 'USD'; })}
            className="h-11 w-24 border border-line px-2 uppercase"
            aria-label="Currency code, e.g. USD"
            maxLength={3}
          />
        </label>
      </div>

      {activePeople.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-ink-soft">Per-person rates — the role-based lever (principal vs. drafter). Blank = default.</p>
          <div className="flex flex-col gap-2">
            {activePeople.map((person) => (
              <div key={person.personId} className="flex items-center gap-3 border border-line p-3">
                <span className="flex-1 truncate">{person.name}</span>
                <label className="flex items-center gap-2">
                  <span className="text-ink-soft">Rate</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={rates.personRates[person.personId] ?? ''}
                    placeholder={defaultPlaceholder}
                    onBlur={(e) => void setPersonRate(person.personId, e.target.value)}
                    className="h-11 w-28 border border-line px-2"
                    aria-label={`Hourly rate for ${person.name}`}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {openProjects.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-ink-soft">
            Per-project flat rate — a negotiated rate that overrides everyone's rate on that project. Blank = use per-person /
            default.
          </p>
          <div className="flex flex-col gap-2">
            {openProjects.map((project) => (
              <div key={project.projectId} className="flex items-center gap-3 border border-line p-3">
                <span className="flex-1 truncate">
                  {project.projectName}
                  {project.clientName ? <span className="text-ink-soft"> · {project.clientName}</span> : null}
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-ink-soft">Rate</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={rates.projectRates[project.projectId] ?? ''}
                    placeholder={defaultPlaceholder}
                    onBlur={(e) => void setProjectRate(project.projectId, e.target.value)}
                    className="h-11 w-28 border border-line px-2"
                    aria-label={`Flat hourly rate for ${project.projectName}`}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
