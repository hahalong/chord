#!/usr/bin/env node
// Chord 聚类评测主脚本
// 用法：
//   node run-eval.mjs synthetic        # 合成数据集 + 真实 AI
//   node run-eval.mjs real              # 真实数据集（~/chord-eval-data/private-dataset.json）+ 真实 AI
//
// 输出：eval-reports/YYYY-MM-DD-HHMM-<dataset>.md + .json
// 通过：与 baseline 对比，所有硬阈值通过 + 准确率不下降 > 2%

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── L1 类别（必须与 packages/core/src/ai/L1Categories.ts 保持一致）
// 这里 inline 是为了让 .mjs 不依赖 TS 编译；改了 L1Categories.ts 也要同步改这里
const L1_NAMES = [
  'AI 应用与工具', 'AI 工程与论文', '投资与金融市场', '测试与面试',
  '编程与软件开发', '半导体与硬科技', '工具型入口', '招聘信息',
  '个人创作与生活', '其他',
]

const L1_LIST_FORMATTED = `
1. **AI 应用与工具** — 面向终端用户的 AI 产品/网站/平台。包括 ChatGPT、Claude、DeepSeek、Gemini、文心一言、通义听悟、Sora、即梦AI、椒图AI、绘想、NemoVideo、ComfyUI、魔搭社区、GitHub Copilot、AI 工具导航站等。**关键：品牌没听过不是排除理由——任何含「AI / Agent / Bot / Chat / Assistant / Claw / Hub / Wild / MGX」等词的产品网站、AI 产品拆解档案、AI 导航站，即使品牌小众（如 OpenClaw / EasyClaw / WildAI / moltbook / MGX / 魔戒.net / OpenMAIC / AI or Not / ChatGPT Chatbot 这种），统统归这里，不要塞「其他」**。**反面：传统素材库 / 设计资源 / 文化平台不属于这里——「纹藏」(中国传统纹样素材库) 应归「个人创作与生活」，不是 ai_app 也不是 misc**
   例如：ChatGPT、即梦AI、椒图AI、通义听悟、文心一言、GitHub Copilot、魔搭社区、ComfyUI、Sora、OpenClaw、EasyClaw、WildAI、moltbook、MGX
2. **AI 工程与论文** — 面向开发者的 AI 技术内容。**全部归这里**：arXiv 论文、模型训练、MCP / Agent 框架（如 MetaGPT/OpenManus/langfuse/supergateway）、AI Gateway、Agent Skills、AI 工具文档（如 Browser Use Telemetry）、AI/ML/GenAI 学院课程（Coursera/DeepLearning.AI/NVIDIA DLI/速通手册）、AI 转型/学习指南（如「向吴恩达学 AI 转型」）、Claude Code 教程、Prompt 工程。**只要标题含「AI / LLM / Agent / Prompt / ML / GenAI / DeepLearning / MCP / 神经网络」中的任何一个，都不要归「其他」**
   例如：arXiv DeepSeek-R1、MCP servers、langfuse、MetaGPT、OpenManus、Browser Use Telemetry、Introduction to GenAI、Google AI Agents 白皮书、向吴恩达学 AI 转型、Claude Code 橙皮书
3. **投资与金融市场** — 股票/外汇/加密货币交易、个股估值分析、ETF 分析、券商工具、Earnings 跟踪、宏观投资策略。**注意：单纯的产业链/技术研报归 hardtech 不归这里**
   例如：TradingView、ARK Invest、MSTR 溢价、Intel 财报、QQQ 估值、美股开户
4. **测试与面试** — 用户**正在准备一场面试**而收藏的资料——任何岗位都算（AI 工程师、PM、QA、销售…）。包括面试题库、面试攻略、面经、Interview Guide、模拟系统、备战指南，以及 QA 测试技术本身
   例如：字节 QA Manager Interview Guide、AI 工程师面试攻略、测试经理面试备考手册、自动驾驶仿真测试面试备战、Interview Warmup、面试准备计划
5. **编程与软件开发** — 编程语言（Java/Solidity/Python）、框架、性能优化、Kafka、RPC、DevOps、CI/CD、CS 课程。**所有博客平台的技术文章一律归这里**：pdai.tech、blog.csdn.net、cnblogs.com、zhuanlan.zhihu.com、博客园、知乎等域名的技术内容。IM 机器人配置（飞书机器人/Telegram机器人）等开发集成也归这里
   例如：Java 全栈知识体系 pdai.tech、JMeter 压测平台 CSDN 博客、kafka 消息队列 博客园、手写 RPC 框架 CSDN、Java 开源项目 CSDN、Solidity 教程、The Missing Semester、飞书机器人配置
6. **半导体与硬科技** — **所有**芯片/半导体/硬科技产业链分析：芯片设备研报、半导体行业研究、AI 基础设施股票研报、人形机器人产业链、有色金属/新能源对比、深科技公司年报（震裕/华为昇腾等）。看到「研报」+ 内容是产业链/技术 → 这里，不是 invest
   例如：芯片设备板块研报、华为昇腾深度投资研究、人形机器人全产业链、震裕科技 300953 年报、AI 基础设施股票研报、半导体设备产业研报
7. **工具型入口** — **严格限定**：一次性"打开就办事"的服务网站。允许的类型：VPN/翻墙服务（如一元机场）、GitHub Proxy、SMS 验证码接收平台、激活密钥商店、地址生成器、API Key 控制台、开发者后台。**绝对不放**：任何博客（csdn.net/cnblogs.com/pdai.tech/zhuanlan.zhihu.com/博客园）、任何教程、任何文章、任何技术知识体系平台
   例如：一元机场 VPN、GitHub Proxy、SMS-Activate、PD 虚拟机激活、美国地址生成器、微信开发者平台、API Keys 控制台
8. **招聘信息** — **用户在主动找工作/看招聘信息**。包含：招聘公告 / JD / 职位详情 / Offer 比较 / 校招公告 / 人才博览会方案 / 求职经验讨论。判断核心：标题要直接指向「招聘 / Offer / JD / 校招 / 职位 / 招人」这类**求职动作**关键词。**只是提到公司名 ≠ 招聘**——「蔚来班车信息」「字节员工福利」「阿里年报」等都不是招聘类（公司名只是来源标识）。同时注意：**只放找工作相关，不放面试备考**——「Offer 值不值得」/「JD」/「招聘」/「校招」/「博览会」→ 这里；「面试备考」/「面试题库」/「面试备战」→ 测试与面试
   例如：贵州人才博览会引才方案、上海农商行 Fintech Offer 值不值得、牛客网 Offer 经验、CS 软件求职精华、字节校招公告、某公司 JD
9. **个人创作与生活** — 个人博客、随笔、旅行清单、生活记录、影视娱乐、**素材库 / 设计资源 / 文化平台**（如「纹藏」中国传统纹样素材库）、豆瓣电影 / 小红书 / 知乎个人内容 / Substack 个人 Newsletter 等。**关键：只要不是 AI 工具 / 编程教程 / 投资研报 / 招聘 这些功能性内容，偏个人 / 文化 / 生活类的全归这里，别塞 misc**
   例如：龙虾日记、世界旅行清单、此时此刻在线观看、纹藏（传统纹样素材库）、豆瓣电影 Top250、小红书日常分享、知乎个人随笔、Substack Letters
10. **其他** — **极度严格 + 默认逃逸口禁用**——只放标题里**完全没有任何可识别主题词、且无法从域名推断意图**的内容。允许的例子**仅限**：localhost dashboard / 192.168.x.x 内网设备 / 纯标题就一两个汉字（如「公众号」「小程序」无后续内容）/ 完全空白或乱码标题。**绝对不归这里的陷阱**：(1) 品牌没听过 ≠ misc——OpenClaw / WildAI / moltbook 这种小众 AI 产品归 AI 应用与工具；(2) 标题含 AI / Agent / Bot / Chat / Hub / Token / Key / 知识 / 教程 / 配置 / 工具 / 助手 / 平台 任一词，必须归对应类（哪怕只是「Personal Access Tokens」这种，也归 utility 不归 misc）；(3) 域名能透露身份的（如 hrwz.*.com 是 HR 招聘，*.ai 多半是 AI 工具）按域名归类
   例如：localhost dashboard、192.168.x.x、"公众号"（无后缀）、"小程序"（无后缀）
`.trim()

