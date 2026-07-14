// One client's page: header (name, meta, edit, delete), then five in-page
// tabs — Overview, Contacts, Leads, Interactions, Reminders. Structural
// pattern (list + detail with in-page tabs) ported from StudioLog's
// ProjectDetail.tsx: same border-line/ink-soft/ink active-tab convention.
// Deleting a client removes everything logged under it — contacts, leads,
// interactions, reminders — via deleteClientCascade, behind a single
// confirm() dialog (this is destructive and, unlike a single contact, can't
// be casually re-created).

import { useState, type ReactNode } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { Client } from '../types';
import type { ClientTab } from '../AppContext';
import { deleteClientCascade } from '../db';
import EditClientDialog from '../components/clients/EditClientDialog';
import OverviewTab from '../components/clients/OverviewTab';
import ContactsTab from '../components/clients/ContactsTab';
import LeadsTab from '../components/clients/LeadsTab';
import InteractionsTab from '../components/clients/InteractionsTab';
import RemindersTab from '../components/clients/RemindersTab';

const TABS: Array<{ id: ClientTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'leads', label: 'Leads' },
  { id: 'interactions', label: 'Interactions' },
  { id: 'reminders', label: 'Reminders' },
];

export default function ClientDetail({
  client,
  onBack,
  initialTab,
}: {
  client: Client;
  onBack: () => void;
  /** deep links (e.g. an overdue reminder on Today) can land on a specific tab */
  initialTab?: ClientTab;
}) {
  const [tab, setTab] = useState<ClientTab>(initialTab ?? 'overview');
  const [busy, setBusy] = useState(false);

  const meta = [client.type, client.source, client.website].filter(Boolean);

  const onDelete = async () => {
    if (
      !window.confirm(
        `Delete "${client.name}" and everything logged under it — contacts, leads, interactions, and reminders? This can't be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteClientCascade(client.id);
    } finally {
      setBusy(false);
    }
    onBack();
  };

  const TAB_CONTENT: Record<ClientTab, ReactNode> = {
    overview: <OverviewTab client={client} />,
    contacts: <ContactsTab client={client} />,
    leads: <LeadsTab client={client} />,
    interactions: <InteractionsTab client={client} />,
    reminders: <RemindersTab client={client} />,
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All clients
      </button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          {meta.length > 0 && <p className="mt-1 text-ink-soft">{meta.join(' · ')}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditClientDialog client={client} />
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={busy}
            aria-label={`Delete ${client.name}`}
            className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 text-ink-soft transition-colors duration-200 hover:border-alert hover:text-alert disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete…
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Client sections"
        className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-line"
      >
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
