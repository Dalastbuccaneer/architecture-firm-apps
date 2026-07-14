import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getFlags } from './db';
import type { AppFlags } from './types';

// Five destinations, plain nouns — the whole app. (Nav-shell pattern ported
// from StudioLog, which itself ported it from StudioHours.)
export type View = 'today' | 'clients' | 'pipeline' | 'reports' | 'settings';
const VIEWS: View[] = ['today', 'clients', 'pipeline', 'reports', 'settings'];

/** The in-page tabs of one client's page (Client Detail). Lives here so
 *  cross-links can name a landing tab without importing a component. */
export type ClientTab = 'overview' | 'contacts' | 'leads' | 'interactions' | 'reminders';

export interface AppCtx {
  flags: AppFlags | undefined;
  view: View;
  setView: (v: View) => void;
  /** One-shot cross-link payload: the Today screen (or any later screen) calls
   *  openClient(id) to jump to Clients with that client's page open —
   *  optionally landing on a specific tab (e.g. 'reminders' from an overdue
   *  follow-up row). The Clients screen consumes it and clears it so a later
   *  plain visit opens the directory list normally. */
  requestedClientId: string | null;
  requestedClientTab: ClientTab | null;
  openClient: (clientId: string, tab?: ClientTab) => void;
  clearClientRequest: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

function initialView(): View {
  const v = new URLSearchParams(window.location.search).get('view');
  return VIEWS.includes(v as View) ? (v as View) : 'today';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const flags = useLiveQuery(() => getFlags(), []);
  const [view, setViewState] = useState<View>(initialView);
  const [requestedClientId, setRequestedClientId] = useState<string | null>(null);
  const [requestedClientTab, setRequestedClientTab] = useState<ClientTab | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    const url = new URL(window.location.href);
    url.searchParams.set('view', v);
    window.history.replaceState(null, '', url);
  };

  const openClient = (clientId: string, tab?: ClientTab) => {
    setRequestedClientId(clientId);
    setRequestedClientTab(tab ?? null);
    setView('clients');
  };
  const clearClientRequest = () => {
    setRequestedClientId(null);
    setRequestedClientTab(null);
  };

  useEffect(() => {
    const onPop = () => setViewState(initialView());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <Ctx.Provider
      value={{ flags, view, setView, requestedClientId, requestedClientTab, openClient, clearClientRequest }}
    >
      {children}
    </Ctx.Provider>
  );
}
