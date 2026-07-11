import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getFirm, getFlags } from './db';
import type { AppFlags, FirmFile, Person } from './types';

// 'invoices' is the Money tab — the internal key never changed, so old
// ?view=invoices links keep working. 'reports' is no longer a view of its own
// (My reports lives inside Week now); initialView maps old links there.
export type View = 'week' | 'invoices' | 'dashboard' | 'people' | 'setup' | 'settings';
const VIEWS: View[] = ['week', 'invoices', 'dashboard', 'people', 'setup', 'settings'];

export interface AppCtx {
  /** undefined = still loading, null = no firm yet (first run) */
  firm: FirmFile | null | undefined;
  flags: AppFlags | undefined;
  /** the person using this install (from flags.meId), null until chosen */
  me: Person | null;
  view: View;
  setView: (v: View) => void;
  /** One-shot cross-link payload: "View burn" (Setup) sets it and jumps to the
   *  Dashboard, which opens the Fee Burn tab on this project and then clears it
   *  so a later plain visit to the Dashboard opens normally. */
  feeBurnProjectId: string | null;
  openFeeBurn: (projectId: string) => void;
  clearFeeBurnRequest: () => void;
  /** Same one-shot idiom for the Dashboard's "Coming up for renewal" strip:
   *  jump to People with the Renewals sub-tab open, then clear. */
  peopleRenewalsRequested: boolean;
  openPeopleRenewals: () => void;
  clearPeopleRenewalsRequest: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

function initialView(): View {
  const v = new URLSearchParams(window.location.search).get('view');
  if (v === 'reports') return 'week'; // pre-restructure bookmark: Reports is now a tab inside Week
  return VIEWS.includes(v as View) ? (v as View) : 'week';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const firm = useLiveQuery(async () => (await getFirm()) ?? null, []);
  const flags = useLiveQuery(() => getFlags(), []);
  const [view, setViewState] = useState<View>(initialView);
  const [feeBurnProjectId, setFeeBurnProjectId] = useState<string | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    const url = new URL(window.location.href);
    url.searchParams.set('view', v);
    window.history.replaceState(null, '', url);
  };

  const openFeeBurn = (projectId: string) => {
    setFeeBurnProjectId(projectId);
    setView('dashboard');
  };
  const clearFeeBurnRequest = () => setFeeBurnProjectId(null);

  const [peopleRenewalsRequested, setPeopleRenewalsRequested] = useState(false);
  const openPeopleRenewals = () => {
    setPeopleRenewalsRequested(true);
    setView('people');
  };
  const clearPeopleRenewalsRequest = () => setPeopleRenewalsRequested(false);

  useEffect(() => {
    const onPop = () => setViewState(initialView());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const me = (flags?.meId && firm?.people.find((p) => p.personId === flags.meId)) || null;

  return (
    <Ctx.Provider
      value={{
        firm,
        flags,
        me,
        view,
        setView,
        feeBurnProjectId,
        openFeeBurn,
        clearFeeBurnRequest,
        peopleRenewalsRequested,
        openPeopleRenewals,
        clearPeopleRenewalsRequest,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
