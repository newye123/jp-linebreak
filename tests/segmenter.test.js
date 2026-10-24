'use strict'

// 断行器の性質テスト。
//
// このファイルの存在理由：元のリポジトリには api/test-segments.js があって、
// 4 つの「テストケース」を回して結果を console.log していた。
// 断言は 1 つもなく、行頭が「。」の出力を 4 つ印刷したうえで rc=0 で終わっていた。
// 名前が test で、終了コードが 0 で、人間が読むと「通った」に見える。
// だから誰も直さなかった。
//
// ここでは 3 種類の検査を混ぜている：
//   golden     … 出力そのものを固定する（規則表が黙って変わったら落ちる）
//   property   … 任意の入力で成り立つべき不変条件（禁則ゼロ・不丢字・行長上限）
//   regression … 昔の壊れた出力を再現しないこと

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const lib = require(path.join(__dirname, '..', 'plugin', 'lib', 'segmenter.js'))
const { segmentJapanese, findViolations, KINSOKU_HEAD, KINSOKU_TAIL } = lib

const ROOT = path.join(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. golden：出力を固定する
// ---------------------------------------------------------------------------

const GOLDEN = [
  {
    name: '句点で切れる',
    text: '今日はいい天気ですね。散歩に行きませんか？',
    max: 15,
    expect: ['今日はいい天気ですね。', '散歩に行きませんか？']
  },
  {
    name: '括弧の中を割らない',
    text: 'これは（テスト）です。特に問題は（ありません）。',
    max: 20,
    expect: ['これは（テスト）です。', '特に問題は（ありません）。']
  },
  {
    name: '読点を捨てない',
    text: '日本vichの設計においては、ユーザーの利便性を最優先に考慮する必要があります。',
    max: 25,
    expect: [
      '日本vichの設計においては、',
      'ユーザーの利便性を最優先に考慮する必要があります。'
    ]
  },
  {
    name: '読点が遠くても読点で切る',
    text: 'この度は、私たちのサービスをご利用いただき、誠にありがとうございます。今後もより良いサービス提供に努めてまいります。',
    max: 20,
    expect: [
      'この度は、',
      '私たちのサービスをご利用いただき、',
      '誠にありがとうございます。',
      '今後もより良いサービス提供に',
      '努めてまいります。'
    ]
  }
]

for (const g of GOLDEN) {
  test(`golden: ${g.name}`, () => {
    const r = segmentJapanese(g.text, { maxLineLength: g.max })
    assert.deepEqual(r.lines, g.expect)
  })
}

// ---------------------------------------------------------------------------
// 2. property：不変条件
// ---------------------------------------------------------------------------

const CORPUS = [
  '今日はいい天気ですね。散歩に行きませんか？',
  'これは（テスト）です。特に問題は（ありません）。',
  '日本vichの設計においては、ユーザーの利便性を最優先に考慮する必要があります。',
  'この度は、私たちのサービスをご利用いただき、誠にありがとうございます。今後もより良いサービス提供に努めてまいります。',
  '「引用」と『二重引用』が混ざった文章です。句点！疑問符？感嘆符。',
  'きゃきゅきょ、しゃしゅしょ、ちゃちゅちょ。小書き仮名のテストです。',
  'コンピューター・グラフィックス・ワークステーションのーーー長音符。',
  'あ、い、う、え、お。か、き、く、け、こ。',
  '短い。',
  'これはとても長い一文でして、途中に読点も句点も空白も一切ないのでどこで切るか迷うタイプの文章です。'
]

test('property: どの maxLineLength でも行頭禁則違反ゼロ', () => {
  for (const text of CORPUS) {
    for (let max = 4; max <= 30; max++) {
      const r = segmentJapanese(text, { maxLineLength: max })
      const bad = findViolations(r.lines.join('\n')).filter((v) => v.type === 'head')
      assert.equal(
        bad.length,
        0,
        `max=${max} で行頭禁則違反: ${JSON.stringify(bad)}\n${r.lines.join(' | ')}`
      )
    }
  }
})

test('property: 行末禁則違反ゼロ', () => {
  for (const text of CORPUS) {
    for (let max = 4; max <= 30; max++) {
      const r = segmentJapanese(text, { maxLineLength: max })
      const bad = findViolations(r.lines.join('\n')).filter((v) => v.type === 'tail')
      assert.equal(bad.length, 0, `max=${max} で行末禁則違反: ${JSON.stringify(bad)}`)
    }
  }
})

test('property: 断行は一字も落とさない', () => {
  // 行を連結すると原文に戻る。これが崩れたら、どんなに綺麗に見えても
  // それは「別の文章」を出力している。
  for (const text of CORPUS) {
    for (const max of [4, 7, 12, 20, 30]) {
      const r = segmentJapanese(text, { maxLineLength: max })
      assert.equal(r.lines.join(''), text, `max=${max} で文字が欠けた`)
    }
  }
})

test('property: 行長は max + maxAdjust を超えない', () => {
  const ADJUST = 3
  for (const text of CORPUS) {
    for (const max of [5, 10, 20]) {
      const r = segmentJapanese(text, { maxLineLength: max })
      for (const line of r.lines) {
        assert.ok(
          [...line].length <= max + ADJUST,
          `max=${max} なのに ${[...line].length} 字の行: ${line}`
        )
      }
    }
  }
})

test('property: 1 文字の行を作らない（最終行の widow 含む）', () => {
  for (const text of CORPUS) {
    for (let max = 6; max <= 24; max++) {
      const r = segmentJapanese(text, { maxLineLength: max })
      if (r.lines.length < 2) continue
      const bad = findViolations(r.lines.join('\n')).filter((v) => v.type === 'one-char')
      assert.equal(bad.length, 0, `max=${max} で 1 文字行: ${JSON.stringify(bad)}`)
    }
  }
})

test('property: 空白も句読点もない長文でも 1 文字行は出ない', () => {
  const text = 'あ'.repeat(47)
  for (let max = 5; max <= 20; max++) {
    const r = segmentJapanese(text, { maxLineLength: max })
    assert.equal(r.lines.join(''), text)
    for (const line of r.lines) assert.ok([...line].length >= 2, `max=${max}: ${line}`)
  }
})

// ---------------------------------------------------------------------------
// 3. regression：元の実装が出していた壊れた出力
// ---------------------------------------------------------------------------

test('regression: 行頭が「。」の行を出さない', () => {
  // 元の実装は 4 用例中 4 箇所で行頭「。」を出していた。
  // fixtures/before.txt がその実物。
  const fs = require('node:fs')
  const before = fs.readFileSync(path.join(ROOT, 'fixtures', 'before.txt'), 'utf8')
  const beforeViolations = findViolations(before).filter((v) => v.type === 'head')
  assert.ok(
    beforeViolations.length >= 4,
    `before.txt に違反が ${beforeViolations.length} 件しかない。fixture が壊れている`
  )

  const after = fs.readFileSync(path.join(ROOT, 'fixtures', 'after.txt'), 'utf8')
  assert.deepEqual(findViolations(after), [], 'after.txt に違反がある')
})

test('regression: 「ね。」だけの行を作らない', () => {
  const r = segmentJapanese('今日はいい天気ですね。散歩に行きませんか？', { maxLineLength: 15 })
  for (const line of r.lines) {
    assert.ok([...line].length > 2, `短すぎる行: ${line}`)
  }
})

test('regression: 語の途中で切る代わりに句点まで送る', () => {
  // 元の実装は max に届くと Math.floor(len/2) で真ん中を切っていた。
  // 「散歩に行き／ませんか？」がその产物。
  const r = segmentJapanese('散歩に行きませんか？', { maxLineLength: 10 })
  assert.deepEqual(r.lines, ['散歩に行きませんか？'])
})

// ---------------------------------------------------------------------------
// 4. 境界と適用域
// ---------------------------------------------------------------------------

test('空文字は 0 行', () => {
  assert.deepEqual(segmentJapanese('', { maxLineLength: 10 }).lines, [])
})

test('1 文字だけの入力は 1 行で、違反ではない', () => {
  const r = segmentJapanese('あ', { maxLineLength: 10 })
  assert.deepEqual(r.lines, ['あ'])
  // 「1 文字行」ルールの適用域は「2 行以上ある文書」。1 行しかない文書に
  // 適用すると、正しい出力を誤報する。
  assert.deepEqual(findViolations('あ'), [])
  assert.ok(findViolations('あ\nい').some((v) => v.type === 'one-char'))
})

test('既存の改行は硬い改行として保たれる', () => {
  const r = segmentJapanese('一行目です。\n二行目です。', { maxLineLength: 20 })
  assert.deepEqual(r.lines, ['一行目です。', '二行目です。'])
})

test('maxLineLength が壊れた値でも落ちない', () => {
  for (const bad of [0, -5, NaN, 'x', null, undefined]) {
    const r = segmentJapanese('あいうえおかきくけこ', { maxLineLength: bad })
    assert.equal(r.lines.join(''), 'あいうえおかきくけこ')
  }
})

test('preferAfterParticle を切ると結果が変わる（効いている証明）', () => {
  const text = '私たちのサービスをご利用いただき、ありがとう'
  const on = segmentJapanese(text, { maxLineLength: 12, preferAfterParticle: true }).lines
  const off = segmentJapanese(text, { maxLineLength: 12, preferAfterParticle: false }).lines
  assert.notDeepEqual(on, off)
})

test('規則表そのものを固定する', () => {
  // 表が黙って痩せると、実装も検査器も一緒に緩む。
  for (const ch of ['。', '、', '！', '？', '」', '』', '）', 'ー', 'っ', 'ャ']) {
    assert.ok(KINSOKU_HEAD.has(ch), `行頭禁則表から「${ch}」が消えている`)
  }
  for (const ch of ['（', '「', '『', '【']) {
    assert.ok(KINSOKU_TAIL.has(ch), `行末禁則表から「${ch}」が消えている`)
  }
  // 行頭禁則と行末禁則は同じ文字を含んではいけない
  for (const ch of KINSOKU_HEAD) {
    assert.ok(!KINSOKU_TAIL.has(ch), `「${ch}」が両方の表に入っている`)
  }
})

// ---------------------------------------------------------------------------
// 5. CLI の三値退出コード
// ---------------------------------------------------------------------------

function runCli(args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check-kinsoku.js'), ...args], {
    encoding: 'utf8'
  })
}

