# 案例 03：没有置信度，就编一个 0.8

## 症状

插件界面上有一根置信度条。点了「AI 分析建议」之后，它显示 `80%`。

那根条画的不是模型的自信，是一个常量。

```js
// api/dist/ai-service.js（旧）
const result = JSON.parse(jsonMatch[0])
return {
  suggestions: result.suggestions || [],
  improvedText: result.improvedText || text,
  reasons: result.reasons || [],
  confidence: result.confidence || 0.8     // ← 模型没给，这里替它给
}
```

同一个函数里还有第二处，更隐蔽：

```js
function parseAIResponse(content, originalText) {
  const lines = content.split('\n').filter(line => line.trim())
  return {
    suggestions: lines.slice(0, 5),
    improvedText: originalText,   // ← 「改善后的文本」= 原文
    reasons: lines.slice(0, 3),
    confidence: 0.7               // ← 又一个常量
  }
}
```

这是 JSON 解析失败时的兜底。兜底的意思是「模型返回的东西读不出来」，但它给出来的结果是：`improvedText` 等于原文、`confidence` 等于 0.7。

界面拿到这个对象，渲染成「改进后的文本：<原文>」「置信度：70%」。

**用户看到的每一处都是错的**：没有改进（那是原文）、没有置信度（那是常量）、没有失败提示（HTTP 200）。

## 取证

```console
$ node -e 'const {normalizeAIResult}=require("./api/ai-service");
  console.log(JSON.stringify(normalizeAIResult({improvedText:"改过的文本"},{})))'
{"improvedText":"改过的文本","suggestions":[],"reasons":[],"confidence":null,"source":"model"}
```

新实现：模型没给 `confidence`，就是 `null`。没有第二个可能。

`tests/ai-service.test.js` 里钉住这一点的断言：

```js
test('confidence が無いときは null（0.8 を捏造しない）', () => {
  const r = normalizeAIResult({ improvedText: '別のテキスト', suggestions: [] }, ORIGINAL)
  assert.equal(r.confidence, null)
})

test('improvedText が原文と同一なら null（改善していない）', () => {
  const r = normalizeAIResult({ improvedText: ORIGINAL, confidence: 0.9 }, ORIGINAL)
  assert.equal(r.improvedText, null, '原文を「改善後」として返してはいけない')
})
```

第二条比第一条重要。**「原文を改善後として返す」は、データが欠けているのではなく、嘘のデータが入っている。** 前者は `null` で表せるが、後者は表せない —— 原文という「もっともらしい値」が入っているので、下流はそれが失敗だとは思わない。

### 附带的第二处

第一代服务 `legacy/server.js` 的 `catch` 里：

```js
} catch (error) {
  console.error('AI Processing Error:', error);
  // 出错时也返回模拟数据，保证前端不崩
  res.json(mockAIResponse(text, mode));
}
```

注释写得很坦白：「出错时也返回模拟数据，保证前端不崩」。问题是 `res.json()` 的状态码是 `200`。调用方拿到的响应和成功响应长得一模一样，里面是 `[本地模拟] 已完成基础排版`。

**「保证前端不崩」和「让前端以为成功了」是两件事。** 前者用 `503` + 明确错误就能做到，不需要伪造成功。

另外这一代还有个副作用：`const PORT = 3000` 是硬编码的，第二代的 `api/server.js` 默认也是 3000。两个一起起，第二代能读 `PORT` 环境变量换端口，第一代不能 —— 所以第一代必然 `EADDRINUSE` 崩掉，而它没有任何 `error` 处理。这也是它被移到 `legacy/` 的原因之一。

## 根因

**默认值被填在了「数据缺失」的位置上。**

`result.confidence || 0.8` 看起来像「给个合理的默认值」，实际是在一个**表示判断**的字段上填了一个**表示事实**的值。这两类字段的默认值规则完全相反：

| 字段类型 | 缺失时 | 为什么 |
|---|---|---|
| 配置（超时、重试次数） | 给默认值 | 缺了也能跑，默认值是设计决策 |
| 判断（置信度、分数、排名） | 必须是 `null` | 缺失本身就是信息：「模型没说」和「模型说 0.8」是两件事 |

同一个 `||` 写法，用在配置上是好习惯，用在判断上是伪造数据。代码长得一模一样，语义完全相反 —— 这就是它一直没被 review 出来的原因。

## 修法

1. **`null` 表示不知道。** `confidence: hasConfidence ? clamp(parsed.confidence) : null`。同时把非数值、`NaN`、`Infinity`、字符串 `"0.8"` 全部归到 `null` —— 「能转成数字的字符串」也是一种猜测。
2. **原文等于改进后就返回 `null`。** 一字未改不是改进。
3. **结果必须带 `source`。** `'model'` 还是 `'unparsed'`。界面据此决定说什么话：「AI 的返答を解釈できませんでした（提案のみ表示）」和「AI は改善案を返しませんでした」是两条不同的提示。
4. **界面不画没数。** `typeof confidence === 'number' && isFinite(confidence)` 才显示那根条，否则 `display = 'none'`。
5. **失败返回失败码。** AI 层异常 → `502`；没配 key → `503`。不再有「200 + 假数据」。

## 结论

**默认值是一种断言。** 写下 `|| 0.8` 的那一刻，你断言了「缺省情况下置信度是 0.8」，而这个断言没有任何依据。

判断一条默认值该不该有，问一句：**这个字段缺了，下游还能不能正确工作？** 能 → 给默认值。不能 → 给 `null`，并且逼下游处理 `null`。

最后一条：这个 bug 不会让任何测试变红，也不会让任何请求失败。它只会让界面上的一个数字看起来很正常。**能被看见的错误都还算好错误**，这类「显示了一个不存在的判断」的错误，只能靠「这个字段缺失时应该是什么」这个问句抓出来。
