import type { ClusterInput, ClusterResult, SaveIntent } from '@chord/types'
import type { AIEngine, QuestionContext, IntentClassificationInput, IntentClassificationResult, PingResult } from './AIEngine.js'
import { daysSince } from '../utils/date.js'
import { L1_CATEGORIES, L1_NAME_SET, formatL1ListForPrompt } from './L1Categories.js'

interface Config {
  baseUrl: string
  apiKey: string
  model: string
  provider?: string
}

export class OpenAICompatibleEngine implements AIEngine {
  readonly id: string
  readonly requiresApiKey = true

  constructor(private cfg: Config) {
    this.id = `openai-compat-${cfg.provider ?? 'custom'}`
  }

  // CR-030：公开 completion 接口，供 AIInsightsService 等其他服务调用
  // 不要 export 私有 chat() 内部结构，只暴露最常用的 string in / string out
  async chatCompletion(prompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
    const { content } = await this.chat(
      [{ role: 'user', content: prompt }],
      { maxTokens: opts.maxTokens ?? 1024, temperature: opts.temperature ?? 0.7 },
    )
    return content
  }

  // max_tokens 必须按调用方传，不能硬编码（CR-027）。
  // 历史 bug：硬编码 512 → cluster()/classifyIntents() 返回的 JSON 被截断 → parse 失败 → 静默 fallback 到 TF-IDF。
  // 不同方法的输出体量差异巨大，所以每个调用点自己设值（cluster 最大、ping 最小）。
  private async chat(
    messages: { role: string; content: string }[],
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<{ content: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; finishReason?: string }> {
    const { maxTokens = 1024, temperature = 0.7 } = opts
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({ model: this.cfg.model, messages, max_tokens: maxTokens, temperature }),
    })

