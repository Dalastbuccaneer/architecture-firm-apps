// Unit test for the pure Reports-screen logic in src/lib/reports.ts.
// Runs on plain Node (v23.6+ strips TS types natively): node test-reports.mjs
import assert from 'node:assert/strict';
import {
  pipelineValueByStage,
  winRateBySector,
  winRateByClientType,
  avgLeadToAward,
  feeCalibration,
  UNSPECIFIED,
} from './src/lib/reports.ts';
import { LEAD_STAGES } from './src/types.ts';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('PASS', name);
};

const mkLead = (over = {}) => ({
  schemaVersion: 1,
  id: over.id ?? 'l-1',
  clientId: 'c-acme',
  title: 'Lead',
  stage: 'inquiry',
  stageChangedAt: '',
  createdAt: '',
  updatedAt: '',
  ...over,
});

const mkClient = (id, name, over = {}) => ({
  schemaVersion: 1,
  id,
  name,
  tags: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

/** Deep walk asserting every number in a result is finite — the edge-case
 *  contract: null is fine ("no data"), NaN/Infinity never is. */
const assertNoBadNumbers = (value, path = 'result') => {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is ${value} — NaN/Infinity leaked`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoBadNumbers(v, `${path}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoBadNumbers(v, `${path}.${k}`);
  }
};

// ---- pipelineValueByStage ---------------------------------------------------------

test('pipelineValueByStage: all six stages, in LEAD_STAGES order, zeros when empty', () => {
  const out = pipelineValueByStage([]);
  assert.equal(out.length, 6);
  assert.deepEqual(out.map((r) => r.stage), LEAD_STAGES);
  for (const row of out) {
    assert.equal(row.count, 0);
    assert.equal(row.rawSum, 0);
    assert.equal(row.weightedSum, 0);
  }
});

test('pipelineValueByStage: counts, raw sums, probability-weighted sums', () => {
  const out = pipelineValueByStage([
    mkLead({ id: 'a', stage: 'inquiry', estimatedFee: 100_000, probability: 10 }),
    mkLead({ id: 'b', stage: 'inquiry' }), // no fee, no probability
    mkLead({ id: 'c', stage: 'qualified', estimatedFee: 50_000, probability: 50 }),
    mkLead({ id: 'd', stage: 'proposal_sent', estimatedFee: 80_000 }), // no probability
    mkLead({ id: 'e', stage: 'won', estimatedFee: 120_000, probability: 100 }),
  ]);
  const by = Object.fromEntries(out.map((r) => [r.stage, r]));
  assert.deepEqual(by.inquiry, { stage: 'inquiry', count: 2, rawSum: 100_000, weightedSum: 10_000 });
  assert.deepEqual(by.qualified, { stage: 'qualified', count: 1, rawSum: 50_000, weightedSum: 25_000 });
  // a priced lead with no probability set counts fully raw but weighs 0
  assert.deepEqual(by.proposal_sent, { stage: 'proposal_sent', count: 1, rawSum: 80_000, weightedSum: 0 });
  assert.deepEqual(by.shortlisted, { stage: 'shortlisted', count: 0, rawSum: 0, weightedSum: 0 });
  assert.deepEqual(by.won, { stage: 'won', count: 1, rawSum: 120_000, weightedSum: 120_000 });
  assert.deepEqual(by.lost, { stage: 'lost', count: 0, rawSum: 0, weightedSum: 0 });
});

// ---- winRateBySector --------------------------------------------------------------

test('winRateBySector: closed leads grouped; open leads shape groups but never count', () => {
  const out = winRateBySector([
    mkLead({ id: 'a', stage: 'won', sector: 'Residential' }),
    mkLead({ id: 'b', stage: 'won', sector: 'Residential' }),
    mkLead({ id: 'c', stage: 'lost', sector: 'Residential' }),
    mkLead({ id: 'd', stage: 'lost', sector: 'Commercial' }),
    mkLead({ id: 'e', stage: 'lost', sector: 'Commercial' }),
    mkLead({ id: 'f', stage: 'inquiry', sector: 'Residential' }), // open — doesn't count
  ]);
  assert.deepEqual(out, [
    { sector: 'Commercial', won: 0, lost: 2, rate: 0 },
    { sector: 'Residential', won: 2, lost: 1, rate: 2 / 3 },
  ]);
});

test('winRateBySector: sector with zero closed leads gets rate null — never NaN', () => {
  const out = winRateBySector([
    mkLead({ id: 'a', stage: 'won', sector: 'Residential' }),
    mkLead({ id: 'b', stage: 'shortlisted', sector: 'Education' }), // no closed leads yet
  ]);
  const education = out.find((r) => r.sector === 'Education');
  assert.deepEqual(education, { sector: 'Education', won: 0, lost: 0, rate: null });
  assertNoBadNumbers(out);
});

test('winRateBySector: missing/blank sector folds into Unspecified, sorted last', () => {
  const out = winRateBySector([
    mkLead({ id: 'a', stage: 'won' }), // no sector at all
    mkLead({ id: 'b', stage: 'lost', sector: '   ' }), // whitespace-only
    mkLead({ id: 'c', stage: 'won', sector: 'Zoos' }), // Z still sorts before Unspecified
  ]);
  assert.deepEqual(out, [
    { sector: 'Zoos', won: 1, lost: 0, rate: 1 },
    { sector: UNSPECIFIED, won: 1, lost: 1, rate: 0.5 },
  ]);
});

test('winRateBySector: trimmed grouping — "Residential " and "Residential" are one sector', () => {
  const out = winRateBySector([
    mkLead({ id: 'a', stage: 'won', sector: 'Residential ' }),
    mkLead({ id: 'b', stage: 'lost', sector: 'Residential' }),
  ]);
  assert.deepEqual(out, [{ sector: 'Residential', won: 1, lost: 1, rate: 0.5 }]);
});

// ---- winRateByClientType ----------------------------------------------------------

const CLIENTS = [
  mkClient('c-acme', 'Acme Developments', { type: 'Developer' }),
  mkClient('c-beta', 'Beta Estates', { type: 'Developer' }),
  mkClient('c-gov', 'City Council', { type: 'Authority' }),
  mkClient('c-blank', 'Untyped Org'), // no type set
  mkClient('c-consult', 'Struct Co', { type: 'Consultant' }),
];

test('winRateByClientType: grouped via the lead client Client.type', () => {
  const out = winRateByClientType(
    [
      mkLead({ id: 'a', stage: 'won', clientId: 'c-acme' }),
      mkLead({ id: 'b', stage: 'lost', clientId: 'c-beta' }),
      mkLead({ id: 'c', stage: 'won', clientId: 'c-gov' }),
      mkLead({ id: 'd', stage: 'won', clientId: 'c-blank' }), // typeless client
      mkLead({ id: 'e', stage: 'lost', clientId: 'c-ghost' }), // no such client
    ],
    CLIENTS,
  );
  assert.deepEqual(out, [
    { clientType: 'Authority', won: 1, lost: 0, rate: 1 },
    { clientType: 'Developer', won: 1, lost: 1, rate: 0.5 },
    { clientType: UNSPECIFIED, won: 1, lost: 1, rate: 0.5 },
  ]);
});

test('winRateByClientType: client type with zero closed leads gets rate null — never NaN', () => {
  const out = winRateByClientType(
    [
      mkLead({ id: 'a', stage: 'won', clientId: 'c-acme' }),
      mkLead({ id: 'b', stage: 'proposal_sent', clientId: 'c-consult' }), // only open work
    ],
    CLIENTS,
  );
  const consultant = out.find((r) => r.clientType === 'Consultant');
  assert.deepEqual(consultant, { clientType: 'Consultant', won: 0, lost: 0, rate: null });
  assertNoBadNumbers(out);
});

// ---- avgLeadToAward ---------------------------------------------------------------

test('avgLeadToAward: mean days from createdAt to stageChangedAt across won leads', () => {
  const out = avgLeadToAward([
    mkLead({
      id: 'a',
      stage: 'won',
      createdAt: '2026-06-01T09:00:00.000Z',
      stageChangedAt: '2026-06-11T09:00:00.000Z', // 10 days
    }),
    mkLead({
      id: 'b',
      stage: 'won',
      createdAt: '2026-05-01T09:00:00.000Z',
      stageChangedAt: '2026-05-21T09:00:00.000Z', // 20 days
    }),
    mkLead({
      id: 'c',
      stage: 'lost', // closed but not won — never counts
      createdAt: '2026-01-01T09:00:00.000Z',
      stageChangedAt: '2026-06-01T09:00:00.000Z',
    }),
    mkLead({ id: 'd', stage: 'won' }), // won but blank dates — excluded, not NaN
  ]);
  assert.equal(out, 15);
});

test('avgLeadToAward: zero won leads -> null, never NaN', () => {
  assert.equal(avgLeadToAward([]), null);
  assert.equal(avgLeadToAward([mkLead({ stage: 'lost' }), mkLead({ stage: 'inquiry' })]), null);
});

test('avgLeadToAward: won leads exist but none with both dates -> null, never NaN', () => {
  const out = avgLeadToAward([
    mkLead({ id: 'a', stage: 'won' }), // both blank
    mkLead({ id: 'b', stage: 'won', createdAt: '2026-06-01T09:00:00.000Z' }), // stageChangedAt blank
    mkLead({
      id: 'c',
      stage: 'won',
      createdAt: 'not-a-date',
      stageChangedAt: '2026-06-11T09:00:00.000Z',
    }), // unparseable
  ]);
  assert.equal(out, null);
});

// ---- feeCalibration ---------------------------------------------------------------

test('feeCalibration: average delta and delta % across won leads with both fees', () => {
  const out = feeCalibration([
    mkLead({ id: 'a', stage: 'won', feeProposed: 100_000, feeWon: 90_000 }), // -10000, -10%
    mkLead({ id: 'b', stage: 'won', feeProposed: 200_000, feeWon: 220_000 }), // +20000, +10%
    mkLead({ id: 'c', stage: 'won', feeProposed: 500_000 }), // no feeWon — excluded
    mkLead({ id: 'd', stage: 'lost', feeProposed: 100_000, feeWon: 90_000 }), // not won — excluded
  ]);
  assert.deepEqual(out, { count: 2, avgDelta: 5_000, avgDeltaPct: 0 });
});

test('feeCalibration: none eligible -> nulls, never NaN', () => {
  assert.deepEqual(feeCalibration([]), { count: 0, avgDelta: null, avgDeltaPct: null });
  assert.deepEqual(feeCalibration([mkLead({ stage: 'won' })]), {
    count: 0,
    avgDelta: null,
    avgDeltaPct: null,
  });
});

test('feeCalibration: feeProposed of 0 never produces Infinity in the %', () => {
  const out = feeCalibration([
    mkLead({ id: 'a', stage: 'won', feeProposed: 0, feeWon: 5_000 }),
  ]);
  assert.equal(out.count, 1);
  assert.equal(out.avgDelta, 5_000); // still counts toward the absolute delta
  assert.equal(out.avgDeltaPct, null); // a % of nothing is "no data", not Infinity
  assertNoBadNumbers(out);
});

// ---- edge sweep: no function ever emits NaN/Infinity on empty or all-open data ------

test('edge sweep: empty and zero-closed-lead inputs yield only finite numbers or null', () => {
  const openOnly = [
    mkLead({ id: 'a', stage: 'inquiry', sector: 'Education', clientId: 'c-consult' }),
    mkLead({ id: 'b', stage: 'shortlisted', estimatedFee: 40_000 }),
  ];
  for (const leads of [[], openOnly]) {
    assertNoBadNumbers(pipelineValueByStage(leads));
    assertNoBadNumbers(winRateBySector(leads));
    assertNoBadNumbers(winRateByClientType(leads, CLIENTS));
    assertNoBadNumbers(winRateByClientType(leads, []));
    assertNoBadNumbers(avgLeadToAward(leads));
    assertNoBadNumbers(feeCalibration(leads));
  }
});

console.log(`\n${n}/${n} unit tests passed`);
