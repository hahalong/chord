// 评测脚本：用真实智谱 AI 在真实导出数据上跑聚类，输出可读报告
// 用法：node apps/extension/eval-clustering.mjs <export.json>
// 直接发 HTTP 请求，不依赖 TS 源（避免 ts/esm loader 麻烦）

import { readFileSync, writeFileSync } from 'node:fs'

const EXPORT_PATH = process.argv[2] ?? '/Users/heyrain/Downloads/chord-export-2026-05-14.json'
const ENV = readFileSync('apps/extension/.env.local', 'utf8')
const KEY = ENV.match(/VITE_CHORD_BUNDLED_AI_KEY=(.+)/)[1].trim()
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-4-flash'

// ─── 与 OpenAICompatibleEngine.cluster() 等价的逻辑（max_tokens=8192）
async function aiCluster(items) {
  const targetCount = Math.max(4, Math.min(20, Math.ceil(items.length / 12)))
  const list = items.map((i, idx) => `${idx + 1}. ${i.title}`).join('\n')

  const prompt = `你是一个内容分类助手。请将以下 ${items.length} 条收藏内容按主题分类，**建议 ${targetCount} 个类别左右**（按内容自然程度决定，多 1-2 个或少 1-2 个都行）。

⚠️ 互斥性（极重要）：每条内容**只能分到一个类别**。itemIndices 数组之间不能有重复数字。返回前请检查：从 0 到 ${items.length - 1} 每个数字必须出现且只出现一次。

核心要求：
- 按内容主题分类，不要按来源网站分类
- 同一网站的不同主题文章分到不同类别
- 不同网站讨论相同主题的文章分到同一类别

**主题名要求**（很重要）：
- 描述「内容是什么」，不是「单条标题里有什么词」
- 用 2-6 字中文具体描述（如「个人财务规划」而非「理财」，「字节面试经验」而非「ByteDance」）
- 禁止：用单一品牌名（如「Notion」「ByteDance」「Claude」）作为整个类别名——除非这个类别真的全是关于该品牌
- 禁止：用关键词拼接当名字（如「纹藏 · agi」「方法 · 教程」）

**类别内必须有共同主题**：
- 同一类别的内容要让人看一眼就理解为什么在一起
- 如果你发现一个类别里有 3 种以上不同主题的内容，请进一步拆分成多个类别

**「其他」类规则**：
- 难以归类的内容（很零散、跨主题、临时收藏）放入名为「其他」的类别
- 「其他」宁可多放，也不要让别的主题类被无关内容污染
- 不要把不相关的内容硬塞到某个主题里凑数

返回 JSON 格式：[{"name":"主题名","itemIndices":[0,1,2],"keywords":["关键词1","关键词2"]}]
itemIndices 从 0 开始

收藏列表：
${list}

只返回 JSON 数组，不要其他文字。`

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 8192, temperature: 0.7 }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = await res.json()
  const finishReason = data.choices?.[0]?.finish_reason
  const usage = data.usage
  const content = data.choices?.[0]?.message?.content ?? ''
  console.log(`    finish=${finishReason}, completion_tokens=${usage?.completion_tokens}`)

  let raw = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const firstBracket = raw.indexOf('[')
  const lastBracket = raw.lastIndexOf(']')
  const tight = firstBracket >= 0 && lastBracket > firstBracket ? raw.slice(firstBracket, lastBracket + 1) : raw
  let parsed
  try {
    parsed = JSON.parse(tight)
  } catch {
    // 截断兜底
    const lastClose = tight.lastIndexOf('}')
    if (lastClose < 0) throw new Error('unparseable')
    parsed = JSON.parse(tight.slice(0, lastClose + 1) + ']')
    console.log('    （兜底截断恢复）')
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('empty result')

  return parsed.map((g) => ({
    name: g.name,
    keywords: g.keywords ?? [],
    itemIds: (g.itemIndices ?? []).map((idx) => items[idx]?.id).filter(Boolean),
  })).filter((g) => g.itemIds.length > 0)
}

