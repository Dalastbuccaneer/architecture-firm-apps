// FirstRun card 3: single-person studio. Sets meId directly — no person
// picker needed since there is exactly one person.
import { useState } from 'react';
import { patchFlags, setFirm } from '../../db';
import { newFirm, newPerson } from '../../lib/seeds';

export default function SoloSetup({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = name.trim().length > 0 && firmName.trim().length > 0 && !saving;

  const finish = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const firm = newFirm(firmName.trim());
    const person = newPerson(name.trim());
    person.isManager = true; // a solo studio's one person runs it — full nav from day one
    firm.people.push(person);
    await setFirm(firm);
    await patchFlags({ meId: person.personId });
  };

  return (
    <div className="w-full max-w-md">
      <p className="mb-4 font-bold">Start solo</p>
      <label className="mb-4 flex flex-col gap-1">
        <span className="text-ink-soft">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 border border-line px-2" />
      </label>
      <label className="mb-4 flex flex-col gap-1">
        <span className="text-ink-soft">Firm / studio name</span>
        <input value={firmName} onChange={(e) => setFirmName(e.target.value)} className="h-11 border border-line px-2" />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void finish()}
          className="min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Start
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
