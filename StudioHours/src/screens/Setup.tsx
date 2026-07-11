// The manager's configuration screen: projects/phases, billing rates,
// activities, and the firm file export. (The people roster moved to the
// top-level People tab.) Every edit clones the current firm, mutates the
// clone, then persists via setFirm() — the kv live query refreshes this
// screen (and every other screen reading the firm) automatically.
import { useApp } from '../AppContext';
import { setFirm } from '../db';
import ProjectsPanel from '../components/setup/ProjectsPanel';
import RatesPanel from '../components/setup/RatesPanel';
import ActivitiesPanel from '../components/setup/ActivitiesPanel';
import FirmFilePanel from '../components/setup/FirmFilePanel';
import type { FirmUpdater } from '../components/setup/types';

// Anchors for the jump-links nav below — each id lands on one of the four
// panels this screen stacks in one long scroll.
const JUMP_LINKS = [
  { id: 'setup-projects', label: 'Projects' },
  { id: 'setup-rates', label: 'Rates' },
  { id: 'setup-activities', label: 'Activities' },
  { id: 'setup-firm-file', label: 'Firm file' },
];

export default function Setup() {
  const { firm } = useApp();
  if (!firm) return null;

  const update: FirmUpdater = async (mutate) => {
    const draft = structuredClone(firm);
    mutate(draft);
    await setFirm(draft);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Firm setup</h1>
      <nav aria-label="Jump to section" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-ink-soft">Jump to:</span>
        {JUMP_LINKS.map((link, i) => (
          <span key={link.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-ink-soft" aria-hidden>·</span>}
            <a href={`#${link.id}`} className="underline underline-offset-4 hover:text-ink-soft">
              {link.label}
            </a>
          </span>
        ))}
      </nav>
      <div className="mt-6">
        <div id="setup-projects">
          <ProjectsPanel firm={firm} update={update} />
        </div>
        <div id="setup-rates">
          <RatesPanel firm={firm} update={update} />
        </div>
        <div id="setup-activities">
          <ActivitiesPanel firm={firm} update={update} />
        </div>
        <div id="setup-firm-file">
          <FirmFilePanel firm={firm} />
        </div>
      </div>
    </div>
  );
}
