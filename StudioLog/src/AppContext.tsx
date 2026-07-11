import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getFlags } from './db';
import type { AppFlags } from './types';

// Three destinations, plain nouns — the whole app. (Nav-shell pattern ported
// from StudioHours, minus its firm/person machinery.)
export type View = 'today' | 'projects' | 'settings';
const VIEWS: View[] = ['today', 'projects', 'settings'];

/** The in-page tabs of one project's page (ProjectDetail). Lives here so
 *  cross-links can name a landing tab without importing a component. */
export type ProjectTab = 'overview' | 'deliverables' | 'log' | 'notes' | 'tasks' | 'contacts';

export interface AppCtx {
  flags: AppFlags | undefined;
  view: View;
  setView: (v: View) => void;
  /** One-shot cross-link payload: the Today screen (or any later screen) calls
   *  openProject(id) to jump to Projects with that project's page open —
   *  optionally landing on a specific tab (e.g. 'log' from an overdue RFI
   *  row). The Projects screen consumes it and clears it so a later plain
   *  visit opens the registry list normally. */
  requestedProjectId: string | null;
  requestedProjectTab: ProjectTab | null;
  openProject: (projectId: string, tab?: ProjectTab) => void;
  clearProjectRequest: () => void;
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
  const [requestedProjectId, setRequestedProjectId] = useState<string | null>(null);
  const [requestedProjectTab, setRequestedProjectTab] = useState<ProjectTab | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    const url = new URL(window.location.href);
    url.searchParams.set('view', v);
    window.history.replaceState(null, '', url);
  };

  const openProject = (projectId: string, tab?: ProjectTab) => {
    setRequestedProjectId(projectId);
    setRequestedProjectTab(tab ?? null);
    setView('projects');
  };
  const clearProjectRequest = () => {
    setRequestedProjectId(null);
    setRequestedProjectTab(null);
  };

  useEffect(() => {
    const onPop = () => setViewState(initialView());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <Ctx.Provider
      value={{ flags, view, setView, requestedProjectId, requestedProjectTab, openProject, clearProjectRequest }}
    >
      {children}
    </Ctx.Provider>
  );
}
