'use strict'

// 断行 API。ここは HTTP の皮だけで、判断は lib/segmenter.js と ai-service.js が持つ。
//
// 元の実装から落としたもの（理由つき）：
//   /api/v1/auth/login   … パスワード 'demo' を決め打ちで受けるだけ。認証ではない。
//   /api/v1/tenant/*     … メモリ上の Map。再起動で消える。
//   /api/v1/usage        … requestsThisMonth を Math.random() で作っていた。
//                          数字が本物でない管理画面は、無いより悪い。
//   admin/               … 上記を表示するための 6 行の HTML。
// 残すと「SaaS のバックエンドがある」ように見えるので、落とした。

const express = require('express')
const cors = require('cors')
const { segmentForLanguage, segmentJapanese } = require('../plugin/lib/segmenter.js')
const { analyzeWithAI, isAIConfigured } = require('./ai-service.js')

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

const MAX_TEXT = 100000
const MAX_BATCH = 100
const MAX_AI_TEXT = 5000

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), ai: isAIConfigured() })
})
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), ai: isAIConfigured() })
})

function validateText(text) {
  if (typeof text !== 'string' || text.length === 0) return 'text is required and must be a non-empty string'
  if (text.length > MAX_TEXT) return `text too long, max ${MAX_TEXT} characters`
  return null
}

app.post('/api/v1/segment', (req, res) => {
  const { text, language = 'ja', options = {} } = req.body || {}
  const bad = validateText(text)
  if (bad) return res.status(400).json({ success: false, error: bad })

  try {
    const result = segmentForLanguage(text, language, options)
    res.json({ success: true, data: result })
  } catch (err) {
    // 例外を握りつぶして 200 を返さない。落ちたなら落ちたと言う。
    console.error('segmentation error:', err)
    res.status(500).json({ success: false, error: 'segmentation failed', message: err.message })
  }
})

app.post('/api/v1/batch-segment', (req, res) => {
  const { texts, language = 'ja', options = {} } = req.body || {}
  if (!Array.isArray(texts)) {
    return res.status(400).json({ success: false, error: 'texts must be an array' })
  }
  if (texts.length > MAX_BATCH) {
    return res.status(400).json({ success: false, error: `too many texts, max ${MAX_BATCH}` })
  }

  const results = texts.map((text, index) => {
    const bad = validateText(text)
    if (bad) return { index, success: false, error: bad }
    try {
      return { index, success: true, result: segmentForLanguage(text, language, options) }
    } catch (err) {
      return { index, success: false, error: err.message }
    }
  })

  // 全件落ちたのに success: true を返すと、呼び出し側は「空の結果」と
  // 「全件エラー」を区別できない。
  const okCount = results.filter((r) => r.success).length
  res.json({ success: okCount > 0, okCount, failCount: results.length - okCount, results })
})

app.get('/api/v1/ai/status', (_req, res) => {
  res.json({ success: true, data: { configured: isAIConfigured(), provider: 'Google Gemini' } })
})

app.post('/api/v1/ai/analyze', async (req, res) => {
  const { text, context } = req.body || {}
  if (typeof text !== 'string' || text.length === 0) {
    return res.status(400).json({ success: false, error: 'text is required' })
  }
  if (text.length > MAX_AI_TEXT) {
    return res.status(400).json({ success: false, error: `text too long, max ${MAX_AI_TEXT} characters` })
  }
  if (!isAIConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'AI feature not configured',
      message: 'Set GOOGLE_API_KEY in .env (see .env.example)'
    })
  }

  try {
    const result = await analyzeWithAI(text, context)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('AI analysis error:', err)
    res.status(502).json({ success: false, error: 'AI analysis failed', message: err.message })
  }
})

// 決定論的な断行だけを返す入口。AI を使わないので key 無しで動く。
app.post('/api/v1/ai/dry-run', (req, res) => {
  const { text, options = {} } = req.body || {}
  const bad = validateText(text)
  if (bad) return res.status(400).json({ success: false, error: bad })
  res.json({ success: true, data: segmentJapanese(text, options) })
})

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`jp-linebreak API listening on http://localhost:${PORT}`)
    console.log(`  health : GET  /health`)
    console.log(`  segment: POST /api/v1/segment`)
    console.log(`  AI     : ${isAIConfigured() ? 'configured' : 'not configured (set GOOGLE_API_KEY)'}`)
  })
}

module.exports = app
