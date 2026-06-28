#!/usr/bin/env node
/**
 * Chord 聚类评测 · intent-mode 实验版（v1.1 prep）
 *
 * 跟原 run-eval.mjs 并存——不动原 prompt，新方法验证"意图判断 + few-shot + reasoning"路线
 *
 * 设计差异：
 *   - 默认 provider: DeepSeek-V4-Pro（api.deepseek.com，含 thinking mode）— 比智谱 GLM-4-Flash 强一档
 *   - prompt: "理解保存意图" + 5 个边界 few-shot + 让模型输出 reasoning + label
 *   - 报告: eval-reports/<date>-real-intent.md
 *   - baseline: baseline-intent.json
 *
 * 用法：
 *   DEEPSEEK_API_KEY=sk-xxx pnpm eval:real:intent
 *
 * 可选 env:
 *   CHORD_EVAL_REAL_DATASET  - dataset 路径，默认 ~/chord-eval-data/private-dataset-v2.json
 *   INTENT_PROVIDER          - 'deepseek' | 'openai' | 'anthropic'，默认 deepseek
 *   INTENT_MODEL             - model id 覆盖默认
 *   INTENT_BATCH_SIZE        - 一次 batch 的 item 数，默认 30（DeepSeek 200K context 能塞更多，但 reasoning 输出多）
 *
 * 评测目标：跟 baseline.json 的 real.accuracy (82.5%) 对比，看意图 prompt + 强模型能不能突破上限
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── L1 类别（与 L1Categories.ts 保持一致，inline 防依赖 TS 编译）
const L1_NAMES = [
  'AI 应用与工具', 'AI 工程与论文', '投资与金融市场', '测试与面试',
  '编程与软件开发', '半导体与硬科技', '工具型入口', '招聘信息',
  '个人创作与生活', '其他',
]
const L1_NAME_SET = new Set(L1_NAMES)

// ─── intent-mode prompt · 完全不写关键词规则, 让模型理解每条 item 的"保存意图" ───
// Few-shot 例子用历史 BC 库 + BC-014 边界 case
const INTENT_PROMPT_HEAD = `把下面收藏归到 10 个预定义类别中的一个。请按"用户保存这条时的真实意图"来判断, 不要被标题里的关键词带偏。

类别定义（按意图描述, 不按关键词）:

1. **AI 应用与工具** — 用户想"用"一个 AI 产品（终端体验者视角）。ChatGPT、Claude.ai、即梦、椒图、ComfyUI 这种网站/应用。
2. **AI 工程与论文** — 用户想"学/搭" AI 系统（开发者/研究者视角）。论文、模型训练、Agent 框架代码、Prompt 工程教程。
3. **投资与金融市场** — 用户想"做投资决策"。个股估值、ETF、券商工具、宏观策略、上市公司财报分析。
4. **测试与面试** — 用户"在准备一场面试"。题库、攻略、面经、备考计划、模拟系统。
5. **编程与软件开发** — 用户"在学非 AI 技术"。编程语言、框架、性能、CS 课程、技术博客（CSDN/掘金/知乎技术专栏等）。
6. **半导体与硬科技** — 用户"在研究硬科技产业链"。芯片设备、半导体设备、人形机器人产业链、光通信光模块、新能源产业研报——看产业逻辑、看上下游、看技术路线。
7. **工具型入口** — 用户"打开就要办事"的服务。VPN、SMS、激活密钥、API Key 控制台、云服务管理后台（Cloudflare/AWS dashboard）、开发者后台。不是用来读的，是用来配置/操作的。
8. **招聘信息** — 用户"在找工作"。招聘公告、JD、Offer 比较、校招、人才博览会方案。
9. **个人创作与生活** — 用户"在消费个人化内容"。博客、随笔、旅行、影视、设计素材库、文化平台。
10. **其他** — 标题信息太少, 无法判断意图（"公众号" 这种纯无后缀 / localhost / 乱码）。**极度严格**——只要能从标题或域名推断主题, 就归对应类, 不要塞这里。

边界判断的关键原则:
- 含 "AI / 机器人 / Token / Agent" 这种词不一定归 AI 类——看**用户的目的**
- 投研报告即使标的是 AI 公司也归 **投资** 或 **半导体硬科技**, 不是 AI 类
- 云服务管理后台（即使含 AI 词）归 **工具型入口**, 不是 AI 类
- 备考资料归 **测试与面试**, 即使涉及 AI 岗位
- **上市公司年报 / 深度研究报告 + 标的是硬科技公司** → 半导体与硬科技（不是 invest, 因为意图是看产业不是炒股）
- **市场情报机构 (TrendForce/IDC/Gartner)** → 投资与金融市场（市场数据用于交易决策）, 跟"产业链分析"(hardtech) 是两回事
- **开源 AI 项目 (ComfyUI/langfuse/Comfy-Org 这种 GitHub repo)** → AI 工程与论文（开发者视角阅读源码 / README）
- **开发者教程 / 在线学院课程 (Claude Code 橙皮书 / OpenAI 课程 / DeepLearning.AI)** → AI 工程与论文（学技术）
- **AI 产品拆解档案 / 产品分析研究** → AI 工程与论文（研究者视角研究产品如何做的）
- **轻量自部署开发工具 (qps-battle/小压测网站)** → 编程与软件开发（开发场景用的小工具, 不是 utility 那种 "VPN/激活/支付"）

边界 case 示例（few-shot）:

- **「CBRS Stock Analysis: Cerebras IPO Investment Research Report」** → **半导体与硬科技**
  理由: 含 AI 词但意图是看半导体公司 IPO/投资分析, 不是学 AI 技术

- **「Workers & Pages | Cloudflare」** → **工具型入口**
  理由: Cloudflare 管理后台, 用户去配置 service, 不是读教程

- **「贵州人才博览会｜岗位1001 网络安全预警与网络空间综合治理 · 7天备考计划」** → **测试与面试**
  理由: 备考计划 = 准备面试, 不是看招聘信息

- **「贵州人才博览会引才工作方案」** → **招聘信息**
  理由: 招聘方案 = 看招聘信息, 跟备考不同

- **「MetaGPT: The Multi-Agent Framework」** → **AI 工程与论文**
  理由: 开发者读 Agent 框架文档, 是技术学习, 归 AI 工程

- **「Claude AI 工程师面试攻略」** → **测试与面试**
  理由: 含 Claude/AI 但意图是准备面试

- **「人形机器人全产业链投研报告」** → **半导体与硬科技**
  理由: 产业链投研, 看产业逻辑, 不是 AI 应用也不是单纯投资

- **「华为昇腾芯片生态 · 深度投资研究报告 2026」** → **半导体与硬科技**
  理由: 虽然写"投资研究报告", 但标的是芯片产业生态, 意图是看产业不是炒股

- **「震裕科技（300953）2025年报深度分析」** → **半导体与硬科技**
  理由: 上市公司年报 + 是硬科技公司 → 看产业不是看股价

- **「Global Market Intelligence | TrendForce」** → **投资与金融市场**
  理由: 市场情报机构, 数据用于交易决策, 跟产业链分析不同

- **「Comfy-Org/ComfyUI: diffusion model GUI with graph/nodes interface」** → **AI 工程与论文**
  理由: 开源 AI 项目 GitHub repo, 开发者视角看源码 / README

- **「真开源！Claude Code 75页橙皮书」** → **AI 工程与论文**
  理由: 开发者教程, 学 Claude Code 编程, 不是用 Claude 产品

- **「Introduction to GenAI and ML 2025 Fall」** → **AI 工程与论文**
  理由: AI/ML 学院课程, 学技术, 归 AI 工程

- **「AI 产品拆解档案馆 · The Teardown Archive」** → **AI 工程与论文**
  理由: 研究 AI 产品如何做, 是研究者视角, 不是用产品

- **「qps-battle Railway 部署的压测工具」** → **编程与软件开发**
  理由: 自部署的开发场景小工具, 不是 VPN/激活那种 utility

返回 JSON 数组, 每条包含 i、label、reason 三个字段:
[{"i":0,"label":"半导体与硬科技","reason":"投研报告标的是半导体公司"}, ...]

注意:
- 每条只选 1 个类别, 必须从上面 10 个里选
- 返回时 i 必须从 0 到 N-1 每个出现且只出现一次
- reason 简短（10-30 字）, 用于事后回看判断对错的依据
- 不要新建类别

`

// ─── 配置 ─────────────────────────────────────────────
const REPO_ROOT = resolve(__dirname, '../../../..')
const DEFAULT_DATASET = `${process.env.HOME}/chord-eval-data/private-dataset-v2.json`
const REAL_DATASET_PATH = process.env.CHORD_EVAL_REAL_DATASET ?? DEFAULT_DATASET
const REAL_LABELS_PATH = resolve(__dirname, 'ground-truth-real.json')
const REPORTS_DIR = resolve(__dirname, 'eval-reports')
const BASELINE_PATH = resolve(REPORTS_DIR, 'baseline-intent.json')

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

const PROVIDER = process.env.INTENT_PROVIDER ?? 'deepseek'
const BATCH_SIZE = parseInt(process.env.INTENT_BATCH_SIZE ?? '30', 10)

const PROVIDERS = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    // v4-pro $0.435/M in $0.87/M out (含 thinking mode)；v4-flash $0.14/$0.28 便宜版
    // 实验目的: 验证意图判断+强模型能不能突破 82.5% 上限——先用最强看天花板
    model: process.env.INTENT_MODEL ?? 'deepseek-v4-pro',
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  zhipu: {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    // 智谱最新: GLM-4.7 (强收费) / GLM-4.7-Flash (免费) / GLM-4.7-FlashX
    // 跟方案 2 公平对比, 选 glm-4.7
    model: process.env.INTENT_MODEL ?? 'glm-4.7',
    keyEnv: 'ZHIPU_API_KEY',
    // fallback: bundled key 是智谱账号同一把, 能调付费模型
    fallbackEnv: 'VITE_CHORD_BUNDLED_AI_KEY',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: process.env.INTENT_MODEL ?? 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: process.env.INTENT_MODEL ?? 'claude-haiku-4-5',
    keyEnv: 'ANTHROPIC_API_KEY',
  },
}

const cfg = PROVIDERS[PROVIDER]
if (!cfg) { console.error(`❌ 未知 provider: ${PROVIDER}`); process.exit(1) }

// v0.1.4 · 优先 env, fallback 从 .env.local 读
let API_KEY = process.env[cfg.keyEnv]
if (!API_KEY && cfg.fallbackEnv) {
  const envPath = resolve(REPO_ROOT, 'apps/extension/.env.local')
  if (existsSync(envPath)) {
    const envFile = readFileSync(envPath, 'utf8')
    const m = envFile.match(new RegExp(`${cfg.fallbackEnv}=(.+)`))
    if (m) {
      API_KEY = m[1].trim()
      console.log(`ℹ️ ${cfg.keyEnv} 未设, 已从 .env.local 读 ${cfg.fallbackEnv} 作为 fallback`)
    }
  }
}
if (!API_KEY) {
  console.error(`❌ 没找到 ${cfg.keyEnv} env`)
  console.error(`   用法: ${cfg.keyEnv}=sk-xxx pnpm eval:real:intent`)
  if (cfg.fallbackEnv) console.error(`   或在 apps/extension/.env.local 配 ${cfg.fallbackEnv}=...`)
  process.exit(1)
}

// ─── AI 调用 ──────────────────────────────────────────
async function classifyL1Intent(items) {
  const list = items.map((it, i) => `${i}. ${it.title} (${it.sourceDomain ?? ''})`).join('\n')
  const prompt = INTENT_PROMPT_HEAD + '\n收藏列表:\n' + list + '\n\n只返回 JSON 数组, 不要其他文字。'

  let body, headers
  if (PROVIDER === 'anthropic') {
    headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }
    body = JSON.stringify({ model: cfg.model, max_tokens: 8192, messages: [{ role: 'user', content: prompt }] })
  } else {
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }
    // v4-pro 默认 thinking mode, max_tokens 给大点防止 reasoning 占太多导致 JSON 被截断
    body = JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], max_tokens: 16384, temperature: 0 })
  }

  const res = await fetch(cfg.endpoint, { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const content = PROVIDER === 'anthropic'
    ? (data.content?.[0]?.text ?? '')
    : (data.choices?.[0]?.message?.content ?? '')

  let raw = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const fb = raw.indexOf('[')
  const lb = raw.lastIndexOf(']')
  let tight = fb >= 0 && lb > fb ? raw.slice(fb, lb + 1) : raw
  let parsed
  try { parsed = JSON.parse(tight) }
  catch (e) {
    const lc = tight.lastIndexOf('}')
    parsed = JSON.parse(tight.slice(0, lc + 1) + ']')
  }
  // v0.1.4 · 把 AI 返回的 label normalize 回标准 L1 名（容忍空格 / 大小写差异）
  // bug: 模型有时返回 "AI工程与论文"（无空格）, ground truth 是 "AI 工程与论文"（有空格） → 被判错
  return parsed.map((r) => ({ ...r, label: normalizeLabel(r.label) }))
}

function normalizeLabel(label) {
  if (!label) return label
  // 精确匹配 → 原样
  if (L1_NAME_SET.has(label)) return label
  // 去空格匹配
  const stripped = label.replace(/\s+/g, '')
  for (const n of L1_NAMES) {
    if (n.replace(/\s+/g, '') === stripped) return n
  }
  return label  // 无法 normalize 就返回原样, 评测会判错（合理）
}

// ─── 加载数据集 ───────────────────────────────────────
function loadDataset() {
  if (!existsSync(REAL_DATASET_PATH)) {
    console.error(`❌ 没找到数据集 ${REAL_DATASET_PATH}`)
    console.error(`   先跑 chord:inspect --export 导出当前 storage`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(REAL_DATASET_PATH, 'utf8'))
  const rawItems = data.items || data
  const items = (Array.isArray(rawItems) ? rawItems : Object.values(rawItems))
    .filter((i) => i.type === 'content' && i.title)
  const gt = JSON.parse(readFileSync(REAL_LABELS_PATH, 'utf8'))
  return { items, labels: gt.items, name: 'real' }
}

// ─── 评测主流程 ───────────────────────────────────────
async function main() {
  console.log(`═══ Chord intent-mode eval ═══`)
  console.log(`  provider: ${PROVIDER} · model: ${cfg.model}`)
  console.log(`  dataset:  ${REAL_DATASET_PATH}`)
  console.log(`  batch:    ${BATCH_SIZE}`)
  if (PROVIDER === 'deepseek' && cfg.model.includes('v4-pro')) {
    console.log(`  💰 估算: ~200 条 / ${BATCH_SIZE} batch ≈ 7 次 API call · v4-pro ~$0.02 / 跑一次`)
  } else if (PROVIDER === 'deepseek' && cfg.model.includes('v4-flash')) {
    console.log(`  💰 估算: ~200 条 / ${BATCH_SIZE} batch ≈ 7 次 API call · v4-flash ~$0.007 / 跑一次`)
  }
  console.log()

  const ds = loadDataset()
  console.log(`数据集 ${ds.items.length} 条 · ground truth ${Object.keys(ds.labels).length} 条`)

  const batches = []
  for (let i = 0; i < ds.items.length; i += BATCH_SIZE) {
    batches.push(ds.items.slice(i, i + BATCH_SIZE))
  }

  const allResults = []
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const start = Date.now()
    console.log(`[${bi + 1}/${batches.length}] 调 AI 分类 ${batch.length} 条 ...`)
    try {
      const result = await classifyL1Intent(batch)
      const elapsed = Math.round((Date.now() - start) / 1000)
      console.log(`  完成 ${elapsed}s, AI 返回 ${result.length} 条`)
      for (let i = 0; i < batch.length; i++) {
        const r = result.find((x) => x.i === i)
        allResults.push({
          item: batch[i],
          label: r?.label ?? null,
          reason: r?.reason ?? null,
        })
      }
    } catch (e) {
      console.error(`  ❌ batch ${bi + 1} 失败:`, e.message)
      for (const it of batch) allResults.push({ item: it, label: null, reason: 'batch failed' })
    }
  }

  // ─── 算指标 ──────────────────────────────────────────
  const withGT = allResults.filter((r) => ds.labels[r.item.id])
  const correct = withGT.filter((r) => r.label === ds.labels[r.item.id]?.label)
  const acc = withGT.length > 0 ? correct.length / withGT.length : 0
  const labelDist = {}
  for (const r of allResults) {
    if (!r.label) continue
    labelDist[r.label] = (labelDist[r.label] ?? 0) + 1
  }
  const mostCommon = Object.entries(labelDist).sort((a, b) => b[1] - a[1])[0]
  const othersCount = labelDist['其他'] ?? 0
  const totalLabeled = allResults.filter((r) => r.label).length
  const missingRate = allResults.filter((r) => !r.label).length / allResults.length
  const mutexViolations = allResults.filter((r) => r.label && !L1_NAME_SET.has(r.label)).length

  console.log()
  console.log('=== 客观指标 ===')
  console.log(`  总数: ${allResults.length} (有标注: ${withGT.length})`)
  console.log(`  整体准确率: ${(acc * 100).toFixed(1)}% (${correct.length}/${withGT.length})`)
  console.log(`  互斥违反: ${mutexViolations}`)
  console.log(`  AI 漏标: ${(missingRate * 100).toFixed(1)}%`)
  console.log(`  最大类: ${mostCommon?.[0] ?? 'N/A'} ${mostCommon?.[1] ?? 0} (${totalLabeled > 0 ? (mostCommon?.[1] / totalLabeled * 100).toFixed(1) : 0}%)`)
  console.log(`  「其他」: ${othersCount} (${totalLabeled > 0 ? (othersCount / totalLabeled * 100).toFixed(1) : 0}%)`)

  // ─── 跟 baseline 对比 ────────────────────────────────
  let baseline = null
  if (existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    console.log()
    console.log('=== 跟 baseline-intent 对比 ===')
    const prev = baseline.accuracy ?? 0
    const diff = (acc - prev) * 100
    console.log(`  之前: ${(prev * 100).toFixed(1)}%`)
    console.log(`  现在: ${(acc * 100).toFixed(1)}%`)
    console.log(`  变化: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`)
  }

  // ─── 跟原 run-eval baseline 对比（智谱 + 硬规则）────
  const rulesBaselinePath = resolve(REPORTS_DIR, 'baseline.json')
  if (existsSync(rulesBaselinePath)) {
    const rb = JSON.parse(readFileSync(rulesBaselinePath, 'utf8'))
    const rbAcc = rb.real?.accuracy ?? 0
    const diff = (acc - rbAcc) * 100
    console.log()
    console.log('=== 跟原 baseline 对比（智谱 + 硬规则）===')
    console.log(`  原版准确率: ${(rbAcc * 100).toFixed(1)}%`)
    console.log(`  intent-mode: ${(acc * 100).toFixed(1)}%`)
    console.log(`  差距: ${diff > 0 ? '✅ +' : '⚠️ '}${diff.toFixed(1)}%`)
  }

  // ─── 错误样本 ────────────────────────────────────────
  const errors = withGT.filter((r) => r.label !== ds.labels[r.item.id]?.label)
  console.log()
  console.log(`=== 错误样本（前 15 条 · 含 AI 的 reasoning）===`)
  for (const e of errors.slice(0, 15)) {
    const gtLabel = ds.labels[e.item.id]?.label
    console.log(`  [应=${gtLabel} → AI=${e.label}] ${e.item.title.slice(0, 60)}`)
    if (e.reason) console.log(`    AI 理由: ${e.reason.slice(0, 80)}`)
  }

  // ─── 写报告 + baseline ────────────────────────────────
  const now = new Date()
  const ts = now.toISOString().replace(/[:-]/g, '').slice(0, 13)
  const reportPath = resolve(REPORTS_DIR, `${ts}-real-intent.md`)
  const reportLines = [
    `# Chord intent-mode eval · ${now.toISOString().slice(0, 16)}`,
    ``,
    `- provider: \`${PROVIDER}\` · model: \`${cfg.model}\``,
    `- dataset: \`${REAL_DATASET_PATH}\``,
    `- ground truth: \`${REAL_LABELS_PATH}\``,
    ``,
    `## 客观指标`,
    `- 总数: ${allResults.length} (有标注: ${withGT.length})`,
    `- **整体准确率: ${(acc * 100).toFixed(1)}%** (${correct.length}/${withGT.length})`,
    `- 互斥违反: ${mutexViolations}`,
    `- AI 漏标: ${(missingRate * 100).toFixed(1)}%`,
    `- 最大类: ${mostCommon?.[0]} ${mostCommon?.[1]}`,
    `- 「其他」占比: ${(othersCount / Math.max(1, totalLabeled) * 100).toFixed(1)}%`,
    ``,
    `## 各类分布`,
    `| L1 类别 | 数量 | 占比 |`,
    `| --- | --- | --- |`,
    ...Object.entries(labelDist).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      `| ${k} | ${v} | ${(v / totalLabeled * 100).toFixed(1)}% |`),
    ``,
    `## 错误样本 (${errors.length} 条)`,
    ...errors.map((e) => {
      const gtLabel = ds.labels[e.item.id]?.label
      const lines = [`- **应=${gtLabel} → AI=${e.label}**: ${e.item.title}`]
      if (e.reason) lines.push(`  - AI 理由: ${e.reason}`)
      return lines.join('\n')
    }),
  ]
  writeFileSync(reportPath, reportLines.join('\n'))
  console.log()
  console.log(`报告: ${reportPath}`)

  // baseline-intent 持平最高才更新
  const FORCE = process.argv.includes('--update-baseline')
  if (FORCE || !baseline || acc >= (baseline.accuracy ?? 0)) {
    writeFileSync(BASELINE_PATH, JSON.stringify({
      accuracy: acc,
      provider: PROVIDER,
      model: cfg.model,
      missingRate,
      othersRatio: othersCount / Math.max(1, totalLabeled),
      maxClusterRatio: (mostCommon?.[1] ?? 0) / Math.max(1, totalLabeled),
      mutexViolations,
      updatedAt: now.toISOString(),
      datasetPath: REAL_DATASET_PATH,
    }, null, 2))
    console.log(`✅ baseline-intent 已更新: ${((baseline?.accuracy ?? 0) * 100).toFixed(1)}% → ${(acc * 100).toFixed(1)}%`)
  } else {
    console.log(`ℹ️ baseline-intent 未更新（accuracy ${(acc * 100).toFixed(1)}% < 历史 ${((baseline?.accuracy ?? 0) * 100).toFixed(1)}%）`)
    console.log(`   强制覆盖加 --update-baseline 参数`)
  }
}

main().catch((e) => {
  console.error('❌ eval 失败:', e)
  process.exit(1)
})