test('CLI: 違反ありは 1', () => {
  const r = runCli([path.join(ROOT, 'fixtures', 'before.txt')])
  assert.equal(r.status, 1, r.stdout + r.stderr)
})

test('CLI: 違反なしは 0', () => {
  const r = runCli([path.join(ROOT, 'fixtures', 'after.txt')])
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('CLI: 存在しないファイルは 2（0 ではない）', () => {
  const r = runCli([path.join(ROOT, 'fixtures', 'no-such-file.txt')])
  assert.equal(r.status, 2, '読めないファイルを「干净」と報告してはいけない')
})

test('CLI: 空ファイルは 2（0 ではない）', () => {
  const os = require('node:os')
  const fs = require('node:fs')
  const tmp = path.join(os.tmpdir(), `jp-kinsoku-empty-${process.pid}.txt`)
  fs.writeFileSync(tmp, '\n\n\n')
  const r = runCli([tmp])
  fs.unlinkSync(tmp)
  assert.equal(r.status, 2, '一行も検査していないのに 0 を返してはいけない')
})

test('CLI: 引数なしは 2', () => {
  assert.equal(runCli([]).status, 2)
})

test('CLI: --json は機械可読', () => {
  const r = runCli([path.join(ROOT, 'fixtures', 'before.txt'), '--json'])
  assert.equal(r.status, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.ok, false)
  assert.ok(parsed.total >= 4)
  assert.equal(parsed.checkedLines, 13)
})

// ---------------------------------------------------------------------------
// 6. 语言分流：切れ方の決定は 1 箇所だけ
// ---------------------------------------------------------------------------

const { segmentForLanguage, wrapWords } = lib

test('分流: ja は禁則断行器を通る', () => {
  const r = segmentForLanguage('今日はいい天気ですね。散歩に行きませんか？', 'ja', {
    maxLineLength: 15
  })
  assert.deepEqual(r.lines, ['今日はいい天気ですね。', '散歩に行きませんか？'])
  assert.equal(r.metadata.language, 'ja')
})

test('分流: zh も禁則を守る（行頭に「。」を出さない）', () => {
  const text = '这是一个很长的中文句子，用来测试断行是否会在句号前面断开。第二个句子。'
  for (let max = 6; max <= 24; max++) {
    const r = segmentForLanguage(text, 'zh', { maxLineLength: max })
    assert.deepEqual(findViolations(r.lines.join('\n')).filter((v) => v.type === 'head'), [])
    assert.equal(r.lines.join(''), text)
  }
})

test('分流: en は単語の途中で切らない', () => {
  const text = 'The quick brown fox jumps over the lazy dog.'
  const r = segmentForLanguage(text, 'en', { maxLineLength: 20 })
  for (const line of r.lines) {
    // 行の境界が単語の途中なら、前後をつなぐと辞書にない語ができる。
    // ここでは「各行が空白で終わるか、文末である」ことだけを見る。
    assert.ok(
      line.endsWith(' ') || line === r.lines[r.lines.length - 1],
      `単語の途中で切れている: ${JSON.stringify(line)}`
    )
  }
})

test('分流: max より長い単語は切らずに 1 行にする', () => {
  const r = wrapWords('short supercalifragilisticexpialidocious end', 10)
  assert.ok(r.lines.includes('supercalifragilisticexpialidocious'))
})

test('分流: 未知の言語は単語折り返しに落ちる（例外を投げない）', () => {
  const r = segmentForLanguage('hello world foo bar', 'xx', { maxLineLength: 12 })
  assert.ok(r.lines.length >= 1)
  assert.equal(r.lines.join(' ').replace(/\s+/g, ' ').trim(), 'hello world foo bar')
})
