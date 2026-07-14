// End-to-end smoke test: drives the built app in system Edge (headless).
// Flow: first-run empty states (Today/Clients/Pipeline/Reports, dismissing
// each screen's first-run driver.js tour as it fires) -> add client + contacts
// (isPrimary + introducedBy) -> add a second client -> add a lead via
// Pipeline, move it Inquiry -> Qualified -> Proposal sent -> Shortlisted ->
// Won (outcomeReason REQUIRED, cancel snaps back) -> second lead -> Lost
// (outcomeReason required there too) -> log an interaction with a follow-up
// -> linked reminder on the Reminders tab -> reminder surfaces on Today with
// status words -> Reports (pipeline value bars, win rates, lead-to-award,
// fee-calibration null branch) -> clients-for-studio export (won client only,
// whitelisted fields only, planted secrets never leak) -> full backup ->
// restore (replace) -> data intact.
// Run: npm run build && npm run preview (port 4175) in one shell, then
// node e2e-smoke.mjs in another. Launch pattern ported from StudioLog.
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Probe 127.0.0.1 first (a stale process can squat [::1]:4175 and `localhost`
// resolves there first), but fall back to [::1]: depending on how the OS
// resolves `localhost`, `vite preview` may bind only ONE loopback family
// (observed on this machine: IPv6 only), and hardcoding IPv4 then fails with
// ECONNREFUSED even though the server is up.
async function pickBase() {
  for (const base of ['http://127.0.0.1:4175/', 'http://[::1]:4175/']) {
    try {
      await fetch(base, { signal: AbortSignal.timeout(2000) });
      return base;
    } catch { /* try the next loopback */ }
  }
  throw new Error('no preview server answering on port 4175 — run `npm run build && npm run preview` first');
}
const BASE = await pickBase();
const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, err) => { results.push(['FAIL', name + ' — ' + err]); console.log('FAIL', name, err); };

const iso = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = new Date();
const plus7 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
const plus10 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10));
const minus1 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));

const WON_REASON = 'Strong referral and right fee';
const LOST_REASON = 'Fee too high for their budget';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept()); // window.confirm (restore replace) auto-accept
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const nav = async (label, h1) => {
  await page.locator('nav[aria-label="Main"]').getByRole('button', { name: label, exact: true }).click();
  await page.waitForSelector(`h1:has-text("${h1}")`);
};

// Each screen's first-run tour (driver.js) fires ~400ms after first landing on
// a screen whose data-tour anchors exist, and its overlay intercepts every
// click — so it MUST be dismissed before the flow can continue. The once-per-
// install flag is burned when the tour STARTS, so dismissing never re-arms it.
const dismissTour = async (name) => {
  const popover = page.locator('.driver-popover');
  await popover.waitFor({ state: 'visible', timeout: 4000 });
  const close = page.locator('.driver-popover-close-btn');
  if (await close.count()) await close.click();
  else await page.keyboard.press('Escape');
  await popover.waitFor({ state: 'detached', timeout: 4000 });
  await page.waitForTimeout(200); // overlay teardown settles
  ok(`tour: ${name} first-run popover fired and was dismissed`);
};

const colText = async (stageLabel) =>
  ((await page.locator(`section[aria-label="${stageLabel} column"]`).textContent()) ?? '');

const squash = (s) => s.replace(/\s+/g, ' ');

