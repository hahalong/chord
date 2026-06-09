# Chord 隐性自我身份图谱 · Master List

> v3.1.25 · 2026-05-23
> 用途：所有 27 个混合身份的"画像档案"——是文案、模板、AI prompt、自动化测试的**唯一真值源**。
> 每次升级如果改到下面任何一项，必须跑 `pnpm test:audit` 跑回归。

---

## 一、体系命名 · 请用户选

参考 MBTI（16 personality types），我们的体系是基于 3 维度的 26+1 种混合自我：
- 消费风格 (Consumption · 7) × 心境 (Mindset · 6) × 半径 (Radius · 3)

候选名（请用户选/改）：

| 候选 | 全称 | 调性 | 备注 |
|---|---|---|---|
| **CMR-26** | Consumption-Mindset-Radius（26 个有意义组合）| 技术、直白 | 跟 IdentityService 维度命名一致 |
| **Chord Triad** | 三和音身份（呼应 "chord = 和弦"）| 诗意、跟品牌呼应 | **推荐** |
| **CST-26** | Chord Self Type（类比 MBTI 的 X-T 命名法）| 中性、专业 | |
| **三和音图谱** | 中文体系名 | 国风、有文化感 | 跟"和弦"概念互补 |

---

## 二、26 个混合身份 · 完整清单

### A 组 · 12 个完整 3D 命名身份（hand-written 真叙述）

| MBTI 码 | 中文名 | 三维组合 | 核心画像 | 关键 banned 词 | §5 模板 key |
|---|---|---|---|---|---|
| **HXG** | 信息焦虑囤积家 | HOARDER + EXPLORER + GENERALIST | 好奇心比胃口大，不停开新方向但旧的还堆着 | 你懒、没纪律 | explorer+generalist+hoarder |
| **HDG** | 多线深挖型囤积家 | HOARDER + DEEPENER + GENERALIST | 多条路同时往深里走，不开新方向但每条加重 | 浅尝即试、不专注 | deepener+generalist+hoarder |
| **HRP** | 怀旧型醒悟者 | HOARDER + RETURNER + SPECIALIST | 跟过去囤积谈判，开始处理多年堆着的 | 还要继续囤、舍不得放 | hoarder+returner+specialist |
| **HZG** | 沉睡的囤积家 | HOARDER + DORMANT + GENERALIST | 离开了书房但旧债还在，最近几乎没新增 | 存东西的瞬间、又敢飞 | dormant+generalist+hoarder |
| **CLP** | 深耕策展人 | CURATOR + SETTLER + SPECIALIST | 注意力像聚光灯，对的位置才亮 | 囤积、什么都存 | curator+settler+specialist |
| **CXG** | 审美型杂食家 | CURATOR + EXPLORER + GENERALIST | 收藏夹像有品味的杂志栏，什么都看但只留精品 | 囤积、积累焦虑 | curator+explorer+generalist |
| **EKP** | 目标驱动型专家 | EXECUTOR + SEEKER + SPECIALIST | 存即用、用即清，一个方向紧紧抓住 | 焦虑保存、收藏如山 | executor+seeker+specialist |
| **EXW** | 短时实验家 | EXECUTOR + EXPLORER + SWITCHER | 像主题的策展型试水者，一周一个领域 | 不专注、浅薄（要拆这个 frame）| executor+explorer+switcher |
| **TRG** | 反思型杂食回归者 | THINKER + RETURNER + GENERALIST | 跟过去自己有未完成对话，慢但深的学习 | 完全没读、知识焦虑 | generalist+returner+thinker |
| **SLP** | 慢品大师 | SLOW_READER + SETTLER + SPECIALIST | 节奏跟"高效率"不在一个时区 | 焦虑积累、太慢了 | settler+slow_reader+specialist |
| **MXG** | 轻盈漫游者 | MINIMALIST + EXPLORER + GENERALIST | 不囤但敢试，存下的少而轻 | 囤积、积累焦虑、慢工细活 | (待加：explorer+generalist+minimalist) |
| **MLP** | 静默深耕者 | MINIMALIST + SETTLER + SPECIALIST | 世界很窄、也很安静 | 囤积、焦虑、慢工细活 | minimalist+settler+specialist |

### B 组 · 4 个"已停下"层（stopped:{consumption}）

mindset = dormant/settler 时优先用。引导词从"该不该保存" → "以前的债该不该回看"。

| MBTI 码模式 | 名称 | 适用场景 | §5 模板 key |
|---|---|---|---|
| **H?P / H?G**（hoarder+stopped+任意半径，HZG/HSG/HZP/HSP 等）| 停下来的囤积者 | 曾活跃囤积，最近 30 天几乎没新增 | stopped:hoarder |
| **E?P / E?G**（executor+stopped） | 停下来的行动者 | 项目结束或转向中 | stopped:executor |
| **C?P / C?G** | 停下来的策展人 | 审美 mindfulness 停顿 | stopped:curator |
| **T?P / T?G** | 停下来的思考者 | 思考转向内部消化 | stopped:thinker |

### C 组 · 4 个"正在整理"层（returning:{consumption}）

mindset = returner 时优先用。引导从"开始整理" → "继续这个节奏"。

