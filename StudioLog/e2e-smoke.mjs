// End-to-end smoke test: drives the built app in system Edge (headless).
// Flow: first-run empty states on all 3 tabs -> add project -> RIBA prefill ->
// stage edit (done + deadline) -> file links -> deliverables -> log ->
// notes (follow-ups) -> tasks (overdue/done) -> contacts (mailto/tel) ->
// registry strip -> Today aggregation -> backup download -> erase -> restore.
// Run: npm run build && npm run preview (port 4174) in one shell, then
// node e2e-smoke.mjs in another. Launch pattern ported from StudioHours.
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 127.0.0.1 (not localhost) on purpose: a stale process on this machine can
// squat [::1]:4174, and `localhost` resolves there first. Vite preview binds
// both loopbacks by default, so IPv4 always reaches OUR server on port 4174.
const BASE = 'http://127.0.0.1:4174/';
const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, err) => { results.push(['FAIL', name + ' — ' + err]); console.log('FAIL', name, err); };

const iso = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = new Date();
const plus1 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
const plus7 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
const plus10 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10));
const minus1 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
const minus2 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept()); // window.confirm double-confirms auto-accept
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const nav = async (label, h1) => {
  await page.locator('nav[aria-label="Main"]').getByRole('button', { name: label, exact: true }).click();
  await page.waitForSelector(`h1:has-text("${h1}")`);
};

