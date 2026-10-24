// api.js - J-Agent Backend Service Client

class JAgentAI {
  /**
   * @param {string} baseUrl - 后端服务地址
   */
  constructor(baseUrl = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * 调用后端 API 进行文本排版优化
   * @param {string} text - 原始日文文本
   * @param {string} mode - 排版模式 (impact/social/business/magic)
   * @returns {Promise<{formattedText: string, explanation: string[]}>}
   */
  async formatText(text, mode) {
    try {
      const response = await fetch(`${this.baseUrl}/format`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          mode: mode
        })
      });

      if (!response.ok) {
        throw new Error(`Server Error: ${response.status}`);
      }

      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error('J-Agent Backend Error:', error);
      throw error;
    }
  }
}

// 确保在浏览器环境中挂载到 window
if (typeof window !== 'undefined') {
  window.JAgentAI = JAgentAI;
}

// 导出（如果是模块化环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JAgentAI;
}