// ─── 配置 ─────────────────────────────────────────────
const MODE = process.argv[2] ?? 'synthetic'
const REPO_ROOT = resolve(__dirname, '../../../..')
const REAL_DATASET_PATH = process.env.CHORD_EVAL_REAL_DATASET ?? `${process.env.HOME}/chord-eval-data/private-dataset.json`
const REAL_LABELS_PATH = resolve(__dirname, 'ground-truth-real.json')
const SYN_DATASET_PATH = resolve(__dirname, 'synthetic-dataset.json')
const REPORTS_DIR = resolve(__dirname, 'eval-reports')
const BASELINE_PATH = resolve(REPORTS_DIR, 'baseline.json')

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

// AI key（从 apps/extension/.env.local 读，跟生产一致）
const ENV_PATH = resolve(REPO_ROOT, 'apps/extension/.env.local')
let AI_KEY = ''
if (existsSync(ENV_PATH)) {
  const env = readFileSync(ENV_PATH, 'utf8')
  AI_KEY = (env.match(/VITE_CHORD_BUNDLED_AI_KEY=(.+)/)?.[1] ?? '').trim()
}
if (!AI_KEY) {
  console.error('❌ 没找到 VITE_CHORD_BUNDLED_AI_KEY')
  process.exit(1)
}
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-4-flash'

