// Clients — the win-work directory: every organization in your network, one
// flat list (no status grouping like StudioLog's Projects — Directory doesn't
// group by pipeline stage, that's what Pipeline is for). Add a client here;
// click a row to open its Overview/Contacts/Leads/Interactions/Reminders
// page via AppContext's openClient (App.tsx owns the list<->detail switch).

import { useLiveQuery } from 'dexie-react-hooks';
import { FileOutput } from 'lucide-react';
import { db, kvGet } from '../db';
import { useApp } from '../AppContext';
import EmptyState from '../components/EmptyState';
import AddClientDialog from '../components/clients/AddClientDialog';
import { buildClientsExport, clientsExportFilename } from '../lib/clientsExport';
import { downloadText } from '../lib/download';

export default function Clients() {
  const { openClient } = useApp();
  const clients = useLiveQuery(() => db.clients.toArray(), []);
  const contacts = useLiveQuery(() => db.contacts.toArray(), []);
  const leads = useLiveQuery(() => db.leads.toArray(), []);
  const firmName = useLiveQuery(() => kvGet<string>('firmName'), []);

  if (clients === undefined || contacts === undefined || leads === undefined) return null; // still loading IndexedDB

  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));

  // Same eligibility rule as buildClientsExport: a client travels only once it
  // has at least one WON lead. Computed live here purely to drive the
  // button's disabled state/tooltip — the actual filtering happens again,
  // independently, inside buildClientsExport itself.
  const wonClientIds = new Set(leads.filter((l) => l.stage === 'won').map((l) => l.clientId));
  const eligibleCount = clients.filter((c) => wonClientIds.has(c.id)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AddClientDialog onCreated={openClient} dataTour="add-client" />
          <button
            type="button"
            disabled={eligibleCount === 0}
            title={eligibleCount === 0 ? 'No clients with a won lead yet' : undefined}
            data-tour="clients-export"
            onClick={() =>
              downloadText(
                clientsExportFilename(firmName),
                JSON.stringify(buildClientsExport(clients, contacts, leads, firmName), null, 2),
              )
            }
            className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileOutput className="h-4 w-4" aria-hidden /> Export clients for StudioLog/StudioHours
          </button>
        </div>
      </div>

      <p className="mt-2 text-ink-soft">
        This is a one-way, manual hand-off: open the downloaded file and copy the details into StudioLog's or
        StudioHours's own client/contact fields by hand — nothing imports automatically.
      </p>

      {sorted.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No clients yet"
            hint="Add the first organization in your network — a client, developer, consultant, or contractor. Nothing leaves this computer."
            action={<AddClientDialog onCreated={openClient} variant="plain" />}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {sorted.map((c) => {
            const primary = contacts.find((k) => k.clientId === c.id && k.isPrimary);
            const openLeads = leads.filter(
              (l) => l.clientId === c.id && l.stage !== 'won' && l.stage !== 'lost',
            ).length;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openClient(c.id)}
                  aria-label={`Open ${c.name}`}
                  className="flex w-full cursor-pointer flex-col gap-2 border border-line p-4 text-left transition-colors duration-200 hover:border-ink"
                >
                  <span className="flex min-h-6 w-full flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-bold">{c.name}</span>
                    {primary && <span className="text-ink-soft">{primary.name}</span>}
                    {openLeads > 0 && (
                      <span className="text-ink-soft">
                        {openLeads} open lead{openLeads === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  {c.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {c.tags.map((t) => (
                        <span key={t} className="border border-line px-2 py-0.5 text-ink-soft">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
