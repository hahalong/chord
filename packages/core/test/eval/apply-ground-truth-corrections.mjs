#!/usr/bin/env node
// 把 seed-ground-truth.mjs 产出的 AI 推荐标签作为起点，套用人工修正 patch，
// 生成最终的 packages/core/test/eval/ground-truth-real.json
//
// 人工修正基于 2026-05-14 那次评测里识别出的错误。
// 后续如果数据集变更或发现新错误，往 CORRECTIONS 加条目并重跑此脚本。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 默认读 .local/ 下 seed-ground-truth.mjs 的产物；可用环境变量覆盖
const SEED = process.env.CHORD_SEED_IN ?? resolve(__dirname, '.local/ground-truth-seed.json')
const OUT = resolve(__dirname, 'ground-truth-real.json')

if (!existsSync(SEED)) {
  console.error(`❌ 没找到 seed 文件: ${SEED}`)
  console.error('   先跑 seed-ground-truth.mjs 生成；或用 CHORD_SEED_IN=<path> 指定其他路径')
  process.exit(1)
}

// 人工修正表：itemId → 正确 label
// 编码我在 .local/ground-truth-seed.md 上看到的错误（首次产生于 /tmp/ground-truth-seed.md，已归档到 historical/2026-05-14-ground-truth-seed.md）
const CORRECTIONS = {
  // ─── AI 给了"AI 应用与工具"但应该归别处的 ───
  'JKbQA_wCS1Yvpl2fDsUyM': { label: '其他',           notes: '紫光云 course，主题不明' },
  'OoU_2NBTvpK2vBm1XHZwq': { label: '其他',           notes: '"公众号" 标题信息太少' },
  'QL-mwmKKQF_PwMCetZniI': { label: '编程与软件开发',   notes: '飞书机器人配置 = IM 集成开发' },
  '3sU3AvJ4K9GM-0sWsyqrD': { label: '编程与软件开发',   notes: 'Telegram 机器人配置 = IM 集成开发' },
  'MhzdNYg-cjq68LIljCaHr': { label: '工具型入口',       notes: '飞书开发者后台 = 工具入口' },
  'W0rBTyXWPqraTkn5j0tDO': { label: '其他',           notes: '飞书云文档扫盲，主题不明' },
  '_hbGUERsHiF4TCbV6EdcK': { label: '个人创作与生活',   notes: '纹藏 wenzang.cn 是传统纹样素材库' },
  'jsXR8MX8M9INMVWhfwvAq': { label: '其他',           notes: '"公众号" 信息不明' },
  'MBFf9gqKb6c1apD0_LHER': { label: '个人创作与生活',   notes: '在线看影视' },

  // ─── AI 给了"投资与金融市场"但应该归"半导体与硬科技"（产业研究）───
  'EhNZcA3YRjapTVfo_hgbF': { label: '半导体与硬科技',   notes: '半导体设备产业研报' },
  'oQTlfNkB_ovTykpWZecGA': { label: '半导体与硬科技',   notes: '芯片设备研报' },
  'KOTym28pE1PZyoxsNB7mb': { label: '半导体与硬科技',   notes: '芯片设备研报（重复）' },
  'We7zqmoPHhpxOn98_fh5P': { label: '半导体与硬科技',   notes: '震裕科技年报，半导体产业链', confidence: 'medium' },
  'U-MY2PV35NLWWdvcEyapy': { label: '半导体与硬科技',   notes: '华为昇腾生态' },
  'NRis7HTmO_VMMm9n3oRJq': { label: '半导体与硬科技',   notes: 'AI 基础设施股票，归硬科技', confidence: 'medium' },
  '2xEMw0oyylaZziSuh6sj5': { label: '半导体与硬科技',   notes: '人形机器人产业链' },

  // ─── AI 给了"投资"但应该归别处 ───
  '-WZR1KgbcfkVvIsVJwulM': { label: '招聘信息',         notes: '上海农商行 Offer 比较' },
  'lrmh5_5DocAvci7N-Zvyk': { label: 'AI 工程与论文',    notes: 'Browser Use 文档' },
  'ZlintofqLl4AUFaElLIr5': { label: '其他',           notes: '贵阳非遗调研报告，非金融投资' },
  'YL0kMg-qykMWReOa1uCU6': { label: '其他',           notes: '"重要内容汇总" 信息不明', confidence: 'low' },

  // ─── AI 给了"AI 工程与论文"但应该归"编程"───
  'VwJKYURUVouCR3JMSLy1T': { label: '编程与软件开发',   notes: 'JMeter 性能压测平台' },
  'FFCE1WmFSwQUckotIvG2r': { label: '编程与软件开发',   notes: '性能测试平台前后端联调' },
  'QW7kLYG1cCkUguvk6qyKk': { label: '编程与软件开发',   notes: 'kafka 消息队列环境搭建' },
  '1UCIMrq6XbLVAGug2l3DZ': { label: '编程与软件开发',   notes: 'Java 开源项目' },
  '_FtGNkv0wwhSLdH8OOdrc': { label: '编程与软件开发',   notes: 'IoT 平台项目' },
  'ayg171zYhkAxO1iB23nV6': { label: '编程与软件开发',   notes: 'DevOps 工具链' },
  'ygQefk7H3mati_UeTTxog': { label: '编程与软件开发',   notes: 'Web3 知识体系' },
  'Ih628V3SfcLpGvTK1pvwB': { label: '编程与软件开发',   notes: 'The Missing Semester CS 课程' },

  // ─── AI 给了"AI 工程与论文"但应该归"工具型入口"───
  'j-F7h85b5h5IUrmJcSfNp': { label: '工具型入口',       notes: 'GitHub Proxy 代理服务' },
  'vA-c-6oB26XfCCq0Vpoat': { label: '工具型入口',       notes: 'API Keys 管理' },

  // ─── AI 给了"AI 工程与论文"但应该归"其他"───
  'sIcMdmFXixzo29ucmlV_-': { label: '其他',           notes: 'Grafana localhost dashboard' },
  'zoGPZYK_72zbQTF25SjRv': { label: '其他',           notes: 'SocketPro 不明' },
  'pX--4W3VQbzCSG7zMavKD': { label: '编程与软件开发',   notes: 'qps-battle 性能测试' },

  // ─── AI 给了"AI 工程与论文"但应该归"投资"───
  'u1csMfmFBRaKTtXQCdbBK': { label: '投资与金融市场',   notes: 'QTS 量化速通手册' },

  // ─── AI 给了"测试与面试"但应该归"投资"───
  '7Brc0Gt-0Sc_FPSQ3lW8h': { label: '投资与金融市场',   notes: 'TikTok Shop 电商行业深度报告' },
  'J38X-r4p4xKpKlWdPbLsN': { label: '投资与金融市场',   notes: 'TikTok Shop 电商行业深度报告（重复）' },

  // ─── AI 给了"编程"但应该归别处 ───
  'mU4XACCPFlh6w9q67eMnd': { label: '工具型入口',       notes: 'GitHub Personal Access Tokens' },
  'gVLQYRG9V3Ir1GeRmIVRt': { label: '招聘信息',         notes: '美国 CS 求职精华汇总' },

  // ─── AI 给了"工具型入口"但应该归"其他"───
  '3Qt1ctQZGyrMb_E1AV-TU': { label: '其他',           notes: '"小程序" 公众号 标题不明' },

  // ─── AI 给了"招聘信息"但应该归别处 ───
  'cXhQ4p2kXQ__BPrDtAjKe': { label: '其他',           notes: '蔚来班车信息，非招聘' },
}

