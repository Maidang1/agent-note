import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { messageText } from './harness/scripted-llm.ts'

/** 一个“模型”：把请求里最后一条消息念回去。 */
class EchoAdapter extends LlmAdapter {
  calls = 0

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  override async* stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = request.messages.at(-1)
    const declared = (request.tools ?? []).map(tool => tool.name)
    const sum = /^(\d+)\+(\d+)$/.exec(messageText(last))

    // TODO：最后一条是用户消息、形如 a+b、且请求声明了 add 工具时，
    // 发出一个 add 工具调用，以 { kind: 'tool-calls' } 结束。

    const text = `你说的是：${messageText(last)}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'llm-echo'
export const inject = ['llm']

export function apply(ctx: Context) {
  ctx.llm.registerAdapter(['echo'], new EchoAdapter())
}
