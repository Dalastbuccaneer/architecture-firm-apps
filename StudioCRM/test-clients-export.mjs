// Clients-for-studio export tests. Same discipline as StudioHours'
// test-studiopay-export.mjs: bundle the REAL src modules with rolldown and run
// them against the actual Dexie database on fake-indexeddb, so the export is
// exercised end-to-end against a REAL populated database — not fixtures
// pretending to be one.
//
// THE ONE UNACCEPTABLE BUG this file exists to prevent: the clients-for-studio
// hand-off (the JSON this app exports for StudioLog/StudioHours) must NEVER
// contain pipeline data (fees, win/loss reasoning, go/no-go notes, stages),
// interactions, reminders, or the confidential client/contact fields (notes,
// address, source, type, website, tags, isPrimary, introducedBy) — only
// won-client names and their contact cards. Section 1 plants unmistakable
// secrets across ALL five domain tables, builds the export from the live
// database, and asserts none of the forbidden material appears, only won
// clients travel, the primary-contact / fallback-to-all rules hold, and only
// the whitelisted key set survives. Run: node test-clients-export.mjs
import 'fake-indexeddb/auto';
import { rolldown } from 'rolldown';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, detail) => { results.push(['FAIL', name]); console.log('FAIL', name, '—', detail); };
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) ok(name);
  else fail(name, `got ${g}, want ${w}`);
};

