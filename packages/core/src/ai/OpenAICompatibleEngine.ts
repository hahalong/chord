import type { ClusterInput, ClusterResult, SaveIntent } from '@chord/types'
import type { AIEngine, QuestionContext, IntentClassificationInput, IntentClassificationResult, PingResult } from './AIEngine.js'
import { daysSince } from '../utils/date.js'
import { L1_CATEGORIES, L1_NAMES, L1_NAME_SET, formatL1ListForPrompt } from './L1Categories.js'

// v1.1 · label normalize · 容忍 "AI 工程与论文" vs "AI工程与论文" 空格差异
//   实测 GLM-4-Flash 有时省略中文里的空格, 导致 string match 失败造成假阴性
function normalizeL1Label(label: string | undefined): string {
  if (!label) return ''
  if (L1_NAME_SET.has(label)) return label
  const stripped = label.replace(/\s+/g, '')
  for (const n of L1_NAMES) {
    if (n.replace(/\s+/g, '') === stripped) return n
  }
  return label
}

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
  //
  // v1.1 · 加分 batch · 解决 intent prompt 在单 batch 大输入下准确率退化
  //   背景: 切到 intent prompt v2 后, GLM-4-Flash 单 batch 175 条 → 64%（不如 v1 硬规则 74%）
  //         分 30 条/batch → 82.3%（v1 baseline +8%, BC-014 修复）
  // v1.1.1 · 并行跑所有 batch · Promise.all
  //   背景: 200 条串行 7 batch ≈ 90s 太慢, 用户截图反馈"等很久"
  //         智谱 API 支持并发, Promise.all 同时发请求, 总时间 ≈ 最慢 batch ~15s
  //   错误处理: 任一 batch 失败整体 throw（不静默 fallback 部分结果）
  async cluster(items: ClusterInput[], _count?: number): Promise<ClusterResult[]> {
    // v1.1 · intent prompt 在 30 条/batch 下表现最稳定（实测）。比这大 GLM-4-Flash 注意力稀释
    const BATCH_SIZE = 30
    const batches: ClusterInput[][] = []
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE))
    }

    // v1.1.1 · 并行: 所有 batch 同时调 API, Promise.all 等齐后合并
    const batchResults = await Promise.all(
      batches.map((batch, bi) => this.classifyBatch(batch, bi + 1, batches.length)),
    )

    // 累加 (全局 itemIndex, label) 跨 batch 合并
    const allParsed: { i: number; label: string }[] = []
    batchResults.forEach((batchParsed, bi) => {
      const offset = bi * BATCH_SIZE
      for (const r of batchParsed) {
        allParsed.push({ i: r.i + offset, label: r.label })
      }
    })

    return this.assembleClusters(items, allParsed)
  }

  // 单 batch 分类调用 · 失败直接 throw 不静默 fallback (CLAUDE.md §11 纪律)
  private async classifyBatch(items: ClusterInput[], batchNum: number, totalBatches: number): Promise<{ i: number; label: string }[]> {
    const list = items
      .map((i, idx) => `${idx}. ${i.title} (${i.domain ?? ''})`)
      .join('\n')

    // v1.1 · intent-based prompt（替换原硬规则路线）
    // 实测对比（175 样本 v3 dataset, BC-014 9 条边界 case 含）:
    //   智谱 GLM-4-Flash + 原硬规则:    74.3% (BC-014 3/9)
    //   智谱 GLM-4-Flash + intent v2:   82.3% (BC-014 8/9) ← 默认 chord_bundled 直接受益 +8%
    //   DeepSeek V4-Pro + intent v2:    86.3% (BC-014 8/9) ← 强模型天花板更高
    // 详见 产品文档/Chord_聚类BadCase库.md BC-014 + run-eval-intent.mjs
    const prompt = `把下面 ${items.length} 条收藏归到 10 个预定义类别中的一个。请按"用户保存这条时的真实意图"来判断，不要被标题里的关键词带偏。

类别定义（按意图描述，不按关键词）：

1. **AI 应用与工具** — 用户想"用"一个 AI 产品（终端体验者视角）。ChatGPT、Claude.ai、即梦、椒图、ComfyUI 这种网站/应用。
2. **AI 工程与论文** — 用户想"学/搭" AI 系统（开发者/研究者视角）。论文、模型训练、Agent 框架代码、Prompt 工程教程。
3. **投资与金融市场** — 用户想"做投资决策"。个股估值、ETF、券商工具、宏观策略、上市公司财报分析。
4. **测试与面试** — 用户"在准备一场面试"。题库、攻略、面经、备考计划、模拟系统。
5. **编程与软件开发** — 用户"在学非 AI 技术"。编程语言、框架、性能、CS 课程、技术博客（CSDN/掘金/知乎技术专栏等）。
6. **半导体与硬科技** — 用户"在研究硬科技产业链"。芯片设备、半导体设备、人形机器人产业链、光通信光模块、新能源产业研报——看产业逻辑、看上下游、看技术路线。
7. **工具型入口** — 用户"打开就要办事"的服务。VPN、SMS、激活密钥、API Key 控制台、云服务管理后台（Cloudflare/AWS dashboard）、开发者后台。不是用来读的，是用来配置/操作的。
8. **招聘信息** — 用户"在找工作"。招聘公告、JD、Offer 比较、校招、人才博览会方案。
9. **个人创作与生活** — 用户"在消费个人化内容"。博客、随笔、旅行、影视、设计素材库、文化平台。
10. **其他** — 标题信息太少，无法判断意图（"公众号" 这种纯无后缀 / localhost / 乱码）。**极度严格**——只要能从标题或域名推断主题，就归对应类，不要塞这里。

边界判断的关键原则：
- 含 "AI / 机器人 / Token / Agent" 这种词不一定归 AI 类——看**用户的目的**
- 投研报告即使标的是 AI 公司也归 **投资** 或 **半导体硬科技**，不是 AI 类
- 云服务管理后台（即使含 AI 词）归 **工具型入口**，不是 AI 类
- 备考资料归 **测试与面试**，即使涉及 AI 岗位
- **上市公司年报 / 深度研究报告 + 标的是硬科技公司** → 半导体与硬科技（不是 invest，因为意图是看产业不是炒股）
- **市场情报机构 (TrendForce/IDC/Gartner)** → 投资与金融市场（市场数据用于交易决策），跟"产业链分析"(hardtech) 是两回事
- **开源 AI 项目 (ComfyUI/langfuse/Comfy-Org 这种 GitHub repo)** → AI 工程与论文（开发者视角阅读源码 / README）
- **开发者教程 / 在线学院课程 (Claude Code 橙皮书 / OpenAI 课程 / DeepLearning.AI)** → AI 工程与论文（学技术）
- **AI 产品拆解档案 / 产品分析研究** → AI 工程与论文（研究者视角研究产品如何做的）
- **轻量自部署开发工具 (qps-battle/小压测网站)** → 编程与软件开发（开发场景用的小工具，不是 utility 那种 "VPN/激活/支付"）

边界 case 示例（few-shot）：

- **「CBRS Stock Analysis: Cerebras IPO Investment Research Report」** → **半导体与硬科技**
  理由: 含 AI 词但意图是看半导体公司 IPO/投资分析，不是学 AI 技术
- **「Workers & Pages | Cloudflare」** → **工具型入口**
  理由: Cloudflare 管理后台，用户去配置 service，不是读教程
- **「贵州人才博览会｜岗位1001 网络安全预警与网络空间综合治理 · 7天备考计划」** → **测试与面试**
  理由: 备考计划 = 准备面试，不是看招聘信息
- **「贵州人才博览会引才工作方案」** → **招聘信息**
  理由: 招聘方案 = 看招聘信息，跟备考不同
- **「MetaGPT: The Multi-Agent Framework」** → **AI 工程与论文**
  理由: 开发者读 Agent 框架文档，是技术学习，归 AI 工程
- **「Claude AI 工程师面试攻略」** → **测试与面试**
  理由: 含 Claude/AI 但意图是准备面试
- **「人形机器人全产业链投研报告」** → **半导体与硬科技**
  理由: 产业链投研，看产业逻辑，不是 AI 应用也不是单纯投资
- **「华为昇腾芯片生态 · 深度投资研究报告 2026」** → **半导体与硬科技**
  理由: 虽然写"投资研究报告"，但标的是芯片产业生态，意图是看产业不是炒股
- **「Global Market Intelligence | TrendForce」** → **投资与金融市场**
  理由: 市场情报机构，数据用于交易决策，跟产业链分析不同
- **「Comfy-Org/ComfyUI: diffusion model GUI with graph/nodes interface」** → **AI 工程与论文**
  理由: 开源 AI 项目 GitHub repo，开发者视角看源码 / README
- **「真开源！Claude Code 75页橙皮书」** → **AI 工程与论文**
  理由: 开发者教程，学 Claude Code 编程，不是用 Claude 产品
- **「AI 产品拆解档案馆」** → **AI 工程与论文**
  理由: 研究 AI 产品如何做，是研究者视角，不是用产品

注意：
- 每条只选 1 个类别，必须从上面 10 个里选
- 返回时 i 必须从 0 到 ${items.length - 1} 每个出现且只出现一次
- 不要新建类别
- **必须包含 reason 字段（10-30 字简短说明判断理由）**——让你"先想清楚再选"，不是事后解释

返回 JSON 数组（i / label / reason 三字段）：[{"i":0,"label":"AI 应用与工具","reason":"AI 产品体验"}, ...]

收藏列表：
${list}

只返回 JSON 数组，不要其他文字。`

    // 30 条/batch · 每条 ~30 token output, max 2048 余量充足
    // temperature 0 让聚类确定性（同一收藏内容多次 recluster 得相同分类，回归测试可比）
    const { content: response, usage, finishReason } = await this.chat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 2048, temperature: 0 },
    )

    try {
      const stripped = response.trim()
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim()
      const fb = stripped.indexOf('[')
      const lb = stripped.lastIndexOf(']')
      let tightRaw = fb >= 0 && lb > fb ? stripped.slice(fb, lb + 1) : stripped
      // 修 AI 长输出时的「偷懒」格式：{"i":N,"VALUE"} → {"i":N,"label":"VALUE"}
      tightRaw = tightRaw.replace(/\{"i":(\d+),"([^"]+)"\}/g, '{"i":$1,"label":"$2"}')
      let p = recoverTruncatedJsonArray(tightRaw) as { i: number; label: string }[] | null
      if (!p && fb >= 0) {
        const lenient = stripped.slice(fb).replace(/\{"i":(\d+),"([^"]+)"\}/g, '{"i":$1,"label":"$2"}')
        p = recoverTruncatedJsonArray(lenient) as typeof p
      }
      if (!p) throw new Error('AI returned unparseable JSON')

      if (finishReason === 'length' || !response.trimEnd().endsWith(']')) {
        console.warn(`[Chord] AI L1 batch ${batchNum}/${totalBatches} appears truncated. finish_reason=%s usage=%o`, finishReason, usage)
      }
      return p
    } catch (e) {
      console.warn(`[Chord] AI L1 batch ${batchNum}/${totalBatches} parse failed:`, (e as Error).message, 'head=', response.slice(0, 200))
      throw new Error(`AI L1 batch ${batchNum}/${totalBatches} parse failed: ` + (e as Error).message)
    }
  }

  // 合并跨 batch 结果到 cluster 列表 · 互斥兜底 + 漏标兜底
  private assembleClusters(items: ClusterInput[], parsed: { i: number; label: string }[]): ClusterResult[] {
    // 把 (item, label) 对汇成 cluster；保留 L1_CATEGORIES 定义的顺序（让兴趣地形显示稳定）
    const itemsByLabel = new Map<string, ClusterInput[]>()
    const seenI = new Set<number>()
    for (const r of parsed) {
      if (seenI.has(r.i)) continue              // 互斥兜底：重复打标只保留第一次
      if (r.i < 0 || r.i >= items.length) continue
      seenI.add(r.i)
      // v1.1 · label normalize · 容忍 "AI 工程与论文" vs "AI工程与论文" 空格差异
      // 之前没 normalize 导致 ~5% 本来对的被假阴性误判
      const normalized = normalizeL1Label(r.label)
      const label = L1_NAME_SET.has(normalized) ? normalized : '其他'
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
