#!/usr/bin/env node
/*
 * 禁则检查器 —— 对「已经排好版的日文」做检查，不负责排版。
 *
 * 用法：
 *   node tools/check-kinsoku.js <文件...>
 *   node tools/check-kinsoku.js --text "一行目。\n二行目。"
 *   node tools/check-kinsoku.js <文件> --json
 *
 * 退出码（三值，不要合并成一值）：
 *   0  查过了，零违反
 *   1  查过了，有违反
 *   2  没查成 —— 参数错、文件读不了、或一行有效内容都没有
 *
 * 为什么 2 必须存在：
 *   如果「没读到东西」也返回 0，那么路径打错、文件为空、编码读错，
 *   全部会被读成「干净」。一个永远返回 0 的检查器比没有检查器更糟，
 *   因为它会让人停止检查。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { findViolations } = require(path.join(__dirname, '..', 'plugin', 'lib', 'segmenter.js'))

const TYPE_LABEL = {
  head: '行頭禁則',
  tail: '行末禁則',
  'one-char': '1文字行'
}

function usage() {
  process.stderr.write(
    [
      '用法:',
      '  node tools/check-kinsoku.js <文件...>',
      '  node tools/check-kinsoku.js --text "一行目。\\n二行目。"',
      '',
      '选项:',
      '  --json    以 JSON 输出，便于接管道',
      '',
      '退出码: 0 干净 / 1 有违反 / 2 没查成',
      ''
    ].join('\n')
  )
}

function main(argv) {
  const files = []
  let inlineText = null
  let asJson = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      asJson = true
    } else if (a === '--text') {
      if (i + 1 >= argv.length) {
        process.stderr.write('--text 后面没跟内容\n')
        return 2
      }
      inlineText = argv[++i]
    } else if (a === '-h' || a === '--help') {
      usage()
      return 0
    } else if (a.startsWith('--')) {
      process.stderr.write(`不认识的选项: ${a}\n`)
      return 2
    } else {
      files.push(a)
    }
  }

  if (inlineText === null && files.length === 0) {
    usage()
    return 2
  }

  const targets = []
  if (inlineText !== null) {
    targets.push({ name: '<--text>', text: inlineText.replace(/\\n/g, '\n') })
  }
  for (const f of files) {
    let text
    try {
      text = fs.readFileSync(f, 'utf8')
    } catch (err) {
      process.stderr.write(`读不了 ${f}: ${err.message}\n`)
      // 读不了就是没查成，不是「干净」
      return 2
    }
    targets.push({ name: f, text })
  }

  let checkedLines = 0
  const results = []
  for (const t of targets) {
    const lines = t.text.split(/\r?\n/).filter((l) => l.length > 0)
    checkedLines += lines.length
    results.push({ name: t.name, lines: lines.length, violations: findViolations(t.text) })
  }

  if (checkedLines === 0) {
    process.stderr.write('一行有效内容都没有 —— 这是探针失灵，不是「没问题」\n')
    return 2
  }

  const total = results.reduce((n, r) => n + r.violations.length, 0)

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ ok: total === 0, checkedLines, total, results }, null, 2) + '\n'
    )
    return total === 0 ? 0 : 1
  }

  for (const r of results) {
    if (r.violations.length === 0) {
      process.stdout.write(`${r.name}: ${r.lines} 行，0 违反\n`)
      continue
    }
    process.stdout.write(`${r.name}: ${r.lines} 行，${r.violations.length} 违反\n`)
    for (const v of r.violations) {
      process.stdout.write(
        `  ${TYPE_LABEL[v.type]} 第 ${v.line} 行  「${v.char}」  ${v.text}\n`
      )
    }
  }
  process.stdout.write(`\n合计 ${checkedLines} 行，${total} 违反\n`)
  return total === 0 ? 0 : 1
}

process.exitCode = main(process.argv.slice(2))
