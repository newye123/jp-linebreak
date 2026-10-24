// server.js - J-Agent Backend (DeepSeek & Gemini Support)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// API Configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Initialize Clients
let openaiClient = null;
let geminiClient = null;

if (DEEPSEEK_API_KEY) {
  openaiClient = new OpenAI({
    baseURL: 'https://api.deepseek.com', // DeepSeek API Base URL
    apiKey: DEEPSEEK_API_KEY
  });
}

if (GOOGLE_API_KEY) {
  geminiClient = new GoogleGenerativeAI(GOOGLE_API_KEY);
}

/**
 * 构造 System Prompt
 */
function getSystemPrompt(mode) {
  const basePrompt = `你是一位专业的日文排版设计总监。
  任务：
  1. 优化用户提供的日文文本排版。
  2. 翻译该文本为中文。
  
  输出要求：
  必须返回严格的 JSON 格式，包含以下字段：
  - "formattedText": 优化后的 HTML 字符串（使用 <br> 换行，适当添加 class，如 text-3xl, font-bold 等）。
  - "explanation": 字符串数组，3-4 条排版决策说明。
  - "translation": 字符串，日文原文的中文翻译。
  
  注意：不要输出 Markdown 代码块，直接输出 JSON 字符串。`;

  switch (mode) {
    case 'impact':
      return `${basePrompt}
      当前模式：【视觉冲击模式】
      - 策略：提炼核心关键词作 <h2> 标题，正文倒金字塔结构，语气强烈。`;
    case 'social':
      return `${basePrompt}
      当前模式：【社媒清新模式】
      - 策略：增加空行呼吸感，句尾添加 Emoji ✨🌸，长句拆短。`;
    case 'business':
      return `${basePrompt}
      当前模式：【商务严谨模式】
      - 策略：标准段落，敬语规范，标点正确。`;
    case 'magic':
      return `${basePrompt}
      当前模式：【魔法竖排模式】
      - 策略：保持段落缩进，适合竖排阅读的节奏。`;
    default:
      return basePrompt;
  }
}

// 模拟 AI 响应 (当没有 Key 时使用)
function mockAIResponse(text, mode) {
  let formattedText = text;
  let explanation = ['[本地模拟] 已完成基础排版'];
  let translation = '[本地模拟] 这是示例文本的中文翻译。请在 .env 文件中配置 API Key 以启用真实翻译。';

  if (mode === 'impact') {
    formattedText = `<h2 class="text-3xl font-bold">${text.substring(0, 10)}...</h2><p class="mt-4">${text}</p>`;
  } else if (mode === 'social') {
    formattedText = text.replace(/。/g, '。✨<br><br>');
  }

  return { formattedText, explanation, translation };
}

// API Route
app.post('/api/format', async (req, res) => {
  const { text, mode } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    let result = null;

    // 优先使用 DeepSeek (OpenAI 兼容接口)
    if (openaiClient) {
      console.log('Using DeepSeek API...');
      const completion = await openaiClient.chat.completions.create({
        messages: [
          { role: "system", content: getSystemPrompt(mode) },
          { role: "user", content: text }
        ],
        model: "deepseek-chat", // 或 deepseek-coder
        response_format: { type: "json_object" }
      });
      result = JSON.parse(completion.choices[0].message.content);
    } 
    // 其次使用 Gemini
    else if (geminiClient) {
      console.log('Using Gemini API...');
      const model = geminiClient.getGenerativeModel({ model: "gemini-pro" });
      const prompt = `${getSystemPrompt(mode)}\n\n用户文本：\n${text}`;
      const resultGen = await model.generateContent(prompt);
      const response = await resultGen.response;
      const textResponse = response.text();
      // 清理可能的 Markdown 标记
      const jsonStr = textResponse.replace(/```json|```/g, '').trim();
      result = JSON.parse(jsonStr);
    } 
    // 降级到本地模拟
    else {
      console.log('No API Key found, using mock response...');
      result = mockAIResponse(text, mode);
    }

    res.json(result);

  } catch (error) {
    console.error('AI Processing Error:', error);
    // 出错时也返回模拟数据，保证前端不崩
    res.json(mockAIResponse(text, mode));
  }
});

app.listen(PORT, () => {
  console.log(`J-Agent Backend running at http://localhost:${PORT}`);
  console.log(`- DeepSeek: ${DEEPSEEK_API_KEY ? 'Configured' : 'Not Configured'}`);
  console.log(`- Gemini: ${GOOGLE_API_KEY ? 'Configured' : 'Not Configured'}`);
});
