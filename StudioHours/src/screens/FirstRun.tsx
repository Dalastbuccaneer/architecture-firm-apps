// Full-screen first-run experience. App renders this whenever firm===null OR
// me===null (see App.tsx / AppContext). Two cases:
//   A. firm === null       — four entry paths (manager wizard, import, solo, sample)
//   B. firm !== null, no me — just the person picker
// Once any path calls setFirm(), useApp().firm flips to non-null and this
// component naturally falls into case B, showing the person picker — no extra
// state wiring needed to chain "create firm" → "who are you?".
import { useState } from 'react';
import { Building2, FolderInput, Sparkles, User } from 'lucide-react';
import { useApp } from '../AppContext';
import { setFirm } from '../db';
import { loadSampleFirm } from '../lib/sampleFirm';
import PersonPicker from '../components/setup/PersonPicker';
import ManagerWizard from '../components/setup/ManagerWizard';
import ImportFirmCard from '../components/setup/ImportFirmCard';
import SoloSetup from '../components/setup/SoloSetup';

type Choice = 'wizard' | 'import' | 'solo' | null;

const CARDS: Array<{ id: Exclude<Choice, null>; icon: typeof Building2; title: string; body: string }> = [
  {
    id: 'wizard',
    icon: Building2,
    title: 'Set up the firm',
    body: 'Manager path — name the firm and add your people. Projects come next, in Setup.',
  },
  {
    id: 'import',
    icon: FolderInput,
    title: 'Import your firm file',
    body: 'Already have a studio-hours-firm.json your manager shared? Drop it in here.',
  },
  {
    id: 'solo',
    icon: User,
    title: 'Start solo',
    body: 'Just you? Set up a one-person studio in a few seconds.',
  },
];

export default function FirstRun() {
  const { firm } = useApp();
  const [choice, setChoice] = useState<Choice>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');

  const loadSample = async () => {
    setSampleError('');
    setSampleLoading(true);
    try {
      await loadSampleFirm();
      // loadSampleFirm sets meId itself, so the app leaves FirstRun entirely.
    } catch (err) {
      setSampleError(err instanceof Error ? err.message : 'Could not load the sample firm.');
      setSampleLoading(false);
    }
  };

  // The Manager Wizard collects the whole team without asking who's who, so
  // the person who answers "Which one is you?" right after creating the firm
  // is the manager — mark them before meId is set. Import and reopen paths
  // (choice !== 'wizard') never assign the flag.
  const claimManager = async (personId: string) => {
    if (!firm) return;
    const draft = structuredClone(firm);
    const person = draft.people.find((p) => p.personId === personId);
    if (person && person.isManager !== true) {
      person.isManager = true;
      await setFirm(draft);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Studio Hours</h1>
        <p className="mt-2">Weekly timesheets, project-hours tracking, and invoicing for small architecture firms.</p>
        <p className="mt-1 text-ink-soft">No signup. No cloud. Your data stays on this computer.</p>
      </div>

      {firm ? (
        <PersonPicker
          people={firm.people.filter((p) => p.active)}
          onPick={choice === 'wizard' ? claimManager : undefined}
        />
      ) : choice === 'wizard' ? (
        <ManagerWizard onCancel={() => setChoice(null)} />
      ) : choice === 'import' ? (
        <ImportFirmCard onCancel={() => setChoice(null)} />
      ) : choice === 'solo' ? (
        <SoloSetup onCancel={() => setChoice(null)} />
      ) : (
        <div className="w-full max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            {CARDS.map(({ id, icon: Icon, title, body }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChoice(id)}
                className="flex cursor-pointer flex-col items-start gap-2 border border-line p-4 text-left transition-colors duration-200 hover:border-ink"
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="font-bold">{title}</span>
                <span className="text-ink-soft">{body}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={sampleLoading}
              onClick={() => void loadSample()}
              className="flex cursor-pointer flex-col items-start gap-2 border border-line p-4 text-left transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              <span className="font-bold">Explore with sample data</span>
              <span className="text-ink-soft">
                {sampleLoading ? 'Loading sample firm…' : 'A fake firm with projects, people, and a few weeks of hours already logged.'}
              </span>
            </button>
          </div>
          {sampleError && <p role="alert" className="mt-4 text-alert">{sampleError}</p>}
        </div>
      )}
    </div>
  );
}
