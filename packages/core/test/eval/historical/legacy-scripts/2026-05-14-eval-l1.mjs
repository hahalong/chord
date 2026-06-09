// L1 验证：用预定义大类做"N 选 1"分类，对比开放聚类
import { readFileSync, writeFileSync } from 'node:fs'

const EXPORT_PATH = process.argv[2] ?? '/Users/heyrain/Downloads/chord-export-2026-05-14.json'
const ENV = readFileSync('apps/extension/.env.local', 'utf8')
const KEY = ENV.match(/VITE_CHORD_BUNDLED_AI_KEY=(.+)/)[1].trim()
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-4-flash'

// ─── L1 类别定义（从评测中识别的真实骨架）────────────────
const L1_LABELS = [
  { id: 'ai_app', name: 'AI 应用与工具', desc: '面向用户的 AI 产品（ChatGPT/Claude/DeepSeek/Gemini、AI 生图、AI 视频、AI Agent 产品、AI SaaS）' },
  { id: 'ai_eng', name: 'AI 工程与论文', desc: '偏开发者技术（arXiv 论文、模型训练、MCP / Agent 框架、langfuse、AI Gateway、Agent Skills）' },
  { id: 'invest', name: '投资与金融市场', desc: '股票/外汇/加密货币、研报、估值分析、TradingView、ARK Invest、券商、Earnings' },
  { id: 'testing', name: '测试与面试', desc: 'QA 测试、面试题库、面试经验、测试经理面试、自动驾驶仿真测试' },
  { id: 'coding', name: '编程与软件开发', desc: '编程语言（Java/Solidity）、框架、性能优化、Kafka、RPC、DevOps、CI/CD、博客教程' },
  { id: 'hardtech', name: '半导体与硬科技', desc: '芯片产业研报、深科技公司（震裕、华为昇腾、人形机器人产业）' },
  { id: 'utility', name: '工具型入口', desc: '一次性工具站（VPN/翻墙、GitHub Proxy、SMS 验证、激活密钥、地址生成器）' },
  { id: 'job', name: '招聘信息', desc: '招聘公告、人才博览会方案、JD、职位详情' },
  { id: 'life', name: '个人创作与生活', desc: '个人博客、随笔、旅行清单、生活记录' },
  { id: 'misc', name: '其他', desc: '真正不属于上面任一类的零散收藏' },
]

const labelList = L1_LABELS.map((l, i) => `${i + 1}. **${l.name}** — ${l.desc}`).join('\n')

async function classifyBatch(items) {
  const list = items.map((it, idx) => `${idx}. ${it.title} (${it.domain})`).join('\n')

  const prompt = `你是分类助手。请把下面 ${items.length} 条收藏内容归到以下 10 个预定义类别中的**一个**。

⚠️ 关键约束：
- 每条只能选 1 个类别（多义内容选最主要的那个）
- 不要新建类别，必须从下面 10 个里选
- 返回时 i 必须从 0 到 ${items.length - 1} 每个出现且只出现一次

类别清单：
${labelList}

判断技巧：
- 「AI 应用与工具」≠「AI 工程与论文」：前者是产品（终端用户用的），后者是论文+工程（开发者用的）
- 「编程与软件开发」吸收一切讲技术细节的博客；「AI 工程与论文」只放 AI 相关
- 「工具型入口」专门容纳"用完即走"的网站（代理、SMS、激活）——不要把这些塞进编程或其他

返回 JSON 数组，格式：[{"i":0,"label":"AI 应用与工具"}, ...]

收藏列表：
${list}

只返回 JSON 数组，不要其他文字。`

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 4096, temperature: 0.2 }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const finishReason = data.choices?.[0]?.finish_reason
  const usage = data.usage
  console.log(`    finish=${finishReason} completion_tokens=${usage?.completion_tokens}`)

  let raw = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const firstBracket = raw.indexOf('[')
  const lastBracket = raw.lastIndexOf(']')
  const tight = firstBracket >= 0 && lastBracket > firstBracket ? raw.slice(firstBracket, lastBracket + 1) : raw
  let parsed
  try { parsed = JSON.parse(tight) }
  catch {
    const lastClose = tight.lastIndexOf('}')
    parsed = JSON.parse(tight.slice(0, lastClose + 1) + ']')
  }
  return parsed
}

// ─── 读数据 ────────────────────────────────────────────────
const data = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'))
const items = (data.items ?? []).filter((i) => i.type === 'content').map((i) => ({
  id: i.id,
  title: (i.title ?? '').slice(0, 80) || '(无标题)',
  domain: i.sourceDomain ?? '',
}))
console.log(`读到 ${items.length} 条 content items`)
console.log(`L1 类别数: ${L1_LABELS.length}`)

