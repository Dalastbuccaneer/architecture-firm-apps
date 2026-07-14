import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, Users, Kanban, BarChart3, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import { AppProvider, useApp, type View } from './AppContext';
import { db } from './db';
import InstallBanner from './components/InstallBanner';
import Today from './screens/Today';
import Clients from './screens/Clients';
import ClientDetail from './screens/ClientDetail';
import Pipeline from './screens/Pipeline';
import Reports from './screens/Reports';
import Settings from './screens/Settings';
import { maybeStartTourFor } from './lib/tours';

// Clients tab: list<->detail switch lives HERE (not inside Clients.tsx, which
// is deliberately just the flat list) — same list/detail split StudioLog's
// Projects.tsx does internally, just hoisted a level up since Clients and
// ClientDetail are separate top-level screens. Consumes AppContext's one-shot
// requestedClientId (set by useApp().openClient) and turns it into a
// persistent "which client is open" state, exactly like Projects.tsx does
// with requestedProjectId/openId.
function ClientsRoute() {
  const { requestedClientId, requestedClientTab, clearClientRequest } = useApp();
  const [openId, setOpenId] = useState<string | null>(requestedClientId);
  const [initialTab, setInitialTab] = useState(requestedClientTab);
  const clients = useLiveQuery(() => db.clients.toArray(), []);

  useEffect(() => {
    if (requestedClientId) {
      setOpenId(requestedClientId);
      setInitialTab(requestedClientTab);
      clearClientRequest();
    }
  }, [requestedClientId, requestedClientTab, clearClientRequest]);

  // Push one history entry the first time a client opens; clear the marker
  // when it closes, so the next open pushes a fresh entry. Mirrors
  // StudioLog's Projects.tsx so browser/Android Back closes the client page
  // instead of leaving the app.
  const pushedRef = useRef(false);
  useEffect(() => {
    if (openId && !pushedRef.current) {
      window.history.pushState({ crmClient: openId }, '');
      pushedRef.current = true;
    } else if (!openId) {
      pushedRef.current = false;
    }
  }, [openId]);

  useEffect(() => {
    const onPop = () => {
      setOpenId((cur) => (cur ? null : cur));
      setInitialTab(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (clients === undefined) return null; // still loading IndexedDB

  const open = openId ? clients.find((c) => c.id === openId) : undefined;
  if (open) return <ClientDetail client={open} initialTab={initialTab ?? undefined} onBack={() => setOpenId(null)} />;

  return <Clients />;
}

// Five destinations, plain nouns, nothing hidden — the "an 80-year-old
// architect must never get lost" rule starts here. (Shell ported from
// StudioLog, which itself ported it from StudioHours.)
const NAV: Array<{ view: View; label: string; icon: LucideIcon }> = [
  { view: 'today', label: 'Today', icon: CalendarCheck },
  { view: 'clients', label: 'Clients', icon: Users },
  { view: 'pipeline', label: 'Pipeline', icon: Kanban },
  { view: 'reports', label: 'Reports', icon: BarChart3 },
  { view: 'settings', label: 'Settings', icon: SettingsIcon },
];

function Shell() {
  const { flags, view, setView } = useApp();
  // Clicking the ALREADY-active nav item remounts its screen — the standard
  // "click the current tab to return to its root" behavior (e.g. backs out of
  // an open client page to the directory list).
  const [remount, setRemount] = useState(0);

  useEffect(() => {
    // Gate on flags being loaded (mirrors StudioHours' `ready` gate) so the
    // stub below never fires before the shell has actually mounted.
    if (flags !== undefined) void maybeStartTourFor(view);
  }, [flags, view]);

  if (flags === undefined) return null; // still loading IndexedDB

  // today is wired up for real via screens/Today.tsx (the one "Follow-ups
  // due" card); clients via ClientsRoute (list<->detail switch); pipeline via
  // screens/Pipeline.tsx (stage board + AddLeadDialog); reports via
  // screens/Reports.tsx (pipeline value chart + win-rate tables +
  // lead-to-award/fee-calibration stats); settings via screens/Settings.tsx
  // (backup/restore + danger zone so far — later steps extend that file).
  const screen: Record<View, ReactNode> = {
    today: <Today />,
    clients: <ClientsRoute />,
    pipeline: <Pipeline />,
    reports: <Reports />,
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
          <span className="font-bold">StudioCRM</span>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1" aria-label="Main">
            {NAV.map((n) => (
              <button
                key={n.view}
                type="button"
                onClick={() => goTo(n.view)}
                className={`flex min-h-11 cursor-pointer items-center gap-1.5 border-b-2 px-2 transition-colors duration-200 ${
                  view === n.view
                    ? 'border-ink font-bold'
                    : 'border-transparent text-ink-soft hover:border-line hover:text-ink'
                }`}
                aria-current={view === n.view ? 'page' : undefined}
              >
                <n.icon className="h-4 w-4" aria-hidden />
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
