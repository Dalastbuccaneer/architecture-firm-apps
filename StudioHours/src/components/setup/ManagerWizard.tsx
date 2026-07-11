// FirstRun card 1: the manager path. Collects a firm name and the initial
// people list, then hands off to setFirm — the parent screen (FirstRun) reacts
// to firm becoming non-null and swaps in the person picker automatically.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { setFirm } from '../../db';
import { newFirm, newPerson, uid } from '../../lib/seeds';

interface DraftPerson {
  key: string;
  name: string;
  weeklyCapacityHours: number;
}

export default function ManagerWizard({ onCancel }: { onCancel: () => void }) {
  const [firmName, setFirmName] = useState('');
  const [people, setPeople] = useState<DraftPerson[]>([{ key: uid(), name: '', weeklyCapacityHours: 40 }]);
  const [saving, setSaving] = useState(false);

  const updatePerson = (key: string, patch: Partial<DraftPerson>) =>
    setPeople((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const addPerson = () => setPeople((prev) => [...prev, { key: uid(), name: '', weeklyCapacityHours: 40 }]);
  const removePerson = (key: string) => setPeople((prev) => prev.filter((p) => p.key !== key));

  const validNames = people.map((p) => p.name.trim()).filter(Boolean);
  const canSubmit = firmName.trim().length > 0 && validNames.length > 0 && !saving;

  const finish = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const firm = newFirm(firmName.trim());
    for (const p of people) {
      const name = p.name.trim();
      if (!name) continue;
      firm.people.push(newPerson(name, p.weeklyCapacityHours || 40));
    }
    await setFirm(firm);
    // setFirm flips useApp().firm to non-null; FirstRun swaps to the person
    // picker, and whoever the firm creator picks as "me" there gets
    // isManager = true (see FirstRun's claimManager).
  };

  return (
    <div className="w-full max-w-lg">
      <p className="mb-4 font-bold">Set up the firm</p>

      <label className="mb-4 flex flex-col gap-1">
        <span className="text-ink-soft">Firm name</span>
        <input
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="e.g. Acme Architects"
          className="h-11 border border-line px-2"
        />
      </label>

      <p className="mb-2 text-ink-soft">People (name + weekly capacity)</p>
      <div className="flex flex-col gap-2">
        {people.map((p, i) => (
          <div key={p.key} className="flex items-center gap-2">
            <input
              value={p.name}
              onChange={(e) => updatePerson(p.key, { name: e.target.value })}
              placeholder="Name"
              aria-label={`Person ${i + 1} name`}
              className="h-11 flex-1 border border-line px-2"
            />
            <input
              type="number"
              min={1}
              value={p.weeklyCapacityHours}
              onChange={(e) => updatePerson(p.key, { weeklyCapacityHours: Number(e.target.value) })}
              aria-label={`Person ${i + 1} weekly capacity hours`}
              className="h-11 w-24 border border-line px-2"
            />
            {people.length > 1 && (
              <button
                type="button"
                aria-label={`Remove person ${i + 1}`}
                onClick={() => removePerson(p.key)}
                className="flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
              >
                <X className="h-4 w-4" aria-hidden /> Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPerson}
        className="mt-2 flex min-h-11 cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add person
      </button>

      <p className="mt-4 text-ink-soft">
        Add projects later in Setup, then use "Prefill stages…" to lay out RIBA, AIA, or interiors phases in one click.
      </p>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void finish()}
          className="min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Create firm
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
        >
          Back
        </button>
      </div>
    </div>
  );
}
