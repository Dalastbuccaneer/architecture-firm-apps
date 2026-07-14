// Live-Dexie test for src/lib/backup.ts. db.ts and backup.ts use extensionless
// relative imports (Vite-style), so plain node can't resolve them directly —
// this bundles the REAL src modules with rolldown (same trick as
// StudioPay/test-backup.mjs and StudioHours/test-people.mjs) and runs them
// against fake-indexeddb: a genuinely populated Dexie database, not a
// hand-rolled stand-in for one. Runner style (test() + node:assert) matches
// StudioLog/test-deadlines.mjs. Run: node test-backup.mjs
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { rolldown } from 'rolldown';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let n = 0;
const test = async (name, fn) => {
  await fn();
  n++;
  console.log('PASS', name);
};

// ---- bundle the real engine (db layer + backup lib, dexie included) -------------
const src = (p) => JSON.stringify(join(import.meta.dirname, 'src', p).replaceAll('\\', '/'));
const tmp = mkdtempSync(join(tmpdir(), 'crm-backup-'));
const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, [
  `export { db, resetAll, kvSet, kvGet } from ${src('db.ts')};`,
  `export { buildBackup, restoreBackup } from ${src('lib/backup.ts')};`,
  `export { ParseError } from ${src('lib/serialize.ts')};`,
  `export { SCHEMA_VERSION } from ${src('types.ts')};`,
].join('\n'));
const bundle = await rolldown({ input: entry, logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const outfile = join(tmp, 'engine.mjs');
writeFileSync(outfile, output[0].code);
const { db, resetAll, kvSet, kvGet, buildBackup, restoreBackup, ParseError, SCHEMA_VERSION } =
  await import(pathToFileURL(outfile));

await test('real engine bundled from src (db + backup run on fake-indexeddb, not a replica)', () => {
  assert.equal(typeof db.clients.bulkPut, 'function');
  assert.equal(typeof buildBackup, 'function');
  assert.equal(typeof restoreBackup, 'function');
});

// ---- fixtures -----------------------------------------------------------------------
const AT = '2026-01-01T00:00:00.000Z';
const rid = (p) => `${p}-${Math.random().toString(36).slice(2)}`;

const mkClient = (over = {}) => ({
  schemaVersion: 1,
  id: rid('c'),
  name: 'Client',
  tags: [],
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const mkContact = (over = {}) => ({
  schemaVersion: 1,
  id: rid('ct'),
  clientId: 'c-acme',
  name: 'Contact',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const mkLead = (over = {}) => ({
  schemaVersion: 1,
  id: rid('l'),
  clientId: 'c-acme',
  title: 'Lead',
  stage: 'inquiry',
  stageChangedAt: AT,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const mkInteraction = (over = {}) => ({
  schemaVersion: 1,
  id: rid('i'),
  clientId: 'c-acme',
  kind: 'call',
  date: '2026-01-01',
  summary: 'Called',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const mkReminder = (over = {}) => ({
  schemaVersion: 1,
  id: rid('r'),
  clientId: 'c-acme',
  label: 'Follow up',
  dueDate: '2026-01-10',
  reminderDays: 0,
  done: false,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

// ================================================================================
// 1. populate a live Dexie db, buildBackup(), wipe, restoreBackup(replace), compare
// ================================================================================
await resetAll();

const clientA = mkClient({ id: 'c-acme', name: 'Acme Developments' });
const clientB = mkClient({ id: 'c-beta', name: 'Beta Estates' });
await db.clients.bulkPut([clientA, clientB]);

const contactA = mkContact({ id: 'ct-1', clientId: 'c-acme', name: 'Dana Wright', email: 'dana@acme.example' });
await db.contacts.put(contactA);

const leadA = mkLead({ id: 'l-1', clientId: 'c-acme', title: 'New HQ', stage: 'shortlisted', estimatedFee: 120_000 });
await db.leads.put(leadA);

const interactionA = mkInteraction({ id: 'i-1', clientId: 'c-acme', leadId: 'l-1', summary: 'Site visit walkthrough' });
await db.interactions.put(interactionA);

const reminderA = mkReminder({ id: 'r-1', clientId: 'c-acme', leadId: 'l-1', label: 'Send proposal', dueDate: '2026-02-01' });
await db.reminders.put(reminderA);

await kvSet('note', 'kv-round-trip-check');

const { fileName, content } = await buildBackup();

await test('buildBackup: filename matches studio-crm-backup-<date>.json', () => {
  assert.match(fileName, /^studio-crm-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

const parsed = JSON.parse(content);
await test('buildBackup: envelope shape and full row counts across all six tables', () => {
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.equal(parsed.exportType, 'studio-crm-backup');
  assert.match(parsed.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(parsed.clients.length, 2);
  assert.equal(parsed.contacts.length, 1);
  assert.equal(parsed.leads.length, 1);
  assert.equal(parsed.interactions.length, 1);
  assert.equal(parsed.reminders.length, 1);
  assert.ok(parsed.kv.some((row) => row.key === 'note' && row.value === 'kv-round-trip-check'));
});

// Wipe every table (planting an unmistakable stray client) to prove 'replace'
// actually replaces the database rather than merely appending to it.
await db.clients.clear();
await db.contacts.clear();
await db.leads.clear();
await db.interactions.clear();
await db.reminders.clear();
await db.kv.clear();
await db.clients.put(mkClient({ id: 'c-stray', name: 'Should be wiped' }));

const result = await restoreBackup(content, 'replace');

await test('restoreBackup(replace): returns the client count it loaded', () => {
  assert.equal(result.clientCount, 2);
});

const clientsAfter = await db.clients.toArray();
await test('restoreBackup(replace): stray pre-existing row is gone, both originals are back', () => {
  assert.equal(clientsAfter.some((c) => c.name === 'Should be wiped'), false);
  assert.deepEqual(clientsAfter.map((c) => c.name).sort(), ['Acme Developments', 'Beta Estates']);
});

await test('restoreBackup(replace): contacts/leads/interactions/reminders match row-for-row', async () => {
  assert.deepEqual(await db.contacts.toArray(), [contactA]);
  assert.deepEqual(await db.leads.toArray(), [leadA]);
  assert.deepEqual(await db.interactions.toArray(), [interactionA]);
  assert.deepEqual(await db.reminders.toArray(), [reminderA]);
});

await test('restoreBackup(replace): kv restored too', async () => {
  assert.equal(await kvGet('note'), 'kv-round-trip-check');
});

// ================================================================================
// 2. restoreBackup rejects a fixture whose exportType belongs to another app
// ================================================================================
const wrongType = JSON.stringify({
  schemaVersion: 1,
  exportType: 'studio-log-backup',
  exportedAt: AT,
  clients: [],
  contacts: [],
  leads: [],
  interactions: [],
  reminders: [],
  kv: [],
});

await test('restoreBackup: rejects a StudioLog-shaped backup with a readable ParseError', async () => {
  await assert.rejects(
    () => restoreBackup(wrongType, 'replace'),
    (err) => {
      assert.ok(err instanceof ParseError, `expected ParseError, got ${err}`);
      assert.match(err.message, /StudioCRM backup/i);
      return true;
    },
  );
});

await test('restoreBackup: a rejected restore leaves the existing database untouched', async () => {
  const stillThere = await db.clients.toArray();
  assert.deepEqual(stillThere.map((c) => c.name).sort(), ['Acme Developments', 'Beta Estates']);
});

await resetAll();
console.log(`\n${n}/${n} unit tests passed`);
