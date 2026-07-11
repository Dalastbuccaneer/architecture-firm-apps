// The firm roster (lives under the top-level People screen): name, capacity,
// per-person utilization band, active, and "Can manage the firm" — the flag
// that decides who sees the firm-level tabs up front (see App.tsx).
import { Plus } from 'lucide-react';
import type { FirmFile, Person } from '../../types';
import { newPerson } from '../../lib/seeds';
import type { FirmUpdater } from './types';
import { numOr } from './numUtils';

export default function PeoplePanel({
  firm,
  update,
  canEditManagerFlag = true,
}: {
  firm: FirmFile;
  update: FirmUpdater;
  // Only a manager (or anyone, in a firm where no one is marked yet) may change
  // who can manage the firm — otherwise a staff member reaching the roster via
  // "More" could tick their own box and unlock the pay/leave/renewals tabs.
  canEditManagerFlag?: boolean;
}) {
  const patchPerson = (personId: string, patch: Partial<Person>) =>
    update((draft) => {
      const p = draft.people.find((x) => x.personId === personId);
      if (p) Object.assign(p, patch);
    });

  const addPerson = () =>
    update((draft) => {
      draft.people.push(newPerson('New person', draft.firm.defaultWeeklyCapacityHours));
    });

  return (
    <section>
      <p className="mb-1 text-ink-soft">
        The billable target is each person&rsquo;s share of time billed = billable hours ÷ available capacity. Alerts compare
        each person to their own target — principals typically 40% – 65%, staff 75% – 85%.
      </p>
      <p className="mb-4 text-ink-soft">
        People marked <span className="font-bold text-ink">Can manage the firm</span> see every tab — Money, Dashboard,
        People, Setup. Everyone else starts on Week, with the rest under “More”. If no one is marked, everyone sees
        everything.
      </p>
      <div className="flex flex-col gap-2">
        {firm.people.map((person) => (
          <div key={person.personId} className="flex flex-wrap items-end gap-3 border border-line p-3">
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-ink-soft">Name</span>
              <input
                defaultValue={person.name}
                onBlur={(e) => void patchPerson(person.personId, { name: e.target.value })}
                className="h-11 w-full border border-line px-2"
                aria-label="Person name"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Weekly capacity</span>
              <input
                type="number"
                min={0}
                defaultValue={person.weeklyCapacityHours}
                onBlur={(e) => void patchPerson(person.personId, { weeklyCapacityHours: numOr(e.target.value, person.weeklyCapacityHours) })}
                className="h-11 w-24 border border-line px-2"
                aria-label={`${person.name || 'person'} weekly capacity hours`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Billable target: low %</span>
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={person.targetUtilization.min}
                onBlur={(e) =>
                  void patchPerson(person.personId, {
                    targetUtilization: { ...person.targetUtilization, min: numOr(e.target.value, person.targetUtilization.min) },
                  })
                }
                className="h-11 w-20 border border-line px-2"
                aria-label={`${person.name || 'person'} billable target low percent`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Billable target: high %</span>
              <input
                type="number"
                min={0}
                max={200}
                defaultValue={person.targetUtilization.max}
                onBlur={(e) =>
                  void patchPerson(person.personId, {
                    targetUtilization: { ...person.targetUtilization, max: numOr(e.target.value, person.targetUtilization.max) },
                  })
                }
                className="h-11 w-20 border border-line px-2"
                aria-label={`${person.name || 'person'} billable target high percent`}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={person.active}
                onChange={(e) => void patchPerson(person.personId, { active: e.target.checked })}
                className="h-4 w-4 cursor-pointer accent-ink"
              />
              Active
            </label>
            <label className={`flex items-center gap-2 pb-2 ${canEditManagerFlag ? 'cursor-pointer' : 'cursor-not-allowed text-ink-soft'}`}>
              <input
                type="checkbox"
                checked={person.isManager === true}
                disabled={!canEditManagerFlag}
                onChange={(e) => void patchPerson(person.personId, { isManager: e.target.checked })}
                className={`h-4 w-4 accent-ink ${canEditManagerFlag ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                aria-label={`${person.name || 'person'} can manage the firm`}
              />
              Can manage the firm
            </label>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void addPerson()}
        className="mt-3 flex min-h-11 cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add person
      </button>
    </section>
  );
}