    if (!res.ok) {
      throw new Error(`AI API error: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as {
      choices: { message: { content: string }; finish_reason?: string }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    return {
      content: data.choices[0]?.message.content ?? '',
      usage: data.usage,
      finishReason: data.choices[0]?.finish_reason,
    }
  }

  // CR-028：换成 L1 预定义大类的"N 选 1"分类，不再开放聚类
  // 实测开放聚类准确率 ~20%（互斥违反 19% + 漏分 15% + cluster 名实不符 57%）
  // L1 分类同样数据集准确率 87%，互斥违反 0%，漏分 0%
  // 详见 产品文档/Chord_聚类质量诊断与L1方案.md
  async cluster(items: ClusterInput[], _count?: number): Promise<ClusterResult[]> {
    const list = items
      .map((i, idx) => `${idx}. ${i.title} (${i.domain ?? ''})`)
      .join('\n')

    const prompt = `把下面 ${items.length} 条收藏归到以下 10 个预定义类别中的**一个**。

⚠️ 约束：
- 每条只能选 1 个类别（多义内容选最主要的那个）
- 不要新建类别，必须从下面 10 个里选
- 返回时 i 必须从 0 到 ${items.length - 1} 每个出现且只出现一次

类别清单：
${formatL1ListForPrompt()}

判断思路（**看用户保存这条是想做什么，不是匹配关键词**）：

每个类别背后的「用户意图」：
- **测试与面试** = 用户**正在准备一场面试**（任何岗位都算——AI 工程师、PM、QA、销售都是）。题库、攻略、面经、Interview Guide、模拟系统都属于
- **AI 工程与论文** = 用户在**学 AI 技术、读 AI 论文、搭 AI 系统**（开发者/研究者视角）
- **AI 应用与工具** = 用户在**用 AI 产品**（终端体验者，不是开发者）
- **编程与软件开发** = 用户在**学非 AI 的技术**（Java/Kafka/性能调优/CS 课程）
- **半导体与硬科技** = 用户在**研究硬科技产业链**（看产业逻辑，不是炒股）
- **投资与金融市场** = 用户在**做投资决策**（个股/ETF/估值/交易工具）
- **工具型入口** = 用户**只是要打开就用**的服务（VPN/SMS/激活/控制台），不需要阅读
- **招聘信息** = 用户在**找工作**（看招聘公告/JD/Offer 比较）——**不是准备面试**
- **个人创作与生活** = 用户在**消费个人化内容**（个人博客/旅行/影视娱乐）
- **其他** = 标题信息太少，无法判断意图（localhost、纯"公众号"、不明链接）

边界示例（同一域名/同一品牌下，根据意图归到不同类）：
- 「Claude AI 工程师面试攻略」→ 准备面试 → 测试与面试
- 「Claude API 入门教程」→ 学 Claude → AI 工程与论文
- 「Claude.ai 产品介绍」→ 体验产品 → AI 应用与工具
- 「半导体行业 2026 投资策略」→ 投资 → 投资与金融市场
- 「半导体设备产业深度研报」→ 看产业 → 半导体与硬科技

同义词都算：「面试 / Interview / 面经」「投资 / 财报 / 估值 / Earnings」「招聘 / JD / Offer」

返回 JSON 数组：[{"i":0,"label":"AI 应用与工具"}, ...]

收藏列表：
${list}

只返回 JSON 数组，不要其他文字。`

    // 输出 ~30 token/item × 166 items ≈ 5000 token；max 8192 留余量
    // temperature 0 让聚类确定性（同一收藏内容多次 recluster 得相同分类，回归测试可比）
    const { content: response, usage, finishReason } = await this.chat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 8192, temperature: 0 },
    )

    let parsed: { i: number; label: string }[]
    try {
      const stripped = response.trim()
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim()
      const fb = stripped.indexOf('[')
      const lb = stripped.lastIndexOf(']')
      let tightRaw = fb >= 0 && lb > fb ? stripped.slice(fb, lb + 1) : stripped
      // 修 AI 长输出时的「偷懒」格式：{"i":N,"VALUE"} → {"i":N,"label":"VALUE"}
      // GLM-4-Flash 在 ~160+ 条 batch 时偶尔会自动省略 "label": key（实测 5/18 触发）
      tightRaw = tightRaw.replace(/\{"i":(\d+),"([^"]+)"\}/g, '{"i":$1,"label":"$2"}')
      let p = recoverTruncatedJsonArray(tightRaw) as { i: number; label: string }[] | null
      if (!p && fb >= 0) {
        // fallback：从 [ 开始截取（不掐尾），用同款 fix
        const lenient = stripped.slice(fb).replace(/\{"i":(\d+),"([^"]+)"\}/g, '{"i":$1,"label":"$2"}')
        p = recoverTruncatedJsonArray(lenient) as typeof p
      }
      if (!p) throw new Error('AI returned unparseable JSON')
      parsed = p

      if (finishReason === 'length' || !response.trimEnd().endsWith(']')) {
        console.warn('[Chord] AI L1 classification appears truncated. finish_reason=%s usage=%o', finishReason, usage)
      }
    } catch (e) {
      console.warn('[Chord] AI L1 classification parse failed:', (e as Error).message, 'head=', response.slice(0, 200))
      throw new Error('AI L1 classification parse failed: ' + (e as Error).message)
    }

    // 把 (item, label) 对汇成 cluster；保留 L1_CATEGORIES 定义的顺序（让兴趣地形显示稳定）
    const itemsByLabel = new Map<string, ClusterInput[]>()
    const seenI = new Set<number>()
    for (const r of parsed) {
      if (seenI.has(r.i)) continue              // 互斥兜底：重复打标只保留第一次
      if (r.i < 0 || r.i >= items.length) continue
      seenI.add(r.i)
      // 非法 label 显式归到「其他」，避免遗漏
      const label = L1_NAME_SET.has(r.label) ? r.label : '其他'
      if (!itemsByLabel.has(label)) itemsByLabel.set(label, [])
      itemsByLabel.get(label)!.push(items[r.i]!)
    }

    // 漏标兜底：AI 没分配的 item 自动归「其他」
    let missingCount = 0
    for (let i = 0; i < items.length; i++) {
      if (!seenI.has(i)) {
        if (!itemsByLabel.has('其他')) itemsByLabel.set('其他', [])
        itemsByLabel.get('其他')!.push(items[i]!)
        missingCount++
      }
    }
    if (missingCount > 0) {
      console.warn(`[Chord] AI L1 漏标 ${missingCount} 条，已兜底归入「其他」`)
    }

    // 按 L1_CATEGORIES 定义的顺序输出（确保兴趣地形顺序稳定）
    const results: ClusterResult[] = []
    for (const cat of L1_CATEGORIES) {
      const its = itemsByLabel.get(cat.name)
      if (!its || its.length === 0) continue
      results.push({
        name: cat.name,
        keywords: [cat.id],          // 不再用关键词命名，保留 id 作为元数据
        itemIds: its.map((i) => i.id),
      })
    }
    return results
  }

  async generateQuestion(ctx: QuestionContext): Promise<string> {
    const age = daysSince(ctx.savedAt)
    const timeDesc =
      age < 7 ? '几天前'
      : age < 30 ? `${Math.floor(age / 7)} 周前`
      : age < 365 ? `${Math.floor(age / 30)} 个月前`
      : `${Math.floor(age / 365)} 年前`

    const prompt = `你是回响，一个帮用户整理收藏内容的助手。请为以下内容生成一句个人化的回响问句。

内容信息：
- 标题：${ctx.title}
- 来源：${ctx.domain}
- 保存时间：${timeDesc}（${ctx.wakeCount > 0 ? `第 ${ctx.wakeCount + 1} 次被唤醒` : '首次唤醒'}）
${ctx.userNote ? `- 用户当时的备注：「${ctx.userNote}」` : ''}
${ctx.cluster ? `- 主题分类：${ctx.cluster}` : ''}

要求：
- 一句话，不超过 40 字
- 语气私人、温柔，像一个轻声陪伴的朋友
- 不评判，只好奇
- 中文
- 不要加引号
- 可以引用用户备注（如果有的话）

只返回问句本身，不要其他文字。`

    // CR-027：单句问句，256 token 充足
    const { content } = await this.chat([{ role: 'user', content: prompt }], { maxTokens: 256 })
    return content.trim()
  }

  async classifyIntents(items: IntentClassificationInput[]): Promise<IntentClassificationResult[]> {
    if (items.length === 0) return []
    // 批量送给 LLM，最多 30 条一批（控制 token + 失败影响面）
    const BATCH = 30
    const results: IntentClassificationResult[] = []
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH)
      const list = slice.map((it, idx) => {
        const summary = it.excerpt ? `（${it.excerpt.slice(0, 80)}）` : ''
        return `${idx}. ${it.title}${summary}`
      }).join('\n')

      const prompt = `你是分析用户收藏动机的助手。下面是用户保存的一组网页，请为每一条判定它的保存意图，从以下 5 类中选一个：

- tool：准备直接用的工具、教程、参考（操作性强）
- learn：想理解某个知识/原理/概念
- aspire：渴望成为某种人 / 转型 / 身份叙事（如「我是如何成为…」「副业」「年薪」）
- inspire：情感共鸣 / 美感 / 哲思 / 随笔
- track：追踪行业动态 / 新闻 / 趋势 / 产品发布

返回 JSON 数组，每条形如 {"i":0,"intent":"aspire"}，i 必须对应输入序号：

${list}

只返回 JSON 数组，不要其他文字。`

      try {
        // CR-027：每批 30 条，输出 30 个 {i,intent} ~500 token，2048 留足余量
        const { content: response } = await this.chat(
          [{ role: 'user', content: prompt }],
          { maxTokens: 2048 },
        )
        // 容错：LLM 可能输出 markdown 代码块，剥掉再 parse
        const cleaned = response.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
        const parsed = (recoverTruncatedJsonArray(cleaned) ?? []) as { i: number; intent: SaveIntent }[]
        for (const p of parsed) {
          const item = slice[p.i]
          if (item && isValidIntent(p.intent)) {
            results.push({ id: item.id, intent: p.intent })
          }
        }
      } catch {
        // 单个 batch 解析失败不影响其他 batch；该批 item 留待下次再试
      }
    }
    return results
  }

  // 测试 Key + 接口是否可用。最小开销：max_tokens=1，单次调用。
  // 错误按 HTTP 状态码归类返回可读提示。
  async ping(): Promise<PingResult> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: [{ role: 'user', content: 'ok' }],
          max_tokens: 1,
          temperature: 0,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const hint = res.status === 401 ? 'API Key 无效或被拒绝'
          : res.status === 403 ? '权限不足（可能模型未开通）'
          : res.status === 404 ? '模型名或接口路径错'
          : res.status === 429 ? '触发限速 / 配额耗尽'
          : res.status >= 500 ? '服务端错误，稍后再试'
          : '请求被拒绝'
        return { ok: false, error: `${hint}（HTTP ${res.status}）${text ? '：' + text.slice(0, 160) : ''}` }
      }
      const data = await res.json().catch(() => null) as { model?: string } | null
      return { ok: true, detail: data?.model ? `模型：${data.model}` : undefined }
    } catch (e) {
      const msg = (e as Error).message || String(e)
      return { ok: false, error: `网络错误：${msg.slice(0, 160)}` }
    }
  }
}

function isValidIntent(s: string): s is SaveIntent {
  return s === 'tool' || s === 'learn' || s === 'aspire' || s === 'inspire' || s === 'track'
}

// 兜底解析被截断的 JSON 数组：
// AI 输出可能因 max_tokens 限制截断在某个对象中间。直接 JSON.parse 会失败。
// 这里截到最后一个完整 `}` 处，加 `]` 闭合，挽救前 N-1 个完整对象。
// 用例：cluster() 期望 10 个 cluster，AI 在第 8 个写到一半被截断；本函数返回前 7 个有效结果，比整体失败好。
export function recoverTruncatedJsonArray(raw: string): unknown[] | null {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : null
  } catch {
    // 落到截断恢复
  }
  if (!raw.startsWith('[')) return null
  const lastClose = raw.lastIndexOf('}')
  if (lastClose < 0) return null
  const truncated = raw.slice(0, lastClose + 1) + ']'
  try {
    const v = JSON.parse(truncated)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
