// One project's page: header (name, meta, edit), then six in-page tabs —
// Overview, Deliverables, Log, Notes, Tasks, and Contacts, all live.

import { useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Project } from '../../types';
import { PROJECT_STATUS_LABEL } from '../../types';
import type { ProjectTab } from '../../AppContext';
import { fullDateLabel } from '../../lib/dates';
import EditProjectDialog from './EditProjectDialog';
import OverviewTab from './OverviewTab';
import DeliverablesTab from './DeliverablesTab';
import LogTab from './LogTab';
import NotesTab from './NotesTab';
import TasksTab from './TasksTab';
import ContactsTab from './ContactsTab';

const TABS: Array<{ id: ProjectTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'deliverables', label: 'Drawings' },
  { id: 'log', label: 'Log' },
  { id: 'notes', label: 'Notes' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'contacts', label: 'Contacts' },
];

export default function ProjectDetail({
  project,
  onBack,
  initialTab,
}: {
  project: Project;
  onBack: () => void;
  /** deep links (e.g. an overdue RFI on Today) can land on a specific tab */
  initialTab?: ProjectTab;
}) {
  const [tab, setTab] = useState<ProjectTab>(initialTab ?? 'overview');

  const meta = [
    project.projectNumber,
    project.clientName,
    project.startDate ? `started ${fullDateLabel(project.startDate)}` : undefined,
    PROJECT_STATUS_LABEL[project.status],
  ].filter(Boolean);

  const TAB_CONTENT: Record<ProjectTab, ReactNode> = {
    overview: <OverviewTab project={project} onDeleted={onBack} />,
    deliverables: <DeliverablesTab project={project} />,
    log: <LogTab project={project} />,
    notes: <NotesTab project={project} />,
    tasks: <TasksTab project={project} />,
    contacts: <ContactsTab project={project} />,
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{project.projectName}</h1>
          {meta.length > 0 && <p className="mt-1 text-ink-soft">{meta.join(' · ')}</p>}
        </div>
        <EditProjectDialog project={project} />
      </div>

      <div role="tablist" aria-label="Project sections" className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-h-11 cursor-pointer items-center border-b-2 px-2 transition-colors duration-200 ${
              tab === t.id
                ? 'border-ink font-bold'
                : 'border-transparent text-ink-soft hover:border-line hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">{TAB_CONTENT[tab]}</div>
    </div>
  );
}
