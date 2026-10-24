/*
 * 日文断行 + 禁则处理 —— 本仓库唯一的断行实现。
 *
 * 为什么这个文件住在 plugin/lib/ 里：
 *   浏览器扩展只能加载自己目录下的文件（manifest 的根就是 plugin/），
 *   所以共用实现必须落在 plugin/ 里面；服务端反过来 require 它。
 *   这个布局不好看，但它是唯一不会产生第二份拷贝的布局。
 *   在这之前，同一段文本有三条代码路径（api 的 segmenter、api 的 simpleSegment、
 *   插件的 fallbackSegment），输出各不相同，用户看不出来。
 *
 * 为什么是 UMD 而不是 ESM：
 *   同一个文件要能被 node 的 require、popup.html 的 <script>、
 *   service worker 三处加载，UMD 是唯一不需要构建步骤的写法。
 *
 * 零依赖。没有形态素解析器 —— 助词判定是字符串匹配，这是本实现的精度上限，
 * 详见 README「它做不到什么」。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.JPSegmenter = factory()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  // ---------------------------------------------------------------------------
  // 禁则规则表
  //
  // 检查器（findViolations）和实现（segment）共用这一张表。
  // 这不是图省事 —— 如果检查器另抄一份表，实现改坏了而检查器没改，
  // 检查器会安静地给出「零违反」，那是最坏的一种绿。
  // 表的正确性由 tests/segmenter.test.js 里的 golden 用例钉住，
  // 不靠「表看起来对」。
  // ---------------------------------------------------------------------------

  // 行頭禁则：这些字符不能出现在行首（JIS X 4051 的实用子集）
  var KINSOKU_HEAD = new Set([
    '。', '、', '，', '．', '！', '？', '：', '；', '・', '…', '‥', 'ー', '—', '～',
    '）', '〕', '］', '｝', '〉', '》', '」', '』', '】', '〙', '〗', '〟', '｣',
    '”', '’', '゛', '゜', '％', '℃',
    // 小書き仮名・繰り返し記号
    'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ',
    'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ッ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ヵ', 'ヶ', '々', 'ゝ', 'ゞ'
  ])

  // 行末禁则：这些字符不能出现在行尾
  var KINSOKU_TAIL = new Set([
    '（', '〔', '［', '｛', '〈', '《', '「', '『', '【', '〘', '〖', '〝', '｢',
    '“', '‘'
  ])

  // 句点・読点：这些字符之后是最自然的断点
  var SENTENCE_END = new Set(['。', '．', '！', '？'])
  var CLAUSE_END = new Set(['、', '，'])

  // 助词（含助动词）。判定方式是从候选断点往回看 1~3 个字符是否命中，
  // 不做形态素解析 —— 所以「はな」的「は」也会被当成助词。
  // 这是已知误差，不是 bug；要消掉它必须引入词典，那会破坏「零依赖」。
  var PARTICLES = [
    'から', 'まで', 'より', 'など', 'ので', 'のに', 'けど', 'けれど',
    'の', 'に', 'は', 'が', 'と', 'を', 'で', 'へ', 'も', 'や', 'ね', 'よ', 'な'
  ]

  var DEFAULT_OPTIONS = {
    // 一行の目標文字数。追い込み（後述）の分だけ超過することがある。
    maxLineLength: 20,
    // true にすると最終行が 1 文字でもそのまま許す
    allowWidow: false,
    // 助詞の直後を優先的に断点にする
    preferAfterParticle: true,
    // 追い込み／追い出しで動かしてよい上限。これを超えるなら禁則より行長を優先する。
    maxAdjust: 3
  }

  function normalizeOptions(options) {
    var o = {}
    for (var k in DEFAULT_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, k)) o[k] = DEFAULT_OPTIONS[k]
    }
    if (options && typeof options === 'object') {
      for (var key in options) {
        if (Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined) {
          o[key] = options[key]
        }
      }
    }
    var n = parseInt(o.maxLineLength, 10)
    o.maxLineLength = isNaN(n) || n < 2 ? 2 : n
    var m = parseInt(o.maxAdjust, 10)
    o.maxAdjust = isNaN(m) || m < 0 ? 0 : m
    return o
  }

  // 一个段落内，从 pos 开始、最多 max 字，挑一个断点（返回 cut，切割区间是 [pos, cut)）
  function chooseCut(text, pos, max, o) {
    var limit = pos + max
    // 断点不允许太靠前：否则会切出一堆三四个字的碎行。
    var floor = pos + Math.max(1, Math.floor(max * 0.5))

    var i
    // 1. 句点・感叹号・问号之后
    //    句読点不设下限：読点は「ここで切ってよい」という著者からの明示的な指示で、
    //    弱い信号（助詞・空白）と同じ土俵で距離を測ると必ず負ける。
    //    これを floor 付きにしていた版では「この度は、」の読点が捨てられ、
    //    20 字ぶん進んだ先で「いただ／き」と語の途中を切っていた。
    for (i = limit - 1; i >= pos + 1; i--) {
      if (SENTENCE_END.has(text.charAt(i))) return i + 1
    }
    // 2. 読点之后
    for (i = limit - 1; i >= pos + 1; i--) {
      if (CLAUSE_END.has(text.charAt(i))) return i + 1
    }
    // 3. 助词之后
    //    第一版这里写成「拿 2 字切片去比对 1 字的助词表」，两边长度对不上，
    //    于是助词分支永远不命中 —— preferAfterParticle 这个选项实际上是个死开关。
    //    tests/segmenter.test.js 里「切了它结果要变」那条断言把它抓出来了。
    if (o.preferAfterParticle) {
      for (i = limit - 1; i >= floor; i--) {
        for (var p = 0; p < PARTICLES.length; p++) {
          var w = PARTICLES[p]
          if (i - w.length + 1 >= pos && text.slice(i - w.length + 1, i + 1) === w) return i + 1
        }
      }
    }
    // 4. 空白之后
    for (i = limit - 1; i >= floor; i--) {
      var ch = text.charAt(i)
      if (ch === ' ' || ch === '\u3000') return i + 1
    }
    // 5. 没有好断点：在 max 处硬切。
    //    原来的实现在这里取 Math.floor(len / 2)，会在「行き／ません」这种
    //    词中间切一刀 —— 断点比硬切还差，因为它连「尽量靠后」都不满足。
    return limit
  }

  // 把 cut 挪到不违反禁则的位置
  function applyKinsoku(text, pos, cut, o) {
    var c = cut
    var moved = 0

    // 行頭禁则 → 追い込み：把禁则字符挤进上一行
    while (c < text.length && KINSOKU_HEAD.has(text.charAt(c)) && moved < o.maxAdjust) {
      c++
      moved++
    }

    // 行末禁则 → 追い出し：把开括号送到下一行
    moved = 0
    while (c > pos + 1 && KINSOKU_TAIL.has(text.charAt(c - 1)) && moved < o.maxAdjust) {
      c--
      moved++
    }

    // 追い出した結果、次の行の先頭が禁则になったらもう一度追い込む
    if (moved > 0) {
      moved = 0
      while (c < text.length && KINSOKU_HEAD.has(text.charAt(c)) && moved < o.maxAdjust) {
        c++
        moved++
      }
    }

    return c
  }

  // 1 文字だけの最終行を避ける（追い出しではなく、前の行から 1 字もらう）
  function fixWidow(lines) {
    if (lines.length < 2) return
    var last = lines[lines.length - 1]
    var prev = lines[lines.length - 2]
    if (last.length !== 1 || prev.length < 4) return
    var borrowed = prev.charAt(prev.length - 1)
    // もらった字が行頭禁则なら、禁则違反を作るだけなのでやめる
    if (KINSOKU_HEAD.has(borrowed)) return
    lines[lines.length - 2] = prev.slice(0, -1)
    lines[lines.length - 1] = borrowed + last
  }

  function segmentParagraph(text, o) {
    var lines = []
    var pos = 0
    var guard = 0
    while (pos < text.length) {
      if (guard++ > text.length + 10) break // 想定外の入力で無限ループしないための保険
      var rest = text.length - pos
      if (rest <= o.maxLineLength) {
        lines.push(text.slice(pos))
        break
      }
      var cut = applyKinsoku(text, pos, chooseCut(text, pos, o.maxLineLength, o), o)
      if (cut <= pos) cut = pos + 1
      if (cut > text.length) cut = text.length
      lines.push(text.slice(pos, cut))
      pos = cut
    }
    if (!o.allowWidow) fixWidow(lines)
    return lines
  }

  function segment(text, options) {
    var o = normalizeOptions(options)
    var src = typeof text === 'string' ? text : String(text == null ? '' : text)
    // 既有换行视为硬断行，不参与重排。这样粘进来的多段文本不会被揉成一坨。
    var paragraphs = src.split(/\r?\n/)
    var lines = []
    for (var i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i] === '') continue
      var part = segmentParagraph(paragraphs[i], o)
      for (var j = 0; j < part.length; j++) lines.push(part[j])
    }
    return {
      lines: lines,
      metadata: {
        originalLength: src.length,
        lineCount: lines.length,
        language: 'ja'
      }
    }
  }

  function JapaneseSegmenter(options) {
    this.options = normalizeOptions(options)
  }
  JapaneseSegmenter.prototype.segment = function (text) {
    return segment(text, this.options)
  }

  function segmentJapanese(text, options) {
    return segment(text, options)
  }

  // ---------------------------------------------------------------------------
  // 语言分流：断行方式只能在这一个地方决定
  //
  // 在这之前，三条代码路径各自决定「用哪种切法」：
  //   api 的 /segment 里 if (language === 'ja') 走禁则断行器，否则走 simpleSegment；
  //   插件的 fallbackSegment 完全不看 language，一律字数硬切；
  //   于是同一段文本、同一个按钮，服务端在线和离线给出两种排版。
  // 现在分流只有一个入口，两条路径都调它。
  // ---------------------------------------------------------------------------
  function wrapWords(text, max) {
    // 空白区切りの言語向け。単語の途中では切らない。
    // max より長い単語だけは、そのまま 1 行にする（切るほうが読めない）。
    var src = String(text == null ? '' : text)
    var lines = []
    var paragraphs = src.split(/\r?\n/)
    for (var i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i]
      if (para === '') continue
      var tokens = para.split(/(\s+)/).filter(function (t) {
        return t.length > 0
      })
      var cur = ''
      for (var j = 0; j < tokens.length; j++) {
        var t = tokens[j]
        if (cur === '') {
          cur = /^\s+$/.test(t) ? '' : t
          continue
        }
        if (cur.length + t.length <= max) {
          cur += t
        } else {
          lines.push(cur)
          cur = /^\s+$/.test(t) ? '' : t
        }
      }
      if (cur !== '') lines.push(cur)
    }
    return {
      lines: lines,
      metadata: { originalLength: src.length, lineCount: lines.length, language: 'other' }
    }
  }

  function segmentByWidth(text, max) {
    var src = String(text == null ? '' : text)
    var lines = []
    var paragraphs = src.split(/\r?\n/)
    for (var i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i]
      for (var j = 0; j < para.length; j += max) lines.push(para.slice(j, j + max))
    }
    return {
      lines: lines,
      metadata: { originalLength: src.length, lineCount: lines.length, language: 'other' }
    }
  }

  var CJK_LANGS = ['zh', 'cn', 'chinese', 'ko', 'kr', 'korean']

  function segmentForLanguage(text, language, options) {
    var lang = String(language == null ? 'ja' : language).toLowerCase()
    var o = normalizeOptions(options)
    if (lang === 'ja' || lang === 'jp' || lang === 'japanese') {
      return segment(text, o)
    }
    if (CJK_LANGS.indexOf(lang) !== -1) {
      // 中文・韩文の禁则は日本語と同じ表で足りる（。」！？は共通）。
      // ただし助詞の判定は日本語のものなので切る。
      var cjkOptions = {}
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) cjkOptions[k] = o[k]
      cjkOptions.preferAfterParticle = false
      var r = segment(text, cjkOptions)
      r.metadata.language = lang
      return r
    }
    return wrapWords(text, o.maxLineLength)
  }

  // ---------------------------------------------------------------------------
  // 检查器：输入任意文本（含换行的排好版结果），输出违反位置
  // 和 segment() 共用同一张规则表，见文件头的说明。
  // ---------------------------------------------------------------------------
  function findViolations(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/)
    var out = []
    // 「1 文字行」这条规则的适用域：只有当整篇有两行以上时才成立。
    // 单字文本排出来就是一行一字，那是输入的性质，不是排版的错误 ——
    // 在这里报违反是误报。规则本身的适用域没写清，检查器就会把对的判成错的。
    var nonEmpty = 0
    for (var n = 0; n < lines.length; n++) if (lines[n].length > 0) nonEmpty++
    var oneCharApplies = nonEmpty > 1
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line.length === 0) continue
      var head = line.charAt(0)
      if (KINSOKU_HEAD.has(head)) {
        out.push({ type: 'head', line: i + 1, char: head, text: line })
      }
      var tail = line.charAt(line.length - 1)
      if (KINSOKU_TAIL.has(tail)) {
        out.push({ type: 'tail', line: i + 1, char: tail, text: line })
      }
      if (oneCharApplies && line.length === 1) {
        out.push({ type: 'one-char', line: i + 1, char: line, text: line })
      }
    }
    return out
  }

  return {
    segmentJapanese: segmentJapanese,
    segment: segment,
    segmentForLanguage: segmentForLanguage,
    segmentByWidth: segmentByWidth,
    wrapWords: wrapWords,
    JapaneseSegmenter: JapaneseSegmenter,
    findViolations: findViolations,
    KINSOKU_HEAD: KINSOKU_HEAD,
    KINSOKU_TAIL: KINSOKU_TAIL,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS
  }
})