// ─── AI 调用 ──────────────────────────────────────────
async function classifyL1(items) {
  // ⚠️ 此 prompt 必须与 packages/core/src/ai/OpenAICompatibleEngine.ts 的 cluster() 保持一致
  // 否则评测的不是生产代码行为
  const list = items.map((it, i) => `${i}. ${it.title} (${it.sourceDomain})`).join('\n')
  const prompt = `把下面 ${items.length} 条收藏归到以下 10 个预定义类别中的**一个**。

⚠️ 约束：
- 每条只能选 1 个类别（多义内容选最主要的那个）
- 不要新建类别，必须从下面 10 个里选
- 返回时 i 必须从 0 到 ${items.length - 1} 每个出现且只出现一次

类别清单：
${L1_LIST_FORMATTED}

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

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
    // CR-028 评测：temperature 0 保证确定性（同一 prompt 同一结果），max_tokens 8192 跟生产对齐
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 8192, temperature: 0 }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  let raw = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const fb = raw.indexOf('['); const lb = raw.lastIndexOf(']')
  let tight = fb >= 0 && lb > fb ? raw.slice(fb, lb + 1) : raw
  // 修 AI 长输出时的偷懒：{"i":N,"VALUE"} → {"i":N,"label":"VALUE"}（GLM 在 ~200 条以上时会自动省略 key）
  tight = tight.replace(/\{"i":(\d+),"([^"]+)"\}/g, '{"i":$1,"label":"$2"}')
  try { return JSON.parse(tight) }
  catch {
    const lc = tight.lastIndexOf('}')
    return JSON.parse(tight.slice(0, lc + 1) + ']')
  }
}

// ─── 加载数据集 ───────────────────────────────────────
function loadDataset(mode) {
  if (mode === 'synthetic') {
    const data = JSON.parse(readFileSync(SYN_DATASET_PATH, 'utf8'))
    return {
      items: data.items.map((i) => ({ id: i.id, title: i.title, sourceDomain: i.sourceDomain })),
      labels: Object.fromEntries(data.items.map((i) => [i.id, { label: i.label, confidence: i.labelConfidence ?? 'high' }])),
      name: 'synthetic',
    }
  }
  if (mode === 'real') {
    if (!existsSync(REAL_DATASET_PATH)) {
      console.error(`❌ 没找到真实数据集 ${REAL_DATASET_PATH}`)
      console.error('   请把 chord-export-YYYY-MM-DD.json 复制到 ~/chord-eval-data/private-dataset.json')
      process.exit(1)
    }
    const data = JSON.parse(readFileSync(REAL_DATASET_PATH, 'utf8'))
    const items = (data.items ?? []).filter((i) => i.type === 'content').map((i) => ({
      id: i.id, title: (i.title ?? '').slice(0, 80), sourceDomain: i.sourceDomain ?? '',
    }))
    let labels = {}
    if (existsSync(REAL_LABELS_PATH)) {
      const f = JSON.parse(readFileSync(REAL_LABELS_PATH, 'utf8'))
      labels = f.items ?? f  // 兼容 {items:{...}} 包装和扁平 {itemId:{...}}
    }
    return { items, labels, name: 'real' }
  }
  throw new Error(`未知 mode: ${mode}`)
}

// ─── 评测计算 ─────────────────────────────────────────
function evaluate(items, labels, aiResults) {
  const validLabels = new Set(L1_NAMES)
  const itemToAILabel = new Map()
  const dupIdx = new Set()
  const seenIdx = new Set()
  let invalidLabelCount = 0

  for (const r of aiResults) {
    if (seenIdx.has(r.i)) { dupIdx.add(r.i); continue }
    seenIdx.add(r.i)
    if (!validLabels.has(r.label)) { invalidLabelCount++; continue }
    if (r.i >= 0 && r.i < items.length) itemToAILabel.set(r.i, r.label)
  }

  const missingIdx = []
  for (let i = 0; i < items.length; i++) {
    if (!itemToAILabel.has(i)) {
      missingIdx.push(i)
      itemToAILabel.set(i, '其他')  // 兜底
    }
  }

  // 计算指标
  const total = items.length
  const dupCount = dupIdx.size
  const missCount = missingIdx.length

  // 准确率（只对有 ground truth 的算）
  let correct = 0, judged = 0
  const perClassStats = {}  // {label: {correct, total}}
  const errors = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const expected = labels[item.id]?.label
    const actual = itemToAILabel.get(i)
    if (!expected) continue
    judged++
    if (!perClassStats[expected]) perClassStats[expected] = { correct: 0, total: 0 }
    perClassStats[expected].total++
    if (actual === expected) {
      correct++
      perClassStats[expected].correct++
    } else {
      errors.push({ id: item.id, title: item.title, expected, actual, confidence: labels[item.id]?.confidence ?? 'high' })
    }
  }

  // 按 AI 输出聚合 cluster
  const clusters = new Map()
  for (let i = 0; i < items.length; i++) {
    const label = itemToAILabel.get(i)
    if (!clusters.has(label)) clusters.set(label, [])
    clusters.get(label).push(items[i])
  }
  const maxSize = Math.max(...[...clusters.values()].map((c) => c.length))
  const othersSize = clusters.get('其他')?.length ?? 0

  return {
    items: total,
    judgedItems: judged,
    correctItems: correct,
    accuracy: judged > 0 ? correct / judged : 0,
    coverage: 1,  // 永远是 1，因为我们兜底了
    mutexViolations: dupCount,
    mutexViolationRate: dupCount / total,
    missingFromAI: missCount,
    missingRate: missCount / total,
    invalidLabels: invalidLabelCount,
    clusterCount: clusters.size,
    maxClusterSize: maxSize,
    maxClusterRatio: maxSize / total,
    othersSize,
    othersRatio: othersSize / total,
    perClass: Object.entries(perClassStats).map(([label, { correct, total }]) => ({
      label, correct, total, accuracy: total > 0 ? correct / total : 0,
    })),
    clusters: [...clusters.entries()].map(([name, items]) => ({ name, size: items.length, items })),
    errors,
  }
}

// ─── 阈值检查 ─────────────────────────────────────────
function checkThresholds(m, baseline) {
  const checks = []
  checks.push({ name: '覆盖率 = 100%', pass: m.coverage === 1, val: m.coverage })
  checks.push({ name: '互斥违反 = 0', pass: m.mutexViolations === 0, val: m.mutexViolations })
  checks.push({ name: 'AI 漏标 < 5%', pass: m.missingRate < 0.05, val: m.missingRate })
  checks.push({ name: '「其他」占比 < 15%', pass: m.othersRatio < 0.15, val: m.othersRatio })
  checks.push({ name: '最大 cluster < 30%', pass: m.maxClusterRatio < 0.3, val: m.maxClusterRatio })
  if (baseline) {
    checks.push({
      name: `整体准确率 ≥ baseline(${(baseline.accuracy * 100).toFixed(1)}%) - 2%`,
      pass: m.accuracy >= baseline.accuracy - 0.02,
      val: m.accuracy,
    })
  }
  return checks
}

// ─── 主流程 ──────────────────────────────────────────
console.log(`\n=== Chord 聚类评测 [mode=${MODE}] ===\n`)

const ds = loadDataset(MODE)
console.log(`数据集: ${ds.name}, ${ds.items.length} items, ${Object.keys(ds.labels).length} 条有标注`)

if (Object.keys(ds.labels).length === 0) {
  console.error(`❌ ${ds.name} 数据集没有 ground truth 标注，无法计算准确率`)
  if (MODE === 'real') console.error(`   请创建 ${REAL_LABELS_PATH}`)
  process.exit(1)
}

console.log(`\n[1/1] 调用 AI 分类……`)
const t0 = Date.now()
let aiResults
try {
  aiResults = await classifyL1(ds.items)
} catch (e) {
  console.error(`❌ AI 调用失败: ${e.message}`)
  process.exit(1)
}
const elapsed = Math.round((Date.now() - t0) / 1000)
console.log(`  完成 ${elapsed}s，AI 返回 ${aiResults.length} 条`)

const metrics = evaluate(ds.items, ds.labels, aiResults)
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))[MODE] : null
const checks = checkThresholds(metrics, baseline)

// ─── 输出 ────────────────────────────────────────────
const allPass = checks.every((c) => c.pass)
const ts = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')

console.log('\n=== 客观指标 ===')
console.log(`  总数: ${metrics.items} (有标注: ${metrics.judgedItems})`)
console.log(`  整体准确率: ${(metrics.accuracy * 100).toFixed(1)}% (${metrics.correctItems}/${metrics.judgedItems})`)
console.log(`  互斥违反: ${metrics.mutexViolations}`)
console.log(`  AI 漏标: ${metrics.missingFromAI}`)
console.log(`  cluster 数: ${metrics.clusterCount}, 最大 ${metrics.maxClusterSize} (${(metrics.maxClusterRatio * 100).toFixed(1)}%)`)
console.log(`  「其他」: ${metrics.othersSize} (${(metrics.othersRatio * 100).toFixed(1)}%)`)

console.log('\n=== 阈值检查 ===')
for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)

console.log('\n=== 各 L1 类准确率 ===')
for (const p of metrics.perClass.sort((a, b) => b.total - a.total)) {
  console.log(`  ${p.label}: ${(p.accuracy * 100).toFixed(0)}% (${p.correct}/${p.total})`)
}

if (metrics.errors.length > 0) {
  console.log(`\n=== 错误样本（前 ${Math.min(10, metrics.errors.length)} 条）===`)
  for (const e of metrics.errors.slice(0, 10)) {
    console.log(`  [${e.expected}] → [${e.actual}]  ${e.title.slice(0, 60)}`)
  }
}

// 写报告
const reportPath = resolve(REPORTS_DIR, `${ts}-${MODE}.md`)
const report = [
  `# Chord 聚类评测报告`,
  ``,
  `- 时间: ${new Date().toISOString()}`,
  `- 数据集: ${ds.name} (${ds.items.length} items, ${ds.items.length - metrics.judgedItems} 条无标注)`,
  `- AI: 智谱 GLM-4-Flash, 耗时 ${elapsed}s`,
  `- 状态: ${allPass ? '✓ 通过' : '✗ 失败'}`,
  ``,
  `## 指标`,
  ``,
  `| 指标 | 本次 | ${baseline ? 'baseline' : ''} |`,
  `|---|---|---|`,
  `| 整体准确率 | ${(metrics.accuracy * 100).toFixed(1)}% | ${baseline ? `${(baseline.accuracy * 100).toFixed(1)}%` : '—'} |`,
  `| 互斥违反 | ${metrics.mutexViolations} | ${baseline?.mutexViolations ?? '—'} |`,
  `| AI 漏标率 | ${(metrics.missingRate * 100).toFixed(1)}% | ${baseline ? `${(baseline.missingRate * 100).toFixed(1)}%` : '—'} |`,
  `| 「其他」占比 | ${(metrics.othersRatio * 100).toFixed(1)}% | ${baseline ? `${(baseline.othersRatio * 100).toFixed(1)}%` : '—'} |`,
  `| 最大 cluster | ${metrics.maxClusterSize} (${(metrics.maxClusterRatio * 100).toFixed(1)}%) | — |`,
  ``,
  `## 各 L1 类准确率`,
  ``,
  `| 类别 | 准确率 | 数量 |`,
  `|---|---|---|`,
  ...metrics.perClass.sort((a, b) => b.total - a.total).map((p) =>
    `| ${p.label} | ${(p.accuracy * 100).toFixed(0)}% | ${p.correct}/${p.total} |`,
  ),
  ``,
  `## 错误样本 (${metrics.errors.length} 条)`,
  ``,
  ...metrics.errors.map((e) => `- **${e.expected} → ${e.actual}** (\`${e.confidence}\`): ${e.title}`),
].join('\n')
writeFileSync(reportPath, report)
console.log(`\n报告: ${reportPath}`)

