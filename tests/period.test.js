// 期間計算のテスト。実行: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { halfKeyOf, halfRange, monthRange, shiftHalf, shiftMonth, shiftDay, dayRange, halfKeyOfMonth, jstDateStr, halfLabel, normalizeStartMonth, setFiscalStartMonth, getFiscalStartMonth } from '../src/period.js'

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

test('開始月1月（上期1〜6月、下期7〜12月）', () => {
  assert.equal(halfKeyOf(2026, 1, 1), '2026H1')
  assert.equal(halfKeyOf(2026, 6, 1), '2026H1')
  assert.equal(halfKeyOf(2026, 7, 1), '2026H2')
  assert.equal(halfKeyOf(2026, 12, 1), '2026H2')
  assert.deepEqual(halfRange('2026H2', 1), ['2026-07-01', '2027-01-01'])
  assert.equal(halfLabel('2026H2', 1), '2026年 下期（7〜12月）')
})
test('開始月10月（上期10〜翌3月、下期4〜9月）', () => {
  assert.equal(halfKeyOf(2026, 10, 10), '2026H1')
  assert.equal(halfKeyOf(2027, 3, 10), '2026H1')
  assert.equal(halfKeyOf(2027, 4, 10), '2026H2')
  assert.equal(halfKeyOf(2027, 9, 10), '2026H2')
  assert.equal(halfKeyOf(2026, 9, 10), '2025H2')
  assert.deepEqual(halfRange('2026H1', 10), ['2026-10-01', '2027-04-01'])
  assert.deepEqual(halfRange('2026H2', 10), ['2027-04-01', '2027-10-01'])
  assert.equal(halfLabel('2026H2', 10), '2026年度 下期（翌4〜9月）')
})
test('全ての開始月で、半期の範囲と判定が一致する', () => {
  for (let s = 1; s <= 12; s++) {
    for (let y = 2025; y <= 2027; y++) for (let m = 1; m <= 12; m++) {
      const key = halfKeyOf(y, m, s)
      const [from, to] = halfRange(key, s)
      const d = `${y}-${String(m).padStart(2, '0')}-01`
      assert.ok(from <= d && d < to, `s=${s} ${d} → ${key} [${from}, ${to})`)
    }
  }
})
test('開始月の設定（不正な値は4月に戻す）', () => {
  assert.equal(normalizeStartMonth(13), 4)
  assert.equal(normalizeStartMonth('7'), 7)
  assert.equal(normalizeStartMonth(null), 4)
  setFiscalStartMonth(1)
  assert.equal(getFiscalStartMonth(), 1)
  assert.equal(halfKeyOf(2026, 7), '2026H2')
  setFiscalStartMonth(4)
  assert.equal(halfLabel('2026H2'), '2026年度 下期（10〜翌3月）')
})