// ─── 读数据 ────────────────────────────────────────────────
const data = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'))
const items = (data.items ?? []).filter((i) => i.type === 'content')
console.log(`读到 ${items.length} 条 content items`)

// 标题超长截断，避免 GLM-4-Flash 8K 上下文撑爆
const inputs = items.map((i) => ({
  id: i.id,
  title: (i.title ?? '').slice(0, 80),
  domain: i.sourceDomain,
}))

const promptChars = inputs.reduce((s, i) => s + i.title.length, 0)
console.log(`prompt 估算: ${promptChars} 字符 (标题总长)`)

// 强制互斥：每个 item 只保留第一次出现的 cluster
function dedupItems(clusters) {
  const seen = new Set()
  const cleaned = []
  for (const c of clusters) {
    const uniqueIds = c.itemIds.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    if (uniqueIds.length > 0) cleaned.push({ ...c, itemIds: uniqueIds })
  }
  return cleaned
}

async function clusterWithBatching(items) {
  // 直接单批跑，靠 prompt 互斥要求 + 客户端 dedup 兜底
  console.log(`  单批 ${items.length} 条……`)
  const raw = await aiCluster(items)
  const cleaned = dedupItems(raw)
  // 报告 AI 互斥违反次数
  const aiTotal = raw.reduce((s, c) => s + c.itemIds.length, 0)
  const cleanedTotal = cleaned.reduce((s, c) => s + c.itemIds.length, 0)
  if (aiTotal !== cleanedTotal) {
    console.log(`  AI 输出有重复！raw 总数 ${aiTotal}, dedup 后 ${cleanedTotal}（去掉 ${aiTotal - cleanedTotal} 个重复）`)
  }
  // 检查覆盖率：原 items 是否都有归属
  const allIds = new Set(items.map((i) => i.id))
  const coveredIds = new Set(cleaned.flatMap((c) => c.itemIds))
  const missing = [...allIds].filter((id) => !coveredIds.has(id))
  if (missing.length > 0) {
    console.log(`  AI 漏掉了 ${missing.length} 条，归入「未分类」`)
    cleaned.push({ name: '未分类', keywords: [], itemIds: missing })
  }
  return cleaned
}

console.log(`\n[1/2] 智谱 GLM-4-Flash 聚类 ${inputs.length} 条……`)
const t0 = Date.now()
let results
try {
  results = await clusterWithBatching(inputs)
} catch (e) {
  console.error('❌ AI 聚类失败:', e.message)
  process.exit(1)
}
console.log(`  完成 ${Math.round((Date.now() - t0) / 1000)}s，得到 ${results.length} 个 cluster`)

// 第二遍：子聚类
const totalSize = results.reduce((s, r) => s + r.itemIds.length, 0)
const SUBCLUSTER_RATIO = 0.3
const SUBCLUSTER_MIN_SIZE = 20

console.log(`\n[2/2] 检查需要子聚类的 cluster……`)
const final = []
for (const r of results) {
  const ratio = r.itemIds.length / totalSize
  const isOthers = r.name.includes('其他') || r.name === '杂项'
  const tooBig = r.itemIds.length >= SUBCLUSTER_MIN_SIZE && (ratio > SUBCLUSTER_RATIO || isOthers)
  if (!tooBig) { final.push(r); continue }
  console.log(`  子聚类「${r.name}」(${r.itemIds.length} items)`)
  const subSet = new Set(r.itemIds)
  const subInputs = inputs.filter((i) => subSet.has(i.id))
  try {
    const subResults = await aiCluster(subInputs)
    if (subResults.length <= 1) { final.push(r); continue }
    if (isOthers) {
      for (const s of subResults) if (s.name === '其他') s.name = '其他·杂项'
    }
    final.push(...subResults)
  } catch (e) {
    console.warn(`    sub-cluster 失败: ${e.message}`)
    final.push(r)
  }
}

