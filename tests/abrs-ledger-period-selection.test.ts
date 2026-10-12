import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAbrsLedgerPeriodSelection,
  defaultAbrsLedgerPeriodSelection,
  restoreAbrsLedgerPeriodSelection,
} from '../src/pages/abrs-automation/model/abrs-ledger-period-selection.ts';

test('daily selection has one date for receipt and collection without a hidden monthly range', () => {
  assert.deepEqual(createAbrsLedgerPeriodSelection('daily', '2026-09-17'), {
    mode: 'daily', value: '2026-09-17', targetDate: '2026-09-17',
    period: { start: '2026-09-17', end: '2026-09-17' },
  });
});

test('monthly selection derives the complete month and receipt anchor including leap day', () => {
  assert.deepEqual(createAbrsLedgerPeriodSelection('monthly', '2024-02'), {
    mode: 'monthly', value: '2024-02', targetDate: '2024-02-29',
    period: { start: '2024-02-01', end: '2024-02-29' },
  });
  assert.equal(createAbrsLedgerPeriodSelection('monthly', '2026-02')?.period.end, '2026-02-28');
});

test('invalid or incomplete native date/month input cannot start collection', () => {
  for (const date of ['', '2026-02-30', '2026-04', '2026-13-01', '2026-4-01']) {
    assert.equal(createAbrsLedgerPeriodSelection('daily', date), null);
  }
  for (const month of ['', '2026-00', '2026-13', '2026-04-18', '2026-4']) {
    assert.equal(createAbrsLedgerPeriodSelection('monthly', month), null);
  }
});

test('default selects the previous complete month through year transition', () => {
  assert.equal(defaultAbrsLedgerPeriodSelection(new Date(2026, 0, 11)).value, '2025-12');
  assert.equal(defaultAbrsLedgerPeriodSelection(new Date(2026, 9, 12)).targetDate, '2026-09-30');
});

test('restores daily/monthly mode while migrating older target-date-only selections as monthly', () => {
  assert.equal(restoreAbrsLedgerPeriodSelection({ targetDate: '2026-09-17', uploadMode: 'daily' }).period.start, '2026-09-17');
  assert.equal(restoreAbrsLedgerPeriodSelection({ targetDate: '2026-09-17', uploadMode: 'monthly' }).targetDate, '2026-09-30');
  assert.equal(restoreAbrsLedgerPeriodSelection({ targetDate: '2026-09-17' }).mode, 'monthly');
  assert.equal(restoreAbrsLedgerPeriodSelection({ targetDate: 'bad-date' }, new Date(2026, 9, 12)).value, '2026-09');
});
