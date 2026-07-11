import { useState, type ReactNode } from 'react';
import { AppProvider, useApp, type View } from './AppContext';
import Today from './screens/Today';
import Projects from './screens/Projects';
import Settings from './screens/Settings';
import InstallBanner from './components/InstallBanner';

// Three destinations, plain nouns, nothing hidden — the "an 80-year-old
// architect must never get lost" rule starts here. (Shell ported from
// StudioHours.)
const NAV: Array<{ view: View; label: string }> = [
  { view: 'today', label: 'Today' },
  { view: 'projects', label: 'Projects' },
  { view: 'settings', label: 'Settings' },
];

function Shell() {
  const { flags, view, setView } = useApp();
  // Clicking the ALREADY-active nav item remounts its screen — the standard
  // "click the current tab to return to its root" behavior (e.g. backs out of
  // an open project page to the registry list).
  const [remount, setRemount] = useState(0);

  if (flags === undefined) return null; // still loading IndexedDB

  const screen: Record<View, ReactNode> = {
    today: <Today />,
    projects: <Projects />,
    settings: <Settings />,
  };

  const goTo = (v: View) => (view === v ? setRemount((k) => k + 1) : setView(v));

  return (
    <div className="min-h-screen bg-paper">
      <div className="print:hidden">
        <InstallBanner />
      </div>
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
          <span className="font-bold">StudioLog</span>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1" aria-label="Main">
            {NAV.map((n) => (
              <button
                key={n.view}
                type="button"
                onClick={() => goTo(n.view)}
                className={`flex min-h-11 cursor-pointer items-center border-b-2 px-2 transition-colors duration-200 ${
                  view === n.view
                    ? 'border-ink font-bold'
                    : 'border-transparent text-ink-soft hover:border-line hover:text-ink'
                }`}
                aria-current={view === n.view ? 'page' : undefined}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main key={remount} className="mx-auto max-w-5xl px-6 py-8">{screen[view]}</main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