// ---- bundle the real engine (db layer + export lib, dexie included) -----------
const src = (p) => JSON.stringify(join(import.meta.dirname, 'src', p).replaceAll('\\', '/'));
const tmp = mkdtempSync(join(tmpdir(), 'crm-clients-export-'));
const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, [
  `export { buildClientsExport, clientsExportFilename } from ${src('lib/clientsExport.ts')};`,
  `export { db, resetAll } from ${src('db.ts')};`,
].join('\n'));
const bundle = await rolldown({ input: entry, logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const outfile = join(tmp, 'engine.mjs');
writeFileSync(outfile, output[0].code);
const { buildClientsExport, clientsExportFilename, db, resetAll } =
  await import(pathToFileURL(outfile));
ok('real engine bundled from src (clientsExport + db layer run on fake-indexeddb, not a replica)');

// ---- fixtures: a database FULL of pipeline / relationship secrets --------------
// Fixed ids on purpose: random uuids are hex and can accidentally contain
// forbidden substrings like "fee", which would make the raw-text scan flaky.
const AT = '2026-01-01T00:00:00.000Z';

// Unmistakable planted secrets — none of these strings may ever reach the file.
const SECRET_CLIENT_NOTE = 'SECRET_CLIENT_NOTE_XYZ';
const SECRET_CLIENT_ADDRESS = 'SECRET_CLIENT_ADDRESS_XYZ';
const SECRET_CLIENT_SOURCE = 'SECRET_CLIENT_SOURCE_XYZ';
const SECRET_CLIENT_TYPE = 'SECRET_CLIENT_TYPE_XYZ';
const SECRET_CLIENT_TAG = 'SECRET_CLIENT_TAG_XYZ';
const SECRET_CONTACT_NOTE = 'SECRET_CONTACT_NOTE_XYZ';
const SECRET_LEAD_TITLE = 'SECRET_LEAD_TITLE_XYZ';
const SECRET_FEE_PROPOSED = 424242;
const SECRET_FEE_WON = 393939;
const SECRET_OUTCOME_REASON = 'SECRET_OUTCOME_REASON_XYZ';
const SECRET_GONOGO_NOTES = 'SECRET_GONOGO_NOTES_XYZ';
const SECRET_LEAD_OWNER = 'SECRET_LEAD_OWNER_XYZ';
const SECRET_INTERACTION_SUMMARY = 'SECRET_INTERACTION_SUMMARY_XYZ';
const SECRET_REMINDER_LABEL = 'SECRET_REMINDER_LABEL_XYZ';
const SECRET_PROSPECT_ORG = 'SECRET_PROSPECT_ORG_XYZ';
const SECRET_PROSPECT_CONTACT = 'SECRET_PROSPECT_CONTACT_XYZ';
const SECRET_PROSPECT_FEE = 555555;

await resetAll();

// WON client #1 — Acme: has a flagged primary, so ONLY the primary travels.
await db.clients.bulkPut([
  {
    schemaVersion: 1, id: 'c-won-acme', name: 'Acme Developments',
    type: SECRET_CLIENT_TYPE, website: 'https://secret-client-site.example',
    address: SECRET_CLIENT_ADDRESS, source: SECRET_CLIENT_SOURCE,
    tags: [SECRET_CLIENT_TAG], notes: SECRET_CLIENT_NOTE,
    createdAt: AT, updatedAt: AT,
  },
  // WON client #2 — Harbor: NO contact is flagged primary, so ALL travel.
  {
    schemaVersion: 1, id: 'c-won-harbor', name: 'Harbor Trust',
    tags: [], createdAt: AT, updatedAt: AT,
  },
  // NOT-won client — an open prospect that must never leave this app at all.
  {
    schemaVersion: 1, id: 'c-prospect', name: SECRET_PROSPECT_ORG,
    tags: [], notes: SECRET_CLIENT_NOTE, createdAt: AT, updatedAt: AT,
  },
]);

await db.contacts.bulkPut([
  // Acme's primary — the only Acme person allowed to travel.
  {
    schemaVersion: 1, id: 'ct-acme-primary', clientId: 'c-won-acme',
    name: 'Dana Wright', role: 'Development Director',
    email: 'dana@acme.example', phone: '+1 555 0100', isPrimary: true,
    createdAt: AT, updatedAt: AT,
  },
  // Acme's NON-primary — must be dropped entirely (name and all).
  {
    schemaVersion: 1, id: 'ct-acme-second', clientId: 'c-won-acme',
    name: 'Priya Raman', email: 'priya@acme.example', isPrimary: false,
    introducedBy: 'ct-acme-primary', notes: SECRET_CONTACT_NOTE,
    createdAt: AT, updatedAt: AT,
  },
  // Harbor's two contacts — neither flagged, so BOTH travel (fallback rule).
  {
    schemaVersion: 1, id: 'ct-harbor-1', clientId: 'c-won-harbor',
    name: 'Noor Haddad', email: 'noor@harbortrust.example',
    createdAt: AT, updatedAt: AT,
  },
  {
    schemaVersion: 1, id: 'ct-harbor-2', clientId: 'c-won-harbor',
    name: 'Sam Field', createdAt: AT, updatedAt: AT,
  },
  // The prospect's contact — even flagged primary, it must never travel.
  {
    schemaVersion: 1, id: 'ct-prospect', clientId: 'c-prospect',
    name: SECRET_PROSPECT_CONTACT, isPrimary: true, notes: SECRET_CONTACT_NOTE,
    createdAt: AT, updatedAt: AT,
  },
]);

await db.leads.bulkPut([
  // Acme's WON lead, loaded with every sensitive pipeline field.
  {
    schemaVersion: 1, id: 'l-acme-won', clientId: 'c-won-acme',
    title: SECRET_LEAD_TITLE, stage: 'won',
    projectType: 'New build', sector: 'Residential',
    estimatedFee: 111111, feeProposed: SECRET_FEE_PROPOSED, feeWon: SECRET_FEE_WON,
    probability: 90, submissionDeadline: '2026-02-01', decisionDate: '2026-03-01',
    goNoGoDecision: 'go', goNoGoNotes: SECRET_GONOGO_NOTES,
    leadOwner: SECRET_LEAD_OWNER, outcomeReason: SECRET_OUTCOME_REASON,
    stageChangedAt: AT, notes: SECRET_CLIENT_NOTE, createdAt: AT, updatedAt: AT,
  },
  // Harbor's WON lead — what makes Harbor eligible.
  {
    schemaVersion: 1, id: 'l-harbor-won', clientId: 'c-won-harbor',
    title: SECRET_LEAD_TITLE, stage: 'won', outcomeReason: SECRET_OUTCOME_REASON,
    stageChangedAt: AT, createdAt: AT, updatedAt: AT,
  },
  // The prospect's OPEN lead — proposal_sent is not won, so the client stays home.
  {
    schemaVersion: 1, id: 'l-prospect-open', clientId: 'c-prospect',
    title: SECRET_LEAD_TITLE, stage: 'proposal_sent',
    feeProposed: SECRET_PROSPECT_FEE, goNoGoNotes: SECRET_GONOGO_NOTES,
    stageChangedAt: AT, createdAt: AT, updatedAt: AT,
  },
]);

await db.interactions.put({
  schemaVersion: 1, id: 'i-1', clientId: 'c-won-acme', contactId: 'ct-acme-primary',
  leadId: 'l-acme-won', kind: 'meeting', date: '2026-01-05',
  summary: SECRET_INTERACTION_SUMMARY, createdAt: AT, updatedAt: AT,
});
await db.reminders.put({
  schemaVersion: 1, id: 'r-1', clientId: 'c-won-acme', leadId: 'l-acme-won',
  label: SECRET_REMINDER_LABEL, dueDate: '2026-01-20', reminderDays: 3,
  done: false, createdAt: AT, updatedAt: AT,
});
ok('database populated: 3 clients (2 won, 1 open prospect) + 5 contacts + 3 leads carrying fees/outcome/go-no-go secrets, plus a secret interaction and reminder');

// ---- 1. CONFIDENTIALITY: the clients-for-studio export stays clean -------------
{
  // Read everything back off the LIVE database, exactly as the export screen
  // does — buildClientsExport only ever sees these three arrays + a firm name.
  const allClients = await db.clients.toArray();
  const allContacts = await db.contacts.toArray();
  const allLeads = await db.leads.toArray();
  eq('live query: 3 clients / 5 contacts / 3 leads on file',
    [allClients.length, allContacts.length, allLeads.length], [3, 5, 3]);

  const payload = buildClientsExport(allClients, allContacts, allLeads, 'Atelier North');
  const text = JSON.stringify(payload, null, 2);

  // (a) deep case-insensitive scan: no forbidden key/word ANYWHERE in the tree
  // or the raw serialized text. ("type" and "id" are checked as EXACT keys
  // below because the whitelisted exportType/clientId keys contain them.)
  const forbidden = [
    'notes', 'address', 'website', 'tags', 'isPrimary', 'introducedBy',
    'stage', 'fee', 'probability', 'deadline', 'decision', 'goNoGo',
    'outcome', 'leadOwner', 'estimated', 'propos', 'sector', 'title',
    'summary', 'interaction', 'reminder', 'label', 'dueDate', 'done', 'source',
  ];
  const forbiddenRe = new RegExp(forbidden.join('|'), 'i');
  const badKeys = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        const lower = k.toLowerCase();
        if (forbiddenRe.test(k) || lower === 'type' || lower === 'id') badKeys.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(payload, '$');
  eq('export: deep key scan finds no forbidden keys (nor bare "type"/"id")', badKeys, []);
  for (const word of forbidden) {
    eq(`export: no "${word}" anywhere in the raw serialized text`, new RegExp(word, 'i').test(text), false);
  }

  // (b) the planted secret VALUES are nowhere in the raw text either.
  eq('export: client note absent', text.includes(SECRET_CLIENT_NOTE), false);
  eq('export: client address absent', text.includes(SECRET_CLIENT_ADDRESS), false);
  eq('export: client source absent', text.includes(SECRET_CLIENT_SOURCE), false);
  eq('export: client type absent', text.includes(SECRET_CLIENT_TYPE), false);
  eq('export: client tag absent', text.includes(SECRET_CLIENT_TAG), false);
  eq('export: client website absent', text.includes('secret-client-site'), false);
  eq('export: contact note absent', text.includes(SECRET_CONTACT_NOTE), false);
  eq('export: lead title absent', text.includes(SECRET_LEAD_TITLE), false);
  eq('export: feeProposed figure absent', text.includes(String(SECRET_FEE_PROPOSED)), false);
  eq('export: feeWon figure absent', text.includes(String(SECRET_FEE_WON)), false);
  eq('export: estimatedFee figure absent', text.includes('111111'), false);
  eq('export: prospect feeProposed figure absent', text.includes(String(SECRET_PROSPECT_FEE)), false);
  eq('export: outcomeReason absent', text.includes(SECRET_OUTCOME_REASON), false);
  eq('export: goNoGoNotes absent', text.includes(SECRET_GONOGO_NOTES), false);
  eq('export: leadOwner absent', text.includes(SECRET_LEAD_OWNER), false);
  eq('export: interaction summary absent', text.includes(SECRET_INTERACTION_SUMMARY), false);
  eq('export: reminder label absent', text.includes(SECRET_REMINDER_LABEL), false);

  // (c) only WON clients travel — the open prospect is fully excluded.
  eq('export: exactly the 2 won clients are present',
    payload.clients.map((c) => c.clientId).sort(), ['c-won-acme', 'c-won-harbor']);
  eq('export: not-won client id absent', text.includes('c-prospect'), false);
  eq('export: not-won client name absent', text.includes(SECRET_PROSPECT_ORG), false);
  eq('export: not-won client contact absent (even though flagged primary)', text.includes(SECRET_PROSPECT_CONTACT), false);

  // (d) primary-contact rule: Acme has a flagged primary, so ONLY Dana travels;
  // the non-primary contact is dropped entirely — name, email, everything.
  const acme = payload.clients.find((c) => c.clientId === 'c-won-acme');
  eq('export: Acme carries exactly its one primary contact', acme.contacts.map((ct) => ct.name), ['Dana Wright']);
  eq('export: Acme non-primary contact fully absent from the raw text', /Priya|priya@acme/.test(text), false);
  eq('export: primary contact org synthesized from the client name', acme.contacts[0].org, 'Acme Developments');
  eq('export: primary contact role/email/phone carried through',
    [acme.contacts[0].role, acme.contacts[0].email, acme.contacts[0].phone],
    ['Development Director', 'dana@acme.example', '+1 555 0100']);

  // (e) fallback rule: Harbor has NO flagged primary, so ALL its contacts travel.
  const harbor = payload.clients.find((c) => c.clientId === 'c-won-harbor');
  eq('export: Harbor falls back to ALL contacts when none is primary',
    harbor.contacts.map((ct) => ct.name).sort(), ['Noor Haddad', 'Sam Field']);

  // (f) exactly the whitelisted keys are present at every level — nothing extra
  // can ride along, whatever it's called. Optional keys are OMITTED, not
  // present-as-undefined.
  eq('export: envelope has exactly the whitelisted keys',
    Object.keys(payload).sort(), ['clients', 'exportType', 'exportedAt', 'firmName', 'schemaVersion']);
  for (const client of payload.clients) {
    eq(`export: client "${client.clientName}" carries ONLY clientId + clientName + contacts`,
      Object.keys(client).sort(), ['clientId', 'clientName', 'contacts']);
  }
  eq('export: full-card contact carries ONLY name/org/role/email/phone',
    Object.keys(acme.contacts[0]).sort(), ['email', 'name', 'org', 'phone', 'role']);
  const noor = harbor.contacts.find((ct) => ct.name === 'Noor Haddad');
  const sam = harbor.contacts.find((ct) => ct.name === 'Sam Field');
  eq('export: email-only contact omits role/phone keys entirely', Object.keys(noor).sort(), ['email', 'name', 'org']);
  eq('export: name-only contact carries ONLY name + org', Object.keys(sam).sort(), ['name', 'org']);

  // (g) envelope shape is correct.
  eq('export: exportType is clients-for-studio', payload.exportType, 'clients-for-studio');
  eq('export: schemaVersion is 1', payload.schemaVersion, 1);
  eq('export: firmName carried through', payload.firmName, 'Atelier North');
  eq('export: exportedAt looks like an ISO timestamp', /^\d{4}-\d{2}-\d{2}T/.test(payload.exportedAt), true);

  // (h) no firm name -> the firmName key is omitted entirely, not undefined.
  const anon = buildClientsExport(allClients, allContacts, allLeads);
  eq('export: firmName key absent when no firm name is given', 'firmName' in anon, false);

  // (i) empty inputs still produce a well-formed (empty) export.
  const empty = buildClientsExport([], [], [], 'Atelier North');
  eq('export: empty inputs -> empty clients array, still valid envelope',
    [empty.clients.length, empty.exportType, empty.schemaVersion], [0, 'clients-for-studio', 1]);

  // (j) filename helper follows the app's slug + date convention.
  const fileName = clientsExportFilename('Atelier North');
  eq('filename: starts with the slugged firm name', fileName.startsWith('atelier-north_'), true);
  eq('filename: contains "clients-for-studio"', fileName.includes('clients-for-studio'), true);
  eq('filename: contains a YYYY-MM-DD date and ends with .json', /clients-for-studio-\d{4}-\d{2}-\d{2}\.json$/.test(fileName), true);
  eq('filename: no firm name -> no prefix at all', /^clients-for-studio-\d{4}-\d{2}-\d{2}\.json$/.test(clientsExportFilename()), true);
}

// ---- 2. sanity: the source data really did have the forbidden material on it ---
// (positive control — proves section 1's clean result isn't just an empty test)
{
  const rawRows = JSON.stringify({
    clients: await db.clients.toArray(),
    contacts: await db.contacts.toArray(),
    leads: await db.leads.toArray(),
    interactions: await db.interactions.toArray(),
    reminders: await db.reminders.toArray(),
  });
  eq('positive control: source rows DO contain the planted secrets', {
    clientNote: rawRows.includes(SECRET_CLIENT_NOTE),
    address: rawRows.includes(SECRET_CLIENT_ADDRESS),
    source: rawRows.includes(SECRET_CLIENT_SOURCE),
    feeProposed: rawRows.includes(String(SECRET_FEE_PROPOSED)),
    feeWon: rawRows.includes(String(SECRET_FEE_WON)),
    outcomeReason: rawRows.includes(SECRET_OUTCOME_REASON),
    goNoGoNotes: rawRows.includes(SECRET_GONOGO_NOTES),
    interactionSummary: rawRows.includes(SECRET_INTERACTION_SUMMARY),
    reminderLabel: rawRows.includes(SECRET_REMINDER_LABEL),
    prospect: rawRows.includes(SECRET_PROSPECT_ORG),
  }, {
    clientNote: true, address: true, source: true, feeProposed: true,
    feeWon: true, outcomeReason: true, goNoGoNotes: true,
    interactionSummary: true, reminderLabel: true, prospect: true,
  });

  const wonLead = await db.leads.get('l-acme-won');
  eq('positive control: leads table really does hold the planted fee figures',
    [wonLead?.feeProposed, wonLead?.feeWon], [SECRET_FEE_PROPOSED, SECRET_FEE_WON]);
}

await resetAll();
ok('resetAll clears the database after the run');

// ---- summary --------------------------------------------------------------------
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
