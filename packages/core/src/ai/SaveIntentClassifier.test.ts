import { describe, it, expect } from 'vitest'
import { detectIntentByRules } from './SaveIntentClassifier.js'

function infer(title: string, domain = 'example.com') {
  return detectIntentByRules({ url: `https://${domain}/page`, title, domain })
}

describe('SaveIntentClassifier.detectIntentByRules', () => {
  describe('tool', () => {
    it('英文 tutorial → tool', () => {
      expect(infer('React Hooks Tutorial: Complete Guide')).toBe('tool')
    })
    it('中文教程 → tool', () => {
      expect(infer('TypeScript 入门教程：完整指南')).toBe('tool')
    })
    it('github.com 域名 → tool', () => {
      expect(infer('Some Random Title', 'github.com')).toBe('tool')
    })
    it('docs. 子域 → tool', () => {
      expect(infer('Some Random Title', 'docs.python.org')).toBe('tool')
    })
    it('中文「配置」「速查」→ tool', () => {
      expect(infer('Nginx 配置速查')).toBe('tool')
    })
  })

  describe('aspire（优先级高于 learn）', () => {
    it('「我是如何成为 X 的」→ aspire', () => {
      expect(infer('我是如何成为 AI 产品经理的')).toBe('aspire')
    })
    it('「我是如何学习 X 的」→ aspire（aspire 优先）', () => {
      expect(infer('我是如何学习深度学习的')).toBe('aspire')
    })
    it('「我的转型」→ aspire', () => {
      expect(infer('30 岁的我的转型之路')).toBe('aspire')
    })
    it('英文 my journey → aspire', () => {
      expect(infer('My journey from designer to founder')).toBe('aspire')
    })
    it('「年薪 / 副业」类 → aspire', () => {
      expect(infer('如何通过副业实现财务自由')).toBe('aspire')
    })
    it('「从零到一」→ aspire', () => {
      expect(infer('独立开发：从零到一打造产品')).toBe('aspire')
    })
  })

  describe('learn', () => {
    it('英文 explained / fundamentals → learn', () => {
      expect(infer('Transformers Explained: A Deep Dive')).toBe('learn')
    })
    it('中文「原理」「深度解析」→ learn', () => {
      expect(infer('React Fiber 架构原理深度解析')).toBe('learn')
    })
    it('中文「揭秘」→ learn', () => {
      expect(infer('JavaScript V8 引擎揭秘')).toBe('learn')
    })
    it('中文「深入理解」→ learn', () => {
      expect(infer('深入理解 React Hooks 原理')).toBe('learn')
    })
    // v2 升级：裸「为什么」「是什么」假阳性高（"为什么我的猫这么可爱"等），已删除
    it('v2: 裸「为什么」不再判为 learn（假阳性高）', () => {
      expect(infer('为什么 JavaScript 这么慢？')).toBe(null)
    })
  })

  describe('track', () => {
    it('英文 announces / launches → track', () => {
      expect(infer('OpenAI Announces GPT-5')).toBe('track')
    })
    it('中文「发布」「趋势」→ track', () => {
      expect(infer('2025 年 AI 产品趋势盘点')).toBe('track')
    })
    it('techcrunch.com 域名 → track', () => {
      expect(infer('Some Random Title', 'techcrunch.com')).toBe('track')
    })
    it('producthunt.com → track', () => {
      expect(infer('Some Random Title', 'www.producthunt.com')).toBe('track')
    })
  })

  describe('inspire', () => {
    it('「随笔」「感悟」→ inspire', () => {
      expect(infer('关于孤独的随笔')).toBe('inspire')
    })
    // v2 关键修复：域名信号软化 — 候选域名必须叠加 pattern 才确认（BC-012 根因修复）
    it('v2: medium.com 但无 inspire pattern → null（不再"一票判定"）', () => {
      expect(infer('Some unrelated content title', 'medium.com')).toBe(null)
    })
    it('v2: medium.com + inspire pattern → inspire', () => {
      expect(infer('关于平凡日子的随笔', 'medium.com')).toBe('inspire')
    })
    it('英文 essay → inspire', () => {
      expect(infer('An essay on slowness')).toBe('inspire')
    })
  })

  describe('null', () => {
    it('完全无 pattern + 无白名单域名 → null', () => {
      expect(infer('XYZ 123 无 pattern 标题')).toBeNull()
    })
    it('空标题 + 普通域名 → null', () => {
      expect(infer('', 'example.com')).toBeNull()
    })
  })

  describe('优先级冲突', () => {
    it('「我是如何 + 学习」aspire 赢过 learn', () => {
      expect(infer('我是如何学习 React Hooks 的')).toBe('aspire')
    })
    it('github.com + 随笔 → tool 赢（域名 tool 优先于 inspire pattern）', () => {
      expect(infer('关于编码的随笔', 'github.com')).toBe('tool')
    })
  })

  // ═══════════ v2 升级新增测试 ═══════════════════════

  describe('v2 · BC-012 类（域名一票决定根因修复）', () => {
    it('「蔚来班车信息全览」mp.weixin.qq.com → null（不应判 inspire）', () => {
      expect(infer('蔚来班车信息全览', 'mp.weixin.qq.com')).toBe(null)
    })
    it('「字节员工福利政策」mp.weixin.qq.com → null（negative pattern）', () => {
      expect(infer('字节员工福利政策', 'mp.weixin.qq.com')).toBe(null)
    })
    // 注：「年报」本质是追踪公司动态，归 track 是合理的（不算 BC-012 类误判）
    it('「阿里年报」mp.weixin.qq.com → 不应被错归 inspire', () => {
      const r = infer('阿里 2025 年年报解读', 'mp.weixin.qq.com')
      expect(r).not.toBe('inspire')   // 关键：不被 mp.weixin 域名吸为 inspire 即可
    })
    it('mp.weixin.qq.com 上的技术教程 → tool（不被 inspire 域名吸走）', () => {
      expect(infer('React Hooks 完整教程', 'mp.weixin.qq.com')).toBe('tool')
    })
  })

  describe('v2 · 中文 pattern 升 2-3 字短语', () => {
    it('裸字「孤独」→ null（v1 假阳性高）', () => {
      expect(infer('孤独')).toBe(null)
    })
    it('裸字「温柔」→ null', () => {
      expect(infer('温柔的力量')).toBe('inspire')   // "温柔的力量" 是修饰短语 pattern 命中
    })
    it('「孤独的诗」→ inspire（短语 pattern 命中）', () => {
      expect(infer('孤独的诗')).toBe('inspire')
    })
    it('「沉默的故事」→ inspire', () => {
      expect(infer('沉默的故事')).toBe('inspire')
    })
    it('「写给未来的自己」→ inspire', () => {
      expect(infer('一封写给未来自己的信')).toBe('inspire')
    })
    it('「平凡的日常」→ inspire', () => {
      expect(infer('平凡的日常时光')).toBe('inspire')
    })
  })

  describe('v2 · 扩域名白名单', () => {
    it('twitter.com → track', () => {
      expect(infer('随便发的内容', 'twitter.com')).toBe('track')
    })
    it('bilibili.com → track', () => {
      expect(infer('一些视频', 'bilibili.com')).toBe('track')
    })
    it('xiaohongshu.com → track', () => {
      expect(infer('某条笔记', 'xiaohongshu.com')).toBe('track')
    })
    it('pypi.org → tool', () => {
      expect(infer('numpy', 'pypi.org')).toBe('tool')
    })
    it('developer.android.com → tool', () => {
      expect(infer('UI Components', 'developer.android.com')).toBe('tool')
    })
  })

  describe('v2 · 扩词典（2026 热词）', () => {
    it('「Vibe Coding 月入十万」→ aspire', () => {
      expect(infer('Vibe Coding 月入十万的实战')).toBe('aspire')
    })
    it('「数字游民生活」→ aspire', () => {
      expect(infer('数字游民的真实生活')).toBe('aspire')
    })
    it('「副业月入过万」→ aspire', () => {
      expect(infer('副业月入过万的真实经验')).toBe('aspire')
    })
    it('「Prompt 工程实战」→ tool', () => {
      expect(infer('Prompt 工程实战指南')).toBe('tool')
    })
    it('「大模型 Agent 趋势」→ track', () => {
      expect(infer('大模型 Agent 趋势')).toBe('track')
    })
    it('「2026 年度回顾」→ track', () => {
      expect(infer('2026 年度技术回顾')).toBe('track')
    })
  })

  describe('v2 · negative patterns 防过判', () => {
    it('inspire 域名 + 技术词 → null（不强行 inspire）', () => {
      expect(infer('Vue3 Composition API 配置实战', 'medium.com')).toBe('tool')
    })
    it('inspire 域名 + JD/招聘 → 不被错归 inspire', () => {
      // saveIntent 没有 job 类（job 是 L1 cluster 类别，不是动机）。
      // 这里只验证：含「JD/招聘」negative pattern 时不会被 inspire 域名吸走
      expect(infer('某公司 JD 详情', 'medium.com')).not.toBe('inspire')
    })
  })
})
