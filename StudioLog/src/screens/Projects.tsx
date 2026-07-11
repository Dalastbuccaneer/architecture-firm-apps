// Projects — registry list or one open project. Clicking the Projects tab
// while already on it remounts this screen (see App.tsx), which backs out of
// an open project to the list. Other screens deep-link here via
// useApp().openProject(id) (the one-shot requestedProjectId).
//
// Opening a project pushes a browser-history entry, so the browser/Android Back
// button closes the project and returns to the list — mirroring the top-level
// ?view= popstate handling in AppContext (which stays untouched: our pushState
// doesn't change ?view, so AppContext's handler no-ops on the same event while
// this screen closes the open project).

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../AppContext';
import ProjectList from '../components/projects/ProjectList';
import ProjectDetail from '../components/projects/ProjectDetail';

export default function Projects() {
  const { requestedProjectId, requestedProjectTab, clearProjectRequest } = useApp();
  const [openId, setOpenId] = useState<string | null>(requestedProjectId);
  // Which tab the deep link asked for (null = Overview). Captured alongside
  // openId so clearing the one-shot request doesn't lose it.
  const [initialTab, setInitialTab] = useState(requestedProjectTab);
  const projects = useLiveQuery(() => db.projects.toArray(), []);

  useEffect(() => {
    if (requestedProjectId) {
      setOpenId(requestedProjectId);
      setInitialTab(requestedProjectTab);
      clearProjectRequest();
    }
  }, [requestedProjectId, requestedProjectTab, clearProjectRequest]);

  // Push one history entry the first time a project opens; clear the marker
  // when it closes, so the next open pushes a fresh entry.
  const pushedRef = useRef(false);
  useEffect(() => {
    if (openId && !pushedRef.current) {
      window.history.pushState({ slProject: openId }, '');
      pushedRef.current = true;
    } else if (!openId) {
      pushedRef.current = false;
    }
  }, [openId]);

  // Browser Back while a project is open closes it (returns to the list);
  // with no project open it's a harmless no-op and AppContext handles ?view=.
  useEffect(() => {
    const onPop = () => {
      setOpenId((cur) => (cur ? null : cur));
      setInitialTab(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (projects === undefined) return null; // still loading IndexedDB

  const open = openId ? projects.find((p) => p.projectId === openId) : undefined;
  if (open)
    return <ProjectDetail project={open} initialTab={initialTab ?? undefined} onBack={() => setOpenId(null)} />;

  const openFromList = (projectId: string) => {
    setInitialTab(null); // a plain list click always lands on Overview
    setOpenId(projectId);
  };
  return <ProjectList projects={projects} onOpen={openFromList} />;
}
