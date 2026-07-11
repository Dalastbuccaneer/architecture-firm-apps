import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { patchFlags } from './db';
import { AppProvider, useApp, type View } from './AppContext';
import Week from './screens/Week';
import FirstRun from './screens/FirstRun';
import Setup from './screens/Setup';
import Dashboard from './screens/Dashboard';
import Invoices from './screens/Invoices';
import People from './screens/People';
import Settings from './screens/Settings';
import InstallBanner from './components/InstallBanner';
import BackupNag from './components/BackupNag';
import { managerAccess } from './lib/access';
import { maybeStartTourFor } from './lib/tours';

// Five destinations, plain nouns. 'invoices' stayed the internal key when the
// tab was renamed Money, so old ?view=invoices links (and tour/e2e selectors)
// keep working. Settings is deliberately NOT here — it's a utility link in the
// header, next to "Switch person".
const NAV: Array<{ view: View; label: string }> = [
  { view: 'week', label: 'Week' },
  { view: 'invoices', label: 'Money' },
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'people', label: 'People' },
  { view: 'setup', label: 'Setup' },
];

/** The firm-level tabs — everything beyond Week. Staff in a firm that HAS a
 *  designated manager see these behind a "More" expander (reachable, never
 *  hidden — just not competing with Week). See Person.isManager in types.ts. */
const FIRM_VIEWS: View[] = ['invoices', 'dashboard', 'people', 'setup'];

function Shell() {
  const { firm, flags, me, view, setView } = useApp();
  // Clicking the ALREADY-active nav item remounts its screen — the standard
  // "click the current tab to return to its root" behavior (e.g. backs out of
  // an open invoice editor to the invoice list, or back to the week grid).
  const [remount, setRemount] = useState(0);
  // Staff-nav "More" expander state (session-only; collapses again next load).
  const [moreOpen, setMoreOpen] = useState(false);

  const ready = !!firm && !!me;
  useEffect(() => {
    if (ready && (view === 'week' || view === 'dashboard')) void maybeStartTourFor(view);
  }, [ready, view]);

  if (firm === undefined || flags === undefined) return null; // still loading IndexedDB

  // First run: no firm yet, or firm exists but this install hasn't picked who it is.
  if (firm === null || !me) return <FirstRun />;

  const screen: Record<View, ReactNode> = {
    week: <Week />,
    invoices: <Invoices />,
    dashboard: <Dashboard />,
    people: <People />,
    setup: <Setup />,
    settings: <Settings />,
  };

  // Default-nav rule: managers see all five tabs. So does EVERYONE in a firm
  // where no person is marked as manager (firm files from before the flag
  // existed) — a legacy firm must never lock its owner out. Same rule gates
  // the People sub-tabs and the Dashboard renewals strip — see lib/access.ts.
  const fullNav = managerAccess(firm, me);
  // If the current view IS a firm-level one, its tab must be visible so the
  // user can always see where they are — that overrides the collapsed state.
  const onFirmView = FIRM_VIEWS.includes(view);
  const expanded = fullNav || moreOpen || onFirmView;
  const navItems = expanded ? NAV : NAV.filter((n) => !FIRM_VIEWS.includes(n.view));

  const goTo = (v: View) => (view === v ? setRemount((k) => k + 1) : setView(v));

  return (
    <div className="min-h-screen bg-paper">
      <div className="print:hidden">
        <InstallBanner />
        <BackupNag />
      </div>
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
          <span className="font-bold">Studio Hours</span>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1" aria-label="Main">
            {navItems.map((n) => (
              <button
                key={n.view}
                type="button"
                onClick={() => goTo(n.view)}
                data-tour={`nav-${n.view}`}
                className={`flex min-h-11 cursor-pointer items-center border-b-2 transition-colors duration-200 ${
                  view === n.view
                    ? 'border-ink font-bold'
                    : 'border-transparent text-ink-soft hover:border-line hover:text-ink'
                }`}
                aria-current={view === n.view ? 'page' : undefined}
              >
                {n.label}
              </button>
            ))}
            {!fullNav && !onFirmView && (
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                data-tour="nav-more"
                className="flex min-h-11 cursor-pointer items-center gap-1 border-b-2 border-transparent text-ink-soft transition-colors duration-200 hover:border-line hover:text-ink"
              >
                More
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
            )}
          </nav>
          <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-x-5 gap-y-1">
            <button
              type="button"
              onClick={() => goTo('settings')}
              data-tour="nav-settings"
              aria-current={view === 'settings' ? 'page' : undefined}
              className={`flex min-h-11 cursor-pointer items-center gap-1.5 transition-colors duration-200 ${
                view === 'settings' ? 'font-bold text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <SettingsIcon className="h-4 w-4" aria-hidden /> Settings
            </button>
            <button
              type="button"
              onClick={() => void patchFlags({ meId: null })}
              aria-label={`Signed in as ${me.name}. Switch person.`}
              className="flex min-h-11 min-w-0 max-w-full cursor-pointer items-center gap-2 text-ink-soft transition-colors duration-200 hover:text-ink"
            >
              <span className="truncate">{firm.firm.firmName} · {me.name}</span>
              <span className="shrink-0 border border-line px-2 py-0.5 font-bold">Switch</span>
            </button>
          </div>
        </div>
      </header>
      <main key={remount} className="mx-auto max-w-6xl px-6 py-8">{screen[view]}</main>
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