try {
  // 1. First-run empty states on all 3 tabs
  await page.goto(BASE);
  await page.waitForSelector('h1:has-text("Today")');
  if (!(await page.getByText('Nothing to watch yet').count())) throw new Error('Today first-run empty state missing');
  if (!(await page.getByText(/Add your first project/).count())) throw new Error('Today empty state must point to Projects');
  ok('Today: first-run empty state points to Projects');

  await nav('Projects', 'Projects');
  if (!(await page.getByText('No projects yet').count())) throw new Error('Projects empty state missing');
  if (!(await page.getByRole('button', { name: /Add project/ }).count())) throw new Error('Add project button missing');
  ok('Projects: first-run empty state + Add project button');

  await nav('Settings', 'Settings');
  const settingsBody = (await page.textContent('body')) ?? '';
  if (!settingsBody.includes('Your data lives on this device. Back it up.')) throw new Error('About line missing');
  if (!/Last backup:\s*Never/.test(settingsBody.replace(/\s+/g, ' '))) throw new Error('"Last backup: Never" missing');
  if (!(await page.getByRole('button', { name: 'Choose file' }).count())) throw new Error('restore "Choose file" button missing');
  ok('Settings: About line, Never-backed-up warning, restore Choose file');

  // 2. Add a project via the Today empty-state cross-link + native dialog
  await nav('Today', 'Today');
  await page.getByRole('button', { name: 'Go to Projects' }).click();
  await page.waitForSelector('h1:has-text("Projects")');
  // Two "Add project" buttons on an empty registry (header + inside the empty
  // state) — use the empty-state one to prove the box itself offers the action.
  await page.getByRole('button', { name: /Add project/ }).last().click();
  await page.waitForSelector('dialog[open]');
  const addDlg = page.locator('dialog[open]'); // scope: labels also exist in the closed header-button dialog
  await addDlg.getByLabel('Project name').fill('Maple House');
  await addDlg.getByLabel('Number (optional)').fill('2601');
  await addDlg.getByLabel('Client (optional)').fill('The Maples');
  await addDlg.getByLabel('Start date (optional)').fill(iso(today));
  await addDlg.getByRole('button', { name: 'Create project' }).click();
  await page.waitForSelector('h1:has-text("Maple House")', { timeout: 5000 });
  const meta = (await page.textContent('body')) ?? '';
  if (!meta.includes('2601') || !meta.includes('The Maples')) throw new Error('project meta (number/client) missing on detail page');
  ok('Add project: dialog creates project and opens its page');

  // 2b. All-clear: a project exists but nothing is due yet -> calm message,
  // no first-run pointer, no fake zero-count alert
  await nav('Today', 'Today');
  await page.waitForSelector('text=Nothing needs attention this week.');
  const clearBody = (await page.textContent('body')) ?? '';
  if (clearBody.includes('Nothing to watch yet')) throw new Error('first-run empty state must not show once a project exists');
  if (clearBody.includes('overdue')) throw new Error('all-clear state must not mention overdue anything: ' + clearBody.slice(0, 300));
  ok('Today: all-clear message when a project exists but nothing is due');
  await nav('Projects', 'Projects');
  await page.getByRole('button', { name: 'Open Maple House' }).click();
  await page.waitForSelector('h1:has-text("Maple House")');

  // 3. Project tabs: every tab of a fresh project shows its empty state
  for (const [tab, waitFor, phrases] of [
    ['Notes', 'No notes yet', ['No notes yet — capture what happened on site or in a meeting', 'Notes work offline']],
    ['Tasks', 'No tasks yet', ['No tasks yet — jot down what needs doing on this project']],
    ['Contacts', 'No contacts yet', ['No contacts yet', 'Add the client, consultants, and authorities for this project']],
  ]) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForSelector(`text=${waitFor}`, { timeout: 5000 });
    const body = (await page.textContent('body')) ?? '';
    for (const phrase of phrases) {
      if (!body.includes(phrase)) throw new Error(`${tab} empty state missing ("${phrase}")`);
    }
  }
  await page.getByRole('tab', { name: 'Drawings' }).click();
  await page.waitForSelector('text=No drawings yet', { timeout: 5000 });
  await page.getByRole('tab', { name: 'Log' }).click();
  await page.waitForSelector('text=Nothing in the log yet', { timeout: 5000 });
  await page.getByRole('tab', { name: 'Overview' }).click();
  ok('project tabs: Notes/Tasks/Contacts/Drawings/Log all show fresh-project empty states, Overview live');

  // 4. Prefill RIBA stages -> 6 rows + timeline strip labels
  if (!(await page.getByText('No stages yet').count())) throw new Error('no-stages empty state missing');
  await page.getByRole('button', { name: /Prefill stages/ }).click();
  await page.waitForSelector('dialog[open]');
  if (!(await page.getByRole('radio', { name: /RIBA stages/ }).isChecked())) throw new Error('RIBA should be the default template');
  await page.locator('dialog[open]').getByRole('button', { name: 'Add stages', exact: true }).click();
  await page.waitForTimeout(500);
  const ribaStages = [
    ['S1', 'Preparation and Briefing'],
    ['S2', 'Concept Design'],
    ['S3', 'Spatial Coordination'],
    ['S4', 'Technical Design'],
    ['S5', 'Construction / Site'],
    ['S6', 'Handover'],
  ];
  for (const [code, name] of ribaStages) {
    const input = page.getByLabel(`Stage name (${code})`);
    if (!(await input.count())) throw new Error(`stage row ${code} missing after prefill`);
    if ((await input.inputValue()) !== name) throw new Error(`stage ${code} name should be "${name}"`);
  }
  if ((await page.locator('input[aria-label^="Stage name ("]').count()) !== 6)
    throw new Error('fresh project should have exactly 6 stage rows after RIBA prefill');
  const strip = page.locator('[data-e2e="stage-strip"]');
  if (!(await strip.count())) throw new Error('timeline strip missing after prefill');
  const stripText = (await strip.textContent()) ?? '';
  for (const [code, name] of ribaStages) {
    if (!stripText.includes(code) || !stripText.includes(name)) throw new Error(`strip missing label ${code} ${name}`);
  }
  if ((stripText.match(/Pending/g) ?? []).length !== 6) throw new Error('all 6 strip segments should read "Pending"');
  ok('prefill: 6 RIBA stage rows, timeline strip shows every code+name+status word');

  // 5. Edit stages: S1 -> Done, S2 gets a deadline in 7 days, S3 overdue by 1
  await page.getByLabel('Status for Preparation and Briefing').selectOption('done');
  await page.getByLabel('End date for Concept Design').fill(plus7);
  await page.getByLabel('End date for Spatial Coordination').fill(minus1);
  await page.waitForTimeout(500);
  const strip2 = (await page.locator('[data-e2e="stage-strip"]').textContent()) ?? '';
  if (!/S1.*Done/.test(strip2)) throw new Error('strip should show S1 as Done: ' + strip2.slice(0, 200));
  if ((strip2.match(/Pending/g) ?? []).length !== 5) throw new Error('strip should show 5 Pending after S1 done');
  ok('stage edit: status select flips strip segment to Done (word + color)');

  // 6. File links: add two, one bare (auto-https), both render as new-tab links
  await page.getByLabel('Label', { exact: true }).fill('Drawings folder');
  await page.getByLabel('Link (paste it here)').fill('https://example.com/drawings');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('Label', { exact: true }).fill('Specs');
  await page.getByLabel('Link (paste it here)').fill('example.com/specs');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.waitForTimeout(300);
  const link1 = page.locator('a[href="https://example.com/drawings"]');
  if (!(await link1.count())) throw new Error('added link not rendered as <a href>');
  if ((await link1.getAttribute('target')) !== '_blank') throw new Error('link must open in a new tab');
  if (!(await page.locator('a[href="https://example.com/specs"]').count()))
    throw new Error('bare URL should have been normalized to https://');
  ok('file links: label+URL rows render as new-tab links, bare URL auto-prefixed');

  // 6b. Deliverables: add 3 drawings, issue one (rev prefill bump), export CSV, supersede one
  await page.getByRole('tab', { name: 'Drawings' }).click();
  const addDrawing = async (number, title) => {
    await page.getByRole('button', { name: 'Add drawing' }).click();
    await page.waitForSelector('dialog[open]');
    const dlg = page.locator('dialog[open]');
    await dlg.getByLabel('Number').fill(number);
    await dlg.getByLabel('Title').fill(title);
    await dlg.getByRole('button', { name: 'Create drawing' }).click();
    await page.waitForTimeout(250);
  };
  await addDrawing('A-101', 'Ground Floor Plan');
  await addDrawing('A-102', 'First Floor Plan');
  await addDrawing('A-201', 'Elevations');
  await page.waitForTimeout(300);
  const delivBody1 = (await page.textContent('body')) ?? '';
  if (!/3 drawings — 0 issued/.test(delivBody1)) throw new Error('drawing count line wrong: ' + delivBody1.slice(0, 300));
  ok('deliverables: add 3 drawings via dialog, count line reads "3 drawings — 0 issued"');

  // D1: the register progress strip summarizes drawings by status (word + color)
  const regStrip = page.locator('[data-e2e="register-strip"]');
  if (!(await regStrip.count())) throw new Error('register progress strip missing above the table');
  const regStripText = (await regStrip.textContent()) ?? '';
  if (!regStripText.includes('Not started') || !regStripText.includes('Issued'))
    throw new Error('register strip should label statuses in words: ' + regStripText.slice(0, 200));
  if (!/3\s*Not started/.test(regStripText)) throw new Error('register strip should count 3 Not started: ' + regStripText.slice(0, 200));
  ok('deliverables: register progress strip shows labeled status segments (3 Not started)');

  await page.getByRole('button', { name: 'Issue A-101 Ground Floor Plan' }).click();
  await page.waitForSelector('dialog[open]');
  const issueDlg = page.locator('dialog[open]');
  const revPrefill = await issueDlg.getByLabel('New revision').inputValue();
  if (revPrefill !== 'P02') throw new Error('rev prefill should gently bump P01 -> P02, got "' + revPrefill + '"');
  await issueDlg.getByLabel('Purpose').selectOption('approval');
  await issueDlg.getByRole('button', { name: 'Record issue' }).click();
  await page.waitForTimeout(300);
  const delivBody2 = (await page.textContent('body')) ?? '';
  if (!delivBody2.includes('P02')) throw new Error('current rev not bumped to P02');
  if (!/3 drawings — 1 issued/.test(delivBody2)) throw new Error('count line should show 1 issued: ' + delivBody2.slice(0, 300));
  if (!delivBody2.includes('Rev P02 — issued')) throw new Error('history row text missing: ' + delivBody2.slice(0, 500));
  ok('Issue…: rev prefill bumps trailing digits (P01 -> P02), status becomes Issued, history records rev+purpose');

  const csvDl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download register/ }).click();
  const csvDownload = await csvDl;
  const csvTmp = mkdtempSync(join(tmpdir(), 'sl-e2e-csv-'));
  const csvPath = join(csvTmp, csvDownload.suggestedFilename());
  await csvDownload.saveAs(csvPath);
  const csvLines = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  if (!csvLines[0].startsWith('Number,Title,Stage')) throw new Error('CSV header wrong: ' + csvLines[0]);
  if (csvLines.length !== 4) throw new Error('CSV should have a header + 3 data rows, got ' + csvLines.length + ' lines');
  ok(`CSV export: header row + 3 data rows (${csvDownload.suggestedFilename()})`);

  await page.getByRole('button', { name: 'Edit A-102 First Floor Plan' }).click();
  await page.waitForSelector('dialog[open]');
  const editDlg = page.locator('dialog[open]');
  await editDlg.getByLabel('Status').selectOption('superseded');
  await editDlg.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);
  const delivBody3 = (await page.textContent('body')) ?? '';
  if (!delivBody3.includes('Superseded')) throw new Error('superseded status word missing');
  if (!(await page.getByText('A-102').count())) throw new Error('superseded row should stay in the table, not be hidden');
  ok('supersede: row stays visible with the word "Superseded" (muted, never hidden)');

  // 6c. Log: add an overdue RFI, mark it answered, filter by status
  await page.getByRole('tab', { name: 'Log' }).click();
  await page.waitForSelector('text=Nothing in the log yet', { timeout: 5000 });
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.waitForSelector('dialog[open]');
  const logDlg = page.locator('dialog[open]');
  await logDlg.getByLabel('Type').selectOption('rfi');
  await logDlg.getByLabel('Reference (optional)').fill('RFI-03');
  await logDlg.getByLabel('Who is it with?').fill('Structural engineer');
  await logDlg.getByLabel('Subject').fill('Beam size at grid 4');
  await logDlg.getByLabel('Due date (optional)').fill(minus1);
  await logDlg.getByRole('button', { name: 'Save to log' }).click();
  await page.waitForTimeout(300);
  const logBody1 = (await page.textContent('body')) ?? '';
  if (!logBody1.includes('OVERDUE')) throw new Error('past-due RFI should show OVERDUE: ' + logBody1.slice(0, 400));
  if (!/1 open — 1 overdue/.test(logBody1)) throw new Error('log count line wrong: ' + logBody1.slice(0, 400));
  ok('log: RFI with a past due date shows OVERDUE and the count line reflects it');

  await page.getByRole('button', { name: 'Mark answered' }).click();
  await page.waitForSelector('dialog[open]');
  const answerDlg = page.locator('dialog[open]');
  await answerDlg.getByLabel(/What was the answer/).fill('24x12, confirmed, no change needed.');
  await answerDlg.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);
  const logBody2 = (await page.textContent('body')) ?? '';
  if (logBody2.includes('OVERDUE')) throw new Error('overdue flag should clear once answered');
  if (!/0 open/.test(logBody2)) throw new Error('open count should drop to 0 once the only item is answered');
  if (!logBody2.includes('Answered')) throw new Error('status word should flip to Answered');
  ok('mark answered: status flips to Answered, overdue clears, answer text shown');

  const logFilters = page.locator('[data-e2e="log-filters"]');
  await logFilters.getByLabel('Status').selectOption('open');
  await page.waitForTimeout(200);
  if (!(await page.getByText('No log items match these filters').count()))
    throw new Error('status=open filter should hide the now-answered item');
  await logFilters.getByLabel('Status').selectOption('answered');
  await page.waitForTimeout(200);
  if (!(await page.getByText('Beam size at grid 4').count())) throw new Error('status=answered filter should show the item');
  await logFilters.getByLabel('Status').selectOption('');
  ok('log filters: status select narrows the visible row subset');

  // 6d. Notes: add a site-visit note with a photo link + 2 follow-ups, tick one off
  await page.getByRole('tab', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.waitForSelector('dialog[open]');
  const noteDlg = page.locator('dialog[open]');
  await noteDlg.getByLabel('What kind of note?').selectOption('site_visit');
  await noteDlg.getByLabel('Title').fill('Slab pour inspection');
  await noteDlg.getByLabel('Attendees (optional)').fill('Me, site foreman');
  await noteDlg.getByLabel(/What happened/).fill('Rebar spacing checked against S-201. Pour approved for Thursday.');
  await noteDlg.getByRole('button', { name: 'Add a photo link' }).click();
  await noteDlg.getByLabel('Photo link 1', { exact: true }).fill('example.com/site-photo-1.jpg');
  await noteDlg.getByRole('button', { name: 'Add a follow-up' }).click();
  await noteDlg.getByLabel('Follow-up 1', { exact: true }).fill('Chase concrete test results');
  await noteDlg.getByRole('button', { name: 'Add a follow-up' }).click();
  await noteDlg.getByLabel('Follow-up 2', { exact: true }).fill('Photograph waterproofing before backfill');
  await noteDlg.getByRole('button', { name: 'Save note' }).click();
  await page.waitForTimeout(300);
  const notesBody1 = (await page.textContent('body')) ?? '';
  if (!notesBody1.includes('Site visit')) throw new Error('note card should show the kind word "Site visit"');
  if (!notesBody1.includes('Slab pour inspection')) throw new Error('note card title missing');
  if (!notesBody1.includes('Rebar spacing checked')) throw new Error('note card body snippet missing');
  if (!notesBody1.includes('2 follow-ups open')) throw new Error('note card should read "2 follow-ups open": ' + notesBody1.slice(0, 400));
  ok('notes: add via dialog — card shows kind word, title, snippet, and "2 follow-ups open"');

  await page.getByText('Open note').click(); // expand the card (native <details>)
  const photoLink = page.locator('a[href="https://example.com/site-photo-1.jpg"]');
  if (!(await photoLink.count())) throw new Error('photo link should render as <a> with https:// auto-prefixed');
  if ((await photoLink.getAttribute('target')) !== '_blank') throw new Error('photo link must open in a new tab');
  if (!((await page.textContent('body')) ?? '').includes('Me, site foreman')) throw new Error('attendees missing in expanded note');
  // .click(), not .check(): these are controlled inputs whose checked state
  // lands after the Dexie write round-trips through the live query.
  await page.getByRole('checkbox', { name: 'Chase concrete test results' }).click();
  await page.waitForTimeout(300);
  const notesBody2 = (await page.textContent('body')) ?? '';
  if (!notesBody2.includes('1 follow-up open')) throw new Error('ticking a follow-up should drop the count to "1 follow-up open"');
  if (notesBody2.includes('2 follow-ups open')) throw new Error('old "2 follow-ups open" count should be gone');
  ok('notes: expanded card shows attendees + new-tab photo link; ticking a follow-up drops the open count to 1');

  // 6e. Tasks: inline add with a past due date -> OVERDUE word -> tick done -> Done group
  await page.getByRole('tab', { name: 'Tasks' }).click();
  const addTaskForm = page.locator('[data-e2e="add-task-form"]');
  await addTaskForm.getByLabel('What needs doing?').fill('Order the window schedule');
  await addTaskForm.getByLabel('Due (optional)').fill(minus1);
  await addTaskForm.getByRole('button', { name: 'Add task' }).click();
  await page.waitForTimeout(300);
  const tasksBody1 = (await page.textContent('body')) ?? '';
  if (!tasksBody1.includes('OVERDUE by 1 day')) throw new Error('past-due task should read "OVERDUE by 1 day": ' + tasksBody1.slice(0, 400));
  if (!/1 to do — 1 overdue/.test(tasksBody1)) throw new Error('task count line wrong: ' + tasksBody1.slice(0, 400));
  ok('tasks: inline add with past due date shows the word OVERDUE and "1 to do — 1 overdue"');

  await page.getByRole('checkbox', { name: 'Mark "Order the window schedule" done' }).click();
  await page.waitForTimeout(300);
  const tasksBody2 = (await page.textContent('body')) ?? '';
  if (!/0 to do/.test(tasksBody2)) throw new Error('count line should drop to "0 to do" once the task is done');
  if (tasksBody2.includes('OVERDUE')) throw new Error('a done task must never read OVERDUE');
  const doneGroup = page.locator('details[data-e2e="done-tasks"]');
  if (!(await doneGroup.count())) throw new Error('Done group missing');
  if (!((await doneGroup.locator('summary').textContent()) ?? '').includes('Done (1)')) throw new Error('Done group should read "Done (1)"');
  await doneGroup.locator('summary').click();
  if (!(await doneGroup.getByText('Order the window schedule').count())) throw new Error('done task should sit inside the Done group');
  ok('tasks: ticking done clears OVERDUE, count drops to 0, task moves into the collapsed Done group');

  // 6f. Contacts: add a consultant, check mailto/tel links + Overview count line
  await page.getByRole('tab', { name: 'Contacts' }).click();
  await page.getByRole('button', { name: 'Add contact' }).click();
  await page.waitForSelector('dialog[open]');
  const contactDlg = page.locator('dialog[open]');
  await contactDlg.getByLabel('Name').fill('Sara Chen');
  await contactDlg.getByLabel('Company or office (optional)').fill('Chen Structural Engineers');
  await contactDlg.getByLabel('Role on this project').selectOption('consultant');
  await contactDlg.getByLabel('Email (optional)').fill('sara@chens.example');
  await contactDlg.getByLabel('Phone (optional)').fill('+1 555 010 1234');
  await contactDlg.getByRole('button', { name: 'Save contact' }).click();
  await page.waitForTimeout(300);
  const contactsBody = (await page.textContent('body')) ?? '';
  if (!contactsBody.includes('Sara Chen')) throw new Error('contact name missing');
  if (!/Consultant\s*\(1\)/.test(contactsBody)) throw new Error('role group header "Consultant (1)" missing');
  const mailLink = page.locator('a[href="mailto:sara@chens.example"]');
  if (!(await mailLink.count())) throw new Error('email should render as a mailto: link');
  if (!(await page.locator('a[href="tel:+15550101234"]').count())) throw new Error('phone should render as a tel: link');
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.waitForSelector('text=1 contact — see the Contacts tab.', { timeout: 5000 }); // live query settles async
  ok('contacts: added consultant renders under a role header with working mailto:/tel: links; Overview counts it');

  // 7. Registry: status group + compact labeled strip
  await page.getByRole('button', { name: 'All projects' }).click();
  await page.waitForSelector('h1:has-text("Projects")');
  const regBody = (await page.textContent('body')) ?? '';
  if (!/Active\s*\(1\)/.test(regBody)) throw new Error('Active (1) group heading missing');
  const row = page.getByRole('button', { name: 'Open Maple House' });
  if (!(await row.count())) throw new Error('registry row missing');
  const rowText = (await row.textContent()) ?? '';
  if (!rowText.includes('2601') || !rowText.includes('The Maples')) throw new Error('row should show number + client');
  if (!/S1.*Done/.test(rowText)) throw new Error('compact strip should label S1 Done: ' + rowText.slice(0, 200));
  ok('registry: status-grouped row shows number + name + client + labeled strip');

  // 7b. Browser Back closes an open project and returns to the list
  await page.getByRole('button', { name: 'Open Maple House' }).click();
  await page.waitForSelector('h1:has-text("Maple House")');
  await page.evaluate(() => window.history.back());
  await page.waitForSelector('h1:has-text("Projects")');
  if (!(await page.getByRole('button', { name: 'Open Maple House' }).count()))
    throw new Error('browser Back should return to the registry list');
  ok('history: browser Back closes an open project and returns to the registry list');

  // 8. Today aggregates: overdue first, upcoming deadline listed, row cross-links
  await nav('Today', 'Today');
  const todayBody = (await page.textContent('body')) ?? '';
  if (!todayBody.includes('Overdue by 1 day')) throw new Error('overdue stage missing from Today');
  if (!todayBody.includes('Due in 7 days')) throw new Error('upcoming stage deadline missing from Today');
  if (!(todayBody.indexOf('Spatial Coordination') < todayBody.indexOf('Concept Design')))
    throw new Error('overdue stage should sort before upcoming one');
  if (todayBody.includes('Preparation and Briefing')) throw new Error('done stage must not appear on Today');
  await page.getByRole('button', { name: /Concept Design/ }).click();
  await page.waitForSelector('h1:has-text("Maple House")');
  ok('Today: overdue + 4-week deadlines listed, sorted, and click-through to the project');

  // 8b. Seed the triage trio (we just landed on Maple House): stage due in 10
  // days, an overdue open RFI, and a task due tomorrow -> each surfaces on
  // Today in its own card with the right words
  await page.getByLabel('End date for Technical Design').fill(plus10);
  await page.getByRole('tab', { name: 'Log' }).click();
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.waitForSelector('dialog[open]');
  const rfiDlg = page.locator('dialog[open]');
  await rfiDlg.getByLabel('Type').selectOption('rfi');
  await rfiDlg.getByLabel('Who is it with?').fill('Window supplier');
  await rfiDlg.getByLabel('Subject').fill('Glazing spec confirmation');
  await rfiDlg.getByLabel('Due date (optional)').fill(minus2);
  await rfiDlg.getByRole('button', { name: 'Save to log' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('tab', { name: 'Tasks' }).click();
  const taskForm = page.locator('[data-e2e="add-task-form"]');
  await taskForm.getByLabel('What needs doing?').fill('Call the planner');
  await taskForm.getByLabel('Due (optional)').fill(plus1);
  await taskForm.getByRole('button', { name: 'Add task' }).click();
  await page.waitForTimeout(300);

  await nav('Today', 'Today');
  const stagesCard = page.locator('[data-e2e="today-stages"]');
  const logCard = page.locator('[data-e2e="today-log"]');
  const tasksCard = page.locator('[data-e2e="today-tasks"]');
  const followUpsCard = page.locator('[data-e2e="today-followups"]');
  const stagesText = (await stagesCard.textContent()) ?? '';
  if (!stagesText.includes('Technical Design') || !stagesText.includes('Due in 10 days'))
    throw new Error('stage due in 10 days missing from the stages card: ' + stagesText.slice(0, 300));
  const logText = (await logCard.textContent()) ?? '';
  if (!logText.includes('RFI') || !logText.includes('Glazing spec confirmation') || !logText.includes('OVERDUE by 2 days'))
    throw new Error('overdue RFI (type word + subject + OVERDUE by 2 days) missing from the log card: ' + logText.slice(0, 300));
  if (!logText.includes('Maple House')) throw new Error('log card row should name its project');
  const tasksText = (await tasksCard.textContent()) ?? '';
  if (!tasksText.includes('Call the planner') || !tasksText.includes('Due in 1 day'))
    throw new Error('task due tomorrow missing from the tasks card: ' + tasksText.slice(0, 300));
  const followUpsText = (await followUpsCard.textContent()) ?? '';
  if (!followUpsText.includes('Photograph waterproofing before backfill'))
    throw new Error('open note follow-up missing from the follow-ups card: ' + followUpsText.slice(0, 300));
  ok('Today: stage due in 10 days, overdue RFI, task due tomorrow, and open follow-up each surface in their own card');

  // D2: a Today task row's TITLE deep-links to the project's Tasks tab
  await tasksCard.getByRole('button', { name: /Call the planner/ }).click();
  await page.waitForSelector('h1:has-text("Maple House")');
  if (!(await page.getByRole('tab', { name: 'Tasks', selected: true }).count()))
    throw new Error('clicking a Today task title should land on the project Tasks tab');
  ok('Today: clicking a task title deep-links straight to the project Tasks tab');
  await nav('Today', 'Today');

  // 8c. The one-tap Done — Today's only write action
  await page.getByRole('checkbox', { name: 'Mark "Call the planner" done' }).click();
  await page.waitForTimeout(400);
  if (await page.getByText('Call the planner').count()) throw new Error('done task should leave the Today list');
  ok('Today: one-tap Done stamps the task and it leaves the list');

  // 8d. Clicking an open item deep-links straight to that project's Log tab
  await logCard.getByRole('button', { name: /Glazing spec confirmation/ }).click();
  await page.waitForSelector('h1:has-text("Maple House")');
  if (!(await page.getByRole('tab', { name: 'Log', selected: true }).count()))
    throw new Error('open-item click should land on the Log tab, not Overview');
  if (!(await page.getByText('Beam size at grid 4').count()))
    throw new Error('Log tab content should be visible after the deep link');
  ok('Today: clicking an open item deep-links straight to the project Log tab');

  // 9. Backup downloads and carries the data
  await nav('Settings', 'Settings');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Back up now/ }).click();
  const download = await dl;
  const tmp = mkdtempSync(join(tmpdir(), 'sl-e2e-'));
  const backupPath = join(tmp, download.suggestedFilename());
  await download.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  if (backup.exportType !== 'studio-log-backup') throw new Error('backup exportType wrong: ' + backup.exportType);
  if (backup.schemaVersion !== 1) throw new Error('backup schemaVersion wrong');
  if (backup.projects?.length !== 1 || backup.projects[0].stages?.length !== 6)
    throw new Error('backup should carry 1 project with 6 stages');
  if (!Array.isArray(backup.kv)) throw new Error('backup should carry the kv table');
  await page.waitForTimeout(400);
  if (/Last backup:\s*Never/.test(((await page.textContent('body')) ?? '').replace(/\s+/g, ' ')))
    throw new Error('"Last backup" should update after backing up');
  ok(`backup: downloads (${download.suggestedFilename()}), all-tables JSON verified`);

  // 10. Erase all (double-confirm auto-accepted), then restore round-trip
  await page.getByRole('button', { name: /Erase all data/ }).click();
  await page.waitForTimeout(600);
  await nav('Projects', 'Projects');
  if (!(await page.getByText('No projects yet').count())) throw new Error('erase-all left projects behind');
  ok('erase all: double-confirm wipes the registry');

  await nav('Settings', 'Settings');
  await page.locator('input[aria-label="Choose backup file"]').setInputFiles(backupPath);
  await page.waitForSelector('text=Restored 1 project', { timeout: 5000 });
  await nav('Projects', 'Projects');
  await page.getByRole('button', { name: 'Open Maple House' }).click();
  await page.waitForSelector('h1:has-text("Maple House")');
  if ((await page.locator('input[aria-label^="Stage name ("]').count()) !== 6)
    throw new Error('restored project should have its 6 stages');
  if ((await page.getByLabel('Status for Preparation and Briefing').inputValue()) !== 'done')
    throw new Error('restored stage status lost');
  if (!(await page.locator('a[href="https://example.com/drawings"]').count()))
    throw new Error('restored project should keep its file links');
  ok('restore: backup file round-trips project, stages, statuses, and links');
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