// ─── 主流程 ──
const seed = JSON.parse(readFileSync(SEED, 'utf8'))
const out = {
  version: '1.0',
  description: '真实数据集 ground truth（人工修正后）。用 itemId 索引，不含标题/URL（隐私边界）。',
  lastUpdated: new Date().toISOString().slice(0, 10),
  notes: 'Seed 由 AI 生成（~80% 准），CORRECTIONS 表里编码了人工修正（基于 2026-05-14 评测）',
  items: {},
}

let aiTotal = 0, correctedCount = 0, mediumCount = 0
for (const [id, info] of Object.entries(seed.items)) {
  aiTotal++
  const correction = CORRECTIONS[id]
  if (correction) {
    correctedCount++
    if (correction.confidence === 'medium') mediumCount++
    out.items[id] = {
      label: correction.label,
      confidence: correction.confidence ?? 'high',
      notes: correction.notes,
    }
  } else {
    // 没在 CORRECTIONS 里 = AI 给的对（默认 high confidence）
    out.items[id] = { label: info.label, confidence: 'high' }
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log(`✓ ground-truth-real.json 已生成`)
console.log(`  - 总数: ${aiTotal}`)
console.log(`  - AI 沿用: ${aiTotal - correctedCount}`)
console.log(`  - 人工修正: ${correctedCount} (其中 ${mediumCount} 条边缘 case)`)

// 统计 label 分布
const dist = new Map()
for (const info of Object.values(out.items)) {
  dist.set(info.label, (dist.get(info.label) ?? 0) + 1)
}
console.log(`\n  label 分布:`)
for (const [label, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${label}: ${n}`)
}
