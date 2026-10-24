const API_BASE = 'http://localhost:3000'

class JPLayoutPopup {
  constructor() {
    this.initElements()
    this.bindEvents()
    this.loadSettings()
    this.checkAIStatus()
  }

  initElements() {
    this.textarea = document.getElementById('text')
    this.languageSelect = document.getElementById('language')
    this.lineLengthSelect = document.getElementById('lineLength')
    this.segmentBtn = document.getElementById('segmentBtn')
    this.aiBtn = document.getElementById('aiBtn')
    this.copyBtn = document.getElementById('copyBtn')
    this.clearBtn = document.getElementById('clearBtn')
    this.output = document.getElementById('output')
    this.stats = document.getElementById('stats')
    this.originalLengthEl = document.getElementById('originalLength')
    this.lineCountEl = document.getElementById('lineCount')
    this.widowToggle = document.getElementById('widowToggle')
    this.punctToggle = document.getElementById('punctToggle')
    this.particleToggle = document.getElementById('particleToggle')
    this.toast = document.getElementById('toast')
    this.aiStatus = document.getElementById('aiStatus')
    this.aiBadge = document.getElementById('aiBadge')
    this.aiTips = document.getElementById('aiTips')
    this.confidenceItem = document.getElementById('confidenceItem')
    this.confidenceBar = document.getElementById('confidenceBar')
    this.confidenceFill = document.getElementById('confidenceFill')
  }

  bindEvents() {
    this.segmentBtn.addEventListener('click', () => this.segmentText())
    this.aiBtn.addEventListener('click', () => this.analyzeWithAI())
    this.copyBtn.addEventListener('click', () => this.copyResult())
    this.clearBtn.addEventListener('click', () => this.clearAll())

    this.widowToggle.addEventListener('click', () => this.toggleSetting(this.widowToggle))
    this.punctToggle.addEventListener('click', () => this.toggleSetting(this.punctToggle))
    this.particleToggle.addEventListener('click', () => this.toggleSetting(this.particleToggle))

    this.textarea.addEventListener('input', () => this.autoResize())
  }

  toggleSetting(element) {
    const current = element.dataset.value === 'true'
    element.dataset.value = !current
    element.classList.toggle('active', !current)
    this.saveSettings()
  }

  getSettings() {
    return {
      widow: this.widowToggle.dataset.value === 'true',
      punctuation: this.punctToggle.dataset.value === 'true',
      particle: this.particleToggle.dataset.value === 'true'
    }
  }

  loadSettings() {
    const saved = localStorage.getItem('jp-layout-settings')
    if (saved) {
      try {
        const settings = JSON.parse(saved)
        this.widowToggle.dataset.value = settings.widow || false
        this.widowToggle.classList.toggle('active', settings.widow || false)
        this.punctToggle.dataset.value = settings.punctuation || false
        this.punctToggle.classList.toggle('active', settings.punctuation || false)
        this.particleToggle.dataset.value = settings.particle !== false
        this.particleToggle.classList.toggle('active', settings.particle !== false)
      } catch (e) {
        console.error('Failed to load settings:', e)
      }
    }
  }

  saveSettings() {
    const settings = this.getSettings()
    localStorage.setItem('jp-layout-settings', JSON.stringify(settings))
  }

  async checkAIStatus() {
    try {
      const response = await fetch(`${API_BASE}/api/v1/ai/status`)
      const result = await response.json()

      if (result.success && result.data?.configured) {
        this.aiStatus.textContent = 'AI Ready'
        this.aiStatus.className = 'badge ai'
        this.aiBadge.textContent = 'AI 已启用'
        this.aiBadge.className = 'badge ai'
        this.aiBtn.disabled = false
        this.aiTips.innerHTML = '<strong>✨ AI 功能已启用</strong><ul><li>点击 "AI 分析建议" 获取智能优化</li><li>AI 会根据上下文分析最佳断行位置</li></ul>'
      } else {
        this.updateAIStatus(false)
      }
    } catch (error) {
      console.error('AI status check failed:', error)
      this.updateAIStatus(false)
    }
  }

