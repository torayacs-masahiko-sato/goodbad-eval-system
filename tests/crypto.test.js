// 暗号化のテスト。実行: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveKeyBytes, importKey, encryptText, decryptText, encryptRow, decryptRows, PREFIX, UNREADABLE } from '../src/cryptoCore.js'

const SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz'
const key = await importKey(await deriveKeyBytes(SECRET))

test('暗号化→復号で元に戻る（日本語・改行・絵文字）', async () => {
  const s = '顧客対応が丁寧だった。\n手順書も更新してくれた👍'
  const c = await encryptText(key, 'points', 'content', s)
  assert.ok(c.startsWith(PREFIX))
  assert.ok(!c.includes('顧客'))
  assert.equal(await decryptText(key, 'points', 'content', c), s)
})
test('同じ文でも毎回違う暗号文になる（推測されにくい）', async () => {
  const a = await encryptText(key, 'points', 'content', '同じ内容')
  const b = await encryptText(key, 'points', 'content', '同じ内容')
  assert.notEqual(a, b)
})
test('鍵が違うと読めない', async () => {
  const other = await importKey(await deriveKeyBytes(SECRET + 'x'))
  const c = await encryptText(key, 'members', 'name', '佐藤')
  assert.equal(await decryptText(other, 'members', 'name', c), UNREADABLE)
})
test('改ざん・別の列への移し替えを検知する', async () => {
  const c = await encryptText(key, 'members', 'name', '佐藤')
  const tampered = c.slice(0, -4) + (c.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA')
  assert.equal(await decryptText(key, 'members', 'name', tampered), UNREADABLE)
  assert.equal(await decryptText(key, 'points', 'content', c), UNREADABLE)
})
test('暗号化前の古いデータ（平文）はそのまま表示できる', async () => {
  assert.equal(await decryptText(key, 'points', 'content', '旧データ'), '旧データ')
  assert.equal(await decryptText(key, 'goals', 'description', null), null)
})
test('二重に暗号化しない・空はそのまま', async () => {
  const c = await encryptText(key, 'goals', 'title', '目標')
  assert.equal(await encryptText(key, 'goals', 'title', c), c)
  assert.equal(await encryptText(key, 'goals', 'description', null), null)
})
test('文字数上限は暗号化前の文字数で判定', async () => {
  await assert.rejects(encryptText(key, 'members', 'name', 'あ'.repeat(51)), /50文字以内/)
  await encryptText(key, 'members', 'name', 'あ'.repeat(50))
})
test('行単位の暗号化・復号（対象外の列は変えない）', async () => {
  const row = { kind: 'good', content: '良かった点', member_id: 'm1' }
  const e = await encryptRow(key, 'points', row)
  assert.equal(e.kind, 'good'); assert.equal(e.member_id, 'm1'); assert.ok(e.content.startsWith(PREFIX))
  const [d] = await decryptRows(key, 'points', [e])
  assert.deepEqual(d, row)
})
test('短すぎる鍵は拒否', async () => {
  await assert.rejects(deriveKeyBytes('short'), /32文字以上/)
})
