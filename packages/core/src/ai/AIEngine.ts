import type { ClusterInput, ClusterResult, SaveIntent } from '@chord/types'

export interface QuestionContext {
  title: string
  domain: string
  savedAt: number
  wakeCount: number
  userNote?: string
  cluster?: string
}

export interface IntentClassificationInput {
  id: string         // item id（用于回填）
  title: string
  domain: string
  excerpt?: string   // 可选摘要，最多 200 字以控制 token
}

export interface IntentClassificationResult {
  id: string
  intent: SaveIntent
}

// 「测试连接」结果
export interface PingResult {
  ok: boolean
  /** 失败时的简短错误描述（HTTP 状态码 + 消息片段） */
  error?: string
  /** 成功时的额外信息（如返回的 model 名） */
  detail?: string
}

export interface AIEngine {
  readonly id: string
  readonly requiresApiKey: boolean
  cluster(items: ClusterInput[], count?: number): Promise<ClusterResult[]>
  generateQuestion(context: QuestionContext): Promise<string>
  // 可选：批量补判保存意图。规则引擎判不出的 item 走这里兜底。
  classifyIntents?(items: IntentClassificationInput[]): Promise<IntentClassificationResult[]>
  // 可选：测试 Key 和接口是否真的通（发一次最小调用）
  ping?(): Promise<PingResult>
}

export const PRESET_ENGINES = {
  // Chord 内置：用编译时注入的开发者 token 调智谱 GLM-4-Flash（免费、无限额度）
  // 用户装上 Chord 不需要任何配置就能用 AI 聚类——开发者构建时通过 VITE_CHORD_BUNDLED_AI_KEY 注入
  chord_bundled: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    provider: 'chord_bundled' as const,
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    provider: 'zhipu' as const,
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    provider: 'siliconflow' as const,
  },
  // 阿里通义千问（DashScope OpenAI 兼容接口）。qwen-turbo 是入门款，有免费额度。
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',
    provider: 'qwen' as const,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5',
    provider: 'anthropic' as const,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    provider: 'openai' as const,
  },
  // DeepSeek v4-flash 是性价比最高的中等强度模型 ($0.14/M input)
  // 实测意图 prompt 下 V4-Pro 86% 准确率, V4-Flash 略低但比 GLM-4-Flash 强一档
  // chat 是别名指向最新生产模型 (V4-Flash thinking-off 模式)
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    provider: 'deepseek' as const,
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-flash',
    provider: 'google' as const,
  },
  doubao: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-lite-4k',
    provider: 'doubao' as const,
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    provider: 'kimi' as const,
  },
} as const
