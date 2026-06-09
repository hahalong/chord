// L1 预定义大类（10 个）——生产代码
// 设计依据：从 2026-05-14 真实用户 166 条数据归纳的兴趣骨架，评测 87% 准确率
// 评测和回归测试请见 packages/core/test/eval/
//
// 后续如需加/改类别：先在 test/eval/run-eval.mjs 验证不会降低整体准确率，再改这里

export interface L1Category {
  id: string
  name: string            // 用户看到的中文名
  desc: string            // 喂给 AI prompt 的描述，决定分类准确度
  examples?: readonly string[]
}

export const L1_CATEGORIES: readonly L1Category[] = [
  {
    id: 'ai_app',
    name: 'AI 应用与工具',
    desc: '面向终端用户的 AI 产品/网站/平台。包括 ChatGPT、Claude、DeepSeek、Gemini、文心一言、通义听悟、Sora、即梦AI、椒图AI、绘想、NemoVideo、ComfyUI、魔搭社区、GitHub Copilot、AI 工具导航站等。**关键：品牌没听过不是排除理由——任何含「AI / Agent / Bot / Chat / Assistant / Claw / Hub / Wild / MGX」等词的产品网站、AI 产品拆解档案、AI 导航站，即使品牌小众（如 OpenClaw / EasyClaw / WildAI / moltbook / MGX / 魔戒.net / OpenMAIC / AI or Not / ChatGPT Chatbot 这种），统统归这里，不要塞「其他」**。**反面：传统素材库 / 设计资源 / 文化平台不属于这里——「纹藏」(中国传统纹样素材库) 应归「个人创作与生活」，不是 ai_app 也不是 misc**',
    examples: ['ChatGPT', '即梦AI', '椒图AI', '通义听悟', '文心一言', 'GitHub Copilot', '魔搭社区', 'ComfyUI', 'Sora', 'OpenClaw', 'EasyClaw', 'WildAI', 'moltbook', 'MGX'],
  },
  {
    id: 'ai_eng',
    name: 'AI 工程与论文',
    desc: '面向开发者的 AI 技术内容。**全部归这里**：arXiv 论文、模型训练、MCP / Agent 框架（如 MetaGPT/OpenManus/langfuse/supergateway）、AI Gateway、Agent Skills、AI 工具文档（如 Browser Use Telemetry）、AI/ML/GenAI 学院课程（Coursera/DeepLearning.AI/NVIDIA DLI/速通手册）、AI 转型/学习指南（如「向吴恩达学 AI 转型」）、Claude Code 教程、Prompt 工程。**只要标题含「AI / LLM / Agent / Prompt / ML / GenAI / DeepLearning / MCP / 神经网络」中的任何一个，都不要归「其他」**',
    examples: ['arXiv DeepSeek-R1', 'MCP servers', 'langfuse', 'MetaGPT', 'OpenManus', 'Browser Use Telemetry', 'Introduction to GenAI', 'Google AI Agents 白皮书', '向吴恩达学 AI 转型', 'Claude Code 橙皮书'],
  },
  {
    id: 'invest',
    name: '投资与金融市场',
    desc: '股票/外汇/加密货币交易、个股估值分析、ETF 分析、券商工具、Earnings 跟踪、宏观投资策略。**注意：单纯的产业链/技术研报归 hardtech 不归这里**',
    examples: ['TradingView', 'ARK Invest', 'MSTR 溢价', 'Intel 财报', 'QQQ 估值', '美股开户'],
  },
  {
    id: 'testing',
    name: '测试与面试',
    desc: '用户**正在准备一场面试**而收藏的资料——任何岗位都算（AI 工程师、PM、QA、销售…）。包括面试题库、面试攻略、面经、Interview Guide、模拟系统、备战指南，以及 QA 测试技术本身',
    examples: ['字节 QA Manager Interview Guide', 'AI 工程师面试攻略', '测试经理面试备考手册', '自动驾驶仿真测试面试备战', 'Interview Warmup', '面试准备计划'],
  },
  {
    id: 'coding',
    name: '编程与软件开发',
    desc: '编程语言（Java/Solidity/Python）、框架、性能优化、Kafka、RPC、DevOps、CI/CD、CS 课程。**所有博客平台的技术文章一律归这里**：pdai.tech、blog.csdn.net、cnblogs.com、zhuanlan.zhihu.com、博客园、知乎等域名的技术内容。IM 机器人配置（飞书机器人/Telegram机器人）等开发集成也归这里',
    examples: ['Java 全栈知识体系 pdai.tech', 'JMeter 压测平台 CSDN 博客', 'kafka 消息队列 博客园', '手写 RPC 框架 CSDN', 'Java 开源项目 CSDN', 'Solidity 教程', 'The Missing Semester', '飞书机器人配置'],
  },
  {
    id: 'hardtech',
    name: '半导体与硬科技',
    desc: '**所有**芯片/半导体/硬科技产业链分析：芯片设备研报、半导体行业研究、AI 基础设施股票研报、人形机器人产业链、有色金属/新能源对比、深科技公司年报（震裕/华为昇腾等）。看到「研报」+ 内容是产业链/技术 → 这里，不是 invest',
    examples: ['芯片设备板块研报', '华为昇腾深度投资研究', '人形机器人全产业链', '震裕科技 300953 年报', 'AI 基础设施股票研报', '半导体设备产业研报'],
  },
  {
    id: 'utility',
    name: '工具型入口',
    desc: '**严格限定**：一次性"打开就办事"的服务网站。允许的类型：VPN/翻墙服务（如一元机场）、GitHub Proxy、SMS 验证码接收平台、激活密钥商店、地址生成器、API Key 控制台、开发者后台。**绝对不放**：任何博客（csdn.net/cnblogs.com/pdai.tech/zhuanlan.zhihu.com/博客园）、任何教程、任何文章、任何技术知识体系平台',
    examples: ['一元机场 VPN', 'GitHub Proxy', 'SMS-Activate', 'PD 虚拟机激活', '美国地址生成器', '微信开发者平台', 'API Keys 控制台'],
  },
  {
    id: 'job',
    name: '招聘信息',
    desc: '**用户在主动找工作/看招聘信息**。包含：招聘公告 / JD / 职位详情 / Offer 比较 / 校招公告 / 人才博览会方案 / 求职经验讨论。判断核心：标题要直接指向「招聘 / Offer / JD / 校招 / 职位 / 招人」这类**求职动作**关键词。**只是提到公司名 ≠ 招聘**——「蔚来班车信息」「字节员工福利」「阿里年报」等都不是招聘类（公司名只是来源标识）。同时注意：**只放找工作相关，不放面试备考**——「Offer 值不值得」/「JD」/「招聘」/「校招」/「博览会」→ 这里；「面试备考」/「面试题库」/「面试备战」→ 测试与面试',
    examples: ['贵州人才博览会引才方案', '上海农商行 Fintech Offer 值不值得', '牛客网 Offer 经验', 'CS 软件求职精华', '字节校招公告', '某公司 JD'],
  },
  {
    id: 'life',
    name: '个人创作与生活',
    desc: '个人博客、随笔、旅行清单、生活记录、影视娱乐、**素材库 / 设计资源 / 文化平台**（如「纹藏」中国传统纹样素材库）、豆瓣电影 / 小红书 / 知乎个人内容 / Substack 个人 Newsletter 等。**关键：只要不是 AI 工具 / 编程教程 / 投资研报 / 招聘 这些功能性内容，偏个人 / 文化 / 生活类的全归这里，别塞 misc**',
    examples: ['龙虾日记', '世界旅行清单', '此时此刻在线观看', '纹藏（传统纹样素材库）', '豆瓣电影 Top250', '小红书日常分享', '知乎个人随笔', 'Substack Letters'],
  },
  {
    id: 'misc',
    name: '其他',
    desc: '**极度严格 + 默认逃逸口禁用**——只放标题里**完全没有任何可识别主题词、且无法从域名推断意图**的内容。允许的例子**仅限**：localhost dashboard / 192.168.x.x 内网设备 / 纯标题就一两个汉字（如「公众号」「小程序」无后续内容）/ 完全空白或乱码标题。**绝对不归这里的陷阱**：(1) 品牌没听过 ≠ misc——OpenClaw / WildAI / moltbook 这种小众 AI 产品归 AI 应用与工具；(2) 标题含 AI / Agent / Bot / Chat / Hub / Token / Key / 知识 / 教程 / 配置 / 工具 / 助手 / 平台 任一词，必须归对应类（哪怕只是「Personal Access Tokens」这种，也归 utility 不归 misc）；(3) 域名能透露身份的（如 hrwz.*.com 是 HR 招聘，*.ai 多半是 AI 工具）按域名归类',
    examples: ['localhost dashboard', '192.168.x.x', '"公众号"（无后缀）', '"小程序"（无后缀）'],
  },
] as const

export const L1_NAMES: readonly string[] = L1_CATEGORIES.map((c) => c.name)
export const L1_NAME_SET = new Set(L1_NAMES)

export function isValidL1Name(name: string): boolean {
  return L1_NAME_SET.has(name)
}

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