| MBTI 码模式 | 名称 | 适用场景 | §5 模板 key |
|---|---|---|---|
| **HR?**（除了 HRP 已有 hand-written） | 怀旧型醒悟者通用 | 翻多年囤积做决定 | returning:hoarder |
| **TR?**（除了 TRG 已有 hand-written） | 反思型回归通用 | 翻老收藏跟过去对话 | returning:thinker |
| **ER?** | 项目库清理者 | 行动者审计过去项目 | returning:executor |
| **CR?** | 精品库重审者 | 审美自我更新 | returning:curator |

### D 组 · 7 个单维度兜底（primary:{consumption}）

只 consumption 触发，mindset/radius 不明显时。

| MBTI 码模式 | 名称 | §5 模板 key |
|---|---|---|
| **H??** | 信息囤积者通用 | primary:hoarder (= UNIVERSAL_FALLBACK) |
| **C??** | 精挑细选者 | primary:curator |
| **E??** | 行动者通用 | primary:executor |
| **T??** | 思考者通用 | primary:thinker |
| **S??** | 慢品者通用 | primary:slow_reader |
| **M??** | 极简者 | primary:minimalist |
| **B??** | 稳态平衡者 | primary:balanced |

**总计：12 + 4 + 4 + 7 = 27 个**（去掉 UNIVERSAL_FALLBACK 即为 26 个独立画像）。

---

## 三、6 段调性矩阵（每个身份每段应该呈现什么）

> 这是自动化测试的**断言来源**——每个身份每段应该走到哪个模板/触发哪些 finding。

### §1 三维身份卡
- 主卡 = consumption（除非 mindset/radius extremity 更高）
- 综合句 = comboName + comboNarrative
- comboName: 命中 12 个 hand-written → 用真名；否则 `synthesizeComboName()` 拼合成名

### §2 数字反差（DramaticInsight）
- HOARDER → 主推 save_vs_process / oldest_waiting / reality_vs_aspiration
- EXECUTOR → skip reality_vs_aspiration（行动者人设保护）
- CURATOR → skip reality_vs_aspiration
- THINKER → skip reality_vs_aspiration + 倾向 chip_distribution（启发型）
- SLOW_READER → skip reality_vs_aspiration
- MINIMALIST → skip reality_vs_aspiration
- 每条 insight 带 identityHook（consistent_extreme / contrast / neutral）

### §3 地形
- MINIMALIST → **不该出焦虑沼泽**（硬约束）
- HOARDER → 通常有焦虑沼泽
- EXECUTOR / CURATOR → 通常有真实热情之林（处理率高）
- THINKER → 看 cluster 分布
- DORMANT/SETTLER 主导 → 通常有沉睡之地

### §4 行为变化（BehavioralChangeService）
- EXPLORER mindset → 有 momentum_rising signal
- DORMANT mindset → 有 dormancy_signal
- SETTLER mindset → 有 stability signal
- RETURNER mindset → 有 return_signal

### §5 心理引导（PsychGuidanceService）
- lookup 优先级：3D key → stopped:{c} → returning:{c} → primary:{c} → UNIVERSAL_FALLBACK
- 4 槽都要含该 identity 的 allowedAngles，不含 bannedAngles

### §6 AI Headline
- prompt 注入 IdentityConstraints（mindset + consumption claim + banList）
- 不能出现 bannedAngles
- 不能出现"看似 X 实则 Y"悖论句式

---

## 四、自动化回归测试矩阵

每个 identity 在 master list 里都有一个 fixture case + 6 段断言。

```typescript
// packages/core/test/identity-regression.test.ts
const IDENTITY_FIXTURES: IdentityFixture[] = [
  {
    mbti: 'HXG',
    name: '信息焦虑囤积家',
    spec: { /* mock data */ },
    assertions: {
      consumption: 'hoarder',
      mindset: 'explorer',
      radius: 'generalist',
      §2: { mustInclude: ['save_vs_process'], mustNotInclude: [] },
      §3: { mustInclude: ['anxiety_panorama'], mustNotInclude: [] },
      §5: { templateKey: 'explorer+generalist+hoarder' },
      bannedWords: ['你懒', '没纪律'],
    },
  },
  // ... 27 个
]
```

测试在 CI 跑：`pnpm test`。任何身份不通过 → CI 红。

---

## 五、实施 roadmap

### Phase 4（这次会话剩余）
- [x] 写本文档（master list）
- [ ] 升级 case-audit 工具支持 6 段调性匹配（不只 banList 扫描，还查 §5 模板 key 是否匹配身份预期）
- [ ] preview 列表页加 audit summary（已有，扩展 audit 维度）

### Phase 5（下次会话）
- [ ] 写 `IdentityFixture[]` 数据结构 + 27 个 fixture
- [ ] 写 `identity-regression.test.ts` 跑全部 fixture
- [ ] CI 接入

### Phase 6（持续）
- [ ] 每加一个新身份/段，先写 fixture + 断言，再写实现
- [ ] 文案 review 时跑 audit，不靠人肉

---

## 六、用户需要确认

- [ ] **体系命名**：CMR-26 / **Chord Triad**（推荐）/ CST-26 / 三和音图谱 / 其他？
- [ ] **27 个清单**：有没有缺漏 / 不必要的？需要新增/合并/拆分？
- [ ] **MBTI 码规则**：当前 3 字母（H/E/T/S/C/M/B + X/D/K/R/L/Z + P/G/W），缺位用 U——保留还是调整？
- [ ] **自动化测试范围**：每个 identity 跑 6 段断言 + bannedWords，还需要加哪些维度？
