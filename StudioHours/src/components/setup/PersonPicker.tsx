// Shared "who are you?" picker — used by FirstRun both when a firm was just
// created/imported (meId still null) and when a firm file already existed on
// this machine but this install hasn't been claimed yet.
import { patchFlags } from '../../db';
import type { Person } from '../../types';

export default function PersonPicker({
  people,
  prompt = 'Which one is you?',
  onPick,
}: {
  people: Person[];
  prompt?: string;
  /** runs before meId is set — FirstRun uses it to mark the firm creator as manager */
  onPick?: (personId: string) => Promise<void> | void;
}) {
  const pick = async (personId: string) => {
    await onPick?.(personId);
    await patchFlags({ meId: personId });
  };

  return (
    <div className="w-full max-w-md">
      <p className="mb-4 text-center font-bold">{prompt}</p>
      {people.length === 0 ? (
        <p className="text-center text-ink-soft">No active people yet — ask your manager to add you in Setup.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {people.map((p) => (
            <button
              key={p.personId}
              type="button"
              onClick={() => void pick(p.personId)}
              className="min-h-11 cursor-pointer border border-line px-4 py-2 text-left transition-colors duration-200 hover:border-ink"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