  updateAIStatus(configured) {
    this.aiStatus.textContent = configured ? 'AI Ready' : 'MVP'
    this.aiStatus.className = configured ? 'badge ai' : 'badge mvp'
    this.aiBadge.textContent = configured ? 'AI 已启用' : 'AI 未配置'
    this.aiBadge.className = configured ? 'badge ai' : 'badge ai offline'
    this.aiBtn.disabled = !configured
  }

  async segmentText() {
    const text = this.textarea.value.trim()
    if (!text) {
      this.showToast('请输入要处理的文本')
      return
    }

    const language = this.languageSelect.value
    const maxLineLength = parseInt(this.lineLengthSelect.value)
    const settings = this.getSettings()

    this.setLoading(this.segmentBtn, true, '处理中...')

    try {
      const response = await fetch(`${API_BASE}/api/v1/segment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          language,
          options: {
            maxLineLength,
            allowWidow: settings.widow,
            breakBeforePunctuation: settings.punctuation,
            preferAfterParticle: settings.particle
          }
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (result.success && result.data) {
        this.displayResult(result.data)
        this.showToast('处理完成')
      } else {
        throw new Error(result.error || '处理失败')
      }
    } catch (error) {
      console.error('Segmentation error:', error)
      this.showToast(`处理失败: ${error.message}`)
      this.fallbackSegment(text, maxLineLength)
    } finally {
      this.setLoading(this.segmentBtn, false, '⚡ 快速断行')
    }
  }

  async analyzeWithAI() {
    const text = this.textarea.value.trim()
    if (!text) {
      this.showToast('请输入要处理的文本')
      return
    }

    if (text.length > 5000) {
      this.showToast('文本太长，请限制在 5000 字以内')
      return
    }

    this.setLoading(this.aiBtn, true, 'AI 分析中...')

    try {
      const response = await fetch(`${API_BASE}/api/v1/ai/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          context: '日文断行排版优化'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || `HTTP ${response.status}`)
      }

      const result = await response.json()

      if (result.success && result.data) {
        this.displayAIResult(result.data)
        this.showToast('AI 分析完成')
      } else {
        throw new Error(result.error || 'AI 分析失败')
      }
    } catch (error) {
      console.error('AI analysis error:', error)
      this.showToast(`AI 分析失败: ${error.message}`)
    } finally {
      this.setLoading(this.aiBtn, false, '🤖 AI 分析建议')
    }
  }

  displayAIResult(data) {
    const { improvedText, suggestions, confidence, source } = data

    // improvedText は null になりうる（AI が改善案を返さなかった／原文と一字一句同じだった）。
    // 以前はここが常に文字列だと決めつけていて、サーバー側は「読めなかった残骸」を
    // 原文で埋めて返していた。つまり画面には「改善後のテキスト」として原文が出ていた。
    if (typeof improvedText !== 'string' || improvedText.length === 0) {
      this.showToast(
        source === 'unparsed'
          ? 'AI の返答を解釈できませんでした（提案のみ表示）'
          : 'AI は改善案を返しませんでした'
      )
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        this.output.classList.remove('empty')
        this.output.innerHTML = suggestions
          .map((s) => `<div class="output-line">・${this.escapeHtml(String(s))}</div>`)
          .join('')
      }
      // 置信度は出さない。無いものを 80% と描かない。
      this.confidenceItem.style.display = 'none'
      this.confidenceBar.style.display = 'none'
      return
    }

    const lines = improvedText.split('\n').filter((line) => line.trim())

    if (lines.length > 0) {
      this.output.classList.remove('empty')
      this.output.innerHTML = lines
        .map((line) => `<div class="output-line">${this.escapeHtml(line)}</div>`)
        .join('')

      this.stats.style.display = 'flex'
      this.originalLengthEl.textContent = improvedText.length
      this.lineCountEl.textContent = lines.length

      // 置信度はモデルが数値で返したときだけ描く。
      // 以前はサーバーが `confidence || 0.8` で埋めていたので、
      // このバーは「AI の自信」ではなく定数を描いていた。
      if (typeof confidence === 'number' && isFinite(confidence)) {
        this.confidenceItem.style.display = 'flex'
        this.confidenceBar.style.display = 'block'
        const percent = Math.round(confidence * 100)
        this.confidenceValue.textContent = percent + '%'
        this.confidenceFill.style.width = percent + '%'
      } else {
        this.confidenceItem.style.display = 'none'
        this.confidenceBar.style.display = 'none'
      }
    }

    this.saveToHistory(improvedText.split('\n'))
  }

  fallbackSegment(text, maxLineLength) {
    // ここは以前、字数で機械的に切るだけの独自実装だった。
    // サーバーが落ちているときだけ通る道なので、普段は誰も見ない。
    // その結果、同じボタン・同じテキストで、オンラインとオフラインの
    // 排版が別物になっていた（オンラインは句点で切る、オフラインは 20 文字で切る）。
    // いまは lib/segmenter.js の同じ実装を呼ぶ。分流も segmentForLanguage が持つ。
    const result = window.JPSegmenter.segmentForLanguage(text, this.languageSelect.value, {
      maxLineLength
    })
    this.displayResult(result)
    // 「ローカル処理」であることは消えないうちに出す（トーストは数秒で消える）
    this.showToast('API に繋がらないためローカル処理しました')
  }

  displayResult(data) {
    const { lines, metadata } = data

    if (!lines || lines.length === 0) {
      this.output.innerHTML = '<span class="empty">没有生成结果</span>'
      return
    }

    this.output.classList.remove('empty')
    this.output.innerHTML = lines.map(line =>
      `<div class="output-line">${this.escapeHtml(line)}</div>`
    ).join('')

    this.stats.style.display = 'flex'
    this.originalLengthEl.textContent = metadata.originalLength
    this.lineCountEl.textContent = metadata.lineCount

    // 隐藏置信度
    this.confidenceItem.style.display = 'none'
    this.confidenceBar.style.display = 'none'

    this.saveToHistory(lines)
  }

  saveToHistory(lines) {
    const history = JSON.parse(localStorage.getItem('jp-layout-history') || '[]')
    const entry = {
      text: lines.join('\n'),
      timestamp: Date.now()
    }
    history.unshift(entry)
    if (history.length > 10) history.pop()
    localStorage.setItem('jp-layout-history', JSON.stringify(history))
  }

  async copyResult() {
    const text = this.output.innerText
    if (!text || this.output.classList.contains('empty')) {
      this.showToast('没有可复制的内容')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      this.showToast('已复制到剪贴板')
    } catch (e) {
      this.showToast('复制失败')
    }
  }

  clearAll() {
    this.textarea.value = ''
    this.output.classList.add('empty')
    this.output.innerHTML = '点击"断行处理"后显示结果'
    this.stats.style.display = 'none'
    this.confidenceItem.style.display = 'none'
    this.confidenceBar.style.display = 'none'
    this.textarea.style.height = '100px'
  }

  setLoading(button, loading, text) {
    button.disabled = loading
    if (loading) {
      const isDark = button.classList.contains('btn-ai')
      button.innerHTML = `<span class="loading ${isDark ? 'dark' : ''}"></span>${text}`
    } else {
      button.textContent = text.replace('⚡ ', '').replace('🤖 ', '')
      if (button.id === 'segmentBtn') button.textContent = '⚡ 快速断行'
      if (button.id === 'aiBtn') button.textContent = '🤖 AI 分析建议'
    }
  }

  showToast(message) {
    this.toast.textContent = message
    this.toast.classList.add('show')
    setTimeout(() => {
      this.toast.classList.remove('show')
    }, 2000)
  }

  autoResize() {
    this.textarea.style.height = 'auto'
    this.textarea.style.height = Math.min(this.textarea.scrollHeight, 200) + 'px'
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new JPLayoutPopup()
})