// 更新 baseline——E-007 教训：只在「新最高」或显式 --update-baseline 时更新
// 之前 bug：每次通过 -2% 阈值就覆盖 → 多轮单向漂移 82.5 → 80.7 → 79 → ...
// 现在：默认只在准确率 ≥ 当前 baseline 时更新（即新最高）；用 --update-baseline 显式覆盖（如有意降低）
const FORCE_UPDATE = process.argv.includes('--update-baseline')
if (allPass) {
  const baselineFile = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {}
  const oldAcc = baselineFile[MODE]?.accuracy ?? 0
  const shouldUpdate = FORCE_UPDATE || metrics.accuracy >= oldAcc

  if (shouldUpdate) {
    baselineFile[MODE] = {
      accuracy: metrics.accuracy,
      mutexViolations: metrics.mutexViolations,
      missingRate: metrics.missingRate,
      othersRatio: metrics.othersRatio,
      maxClusterRatio: metrics.maxClusterRatio,
      perClassAccuracy: Object.fromEntries(metrics.perClass.map((p) => [p.label, p.accuracy])),
      updatedAt: new Date().toISOString(),
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(baselineFile, null, 2))
    console.log(`✓ baseline 已更新: ${oldAcc * 100 | 0}% → ${metrics.accuracy * 100 | 0}% (${FORCE_UPDATE ? '强制' : '新最高'})`)
  } else {
    console.log(`✓ 通过阈值但准确率 ${(metrics.accuracy * 100).toFixed(1)}% < baseline ${(oldAcc * 100).toFixed(1)}% → baseline 保留不变`)
    console.log(`  如果这是有意降低（如换模型/换数据集），加 --update-baseline 强制覆盖`)
  }
} else {
  console.log(`\n❌ 阈值未通过，baseline 未更新`)
  process.exit(1)
}
