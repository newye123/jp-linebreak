# jp-linebreak

日文断行 + 禁则（行頭禁則／行末禁則）处理，附一个**真的会红**的检查器。

[![license: NC-1.0](https://img.shields.io/badge/license-NC--1.0-blue)](LICENSE)
[![tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)](#验证)
[![deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](plugin/lib/segmenter.js)

一句话：**把「字数硬切」换成按日文组版规则断行，并且让违规变成一条会失败的断言，而不是一段打印。**

---

## 30 秒验证

不用装任何东西（核心零依赖，Node ≥ 20）：

```bash
git clone https://github.com/newye123/jp-linebreak && cd jp-linebreak

# 1. 拿旧实现的输出跑检查器 —— 它会红
node tools/check-kinsoku.js fixtures/before.txt
#    fixtures/before.txt: 13 行，6 违反      → 退出码 1

# 2. 拿新实现的输出跑同一个检查器 —— 它绿
node tools/check-kinsoku.js fixtures/after.txt
#    fixtures/after.txt: 11 行，0 违反       → 退出码 0

# 3. 跑测试
npm test        # 56 passing
```

`fixtures/before.txt` 是旧实现的原始输出，一字未改。差别就在这里：

```
旧：今日はいい天気です / ね。散歩に行きませんか？        ← 「ね。」孤零零一行
新：今日はいい天気ですね。 / 散歩に行きませんか？        ← 在句点断

旧：これは（テスト）です / 。特に問題は（ありません）。   ← 行首是句号
新：これは（テスト）です。 / 特に問題は（ありません）。   ← 句号归上一行

旧：誠にありがとうございます / 。今後もより / … / 。     ← 两行只有一个句号
新：誠にありがとうございます。 / 今後もより良いサービス提供に / 努めてまいります。
```

---

## 三个案例（都是真实故障，都能复现）

| # | 症状 | 一句话 |
|---|---|---|
| [01](cases/01-four-cases-zero-assertions.md) | 有测试文件，跑起来全绿，排版是错的 | 四条用例，零条断言。退出码只证明脚本没崩，不证明排版对 |
| [02](cases/02-one-button-three-implementations.md) | 同一个按钮，有时结果不一样，用户没发现 | 三条代码路径各自决定怎么切，降级路径静默生效 |
| [03](cases/03-fabricated-confidence.md) | 界面显示了一个数字，没人知道它哪来的 | `confidence \|\| 0.8` —— 缺失被填成了常量 |

三个都不是崩溃。三个都是退出码 `0`、HTTP `200`、界面正常。

---

## 用法

### 命令行：检查任意排好版的日文

```bash
node tools/check-kinsoku.js 排版结果.txt
node tools/check-kinsoku.js --text "一行目。\n二行目。"
node tools/check-kinsoku.js 排版结果.txt --json
```

退出码三值：

| 码 | 含义 |
|---|---|
| `0` | 查过了，零违反 |
| `1` | 查过了，有违反 |
| `2` | **没查成** —— 路径错、文件空、一行有效内容都没有 |

第三档是这个工具的立场：如果「没读到东西」也返回 `0`，那么路径打错、文件为空、编码读错，全部会被读成「干净」。**一个永远返回 0 的检查器比没有检查器更糟，因为它会让人停止检查。**

### 代码里：当模块用

```js
const { segmentJapanese, segmentForLanguage, findViolations } = require('./plugin/lib/segmenter.js')

segmentJapanese('今日はいい天気ですね。散歩に行きませんか？', { maxLineLength: 15 })
// → { lines: ['今日はいい天気ですね。', '散歩に行きませんか？'],
//     metadata: { originalLength: 21, lineCount: 2, language: 'ja' } }

segmentForLanguage(text, 'en', { maxLineLength: 40 })   // 空白区切りの言語は語中で切らない
findViolations(已经排好的文本)                            // → [{ type, line, char, text }, ...]
```

选项（**都没有隐藏默认值陷阱**，见 `DEFAULT_OPTIONS`）：

| 选项 | 默认 | 说明 |
|---|---|---|
| `maxLineLength` | `20` | 目标行宽。禁则调整（追い込み／追い出し）时允许超出 |
| `allowWidow` | `false` | `false` 时避免最后一行只剩 1 字 |
| `preferAfterParticle` | `true` | 优先在助词后断。**没有形态素解析，是字符串匹配**，见下 |
| `maxAdjust` | `3` | 追い込み／追い出し最多挪几个字 |

### HTTP API

```bash
cd api && npm install && cd ..
PORT=3000 node api/server.js
```

```bash
curl -s localhost:3000/health
curl -s -X POST localhost:3000/api/v1/segment \
  -H 'Content-Type: application/json' \
  -d '{"text":"今日はいい天気ですね。散歩に行きませんか？","language":"ja","options":{"maxLineLength":15}}'
```

| 端点 | 说明 |
|---|---|
| `GET /health` | 存活 + AI 是否已配置 |
| `POST /api/v1/segment` | 单条断行 |
| `POST /api/v1/batch-segment` | 批量（≤100 条），返回 `okCount` / `failCount` |
| `GET /api/v1/ai/status` | AI 是否配置 |
| `POST /api/v1/ai/analyze` | 让 Gemini 提建议（**不改变断行结果**，见下） |

AI 部分需要自备 key：

```bash
cp .env.example .env    # 填入 GOOGLE_API_KEY
```

没配 key 时 `/api/v1/ai/analyze` 返回 **`503`**，不会返回假数据。断行本身完全不需要 key。

### 浏览器扩展

`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `plugin/` 目录。

插件只做一件事：把文本发给本地 API，把行显示出来。API 连不上时**用同一份实现**在本地算（见案例 02），并明确告诉你「API に繋がらないためローカル処理しました」。

---

## 断行是怎么做的

### 1. 禁则（这是硬规则，不是偏好）

- **行頭禁則**：`。、，．！？：；・…‥ー`、闭括号 `）〕］｝〉》」』】`、小写假名 `ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々` 等不能出现在行首。
- **行末禁則**：`（〔［｛〈《「『【` 等开括号不能出现在行尾。

处理方式用标准的两招：

- **追い込み**：断点后面跟着行頭禁則字符 → 把断点往后挪，把它挤进上一行（行宽允许超出 `maxAdjust`）。
- **追い出し**：断点前面是行末禁則字符 → 把断点往前挪，把开括号送到下一行；挪完再检查一次行首。

### 2. 断点优先级

从行宽上限往回找，越靠前的优先级越高：

1. **句点・感叹号・问号之后**（不设距离下限 —— 読点是作者给的「这里可以断」的明确信号）
2. **読点之后**（同上）
3. **助词之后**（`の に は が と を で へ も や から まで より など`）
4. **空白之后**
5. **行宽上限处硬切**

第 1、2 条不设距离下限是踩过坑的：设了下限（行宽 50%）之后，`この度は、` 的読点会被丢掉，然后在 20 字之外把 `いただ／き` 从词中间劈开。**読点是强信号，不能和助词、空格放在同一个距离标尺上比。**

### 3. 语言分流只有一个入口

```js
segmentForLanguage(text, language, options)
```

- `ja` → 禁则断行器 + 助词优先
- `zh` / `ko` → 同一张禁则表（`。」！？` 共通），关掉日语助词判定
- 其它 → 按空格折行，**不切词**（超长单词整行放，不劈开）

分流只有这一处。以前服务端 `if (language === 'ja')` 和插件的 `fallbackSegment` 各判一次，于是同一段文本在在线/离线两种状态下排出两种结果（案例 02）。

---

## 它做不到什么

这一节比上面所有内容都重要。

1. **没有形态素解析。** 助词判定是字符串匹配，所以 `はな` 的 `は`、`かみ` 的 `が` 都会被当成助词。要消掉这个误差必须引入词典，那会破坏「零依赖」这个前提。取舍是明确的：**宁可偶尔在怪地方断，也不要为了准确率引入 30MB 词典。**
2. **不能保证不在词内断开。** 没有词典就没有词边界。`今後もより良いサービス提供に努めてまいります` 这类没有読点也没有合适助词的长句，最后会在行宽处硬切。这是已知限制，`cases/01` 里有实例。
3. **只做横排断行。** 竖排（縦組み）、ルビ、禁則の「ぶら下げ」排版、`――` 和 `……` 的分離禁止，都没做。
4. **禁则表是实用子集。** JIS X 4051 的完整字符集比这里大；这里收的是实际排版里最常撞到的那些。要更严，改 `KINSOKU_HEAD` / `KINSOKU_TAIL` 两个 `Set` 即可 —— 测试会告诉你改坏了什么。
5. **没有和商业组版引擎对比过。** 没和 InDesign 的「日本語組版」、JLReq 参考实现或任何商业排版软件做过逐行对照。它比字数硬切好，仅此而已。
6. **AI 不参与断行决定。** `/api/v1/ai/analyze` 只是把文本发给 Gemini 拿建议，**返回的建议不改变 `segment()` 的输出**。让 LLM 决定断点会导致同样的输入每次排出不同行数，禁则守不守也变成运气。决定论的部分留给代码。
7. **`plugin/content.js` 和 `plugin/background.js` 是 2 行占位。** 插件不做页面注入、不改网页排版，只在弹窗里处理你粘进去的文本。manifest 里声明了 `content_scripts` 和 `service_worker`，但那两个文件只有一句 `console.log` —— 这是原型的残留，不是功能。
8. **`legacy/` 能跑但别用。** 第一代 AI 排版演示，依赖未在旧 package.json 里声明，失败时返回 `200` + 模拟数据。留着只为让案例 03 的引用可核对。

---

## 仓库结构

```
jp-linebreak/
├── plugin/
│   ├── lib/segmenter.js      ← 唯一的断行实现（零依赖，UMD）
│   ├── popup.html / popup.js ← 扩展弹窗
│   └── manifest.json         ← MV3
├── tools/check-kinsoku.js    ← CLI 检查器（三值退出码）
├── api/
│   ├── server.js             ← HTTP 皮
│   └── ai-service.js         ← Gemini 层（只提建议，不决定断行）
├── tests/                    ← 56 条断言
│   ├── segmenter.test.js     ← golden / property / regression
│   ├── ai-service.test.js    ← 「不盛数据」的断言
│   └── repo.test.js          ← 仓库自检（案例结构、断言密度、密钥扫描）
├── cases/                    ← 三个案例
├── fixtures/                 ← 旧输出 / 新输出（可对跑）
└── legacy/                   ← 第一代演示，隔离，不接 CI
```

**为什么断行实现住在 `plugin/lib/` 而不是根目录 `lib/`：** 浏览器扩展只能加载自己目录下的文件（`manifest.json` 的根就是 `plugin/`），所以共用实现必须落在 `plugin/` 里面，服务端反过来 `require('../plugin/lib/segmenter.js')`。

这个布局不好看。另一个选项是「根目录放一份、插件里放一份、用 CI 比对 sha256 保证一致」—— 那只是把「两份」变成「两份但假装是一份」，改起来照样会漏。

---

## 验证

```bash
npm test          # 56 条
npm run check     # 检查 fixtures/after.txt，应为 0 违反 / 退出码 0
```

测试分四层，各抓不同的东西：

| 层 | 抓什么 | 数量 |
|---|---|---|
| golden | 规则表被悄悄改动 | 4 |
| property | 任意输入都该成立的不变量（禁则零违反、不丢字、行宽上限、无 1 字行） | 8 |
| regression | 旧的坏输出不再出现 | 3 |
| CLI / 适用域 / 分流 | 三值退出码、单字文本不误报、ja/zh/en 分流 | 20+ |
| 仓库自检 | 案例结构、断言密度、密钥扫描、清单一致性 | 17 |

CI 跑 ubuntu × windows × Node 20/22，并带两次负控（故意注入破坏，看测试红不红，还原后校验 sha256 一致）。

---

## 许可

**NC-1.0（非商业使用许可 1.0）** —— 详见 [`LICENSE`](LICENSE)，著作权与第三方归属见 [`NOTICE.md`](NOTICE.md)。

- 个人学习、研究、教学、非商业项目：可以，保留署名即可
- 商业使用（含付费产品、SaaS、企业内部营利流程、技能市场付费上架、训练商业模型）：**禁止**，需事先书面授权
- 本作品是**源码公开（source-available）**，不是 OSI 开源

**关于禁则规则本身：** `行頭禁則` / `行末禁則` 的字符集来自日文组版的公开规范（JIS X 4051 及通行实践），是事实性规则，不因本许可而被垄断。你可以自由地按这些规则实现自己的排版程序 —— 本许可约束的是本仓库的代码、测试与文档。

**关于前身：** 本仓库由未公开项目 `J-Agent 日文排版换行` 整理而来，那个项目的 README 里写的是 `MIT License`。本仓库首次公开发布即为 NC-1.0，没有以更宽松的许可公开发布过。若此前有人从非公开渠道取得过 MIT 副本，其副本仍适用当时的 MIT —— 本许可不追溯。
