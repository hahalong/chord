#!/usr/bin/env node
// 用 AI L1 分类的输出作为真实数据集 ground truth 的种子
// 用法：node seed-ground-truth.mjs
// 输出：test/eval/.local/ground-truth-seed.{json,md}（gitignored）
//   含每条 item 的 id + title + domain + AI 推荐标签
// 接下来需要人工逐条审查、修正错误标签，再通过 apply-ground-truth-corrections.mjs 生成 ground-truth-real.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const DATASET = process.env.CHORD_EVAL_REAL_DATASET ?? `${process.env.HOME}/chord-eval-data/private-dataset.json`
const LOCAL_DIR = resolve(__dirname, '.local')
if (!existsSync(LOCAL_DIR)) mkdirSync(LOCAL_DIR, { recursive: true })
const OUT_JSON = process.env.CHORD_SEED_OUT ?? resolve(LOCAL_DIR, 'ground-truth-seed.json')
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md')

const env = readFileSync(resolve(REPO_ROOT, 'apps/extension/.env.local'), 'utf8')
const KEY = env.match(/VITE_CHORD_BUNDLED_AI_KEY=(.+)/)[1].trim()

const L1_LIST = `
1. **AI 应用与工具** — 面向用户的 AI 产品（ChatGPT/Claude/DeepSeek/Gemini、AI 生图、AI 视频、AI Agent 产品、AI SaaS）
2. **AI 工程与论文** — 偏开发者技术（arXiv 论文、MCP / Agent 框架、langfuse、AI Gateway、Agent Skills、AI 教程课程）
3. **投资与金融市场** — 股票/外汇/加密货币、研报、估值分析、TradingView、ARK Invest、Earnings
4. **测试与面试** — QA 测试、面试题库、面试经验、测试经理面试、自动驾驶仿真测试
5. **编程与软件开发** — 编程语言（Java/Solidity）、框架、性能优化、Kafka、RPC、DevOps、博客教程
6. **半导体与硬科技** — 芯片产业研报、深科技公司（震裕、华为昇腾、人形机器人产业）
7. **工具型入口** — 一次性服务网站，不需要阅读就能用：VPN、激活、SMS 验证、地址生成器
8. **招聘信息** — 招聘公告、人才博览会、JD、求职 Offer 比较
9. **个人创作与生活** — 个人博客、随笔、旅行、生活记录、影视娱乐
10. **其他** — 真正不属于上面任一类
`.trim()

const data = JSON.parse(readFileSync(DATASET, 'utf8'))
const items = (data.items ?? []).filter((i) => i.type === 'content').map((i) => ({
  id: i.id, title: (i.title ?? '').slice(0, 80), domain: i.sourceDomain ?? '',
}))
console.log(`读到 ${items.length} 条`)

const list = items.map((it, i) => `${i}. ${it.title} (${it.domain})`).join('\n')
const prompt = `把下面 ${items.length} 条收藏归到以下 10 个预定义类别中的**一个**。
每条只能选 1 个；从 0 到 ${items.length - 1} 每个必须出现且只出现一次。

${L1_LIST}

返回 JSON：[{"i":0,"label":"AI 应用与工具"}, ...]

收藏列表：
${list}

只返回 JSON 数组。`

console.log('调用 AI……')
const t0 = Date.now()
const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model: 'glm-4-flash', messages: [{ role: 'user', content: prompt }], max_tokens: 8192, temperature: 0.2 }),
})
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
const r = await res.json()
const content = r.choices[0].message.content
console.log(`完成 ${Math.round((Date.now() - t0) / 1000)}s, completion_tokens=${r.usage?.completion_tokens}`)

let raw = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
const fb = raw.indexOf('['), lb = raw.lastIndexOf(']')
const tight = fb >= 0 && lb > fb ? raw.slice(fb, lb + 1) : raw
let parsed
try { parsed = JSON.parse(tight) }
catch {
  const lc = tight.lastIndexOf('}')
  parsed = JSON.parse(tight.slice(0, lc + 1) + ']')
}

// 输出 seed 结构：含 title + domain 方便人工审查；ground-truth-real.json 最终只保留 id + label
const seed = {
  version: '1.0',
  description: 'AI 推荐的 ground truth 种子。需要人工逐条审查、修正错误后保存为 ground-truth-real.json（只保留 itemId + label）',
  lastUpdated: new Date().toISOString().slice(0, 10),
  items: {},
}
const idToTitle = new Map(items.map((it) => [it.id, it]))
const aiByI = new Map(parsed.map((p) => [p.i, p.label]))

for (let i = 0; i < items.length; i++) {
  const it = items[i]
  const aiLabel = aiByI.get(i) ?? '其他'   // 漏标的归「其他」
  seed.items[it.id] = {
    label: aiLabel,
    confidence: 'ai-generated',     // 等人工审查后改成 high / medium / low
    title: it.title,                // 仅 seed 包含，方便审查
    domain: it.domain,
    notes: '',
  }
}

writeFileSync(OUT_JSON, JSON.stringify(seed, null, 2))
console.log(`\n种子写到 ${OUT_JSON}`)
console.log('下一步：人工审查每条标签，修正后通过 apply-ground-truth-corrections.mjs 应用 patch，生成 ground-truth-real.json')

// 顺手输出一份按 cluster 分组的可读 markdown，方便审查
const byLabel = new Map()
for (const [id, info] of Object.entries(seed.items)) {
  if (!byLabel.has(info.label)) byLabel.set(info.label, [])
  byLabel.get(info.label).push({ id, ...info })
}
const md = ['# Ground Truth 种子 (人工审查用)', '', `数据集: ${items.length} items`, '']
for (const [label, its] of [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length)) {
  md.push(`## ${label} (${its.length})`, '')
  for (const it of its) md.push(`- [\`${it.id}\`] ${it.title}  \`${it.domain}\``)
  md.push('')
}
writeFileSync(OUT_MD, md.join('\n'))
console.log('可读版: ' + OUT_MD)
