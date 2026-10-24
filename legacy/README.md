# legacy/ —— 第一代演示，保留但不推荐

这里是最初的版本：一个「AI 帮你排版日文并翻译成中文」的演示，`server.js` + `api.js` + `demo.html`。

## 为什么留着

`cases/03-fabricated-confidence.md` 引用了 `server.js` 里的这段：

```js
} catch (error) {
  console.error('AI Processing Error:', error);
  // 出错时也返回模拟数据，保证前端不崩
  res.json(mockAIResponse(text, mode));
}
```

把文件删掉，案例就只剩一段引用；留着，任何人都能打开确认它真的这么写。**能核对的东西才叫证据。**

## 为什么移到 legacy/

它和第二代（`api/server.js` + `plugin/`）不是同一个产品：

| | 第一代 | 第二代 |
|---|---|---|
| 做什么 | 让 AI 重排整段文本并翻译 | 按日文组版规则断行 |
| 端口 | 硬编码 `3000` | `process.env.PORT`，默认 3000 |
| 输出 | HTML 字符串 | 行数组 |
| 失败时 | `200` + 模拟数据 | `502` / `503` + 错误 |
| 依赖 | `openai`、`@google/generative-ai`、`body-parser`（**原仓库的 package.json 里没有声明，`node server.js` 直接 MODULE_NOT_FOUND**） | `express`、`cors`、`dotenv` |

两边都监听 3000，一起起必然冲突。

## 怎么跑（如果你真的想跑）

```bash
cd legacy
npm install
node server.js     # 需要 3000 端口空着
```

没有配置 `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY` 时，它会走 `mockAIResponse()`，返回 `[本地模拟] ...` 并且状态码是 `200`。这不是 bug report，这就是案例 03 描述的行为本身。

## 不要做的事

- 不要把 `legacy/` 接进 CI。它依赖外部 API，且行为已知有问题。
- 不要把它当成「旧版 API 兼容层」。接口路径（`/api/format`）和第二代（`/api/v1/segment`）完全不同。
- 不要把它部署出去。
