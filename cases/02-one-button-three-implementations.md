# 案例 02：同一个按钮，三条代码路径

## 症状

插件里只有一个按钮：「⚡ 快速断行」。点下去之后：

- API 在线 → `POST /api/v1/segment` → 服务端 `segmenter.segment()` → 按句点、读点、助词断行
- API 挂了 → `catch` 里调 `this.fallbackSegment()` → `text.slice(i, i + maxLineLength)`，纯字数硬切

用户看到的是同一个界面、同一个按钮、同一段文本。**输出是两种东西**，而且只有一条 2 秒后消失的 toast 说明区别。

同一个按钮还藏着第三条路径：服务端的 `/api/v1/segment` 里 `if (language === 'ja')` 走禁则断行器，`else` 走 `simpleSegment()` —— 又一个纯字数硬切。插件把 `language` 传上去，所以中文、英文、韩文走的是第三条。

三条路径，两个实现，零个地方统一。

## 取证

同一段日文，`maxLineLength = 10`，两条路径的实际输出：

```console
服务端 segmenter（禁则断行器）:
  1: 今日はいい天気です
  2: ね。
  3: 散歩に行き
  4: ませんか？
插件 fallbackSegment（字数硬切）:
  1: 今日はいい天気ですね
  2: 。散歩に行きませんか
  3: ？

结果相同吗: false
```

两边都错，错得不一样：左边把「ね。」切成孤零零一行、把「行きません」从中间劈开；右边第二行以「。」开头，第三行只有「？」一个字。

中文也一样。`fallbackSegment` 完全不看 `language`，中文照样按字数硬切：

```console
$ max=14，slice 硬切
["这是一个很长的中文句子，用来", "测试断行是否会在句号前面断开", "。"]
                                          ↑ 最后一行只有一个句号
```

## 根因

**「降级」这个词让人放松了。** 写 fallback 的时候脑子里想的是「网络不好时先凑合一下」，所以它天然不被当成产品的一部分 —— 不被 review、不被测试、不被对比。但用户不会知道自己在看降级结果，他只知道按钮点了，出来了字。

具体三处：

1. **切法在三个地方各自决定。** 服务端的 `if/else`、插件的 `fallbackSegment`、根目录 `server.js` 的 `mockAIResponse`，每处都自己判断「这段文本该怎么切」。
2. **降级是静默的。** `catch` 里没有 `throw`，只有 `showToast('使用本地处理')`。toast 消失之后，界面上没有任何标记说明这份结果是本地凑合的。
3. **两份实现的默认值不同。** 服务端 `maxLineLength` 缺省 20，`simpleSegment` 缺省 22，插件从下拉框读，缺省也是 20。同一个字段三个默认值，谁都不知道。

## 修法

### 1. 唯一实现

`plugin/lib/segmenter.js` 是仓库里唯一的断行实现，零依赖，UMD（node 的 `require`、`popup.html` 的 `<script>`、service worker 都能加载）。

它住在 `plugin/` 里面而不是根目录的 `lib/`，原因是硬约束：浏览器扩展只能加载自己目录下的文件，`manifest.json` 的根就是 `plugin/`。所以服务端反过来 `require('../plugin/lib/segmenter.js')`。

这个目录布局不好看。但另一个选项是「根目录放一份、插件里放一份、用 CI 比对 sha256 保证一致」—— 那只是把「两份」变成「两份但假装是一份」，改起来照样会漏。

### 2. 分流只有一个入口

```js
// plugin/lib/segmenter.js
function segmentForLanguage(text, language, options) {
  if (lang === 'ja' || lang === 'jp' || lang === 'japanese') return segment(text, options)
  if (CJK_LANGS.indexOf(lang) !== -1) { /* 同一张禁则表，关掉日语助词判定 */ }
  return wrapWords(text, o.maxLineLength)   // 空白区切的语言，不切词
}
```

服务端和插件都只调它。插件那边现在是：

```js
fallbackSegment(text, maxLineLength) {
  const result = window.JPSegmenter.segmentForLanguage(text, this.languageSelect.value, {
    maxLineLength
  })
  ...
  this.showToast('API に繋がらないためローカル処理しました')
}
```

### 3. 降级要说出来

toast 文案从「使用本地处理」改成「API に繋がらないためローカル処理しました」—— 说清**为什么**。但 toast 终究会消失，所以更彻底的做法是不降级：既然本地和远程跑的是同一份代码，API 不可用时不应该有「另一种结果」，只有「同一种结果」和「明确失败」。

这一条没做完：当前仍然保留 fallback（离线可用是真实需求），只是把两份结果对齐了。**残留风险写在这里，不藏**：如果哪天有人在 `segmentForLanguage` 里加了只有服务端才有的逻辑（比如读词典文件），两条路径会再次分叉，而测试不会红 —— 因为测试只跑 `segmentForLanguage` 本身。

## 结论

**降级路径如果和主路径结论不同，它就不是降级，是另一个产品。**

而且是最不容易被发现的那个产品 —— 因为它只在出故障时上线，出故障时没人有空比对排版。

检查方法很土：把主路径关掉，用同一批输入跑一遍，逐行 diff。这一条应该写进任何带 fallback 的项目的验收清单。在这个仓库里，它变成了 `tests/segmenter.test.js` 里的分流测试（ja / zh / en / 未知语言四条），以及「唯一实现」这个结构性约束。
