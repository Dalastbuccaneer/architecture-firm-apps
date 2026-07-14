// Client -> Interactions: activity log for this client, newest date first.
// Structural pattern (list + expandable card) ported from StudioLog's
// NotesTab.tsx/NoteCard.tsx, stripped of attendees/photoLinks/actions.
// Interactions instead get a contactId/leadId picker and an optional
// follow-up date/label pair (see InteractionFormDialog) that writes a linked
// Reminder in the same call.

import { useLiveQuery } from 'dexie-react-hooks';
import type { Client } from '../../types';
import { db } from '../../db';
import EmptyState from '../EmptyState';
import InteractionFormDialog from './InteractionFormDialog';
import InteractionCard from './InteractionCard';

export default function InteractionsTab({ client }: { client: Client }) {
  const interactions = useLiveQuery(
    () => db.interactions.where('clientId').equals(client.id).toArray(),
    [client.id],
  );
  const contacts = useLiveQuery(
    () => db.contacts.where('clientId').equals(client.id).toArray(),
    [client.id],
  );
  const leads = useLiveQuery(() => db.leads.where('clientId').equals(client.id).toArray(), [client.id]);

  if (interactions === undefined || contacts === undefined || leads === undefined) return null;

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const sorted = [...interactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">Calls, emails, meetings, and site visits with this client.</p>
        <InteractionFormDialog client={client} contacts={contacts} leads={leads} />
      </div>

      {sorted.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No interactions logged yet."
            hint="Log a call, email, meeting, or site visit to start this client's activity history."
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {sorted.map((interaction) => (
            <InteractionCard
              key={interaction.id}
              interaction={interaction}
              contact={interaction.contactId ? contactById.get(interaction.contactId) : undefined}
              lead={interaction.leadId ? leadById.get(interaction.leadId) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
