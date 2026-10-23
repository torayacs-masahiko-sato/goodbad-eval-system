// 期間計算のテスト。実行: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { halfKeyOf, halfRange, monthRange, shiftHalf, shiftMonth, shiftDay, dayRange, halfKeyOfMonth, jstDateStr } from '../src/period.js'

test('半期の判定（上期4〜9月、下期10〜翌3月）', () => {
  assert.equal(halfKeyOf(2026, 4), '2026H1')
  assert.equal(halfKeyOf(2026, 9), '2026H1')
  assert.equal(halfKeyOf(2026, 10), '2026H2')
  assert.equal(halfKeyOf(2027, 3), '2026H2')
  assert.equal(halfKeyOfMonth('2027-01'), '2026H2')
})
test('期間の範囲', () => {
  assert.deepEqual(halfRange('2026H1'), ['2026-04-01', '2026-10-01'])
  assert.deepEqual(halfRange('2026H2'), ['2026-10-01', '2027-04-01'])
  assert.deepEqual(monthRange('2026-12'), ['2026-12-01', '2027-01-01'])
  assert.deepEqual(dayRange('2027-02-28'), ['2027-02-28', '2027-03-01'])
})
test('前後移動', () => {
  assert.equal(shiftHalf('2026H2', 1), '2027H1')
  assert.equal(shiftHalf('2026H1', -1), '2025H2')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
})
test('日本時間での日付（UTC 15:30 は翌日扱い）', () => {
  assert.equal(jstDateStr('2026-10-19T15:30:00Z'), '2026-10-20')
  assert.equal(jstDateStr('2026-10-19T14:59:00Z'), '2026-10-19')
})
