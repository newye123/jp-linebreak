'use strict'

// Gemini に「この断行を直せ」と聞く層。
//
// この層の仕事は「AI に聞くこと」だけで、断行の最終決定権は無い。
// 決定権を AI に渡すと、同じ入力で毎回違う行数が出て、
// 禁則を守るかどうかも運になる。決定的な部分は lib/segmenter.js が持つ。
//
// 元の実装には 2 つのはっきりした嘘があった。どちらも
// 「AI が答えられなかった」を「AI がこう答えた」にすり替えていた：
//
//   1) confidence: result.confidence || 0.8
//      モデルが confidence を返さなかったら 0.8 を捏造していた。
//      插件界面那根置信度条画的就是这个常量。
//   2) parseAIResponse が improvedText: originalText を返していた
//      JSON として読めなかったとき、「改善後のテキスト」欄に原文をそのまま入れていた。
//      利用者から見ると「AI が直した」と「AI が何も変えなかった」の区別がつかない。
//
// いまは両方とも「無い」を「無い」として返す。UI 側は null を扱う。

const dotenv = require('dotenv')
dotenv.config()

const MODEL = 'gemini-2.0-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const SYSTEM_PROMPT = `你是一个日文排版专家。你的任务是帮助用户优化日文的断行和排版。

请遵循以下规则：
1. 优化断行位置，避免孤行（widow/orphan）
2. 考虑日文排版习惯，在适当位置断行
3. 不要改变原文的语义
4. 标点符号应该放在行末，而不是行首（行頭禁則）
5. 括号、引号内的内容应尽量不分断

请返回 JSON 格式的分析结果。`

function apiKey() {
  const k = process.env.GOOGLE_API_KEY
  if (!k || k === 'your-google-api-key-here') return null
  return k
}

function isAIConfigured() {
  return apiKey() !== null
}

// モデルの返答（パース済み or 生テキスト）を、UI が信用できる形に正規化する。
// 「分からない」は null。既定値で埋めない。
function normalizeAIResult(parsed, originalText) {
  const hasConfidence = parsed && typeof parsed.confidence === 'number' && isFinite(parsed.confidence)
  const improved =
    parsed && typeof parsed.improvedText === 'string' && parsed.improvedText.length > 0
      ? parsed.improvedText
      : null
  return {
    // 改善後テキストが原文と一字一句同じなら「改善していない」として null にする。
    // 「変わっていない」を「改善後」として出すのが、いちばん人を騙す形。
    improvedText: improved !== null && improved !== originalText ? improved : null,
    suggestions: Array.isArray(parsed && parsed.suggestions) ? parsed.suggestions : [],
    reasons: Array.isArray(parsed && parsed.reasons) ? parsed.reasons : [],
    confidence: hasConfidence ? Math.max(0, Math.min(1, parsed.confidence)) : null,
    // どこから来た結果かを必ず持たせる。UI が「AI の判断」と「読めなかった残骸」を
    // 区別できないまま表示するのを防ぐ。
    source: 'model'
  }
}

// JSON として読めなかったときの残骸。提案として出すが、改善後テキストは出さない。
function salvageResult(content, originalText) {
  const lines = String(content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return {
    improvedText: null,
    suggestions: lines.slice(0, 5),
    reasons: [],
    confidence: null,
    source: 'unparsed'
  }
}

function buildPrompt(text, context) {
  return `请分析并优化以下日文文本的断行：

原文：
${text}

${context ? `上下文：${context}` : ''}

请提供：
1. 改进后的断行文本（improvedText）
2. 具体的改进建议（suggestions，字符串数组）
3. 每条建议的理由（reasons，字符串数组）
4. 整体置信度（confidence，0-1 的数字）

只返回 JSON，不要有其他内容。`
}

async function analyzeWithAI(text, context) {
  const key = apiKey()
  if (!key) throw new Error('AI API key not configured')

  const response = await fetch(`${ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + buildPrompt(text, context) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
    })
  })

  if (!response.ok) {
    let message = `AI API error (HTTP ${response.status})`
    try {
      const err = await response.json()
      if (err && err.error && err.error.message) message = err.error.message
    } catch (_) {
      /* レスポンスが JSON でないなら、ステータスだけ持っていく */
    }
    throw new Error(message)
  }

  const data = await response.json()
  const content =
    (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) || ''

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return normalizeAIResult(JSON.parse(jsonMatch[0]), text)
    } catch (_) {
      return salvageResult(content, text)
    }
  }
  return salvageResult(content, text)
}

module.exports = {
  analyzeWithAI,
  isAIConfigured,
  normalizeAIResult,
  salvageResult,
  buildPrompt,
  SYSTEM_PROMPT
}
