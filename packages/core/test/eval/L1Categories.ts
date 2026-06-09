// L1 预定义大类（10 个）—— 评测和生产共用
// 设计依据：从 2026-05-14 真实用户 166 条数据归纳出的真实兴趣骨架
// 后续如果需要加类，先在评测里验证不会降低整体准确率，再加到生产代码

export interface L1Category {
  id: string
  name: string       // 用户看到的中文名
  desc: string       // 喂给 AI prompt 的描述（关键，决定分类准确度）
  examples?: string[] // few-shot 示例（可选，给 AI 补充信号）
}

export const L1_CATEGORIES: L1Category[] = [
  {
    id: 'ai_app',
    name: 'AI 应用与工具',
    desc: '面向用户的 AI 产品（ChatGPT/Claude/DeepSeek/Gemini、AI 生图、AI 视频、AI Agent 产品、AI SaaS、AI 修图）',
    examples: ['ChatGPT', '即梦AI', '椒图AI', 'NemoVideo', 'OpenClaw', 'Sora'],
  },
  {
    id: 'ai_eng',
    name: 'AI 工程与论文',
    desc: '偏开发者技术：arXiv 论文、模型训练、MCP / Agent 框架、langfuse、AI Gateway、Agent Skills、AI 教程课程',
    examples: ['arXiv DeepSeek-R1', 'MCP servers', 'langfuse', 'MetaGPT', 'Google AI Agents 白皮书'],
  },
  {
    id: 'invest',
    name: '投资与金融市场',
    desc: '股票/外汇/加密货币、个股财报分析、ETF、估值分析、券商、TradingView、ARK Invest、Earnings、研报',
    examples: ['TradingView', 'ARK Invest', 'MSTR', 'Intel 财报', '半导体研报', 'QQQ 估值'],
  },
  {
    id: 'testing',
    name: '测试与面试',
    desc: 'QA 测试、面试题库、面试经验、测试经理面试、自动驾驶仿真测试、面试备战指南',
    examples: ['字节 QA Manager 面试', '自动驾驶仿真测试', '测试经理面试备考'],
  },
  {
    id: 'coding',
    name: '编程与软件开发',
    desc: '编程语言（Java/Solidity/Python）、框架、性能优化、Kafka、RPC、DevOps、CI/CD、博客教程、CS 课程',
    examples: ['Java 全栈知识体系', 'kafka 消息队列', 'RPC 框架', 'Solidity 教程', 'The Missing Semester'],
  },
  {
    id: 'hardtech',
    name: '半导体与硬科技',
    desc: '芯片产业研报、深科技公司分析（震裕、华为昇腾、人形机器人产业）—— 注意：是产业研究，不是投资标的',
    examples: ['芯片设备研报', '华为昇腾生态', '人形机器人产业链', '震裕科技年报'],
  },
  {
    id: 'utility',
    name: '工具型入口',
    desc: '一次性服务网站，不需要阅读就能用：VPN/翻墙、GitHub Proxy、SMS 验证、激活密钥、地址生成器、API Key 管理。**不放编程博客或教程**',
    examples: ['一元机场', 'GitHub Proxy', 'SMS-Activate', 'PD 激活', '地址生成器'],
  },
  {
    id: 'job',
    name: '招聘信息',
    desc: '招聘公告、人才博览会方案、JD、职位详情、求职 Offer 比较',
    examples: ['贵州人才博览会', '上海农商行 Offer', '职位详情'],
  },
  {
    id: 'life',
    name: '个人创作与生活',
    desc: '个人博客、随笔、旅行清单、生活记录、影视娱乐',
    examples: ['龙虾日记', '世界旅行清单', '此时此刻在线观看'],
  },
  {
    id: 'misc',
    name: '其他',
    desc: '真正不属于上面任一类的零散收藏（首选其他 9 类，找不到才用这个）',
    examples: [],
  },
]

export const L1_NAMES = L1_CATEGORIES.map((c) => c.name)

export function getL1ByName(name: string): L1Category | undefined {
  return L1_CATEGORIES.find((c) => c.name === name)
}

// 给 prompt 用的格式化清单
export function formatL1ListForPrompt(): string {
  return L1_CATEGORIES.map((c, i) => {
    const ex = c.examples?.length ? `\n   例如：${c.examples.join('、')}` : ''
    return `${i + 1}. **${c.name}** — ${c.desc}${ex}`
  }).join('\n')
}
