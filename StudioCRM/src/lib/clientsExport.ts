// Clients-for-studio export — builds the won-client/contact hand-off that is
// manually referenced while creating projects in StudioLog/StudioHours.
// A pure module: the builder takes ONLY plain client/contact/lead arrays, so
// by construction it cannot reach the interactions or reminders tables or any
// other confidential data — same discipline as StudioHours'
// lib/studiopayExport.ts, applied here to this app's one shareable artifact.
// Only clients with at least one WON lead travel; open prospects never leave
// this app. Each contact carries ONLY name + org (synthesized from the client
// name) + role + email + phone. Everything else is EXCLUDED and must stay so:
//   - Client: type, website, address, source, tags, and notes never travel.
//   - Lead: NO lead field travels, ever — not title, stage, projectType,
//     sector, estimatedFee, feeProposed, feeWon, probability,
//     submissionDeadline, decisionDate, goNoGoDecision, goNoGoNotes,
//     leadOwner, outcomeReason, stageChangedAt, or notes. Leads are read
//     solely to decide WHICH clients are eligible (stage === 'won'). The fee
//     figures and win/loss reasoning are the most sensitive data in this app
//     and may never appear in this file.
//   - Interaction: nothing travels — the builder can't even receive them.
//   - Reminder: nothing travels — the builder can't even receive them.
//   - Contact: isPrimary, introducedBy, notes, and the contact's own id/
//     clientId never travel (isPrimary only selects WHO is included).

import type { Client, Contact, Lead } from '../types';
import { nowISO, todayISO } from './dates.ts';
import { slug } from './serialize.ts';

/** Bumped only when THIS file's payload shape changes — kept independent of
 *  the app's internal SCHEMA_VERSION (types.ts) since StudioLog/StudioHours
 *  are separate apps that evolve on their own schedules. */
const CLIENTS_EXPORT_SCHEMA_VERSION = 1;

export interface ClientsExportContact {
  name: string;
  /** the client's name, synthesized — contacts have no org field of their own */
  org: string;
  /** Optional keys are omitted entirely (not present as undefined) when the
   *  source contact doesn't have them. */
  role?: string;
  email?: string;
  phone?: string;
}

export interface ClientsExportClient {
  clientId: string;
  clientName: string;
  contacts: ClientsExportContact[];
}

export interface ClientsExportFile {
  schemaVersion: number;
  exportType: 'clients-for-studio';
  exportedAt: string;
  /** cosmetic — key is omitted entirely when no firm name is set */
  firmName?: string;
  clients: ClientsExportClient[];
}

/** Build the clients-for-studio hand-off from plain client/contact/lead
 *  arrays — no database access, no interactions/reminders tables in scope,
 *  ever. INCLUDES only clients with at least one won lead; per client, only
 *  contacts flagged isPrimary travel, falling back to ALL of that client's
 *  contacts when none is flagged (never silently drop a client's people).
 *  Do not add parameters that widen what this function can reach. */
export function buildClientsExport(
  clients: Client[],
  contacts: Contact[],
  leads: Lead[],
  firmName?: string,
): ClientsExportFile {
  const wonClientIds = new Set(leads.filter((l) => l.stage === 'won').map((l) => l.clientId));
  const eligible = clients.filter((c) => wonClientIds.has(c.id));
  return {
    schemaVersion: CLIENTS_EXPORT_SCHEMA_VERSION,
    exportType: 'clients-for-studio',
    exportedAt: nowISO(),
    ...(firmName !== undefined ? { firmName } : {}),
    clients: eligible.map((client) => {
      const theirs = contacts.filter((ct) => ct.clientId === client.id);
      const primaries = theirs.filter((ct) => ct.isPrimary === true);
      const chosen = primaries.length > 0 ? primaries : theirs;
      return {
        clientId: client.id,
        clientName: client.name,
        contacts: chosen.map((ct) => ({
          name: ct.name,
          org: client.name,
          ...(ct.role !== undefined ? { role: ct.role } : {}),
          ...(ct.email !== undefined ? { email: ct.email } : {}),
          ...(ct.phone !== undefined ? { phone: ct.phone } : {}),
        })),
      };
    }),
  };
}

/** e.g. "atelier-north_clients-for-studio-2026-07-14.json" — the firm-name
 *  prefix is dropped entirely when no firm name is set. */
export function clientsExportFilename(firmName?: string): string {
  return `${firmName ? `${slug(firmName)}_` : ''}clients-for-studio-${todayISO()}.json`;
}