try {
  // 1. First-run: Today's empty state points at Clients; no tour fires here
  // (the Today tour is anchored to the follow-ups card, which doesn't exist yet)
  await page.goto(BASE);
  await page.waitForSelector('h1:has-text("Today")');
  if (!(await page.getByText('Nothing to watch yet').count())) throw new Error('Today first-run empty state missing');
  if (!(await page.getByText(/Add your first client/).count())) throw new Error('Today empty state must point to Clients');
  ok('Today: first-run empty state points to Clients');

  // 2. Cross-link to Clients -> Clients tour fires -> dismiss -> empty state
  await page.getByRole('button', { name: 'Go to Clients' }).click();
  await page.waitForSelector('h1:has-text("Clients")');
  await dismissTour('Clients');
  if (!(await page.getByText('No clients yet').count())) throw new Error('Clients empty state missing');
  if (!(await page.getByRole('button', { name: /Export clients/ }).isDisabled()))
    throw new Error('export button must be disabled while no client has a won lead');
  ok('Clients: first-run empty state, export button disabled with no won lead');

  // 3. Pipeline first visit: tour fires -> dismiss -> no-clients empty state
  await nav('Pipeline', 'Pipeline');
  await dismissTour('Pipeline');
  if (!(await page.getByText('No leads yet').count())) throw new Error('Pipeline empty state missing');
  if (!(await page.getByText(/Leads belong to clients/).count()))
    throw new Error('no-clients variant of the Pipeline empty state missing');
  ok('Pipeline: first-run empty state says to add the client first');

  // 3b. Reports first visit with zero leads: empty state, and NO tour fires
  // (its anchor section only renders once leads exist — flag stays unburned)
  await nav('Reports', 'Reports');
  if (!(await page.getByText('Not enough data yet').count())) throw new Error('Reports empty state missing');
  if (!(await page.getByRole('button', { name: 'Go to Pipeline' }).count()))
    throw new Error('Reports empty state should cross-link to Pipeline');
  if (await page.locator('.driver-popover').count())
    throw new Error('Reports tour must not fire while its anchor section is absent');
  ok('Reports: zero-lead empty state, tour correctly held back');

  // 4. Add client A via the empty-state button (header + empty state both offer it)
  await nav('Clients', 'Clients');
  await page.getByRole('button', { name: /Add client/ }).last().click();
  await page.waitForSelector('dialog[open]');
  const clientDlg = page.locator('dialog[open]'); // scope: same labels exist in closed dialogs
  await clientDlg.getByLabel('Name').fill('Chen Development Group');
  await clientDlg.getByLabel('Type (optional)').fill('Developer');
  await clientDlg.getByLabel('Notes (optional)').fill('UNMISTAKABLE-SECRET-CLIENT-NOTE prefers fixed fees');
  await clientDlg.getByRole('button', { name: 'Save client' }).click();
  await page.waitForSelector('h1:has-text("Chen Development Group")', { timeout: 5000 });
  ok('Add client: dialog creates the client and opens its page');

  // 4b. Contacts: Sara (primary), then David introduced by Sara
  await page.getByRole('tab', { name: 'Contacts' }).click();
  await page.waitForSelector('text=No contacts yet', { timeout: 5000 });
  await page.getByRole('button', { name: 'Add contact' }).click();
  await page.waitForSelector('dialog[open]');
  const saraDlg = page.locator('dialog[open]');
  await saraDlg.getByLabel('Name').fill('Sara Chen');
  await saraDlg.getByLabel('Role (optional)').fill('Development Director');
  await saraDlg.getByLabel('Email (optional)').fill('sara@chendev.example');
  await saraDlg.getByLabel('Phone (optional)').fill('+1 555 010 1234');
  await saraDlg.getByRole('checkbox', { name: 'Primary contact for this client' }).click();
  await saraDlg.getByLabel('Notes (optional)').fill('UNMISTAKABLE-SECRET-CONTACT-NOTE golfs on Fridays');
  await saraDlg.getByRole('button', { name: 'Save contact' }).click();
  await page.waitForTimeout(300);
  if (!(await page.locator('span[aria-label="Primary contact"]').count())) throw new Error('primary star missing');
  if (!(await page.locator('a[href="mailto:sara@chendev.example"]').count())) throw new Error('mailto: link missing');
  if (!(await page.locator('a[href="tel:+15550101234"]').count())) throw new Error('tel: link missing (digits+leading + only)');
  ok('contact: Sara saved as primary with working mailto:/tel: links');

  await page.getByRole('button', { name: 'Add contact' }).click();
  await page.waitForSelector('dialog[open]');
  const davidDlg = page.locator('dialog[open]');
  await davidDlg.getByLabel('Name').fill('David Park');
  await davidDlg.getByLabel('Role (optional)').fill('Project Manager');
  await davidDlg.getByLabel('Introduced by (optional)').selectOption({ label: 'Sara Chen (Development Director)' });
  await davidDlg.getByRole('button', { name: 'Save contact' }).click();
  await page.waitForTimeout(300);
  const contactsBody = (await page.textContent('body')) ?? '';
  if (!contactsBody.includes('Introduced by: Sara Chen'))
    throw new Error('David\'s card should resolve introducedBy to "Sara Chen": ' + contactsBody.slice(0, 400));
  if (!contactsBody.includes('Introduced by: External / unknown'))
    throw new Error('Sara\'s own card should read "External / unknown"');
  ok('contact: David saved with introducedBy resolving to Sara on his card');

  // 4c. Client B — the lost lead will live here, so the export can prove
  // that a client with no won lead never travels
  await page.getByRole('button', { name: 'All clients' }).click();
  await page.waitForSelector('h1:has-text("Clients")');
  await page.getByRole('button', { name: /Add client/ }).click();
  await page.waitForSelector('dialog[open]');
  const clientBDlg = page.locator('dialog[open]');
  await clientBDlg.getByLabel('Name').fill('Hargrove Contractors');
  await clientBDlg.getByLabel('Type (optional)').fill('Contractor');
  await clientBDlg.getByRole('button', { name: 'Save client' }).click();
  await page.waitForSelector('h1:has-text("Hargrove Contractors")', { timeout: 5000 });
  ok('Add client: second client (Hargrove Contractors) created');

  // 5. Lead 1 via Pipeline (tour already dismissed on this screen)
  await nav('Pipeline', 'Pipeline');
  await page.getByRole('button', { name: /Add lead/ }).last().click(); // empty-state instance
  await page.waitForSelector('dialog[open]');
  const leadDlg = page.locator('dialog[open]');
  // NOT exact: a wrapped <select>'s accessible name includes its selected
  // option's text ("Client Choose a client…"), so exact-match never hits.
  await leadDlg.getByLabel('Client').selectOption({ label: 'Chen Development Group' });
  await leadDlg.getByLabel('Title').fill('Riverside Tower RFP');
  await leadDlg.getByLabel('Sector (optional)').fill('Residential');
  await leadDlg.getByLabel('Estimated fee (optional)').fill('120000');
  await leadDlg.getByLabel('Probability').fill('40');
  await leadDlg.getByLabel('Submission deadline (optional)').fill(plus7);
  await leadDlg.getByLabel('Decision date (optional)').fill(plus10);
  await leadDlg.getByLabel('Go / no-go (optional)').selectOption('go');
  await leadDlg.getByLabel('Go / no-go notes (optional)').fill('UNMISTAKABLE-SECRET-GONOGO strong relationship, fee upside');
  await leadDlg.getByRole('button', { name: 'Save lead' }).click();
  await page.waitForTimeout(400);
  const inquiryCol = await colText('Inquiry');
  if (!inquiryCol.includes('Riverside Tower RFP')) throw new Error('new lead missing from Inquiry column');
  if (!inquiryCol.includes('1 lead · $120,000')) throw new Error('Inquiry header should sum the fee: ' + inquiryCol.slice(0, 200));
  if (!inquiryCol.includes('Est. $120,000')) throw new Error('card should show the estimated fee');
  if (!inquiryCol.includes('Submission') || !inquiryCol.includes('Due in 7 days'))
    throw new Error('submission deadline duePhrase missing: ' + inquiryCol.slice(0, 300));
  if (!inquiryCol.includes('Decision') || !inquiryCol.includes('Due in 10 days'))
    throw new Error('decision date duePhrase missing: ' + inquiryCol.slice(0, 300));
  ok('Add lead: lands in Inquiry with fee sum + watched-date words ("Due in 7 days"/"Due in 10 days")');

  // 5b. March it through the open stages via the card's <select>
  const stageSelect = page.getByLabel('Stage for Riverside Tower RFP', { exact: true });
  for (const [stage, colLabel] of [
    ['qualified', 'Qualified'],
    ['proposal_sent', 'Proposal sent'],
    ['shortlisted', 'Shortlisted'],
  ]) {
    await stageSelect.selectOption(stage);
    await page.waitForTimeout(300);
    if (!(await colText(colLabel)).includes('Riverside Tower RFP'))
      throw new Error(`lead should sit in the ${colLabel} column after the select change`);
  }
  ok('stage select: Inquiry -> Qualified -> Proposal sent -> Shortlisted, card follows each move');

  // 5c. Won transition: outcomeReason is REQUIRED — no reason, no move
  await stageSelect.selectOption('won');
  await page.waitForSelector('text=Why was this won?');
  if (!(await page.getByText('(required to move it)').count())) throw new Error('required wording missing from the prompt');
  if (!(await colText('Won')).includes('0 leads')) throw new Error('picking Won must not move the lead before a reason is given');
  await page.getByRole('button', { name: 'Move to Won' }).click(); // empty input — native required blocks
  await page.waitForTimeout(300);
  if (!(await colText('Won')).includes('0 leads')) throw new Error('empty outcomeReason must not commit the Won move');
  ok('Won transition: prompt appears, empty reason is blocked, lead stays put');

  // 5d. Cancel snaps the select back without committing
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(200);
  if ((await stageSelect.inputValue()) !== 'shortlisted') throw new Error('Cancel should snap the select back to Shortlisted');
  ok('Won transition: Cancel snaps the select back to the real stage');

  // 5e. Give the reason -> commits, card lands in Won with the reason shown
  await stageSelect.selectOption('won');
  await page.getByPlaceholder('e.g. Right fee, strong referral').fill(WON_REASON);
  await page.getByRole('button', { name: 'Move to Won' }).click();
  await page.waitForTimeout(400);
  const wonCol = await colText('Won');
  if (!wonCol.includes('Riverside Tower RFP')) throw new Error('lead missing from the Won column');
  if (!wonCol.includes('1 lead · $120,000')) throw new Error('Won header should count/sum the lead');
  if (!wonCol.includes(`Won because: ${WON_REASON}`)) throw new Error('Won card should show its outcomeReason');
  if (wonCol.includes('Due in')) throw new Error('a closed (won) lead must not carry near-due date flags');
  if (!(await colText('Shortlisted')).includes('0 leads')) throw new Error('Shortlisted should be empty after the move');
  ok('Won transition: reason given -> card moves to Won, shows "Won because:", date flags cleared');

  // 6. Lead 2 (client B) straight to Lost — reason required there too
  await page.getByRole('button', { name: /Add lead/ }).click(); // board shown now — single header instance
  await page.waitForSelector('dialog[open]');
  const lead2Dlg = page.locator('dialog[open]');
  await lead2Dlg.getByLabel('Client').selectOption({ label: 'Hargrove Contractors' });
  await lead2Dlg.getByLabel('Title').fill('Community Library Extension');
  await lead2Dlg.getByLabel('Sector (optional)').fill('Education');
  await lead2Dlg.getByRole('button', { name: 'Save lead' }).click();
  await page.waitForTimeout(400);
  const stageSelect2 = page.getByLabel('Stage for Community Library Extension', { exact: true });
  await stageSelect2.selectOption('lost');
  await page.waitForSelector('text=Why was this lost?');
  if (!(await colText('Lost')).includes('0 leads')) throw new Error('picking Lost must not move the lead before a reason');
  await page.getByPlaceholder('e.g. Fee too high, went with a larger firm').fill(LOST_REASON);
  await page.getByRole('button', { name: 'Move to Lost' }).click();
  await page.waitForTimeout(400);
  const lostCol = await colText('Lost');
  if (!lostCol.includes('Community Library Extension')) throw new Error('lead missing from the Lost column');
  if (!lostCol.includes(`Lost because: ${LOST_REASON}`)) throw new Error('Lost card should show its outcomeReason');
  ok('Lost transition: outcomeReason required and shown on the Lost card');

  // 7. Interaction with a follow-up -> linked reminder in the same write
  await nav('Clients', 'Clients');
  await page.getByRole('button', { name: 'Open Chen Development Group' }).click();
  await page.waitForSelector('h1:has-text("Chen Development Group")');
  // Overview relationship history reflects the won lead + the referral graph
  const overviewBody = (await page.textContent('body')) ?? '';
  if (!overviewBody.includes('Riverside Tower RFP')) throw new Error('Overview "Past opportunities" should list the won lead');
  if (!overviewBody.includes('David Park introduced by Sara Chen'))
    throw new Error('Overview referral network should show David introduced by Sara');
  ok('Overview: relationship history shows the won opportunity and the referral line');

  await page.getByRole('tab', { name: 'Interactions' }).click();
  await page.waitForSelector('text=No interactions logged yet.', { timeout: 5000 });
  await page.getByRole('button', { name: 'Log interaction' }).click();
  await page.waitForSelector('dialog[open]');
  const intDlg = page.locator('dialog[open]');
  await intDlg.getByLabel('Kind').selectOption('meeting');
  await intDlg.getByLabel('Summary').fill('Debrief on the tower award; agreed to send the phase 2 fee proposal.');
  await intDlg.getByLabel('Contact (optional)').selectOption({ label: 'Sara Chen — Development Director' });
  await intDlg.getByLabel('Opportunity (optional)').selectOption({ label: 'Riverside Tower RFP (Won)' });
  await intDlg.getByRole('checkbox', { name: 'Set a follow-up' }).click();
  await intDlg.getByLabel('Follow-up due').fill(minus1); // yesterday -> OVERDUE by 1 day
  await intDlg.getByLabel('Label (optional)').fill('Chase the phase 2 fee proposal');
  await intDlg.getByRole('button', { name: 'Save interaction' }).click();
  await page.waitForTimeout(400);
  const intBody = (await page.textContent('body')) ?? '';
  if (!intBody.includes('Meeting')) throw new Error('interaction card should show the kind word "Meeting"');
  if (!intBody.includes('With Sara Chen · Re: Riverside Tower RFP'))
    throw new Error('interaction card should name its contact and opportunity: ' + intBody.slice(0, 400));
  if (!intBody.includes('Follow-up set for')) throw new Error('interaction card should flag the follow-up date');
  ok('interaction: logged with contact + opportunity ties and a follow-up date');

  await page.getByRole('tab', { name: 'Reminders' }).click();
  await page.waitForTimeout(400);
  const remBody = (await page.textContent('body')) ?? '';
  if (!remBody.includes('Chase the phase 2 fee proposal'))
    throw new Error('linked reminder missing from the Reminders tab: ' + remBody.slice(0, 400));
  if (!remBody.includes('OVERDUE by 1 day')) throw new Error('reminder status words wrong: ' + remBody.slice(0, 400));
  ok('reminder: logInteraction wrote the linked reminder, Reminders tab reads "OVERDUE by 1 day"');

  // 8. Today: the follow-ups card now exists, so ITS tour finally fires
  await nav('Today', 'Today');
  await dismissTour('Today');
  const todayBody = (await page.textContent('body')) ?? '';
  if (!todayBody.includes('Follow-ups due')) throw new Error('"Follow-ups due" card missing');
  if (!todayBody.includes('Chen Development Group')) throw new Error('reminder row should name the client');
  if (!todayBody.includes('Riverside Tower RFP')) throw new Error('reminder row should name its linked lead');
  if (!todayBody.includes('Chase the phase 2 fee proposal')) throw new Error('reminder label missing from Today');
  if (!todayBody.includes('OVERDUE by 1 day')) throw new Error('Today status words wrong: ' + todayBody.slice(0, 400));
  ok('Today: reminder surfaces with client + lead + label + "OVERDUE by 1 day"');

  // 8b. Row click-through deep-links to that client's Reminders tab
  await page.getByRole('button', { name: /Open Chen Development Group's reminders/ }).click();
  await page.waitForSelector('h1:has-text("Chen Development Group")');
  if (!(await page.getByRole('tab', { name: 'Reminders', selected: true }).count()))
    throw new Error('Today row click should land on the Reminders tab');
  ok('Today: clicking the reminder row deep-links to the client\'s Reminders tab');

  // 9. Reports: leads exist now, so ITS tour finally fires too
  await nav('Reports', 'Reports');
  await dismissTour('Reports');
  if (!(await page.locator('[aria-label="Won: 1 lead, $120,000 raw value, $48,000 probability-weighted"]').count()))
    throw new Error('Won bar aria-label wrong — raw/weighted sums off');
  if (!(await page.locator('[aria-label="Lost: 1 lead, $0 raw value, $0 probability-weighted"]').count()))
    throw new Error('Lost bar aria-label wrong — unpriced lead should sum to $0');
  // Win-rate tables: check each group's actual <td> cells (Won/Lost/rate)
  const expectWinRateRow = async (group, want) => {
    const cells = await page.locator('tr').filter({ hasText: group }).first().locator('td').allTextContents();
    if (cells.join('|') !== `${group}|${want}`)
      throw new Error(`${group} win-rate row wrong — got [${cells.join('|')}], want [${group}|${want}]`);
  };
  await expectWinRateRow('Residential', '1|0|100%');
  await expectWinRateRow('Education', '0|1|0%');
  await expectWinRateRow('Developer', '1|0|100%');
  await expectWinRateRow('Contractor', '0|1|0%');
  const reportsBody = squash((await page.textContent('body')) ?? '');
  if (!reportsBody.includes("days, on average, from a lead's start to being won"))
    throw new Error('lead-to-award stat missing (won lead exists, so no null branch)');
  if (!reportsBody.includes('needs at least one won lead with both a proposed fee and a final won fee'))
    throw new Error('fee calibration should render its no-data branch (no feeProposed/feeWon set anywhere)');
  ok('Reports: pipeline bars exact, win rates 100%/0% by sector and client type, lead-to-award + fee-calibration render');

  // 10. clients-for-studio export: won client only, whitelisted fields only
  await nav('Clients', 'Clients');
  const exportBtn = page.getByRole('button', { name: /Export clients/ });
  if (await exportBtn.isDisabled()) throw new Error('export button should be enabled once a client has a won lead');
  const expDl = page.waitForEvent('download');
  await exportBtn.click();
  const expDownload = await expDl;
  if (!/^clients-for-studio-\d{4}-\d{2}-\d{2}\.json$/.test(expDownload.suggestedFilename()))
    throw new Error('export filename wrong: ' + expDownload.suggestedFilename());
  const expTmp = mkdtempSync(join(tmpdir(), 'crm-e2e-exp-'));
  const expPath = join(expTmp, expDownload.suggestedFilename());
  await expDownload.saveAs(expPath);
  const expText = readFileSync(expPath, 'utf8');
  const exp = JSON.parse(expText);
  if (exp.exportType !== 'clients-for-studio') throw new Error('export exportType wrong: ' + exp.exportType);
  if (exp.schemaVersion !== 1) throw new Error('export schemaVersion wrong');
  if (exp.clients?.length !== 1) throw new Error('only the ONE won client may travel, got ' + exp.clients?.length);
  if (exp.clients[0].clientName !== 'Chen Development Group') throw new Error('wrong client exported');
  const expContacts = exp.clients[0].contacts;
  if (expContacts?.length !== 1 || expContacts[0].name !== 'Sara Chen')
    throw new Error('only the primary contact (Sara) may travel, got ' + JSON.stringify(expContacts));
  const keys = Object.keys(expContacts[0]).sort().join(',');
  if (keys !== 'email,name,org,phone,role') throw new Error('contact keys must be exactly the whitelist, got: ' + keys);
  if (expContacts[0].org !== 'Chen Development Group') throw new Error('contact org should be the client name');
  for (const secret of [
    'UNMISTAKABLE', // client note, contact note, go/no-go notes all carry this token
    WON_REASON, LOST_REASON, // outcomeReason must never travel
    '120000', // no fee figure may travel
    'Riverside Tower', // no lead field travels, not even the title
    'Hargrove', 'David Park', // non-won client, non-primary contact
    'isPrimary', 'introducedBy', 'notes', // excluded contact fields, even as keys
  ]) {
    if (expText.includes(secret)) throw new Error(`export leaked "${secret}"`);
  }
  ok(`export: won client only, primary contact only, whitelist keys only, zero secret leakage (${expDownload.suggestedFilename()})`);

  // 11. Settings: tour fires on first visit -> backup -> restore (replace)
  await nav('Settings', 'Settings');
  await dismissTour('Settings');
  const settingsBody = squash((await page.textContent('body')) ?? '');
  if (!settingsBody.includes('Your data lives on this device. Back it up.')) throw new Error('About line missing');
  if (!/Last backup:\s*Never/.test(settingsBody)) throw new Error('"Last backup: Never" missing before first backup');
  const bakDl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Back up now/ }).click();
  const bakDownload = await bakDl;
  const bakTmp = mkdtempSync(join(tmpdir(), 'crm-e2e-bak-'));
  const backupPath = join(bakTmp, bakDownload.suggestedFilename());
  await bakDownload.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  if (backup.exportType !== 'studio-crm-backup') throw new Error('backup exportType wrong: ' + backup.exportType);
  if (backup.schemaVersion !== 1) throw new Error('backup schemaVersion wrong');
  if (backup.clients?.length !== 2) throw new Error('backup should carry 2 clients');
  if (backup.contacts?.length !== 2) throw new Error('backup should carry 2 contacts');
  if (backup.leads?.length !== 2) throw new Error('backup should carry 2 leads');
  if (backup.interactions?.length !== 1) throw new Error('backup should carry 1 interaction');
  if (backup.reminders?.length !== 1) throw new Error('backup should carry 1 reminder');
  if (!Array.isArray(backup.kv)) throw new Error('backup should carry the kv table');
  if (!backup.leads.some((l) => l.outcomeReason === WON_REASON)) throw new Error('backup lost the won outcomeReason');
  await page.waitForTimeout(400);
  if (/Last backup:\s*Never/.test(squash((await page.textContent('body')) ?? '')))
    throw new Error('"Last backup" should update after backing up');
  ok(`backup: downloads (${bakDownload.suggestedFilename()}), all six tables verified`);

  // 11b. Restore it straight back in replace mode (confirm auto-accepted).
  // Replace wipes everything first, so all data afterwards came from the file.
  if (!(await page.getByRole('radio', { name: /Replace — erase current data/ }).isChecked()))
    throw new Error('Replace should be the default restore mode');
  await page.locator('input[aria-label="Choose backup file"]').setInputFiles(backupPath);
  await page.waitForSelector('text=Restored 2 clients', { timeout: 5000 });
  ok('restore: replace-mode restore of the same file reports "Restored 2 clients"');

  // 11c. Data intact after the round-trip
  await nav('Clients', 'Clients');
  const listBody = (await page.textContent('body')) ?? '';
  if (!listBody.includes('Chen Development Group') || !listBody.includes('Hargrove Contractors'))
    throw new Error('restored client list incomplete');
  if (!listBody.includes('Sara Chen')) throw new Error('restored list should still show the primary contact name');
  await page.getByRole('button', { name: 'Open Chen Development Group' }).click();
  await page.waitForSelector('h1:has-text("Chen Development Group")');
  await page.getByRole('tab', { name: 'Reminders' }).click();
  await page.waitForTimeout(400);
  const remBody2 = (await page.textContent('body')) ?? '';
  if (!remBody2.includes('Chase the phase 2 fee proposal') || !remBody2.includes('OVERDUE by 1 day'))
    throw new Error('restored reminder lost its label or status');
  await nav('Pipeline', 'Pipeline');
  const wonCol2 = await colText('Won');
  if (!wonCol2.includes('Riverside Tower RFP') || !wonCol2.includes(`Won because: ${WON_REASON}`))
    throw new Error('restored won lead lost its stage or outcomeReason');
  const lostCol2 = await colText('Lost');
  if (!lostCol2.includes('Community Library Extension') || !lostCol2.includes(`Lost because: ${LOST_REASON}`))
    throw new Error('restored lost lead lost its stage or outcomeReason');
  ok('restore: clients, contacts, reminder, and both closed leads (with reasons) round-trip intact');
} catch (err) {
  fail('flow', err.message ?? String(err));
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => {});
}

if (errors.length) fail('console pageerrors', errors.join(' | ').slice(0, 500));
else ok('no page errors');

await browser.close();
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
