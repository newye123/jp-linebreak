'use strict'

// 仓库自检。检查的不是「代码对不对」（那是 segmenter.test.js 的事），
// 而是「这个仓库作为一份可核对的材料，有没有自相矛盾」。

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8')
}
function exists(p) {
  return fs.existsSync(path.join(ROOT, p))
}

// ---------------------------------------------------------------------------
// 案例：结构必须齐
// ---------------------------------------------------------------------------

const CASE_FILES = fs
  .readdirSync(path.join(ROOT, 'cases'))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')

test('cases/ 至少有三份案例', () => {
  assert.ok(CASE_FILES.length >= 3, `只有 ${CASE_FILES.length} 份`)
})

for (const f of CASE_FILES) {
  test(`案例结构完整: cases/${f}`, () => {
    const body = read(path.join('cases', f))
    // 必须锚到行尾。只写 `^##\s+取证` 会被 `## 取证材料（改坏了）` 这种前缀命中，
    // 于是「节标题被改坏」这件事检查不出来。
    assert.match(body, /^#\s+\S/m, `${f} 缺一级标题`)
    assert.match(body, /^##\s+症状\s*$/m, `${f} 缺一节：## 症状`)
    assert.match(body, /^##\s+取证\s*$/m, `${f} 缺一节：## 取证`)
    assert.match(body, /^##\s+根因\s*$/m, `${f} 缺一节：## 根因`)
    assert.match(body, /^##\s+修法\s*$/m, `${f} 缺一节：## 修法`)
    assert.match(body, /^##\s+结论\s*$/m, `${f} 缺一节：## 结论`)
    // 取证节必须真的贴了终端输出，不能只有散文
    assert.match(body, /```(console|bash|js|diff)/, `${f} 的取证里没有代码块`)
  })
}

test('cases/README.md 的链接都指向存在的文件', () => {
  const idx = read(path.join('cases', 'README.md'))
  const links = [...idx.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1])
  assert.ok(links.length >= 3, '索引里至少要有三个链接')
  for (const link of links) {
    assert.ok(exists(path.join('cases', link)), `索引链接指向不存在的文件: ${link}`)
  }
  // 反方向：每份案例都要被索引到
  for (const f of CASE_FILES) {
    assert.ok(links.includes(f), `案例 ${f} 没有出现在索引里`)
  }
})

// ---------------------------------------------------------------------------
// 结构：不该再出现第二份实现
// ---------------------------------------------------------------------------

test('没有编译产物和源码两份（api/src、api/dist 必须不存在）', () => {
  assert.ok(!exists('api/src'), 'api/src 又出现了 —— 核心算法只能有一份')
  assert.ok(!exists('api/dist'), 'api/dist 又出现了 —— 核心算法只能有一份')
})

test('断行实现只有一处', () => {
  const candidates = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (entry.name.endsWith('.js')) {
        const body = read(rel)
        if (/function\s+segmentJapanese|function\s+fallbackSegment/.test(body)) candidates.push(rel)
      }
    }
  }
  walk('.')
  assert.deepEqual(candidates, [path.join('plugin', 'lib', 'segmenter.js')], '断行实现不止一处')
})

test('插件里没有任何一份自己的断行实现', () => {
  const popup = read(path.join('plugin', 'popup.js'))
  assert.ok(
    popup.includes('JPSegmenter'),
    'popup.js 没有调用共用实现 —— 它又自己切了'
  )
})

// ---------------------------------------------------------------------------
// 断言密度：挡住「只打印不断言」的测试文件
// ---------------------------------------------------------------------------

test('每个测试文件里断言的次数不少于用例数', () => {
  const dir = path.join(ROOT, 'tests')
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.test.js'))) {
    const body = read(path.join('tests', f))
    const cases = (body.match(/(^|\n)\s*test\(/g) || []).length
    const asserts = (body.match(/assert\./g) || []).length
    assert.ok(
      asserts >= cases,
      `${f}: ${cases} 个用例只有 ${asserts} 处断言 —— 这就是「跑通了但没验证」`
    )
  }
})

// ---------------------------------------------------------------------------
// 许可与署名
// ---------------------------------------------------------------------------

test('LICENSE 是 NC-1.0，不是 MIT', () => {
  const lic = read('LICENSE')
  assert.ok(lic.includes('NC-1.0') || lic.includes('NonCommercial'), 'LICENSE 不是非商业许可')
  assert.doesNotMatch(lic.slice(0, 80), /^\s*MIT License/i, 'LICENSE 首行又变回 MIT 了')
})

test('NOTICE.md 写明著作权人', () => {
  const n = read('NOTICE.md')
  assert.match(n, /著作权|著作権|Copyright/i)
  assert.ok(n.includes('newye123'), 'NOTICE 里没有署名')
})

// ---------------------------------------------------------------------------
// 密钥与隐私
// ---------------------------------------------------------------------------

test('仓库里没有 API key 残留', () => {
  const patterns = [
    /AIza[0-9A-Za-z_-]{35}/, // Google
    /sk-[A-Za-z0-9]{20,}/, // OpenAI 风格
    /ghp_[A-Za-z0-9]{30,}/, // GitHub PAT
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/
  ]
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(js|json|md|html|example|yml|yaml|ts)$/.test(entry.name)) {
        const body = read(rel)
        for (const p of patterns) {
          assert.doesNotMatch(body, p, `${rel} 里疑似有密钥`)
        }
      }
    }
  }
  walk('.')
})

test('.env 不在仓库里，但 .env.example 在', () => {
  assert.ok(!exists('.env'), '.env 被提交进来了')
  assert.ok(exists('.env.example'))
  assert.match(read('.env.example'), /your-google-api-key-here/, '.env.example 里不该有真 key')
})

// ---------------------------------------------------------------------------
// 清单一致性
// ---------------------------------------------------------------------------

test('manifest.json 合法，version 与 package.json 一致', () => {
  const manifest = JSON.parse(read(path.join('plugin', 'manifest.json')))
  const pkg = JSON.parse(read('package.json'))
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.version, pkg.version)
  // 插件要加载的脚本必须真实存在
  assert.ok(exists(path.join('plugin', manifest.background.service_worker)))
  for (const cs of manifest.content_scripts) {
    for (const js of cs.js) assert.ok(exists(path.join('plugin', js)), `缺文件: ${js}`)
  }
  assert.ok(exists(path.join('plugin', manifest.action.default_popup)))
})

test('popup.html 加载了共用实现', () => {
  const html = read(path.join('plugin', 'popup.html'))
  assert.match(html, /<script src="lib\/segmenter\.js"><\/script>/, 'popup.html 没有引入 lib/segmenter.js')
})

test('legacy 存在（案例 03 要引用它）', () => {
  assert.ok(exists(path.join('legacy', 'server.js')))
  assert.ok(exists(path.join('legacy', 'README.md')))
})

test('README 提到的关键文件都存在', () => {
  for (const p of [
    'plugin/lib/segmenter.js',
    'tools/check-kinsoku.js',
    'api/server.js',
    'api/ai-service.js',
    'fixtures/before.txt',
    'fixtures/after.txt',
    'cases/README.md',
    'LICENSE',
    'NOTICE.md'
  ]) {
    assert.ok(exists(p), `README 提到的文件不存在: ${p}`)
  }
})
