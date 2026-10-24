# NOTICE

## 著作权

本仓库全部代码、测试、文档与案例文本的著作权归 **yt**（GitHub: [@newye123](https://github.com/newye123)）所有。

- 首次公开发布：2026-10-24
- 许可：**NC-1.0**（非商业使用许可 1.0），全文见 [`LICENSE`](LICENSE)
- 本仓库是**源码公开（source-available）**，不是 OSI 开源

## 引用格式

学术引用、文章转载、二次开发请使用：

```
yt (@newye123). jp-linebreak: 日文断行与禁则处理（含可失败的检查器）.
2026. https://github.com/newye123/jp-linebreak
```

## 许可范围之外的内容

### 1. 禁则规则集

`行頭禁則` / `行末禁則` 的字符集来自日文组版的公开规范（JIS X 4051 及通行排版实践）。这些是**事实性规则**，不属于本仓库的著作权范围，任何人都可以按这些规则实现自己的排版程序。

本许可约束的是本仓库的代码、测试、文档与案例文本。

### 2. 第三方服务与库

| 内容 | 归属 | 说明 |
|---|---|---|
| Google Gemini API | Google LLC | `api/ai-service.js` 调用。使用需自备 API key，受 Google 的服务条款约束。仓库内不含任何 key。 |
| Express / cors / dotenv | 各自作者 | `api/package.json` 声明的运行时依赖，MIT 许可 |
| Chrome / Edge / Firefox 扩展 API | 各浏览器厂商 | `plugin/manifest.json` 使用 Manifest V3 |
| openai / @google/generative-ai / body-parser | 各自作者 | **仅 `legacy/` 使用**，不在主路径上 |

### 3. 素材

- `fixtures/before.txt` 与 `fixtures/after.txt` 里的日文句子是本项目自写的测试语料，不含任何第三方文本。
- 仓库内**没有**任何教材原文、客户译文、真实文案或用户数据。

## 前身与脱敏范围

本仓库由内部项目 `J-Agent 日文排版换行` 整理而来。公开前的处理：

| 处理 | 具体做了什么 |
|---|---|
| 移除密钥 | 原项目的 `.env`（含真实 `GOOGLE_API_KEY`）未复制；仓库内只剩 `.env.example` 里的占位符 `your-google-api-key-here`。已用 `AIza` / `sk-` / `ghp_` / 私钥头四类模式全量扫描，零命中。 |
| 移除构建产物 | `node_modules/`、`.vercel/` 未复制 |
| 移除业务代码 | `admin/`（6 行占位页）、`/api/v1/auth`、`/api/v1/tenant/*`、`/api/v1/usage`（用量是 `Math.random()` 生成的假数字）已删除 |
| 隔离旧版本 | 第一代演示（AI 排版 + 翻译）移入 `legacy/`，不接入 CI |
| 重写核心 | 断行实现重写为带禁则处理的单文件版本，理由见 `cases/01` 与 `cases/02` |

## 关于「没有做的事」

- **没有做过用户研究，也没有对照实验。** 「行頭禁則违反从 4 处降到 0 处」是同一批测试语料上新旧实现的对跑结果，不是排版质量评测。
- **没有和商业组版引擎对比过。** 不与 InDesign 的「日本語組版」、JLReq 参考实现、或任何商业排版软件做过逐行对照。
- **没有形态素解析。** 助词判定是字符串匹配，精度有上限，见 `LICENSE` 第五节与 `README.md`「它做不到什么」。

任何把这些产出当作「排版质量已被验证」来引用的做法，都不符合本声明的原意。