// ─── 评测 ─────────────────────────────────────────────────
const idToItem = new Map(items.map((i) => [i.id, i]))

const report = []
report.push('# Chord 聚类评测报告')
report.push(`\n生成时间: ${new Date().toISOString()}`)
report.push(`数据规模: ${items.length} content items`)
report.push(`生成 cluster 数: ${final.length}`)
const maxSize = Math.max(...final.map((c) => c.itemIds.length))
const minSize = Math.min(...final.map((c) => c.itemIds.length))
const othersCluster = final.find((c) => c.name.includes('其他') || c.name === '杂项')
const othersSize = othersCluster?.itemIds.length ?? 0
report.push(`最大 cluster: ${maxSize} items (${((maxSize / items.length) * 100).toFixed(1)}%)`)
report.push(`最小 cluster: ${minSize} items`)
report.push(`「其他」: ${othersSize} items (${((othersSize / items.length) * 100).toFixed(1)}%)`)

const checks = [
  { name: '没有 `·` 拼接名', pass: !final.some((c) => c.name.includes('·')), detail: final.filter((c) => c.name.includes('·')).map((c) => c.name).join(', ') },
  { name: '没有 junk drawer（最大 cluster < 25%）', pass: maxSize / items.length < 0.25, detail: `最大 ${maxSize}/${items.length} = ${((maxSize / items.length) * 100).toFixed(1)}%` },
  { name: '「其他」健康（< 15%）', pass: othersSize / items.length < 0.15, detail: `「其他」${othersSize}/${items.length} = ${((othersSize / items.length) * 100).toFixed(1)}%` },
  { name: '粒度合理（cluster 数在 5-25 之间）', pass: final.length >= 5 && final.length <= 25, detail: `${final.length} 个 cluster` },
  { name: '所有 cluster 都有内容', pass: final.every((c) => c.itemIds.length > 0), detail: `空 cluster: ${final.filter((c) => c.itemIds.length === 0).length}` },
]

report.push('\n## 客观指标')
for (const ch of checks) report.push(`- ${ch.pass ? '✓' : '✗'} ${ch.name} — ${ch.detail}`)

report.push('\n## 各 Cluster 内容（用于主观评测）\n')
final.sort((a, b) => b.itemIds.length - a.itemIds.length)
for (const c of final) {
  report.push(`### 「${c.name}」(${c.itemIds.length} items)`)
  report.push(`keywords: ${(c.keywords ?? []).join(', ')}`)
  const sampleSize = Math.min(c.itemIds.length, 15)
  report.push(`\n样本（前 ${sampleSize}）：`)
  for (const id of c.itemIds.slice(0, sampleSize)) {
    const it = idToItem.get(id)
    if (!it) continue
    report.push(`- ${it.title}  \`${it.sourceDomain}\``)
  }
  if (c.itemIds.length > sampleSize) report.push(`- ... 还有 ${c.itemIds.length - sampleSize} 条`)
  report.push('')
}

const out = '/tmp/chord-eval-report.md'
writeFileSync(out, report.join('\n'))
console.log(`\n报告已写入 ${out}`)
console.log(`\n=== 客观指标速览 ===`)
for (const ch of checks) console.log(`  ${ch.pass ? '✓' : '✗'} ${ch.name}`)

writeFileSync('/tmp/chord-eval-clusters.json', JSON.stringify({
  meta: { items: items.length, clusters: final.length, generatedAt: Date.now() },
  clusters: final.map((c) => ({
    name: c.name, keywords: c.keywords, size: c.itemIds.length,
    items: c.itemIds.map((id) => {
      const it = idToItem.get(id)
      return it ? { id, title: it.title, domain: it.sourceDomain } : { id }
    }),
  })),
}, null, 2))
console.log('JSON 已写入 /tmp/chord-eval-clusters.json')
