// Client -> Overview: the client's own directory fields (name, type, website,
// address, tags, notes) with an edit affordance, plus a read-only
// relationship-history block — (a) last touchpoint: the most recent
// interactions.date across this client's interactions, (b) past opportunities:
// this client's WON leads (title + fee + decision date), and (c) a referral
// network built from contacts.introducedBy: who introduced this client's own
// contacts, and who this client's contacts have gone on to introduce
// elsewhere. Plain lists only, no graph visualization — out of proportion for
// a lightweight CRM (see the plan's "Screens" section, Clients bullet).

import { useLiveQuery } from 'dexie-react-hooks';
import { Globe } from 'lucide-react';
import type { Client } from '../../types';
import { db } from '../../db';
import { fullDateLabel } from '../../lib/dates';
import EditClientDialog from './EditClientDialog';

function formatFee(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return amount.toLocaleString();
  }
}

function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export default function OverviewTab({ client }: { client: Client }) {
  // All contacts (not just this client's) are needed to resolve the
  // introducedBy graph across client boundaries.
  const contacts = useLiveQuery(() => db.contacts.toArray(), []);
  const clients = useLiveQuery(() => db.clients.toArray(), []);
  const leads = useLiveQuery(() => db.leads.where('clientId').equals(client.id).toArray(), [client.id]);
  const interactions = useLiveQuery(
    () => db.interactions.where('clientId').equals(client.id).toArray(),
    [client.id],
  );

  if (contacts === undefined || clients === undefined || leads === undefined || interactions === undefined) {
    return null; // still loading IndexedDB
  }

  const clientContacts = contacts.filter((c) => c.clientId === client.id);
  const clientContactIds = new Set(clientContacts.map((c) => c.id));

  // (a) Last touchpoint — max interactions.date across this client's interactions.
  const lastTouchpoint = interactions.reduce<string | null>(
    (max, i) => (max === null || i.date > max ? i.date : max),
    null,
  );

  // (b) Past opportunities — this client's won leads, most recently decided first.
  const wonLeads = [...leads]
    .filter((l) => l.stage === 'won')
    .sort((a, b) => (b.decisionDate ?? '').localeCompare(a.decisionDate ?? ''));

  // (c) Referral network — the contacts.introducedBy graph, two directions:
  //   - this client's own contacts who were introduced by someone
  //   - contacts at OTHER clients who were introduced by one of this client's contacts
  const introducedByRows = clientContacts
    .filter((c) => c.introducedBy)
    .map((c) => ({ contact: c, introducer: contacts.find((x) => x.id === c.introducedBy) }));

  const hasIntroducedRows = contacts
    .filter((z) => z.clientId !== client.id && z.introducedBy && clientContactIds.has(z.introducedBy))
    .map((z) => ({
      contact: z,
      introducer: clientContacts.find((c) => c.id === z.introducedBy)!,
      atClient: clients.find((cl) => cl.id === z.clientId),
    }));

  const hasReferralData = introducedByRows.length > 0 || hasIntroducedRows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Details */}
      <section className="border border-line p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Details</h2>
          <EditClientDialog client={client} />
        </div>

        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-ink-soft">Name</dt>
            <dd>{client.name}</dd>
          </div>

          <div>
            <dt className="text-ink-soft">Type</dt>
            <dd>{client.type || 'Not set'}</dd>
          </div>

          <div>
            <dt className="text-ink-soft">Website</dt>
            <dd>
              {client.website ? (
                <a
                  href={websiteHref(client.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 w-fit items-center gap-1.5 underline underline-offset-4 transition-colors duration-200 hover:text-ink-soft"
                >
                  <Globe className="h-4 w-4 shrink-0" aria-hidden />
                  {client.website}
                </a>
              ) : (
                'Not set'
              )}
            </dd>
          </div>

          <div>
            <dt className="text-ink-soft">Address</dt>
            <dd>{client.address || 'Not set'}</dd>
          </div>

          <div>
            <dt className="text-ink-soft">Tags</dt>
            <dd>
              {client.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {client.tags.map((t) => (
                    <span key={t} className="border border-line px-2 py-0.5 text-ink-soft">
                      {t}
                    </span>
                  ))}
                </span>
              ) : (
                'None'
              )}
            </dd>
          </div>

          <div>
            <dt className="text-ink-soft">Notes</dt>
            <dd className="whitespace-pre-wrap">{client.notes || 'None'}</dd>
          </div>
        </dl>
      </section>

      {/* Relationship history */}
      <section className="border border-line p-4">
        <h2 className="mb-1 font-bold">Relationship history</h2>
        <p className="mb-3 text-ink-soft">
          Everything below is derived from this app's own records — activity, opportunities, and referrals logged
          here.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-bold">Last touchpoint</h3>
            <p className="mt-1">
              {lastTouchpoint ? fullDateLabel(lastTouchpoint) : 'No interactions logged yet.'}
            </p>
          </div>

          <div>
            <h3 className="font-bold">Past opportunities</h3>
            {wonLeads.length === 0 ? (
              <p className="mt-1 text-ink-soft">No won opportunities yet.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-2">
                {wonLeads.map((l) => {
                  const fee = l.feeWon ?? l.feeProposed;
                  return (
                    <li key={l.id} className="border border-line p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-bold">{l.title}</span>
                        {fee !== undefined && <span>{formatFee(fee)}</span>}
                      </div>
                      {l.decisionDate && <p className="text-ink-soft">Decided {fullDateLabel(l.decisionDate)}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-bold">Referral network</h3>
            {!hasReferralData ? (
              <p className="mt-1 text-ink-soft">No referral connections logged yet.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {introducedByRows.map(({ contact, introducer }) => (
                  <li key={`in-${contact.id}`}>
                    {contact.name} introduced by {introducer ? introducer.name : 'someone no longer in the directory'}
                  </li>
                ))}
                {hasIntroducedRows.map(({ contact, introducer, atClient }) => (
                  <li key={`out-${contact.id}`}>
                    {introducer.name} has introduced: {contact.name} at {atClient ? atClient.name : 'another client'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
