/**
 * Ollama SDK Compatibility Layer
 * Provides an Anthropic-compatible interface for Ollama API
 */

export class AnthropicOllama {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:11434'
    this.apiKey = options.apiKey
    this.defaultHeaders = options.defaultHeaders || {}
    this.maxRetries = options.maxRetries || 3
    this.timeout = options.timeout || 600000
    this.logger = options.logger
  }

  async messages.create(params) {
    const { model, messages, max_tokens, temperature, stream, tools, system } = params

    const ollamaModel = this._mapModel(model)

    const ollamaMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    if (system) {
      ollamaMessages.unshift({ role: 'system', content: system })
    }

    const requestBody = {
      model: ollamaModel,
      messages: ollamaMessages,
      stream: stream || false,
      options: {
        temperature: temperature || 0.7,
        num_predict: max_tokens || 4096,
      }
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema || tool.parameters
        }
      }))
    }

    try {
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
          ...this.defaultHeaders
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${error}`)
      }

      if (stream) {
        return this._createStreamResponse(response, tools)
      }

      const data = await response.json()

      return this._transformResponse(data, tools)
    } catch (error) {
      this.logger?.error?.('Ollama request failed:', error.message)
      throw error
    }
  }

  _mapModel(model) {
    const modelMap = {
      'claude-opus-4-6': 'llama3.3',
      'claude-sonnet-4-6': 'llama3.3',
      'claude-haiku-4-5': 'llama3.2',
      'claude-3-5-sonnet': 'llama3.2',
      'claude-3-5-haiku': 'llama3.2',
      'claude-3-opus': 'llama3.3',
      'claude-3-sonnet': 'llama3.2',
    }

    const normalized = model.toLowerCase().replace(/\[.*?\]/g, '').trim()
    return modelMap[normalized] || model
  }

  _transformResponse(data, tools) {
    const message = data.message || {}
    const content = []

    if (message.content) {
      content.push({
        type: 'text',
        text: message.content
      })
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: toolCall.function?.name,
          input: typeof toolCall.function?.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function?.arguments || {}
        })
      }
    }

    return {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: data.model || 'unknown',
      stop_reason: data.done ? 'end_turn' : null,
      usage: {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0
      }
    }
  }

  _createStreamResponse(response, tools) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const data = JSON.parse(line)
              if (data.message) {
                yield {
                  type: 'content_block_delta',
                  delta: {
                    type: 'text_delta',
                    text: data.message.content || ''
                  }
                }

                if (data.message.tool_calls) {
                  for (const toolCall of data.message.tool_calls) {
                    yield {
                      type: 'content_block_delta',
                      delta: {
                        type: 'input_json_delta',
                        partial_json: JSON.stringify(toolCall.function?.arguments || {})
                      }
                    }
                  }
                }
              }

              if (data.done) {
                yield {
                  type: 'message_stop',
                  stop_reason: 'end_turn'
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    }
  }
}

export default { AnthropicOllama }
