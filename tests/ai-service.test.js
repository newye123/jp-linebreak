'use strict'

// AI 层の「盛らない」ことを固定するテスト。
//
// 元の実装は 2 箇所で、無い情報を既定値で埋めていた：
//   confidence: result.confidence || 0.8
//   parseAIResponse → { improvedText: originalText, confidence: 0.7 }
// どちらも「AI が答えられなかった」を「AI がこう答えた」に変換する。
// 画面には 80% の置信度バーと「改善後のテキスト」が出る。
// 利用者に区別する手段が無い、という点でこれは表示の不具合ではなく嘘。

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { normalizeAIResult, salvageResult, buildPrompt, SYSTEM_PROMPT } = require(
  path.join(__dirname, '..', 'api', 'ai-service.js')
)

const ORIGINAL = '今日はいい天気ですね。散歩に行きませんか？'

test('confidence が無いときは null（0.8 を捏造しない）', () => {
  const r = normalizeAIResult({ improvedText: '別のテキスト', suggestions: [] }, ORIGINAL)
  assert.equal(r.confidence, null)
})

test('confidence が数値ならそのまま通す', () => {
  assert.equal(normalizeAIResult({ confidence: 0.93 }, ORIGINAL).confidence, 0.93)
  assert.equal(normalizeAIResult({ confidence: 0 }, ORIGINAL).confidence, 0)
})

test('confidence が範囲外なら丸める', () => {
  assert.equal(normalizeAIResult({ confidence: 1.7 }, ORIGINAL).confidence, 1)
  assert.equal(normalizeAIResult({ confidence: -3 }, ORIGINAL).confidence, 0)
})

test('confidence が数値でないなら null', () => {
  for (const bad of ['0.8', null, NaN, Infinity, {}, []]) {
    assert.equal(normalizeAIResult({ confidence: bad }, ORIGINAL).confidence, null)
  }
})

test('improvedText が原文と同一なら null（改善していない）', () => {
  const r = normalizeAIResult({ improvedText: ORIGINAL, confidence: 0.9 }, ORIGINAL)
  assert.equal(r.improvedText, null, '原文を「改善後」として返してはいけない')
})

test('improvedText が空文字・非文字列なら null', () => {
  for (const bad of ['', null, undefined, 123, {}]) {
    assert.equal(normalizeAIResult({ improvedText: bad }, ORIGINAL).improvedText, null)
  }
})

test('解釈できなかった残骸は improvedText を返さない', () => {
  const r = salvageResult('1行目\n2行目\n3行目', ORIGINAL)
  assert.equal(r.improvedText, null)
  assert.equal(r.confidence, null)
  assert.equal(r.source, 'unparsed')
  assert.deepEqual(r.suggestions, ['1行目', '2行目', '3行目'])
})

test('結果には必ず source が付く', () => {
  assert.equal(normalizeAIResult({}, ORIGINAL).source, 'model')
  assert.equal(salvageResult('x', ORIGINAL).source, 'unparsed')
})

test('プロンプトに原文と行頭禁則の指示が入る', () => {
  const p = buildPrompt('テスト本文', 'コンテキスト')
  assert.ok(p.includes('テスト本文'))
  assert.ok(p.includes('コンテキスト'))
  // 行頭禁則の指示は SYSTEM_PROMPT（system 側）に入っている
  assert.ok(SYSTEM_PROMPT.includes('行頭禁則'))
})