// ─── 单批分类（166 条没问题，因为输出小）────────────────
console.log('\n[1/1] L1 分类……')
const t0 = Date.now()
const results = await classifyBatch(items)
console.log(`  完成 ${Math.round((Date.now() - t0) / 1000)}s，返回 ${results.length} 条标注`)

// ─── 验证 & 兜底 ─────────────────────────────────────────
const validLabels = new Set(L1_LABELS.map((l) => l.name))
const itemToLabel = new Map()
let invalidCount = 0
for (const r of results) {
  if (!validLabels.has(r.label)) {
    invalidCount++
    continue
  }
  if (itemToLabel.has(r.i)) continue  // 重复 → 保留第一个
  if (r.i >= 0 && r.i < items.length) itemToLabel.set(r.i, r.label)
}
if (invalidCount > 0) console.log(`  ${invalidCount} 条 label 非法（不在 10 个预定义里）`)

const missingCount = items.length - itemToLabel.size
if (missingCount > 0) {
  console.log(`  漏标 ${missingCount} 条，归入「其他」兜底`)
  for (let i = 0; i < items.length; i++) {
    if (!itemToLabel.has(i)) itemToLabel.set(i, '其他')
  }
}

// 重复检测
const dupSet = new Set()
const allI = new Set()
for (const r of results) {
  if (allI.has(r.i)) dupSet.add(r.i)
  allI.add(r.i)
}
console.log(`  AI 重复打标: ${dupSet.size} 个 (raw ${results.length}, dedup ${itemToLabel.size})`)

// ─── 汇总 cluster ─────────────────────────────────────────
const clustersByName = new Map()
for (let i = 0; i < items.length; i++) {
  const label = itemToLabel.get(i)
  if (!clustersByName.has(label)) clustersByName.set(label, [])
  clustersByName.get(label).push(items[i])
}

const clusters = [...clustersByName.entries()].map(([name, items]) => ({ name, items }))
clusters.sort((a, b) => b.items.length - a.items.length)

// ─── 报告 ────────────────────────────────────────────────
const report = []
report.push('# Chord L1 分类评测报告（预定义大类方案）')
report.push(`\n生成时间: ${new Date().toISOString()}`)
report.push(`数据规模: ${items.length} content items`)
report.push(`L1 类别数: ${L1_LABELS.length}`)

const maxSize = Math.max(...clusters.map((c) => c.items.length))
const minSize = Math.min(...clusters.map((c) => c.items.length))
const others = clusters.find((c) => c.name === '其他')
const othersSize = others?.items.length ?? 0
report.push(`生成 cluster 数: ${clusters.length}`)
report.push(`最大: ${maxSize} (${((maxSize / items.length) * 100).toFixed(1)}%)`)
report.push(`最小: ${minSize}`)
report.push(`「其他」: ${othersSize} (${((othersSize / items.length) * 100).toFixed(1)}%)`)

report.push('\n## 客观指标对比（vs 开放聚类）\n')
report.push(`| 指标 | 开放聚类 | L1 分类 |`)
report.push(`|---|---|---|`)
report.push(`| AI 互斥违反 | 19% | ${((dupSet.size / items.length) * 100).toFixed(1)}% |`)
report.push(`| AI 漏标 | 15% | ${((missingCount / items.length) * 100).toFixed(1)}% |`)
report.push(`| 「其他」占比 | 45% (初始) | ${((othersSize / items.length) * 100).toFixed(1)}% |`)
report.push(`| 命名稳定性 | 每次不同 | 永远是这 10 个 |`)

report.push('\n## 各类别完整内容\n')
for (const c of clusters) {
  report.push(`### 「${c.name}」(${c.items.length} items)\n`)
  for (const it of c.items) {
    report.push(`- ${it.title}  \`${it.domain}\``)
  }
  report.push('')
}

const out = '/tmp/chord-l1-report.md'
writeFileSync(out, report.join('\n'))
console.log(`\n报告: ${out}`)

writeFileSync('/tmp/chord-l1-clusters.json', JSON.stringify({
  meta: { items: items.length, clusters: clusters.length, generatedAt: Date.now() },
  clusters: clusters.map((c) => ({ name: c.name, size: c.items.length, items: c.items })),
}, null, 2))
console.log(`JSON: /tmp/chord-l1-clusters.json`)
