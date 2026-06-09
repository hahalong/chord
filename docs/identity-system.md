# Chord 身份系统设计 · 3 维度 × 12 身份

> 把当前的单一 `consumption_style` Finding 升级为**三维身份系统**：每个用户同时被 3 个维度的身份描述，3 张「身份卡」叠在 Profile 顶部，构成"你是谁"的完整答案。
>
> 设计哲学：**身份不是 label，是引导依据**。每个身份都附带一组明确的「该怎么对待这种用户」的产品决策——UI 强调什么、不强调什么、何时通知、何时沉默、推什么功能。系统因为知道你是谁，所以能温柔且准确地对待你。

---

## 为什么是 3 个维度而不是 1 个？

当前 `consumption_style` 只回答了「你怎么消费」这一个问题。但同一个用户在不同维度上是完全独立的人格切片：

- 你**怎么消费**（消费方式）≠ 你**当下处于什么状态**（心境）≠ 你**长期注意力分布**（半径）
- 一个 HOARDER 可能正在 SEEKER 心境也可能在 SETTLER 心境
- 一个 SPECIALIST 可能是 EXECUTOR 也可能是 HOARDER

3 个维度互相正交，组合起来才能描述清楚一个真实用户。**5 × 4 × 3 = 60 种组合**，足够区分大部分用户而不至于"千人一面"。

| 维度 | 时间尺度 | 回答的问题 | 身份数 |
|---|---|---|---|
| **消费方式** | 长期（半年级稳定） | "你怎么对待收藏？" | 5 |
| **当下心境** | 短期（4-8 周窗口） | "你最近处在什么状态？" | 4 |
| **关注半径** | 中长期（季度级） | "你的注意力分布有多宽？" | 3 |

---

## 共享算法基础

### IdentityScore 数据结构

```ts
interface IdentityScore {
  id: string                      // 'HOARDER' | 'CURATOR' | ...
  dimension: 'consumption' | 'mindset' | 'radius'
  zhName: string                  // '收藏家'
  score: number                   // 0-100
  confidence: number              // score / 100
  evidence: string[]              // ["170 条收藏", "处理率 6%", ...]
  guidanceHints: GuidanceHint[]   // 用于驱动 UI 决策
}

interface GuidanceHint {
  type: 'tone' | 'feature' | 'frequency' | 'priority'
  value: string                   // 如 'no-shame', 'recommend-vow', 'reduce-notifications'
}
```

### computeAllIdentities

```ts
function computeAllIdentities(
  items: Item[],
  events: ChordEvent[],
  visitCounts: Map<string, number>,
): { consumption: IdentityScore; mindset: IdentityScore; radius: IdentityScore } {
  // 每个维度独立算所有候选身份的分数，取最高的
  const consumption = pickHighest(CONSUMPTION_IDENTITIES.map(c => c.compute(items, events)))
  const mindset = pickHighest(MINDSET_IDENTITIES.map(m => m.compute(items, events, visitCounts)))
  const radius = pickHighest(RADIUS_IDENTITIES.map(r => r.compute(items)))
  return { consumption, mindset, radius }
}
```

每个维度内的多个身份是**互斥**的（只能是 5 选 1 / 4 选 1 / 3 选 1）。

### 兜底逻辑

- 数据不足（items < 20）→ 所有维度返回 confidence < 0.4，UI 显示"还在了解你…"，不强行打标签
- 多个身份分数接近（top1 - top2 < 15）→ 显示 top1 但标注"也有点像 X"
- 单一身份分数 > 70 → 标注「显著」(confidence high)

---

# 维度 1：消费方式（Consumption Style）

回答："你怎么对待收藏？"——这是长期稳定的人格特质。

## 🃏 HOARDER · 收藏家

### 定义
保存远超处理。书房在积累，决策在延后。

### 数据信号
- `totalItems > 50`
- `processedRate < 20%`
- 30 天新增 ÷ 30 天处理 > 3 : 1
- `noteRate < 10%`

### 算法
```ts
let score = 0
if (totalItems > 50) score += 25
if (processedRate < 0.2) score += 30
if (recentSaved > recentProcessed * 3) score += 25
if (noteRate < 0.1) score += 20
```

### 用户画像
看到好东西就存，"以后会看"，但很少回头处理。背景里有积累焦虑——书房越大越觉得"欠债"。可能是工程师 / 终身学习者 / 知识工作者，习惯了"信息收藏即拥有"的错觉。

### 引导方向（核心：**不羞辱 + 减焦虑 + 帮决策**）

| 引导 | 怎么做 |
|---|---|
| 🚫 **不羞辱** | 绝对禁止"你又不看为什么收藏"。文案改"170 条里 94% 还没打开"为"170 条都在等你回去看" |
| ⚡ **减摩擦决策** | 推送「3 分钟扫一遍」批量决策；唤醒次数高的 item 高亮 |
| 🌊 **回响时刻** 重点用户 | Echo Index 触发对他特别有用——很多 item visit>5 但没处理 |
| 📜 **回响之约** 推荐 | 把"留下来"升级为有 deadline 的承诺 |
| 🌸 **庆祝放手** | growing_honest Finding 重点显示——HOARDER 最需要看到"我能放手"的证据 |

---

## 🎨 CURATOR · 策展人

### 定义
收藏少而精，每条都处理或评论。书房像精心策展的展览。

### 数据信号
- `processedRate > 70%`
- `noteRate > 40%`
- `totalItems` 中等（30-150）
- 笔记长度均值 > 20 字
- `cluster` 数量适中（5-12）

### 算法
```ts
let score = 0
if (processedRate > 0.7) score += 35
if (noteRate > 0.4) score += 30
if (totalItems >= 30 && totalItems <= 150) score += 15
if (avgNoteLength > 20) score += 20
```

### 用户画像
知识工作者 / 研究者 / 作家。把收藏当成研究素材库。每条进来都经过筛选，留下的都是有用的。书房有内在结构感。

### 引导方向（核心：**强化连接 + 提供导出 + 尊重已有结构**）

| 引导 | 怎么做 |
|---|---|
| 🔗 **发现联系** | cluster 内 cross-reference：「这 3 条都在讨论 X」 |
| 📤 **导出能力** | Notion / Markdown / RSS 导出；定期"研究包"打包功能 |
| 🎯 **倾听模式** 推荐 | 用主题召唤已策展的内容——CURATOR 经常需要"翻出当时存的 X" |
| 🚫 **不打扰** | Echo Moment 通知阈值提高（visit ≥ 10 才触发，避免对已经主动的人 nag） |
| 📊 **结构可视化** | 兴趣地形 / 心智地图重点用户——他们享受看自己策展的全貌 |

---

## 🚀 EXECUTOR · 实践者

### 定义
决策快，倾向"用过了"。收藏就是为了用，用完即过。

### 数据信号
- `processedRate > 50%`
- "used" chip 占决策的 60%+
- `avgDecisionLag < 14` 天
- "实际用到了" / "分享出去了" chip 比例高

### 算法
```ts
let score = 0
if (processedRate > 0.5) score += 25
if (usedChipRatio > 0.6) score += 30
if (avgDecisionLag < 14) score += 25
if (actionChipRatio > 0.4) score += 20  // 实际用到了 + 分享出去了
```

### 用户画像
行动派 / 工程师 / 产品经理。看到 → 决定要不要 → 用 → 归档。收藏的目的是行动，不是收藏本身。

### 引导方向（核心：**快 + 不打扰 + 看真热情**）

| 引导 | 怎么做 |
|---|---|
| ⚡ **批量决策** | 默认开启"快速扫一遍"模式 |
| 🚫 **减少弹窗** | Echo Moment 通知频率降到最低（已经在主动用，不需要提醒） |
| 🔥 **回响图谱** 推荐 | 看哪些主题"真在用"——验证自己的行动效率 |
| ✓ **chip 隐藏** | 「派上用场了？」chip 流程对 EXECUTOR 默认折叠（他已经知道自己用过了） |
| 📈 **数据反馈** | 重点显示"本周处理 X 条 / 实际用过 Y 条"成就感 |

---

## 🧠 THINKER · 思考者

### 定义
留笔记多，决策慢，倾向"留下来"。每条都要琢磨。

### 数据信号
- `noteRate > 30%`
- 私人笔记长度均值 > 50 字
- `processedRate` 中等（20-50%）
- "kept" chip 占决策的 50%+
- "启发思路" chip 高于平均

### 算法
```ts
let score = 0
if (noteRate > 0.3) score += 30
if (avgPrivateNoteLength > 50) score += 30
if (processedRate >= 0.2 && processedRate <= 0.5) score += 15
if (keptChipRatio > 0.5) score += 25
```

### 用户画像
沉思型 / 哲学爱好者 / 自我反思型读者。收藏一条等于开始一段思考。决策慢不是拖延，是真的在想。

### 引导方向（核心：**不催 + 帮连接思考 + 提供反思空间**）

| 引导 | 怎么做 |
|---|---|
| 🕰 **不催决策** | 三向决策按钮文字调整：「再想想」替代"留下来"；wakeCount 阈值提高 |
| 💬 **对话式自省** 重点用户 | 变体 B（如果选）天然适合 THINKER——节奏慢、有反思空间 |
| 🔗 **思考连接** | 同 cluster 同笔记关键词的 item 互相推荐：「你 3 个月前对类似话题写过这一段」 |
| 📝 **笔记升级** | 私人笔记区域更大、支持 Markdown、自动提取关键词 |
| 🎯 **回响之约** 推荐 | 立约功能对 THINKER 很合适——他知道"现在想不清楚，30 天后再问" |

---

## 🐢 SLOW READER · 慢读者

### 定义
处理超慢但确实在处理。喜欢"放着发酵"。

### 数据信号
- `avgDecisionLag > 60` 天
- `processedRate` 中等（20-50%）
- `wakeCount` 均值高（多次唤醒才决策）
- 但最终处理质量不低（chip 多样、笔记不空）

### 算法
```ts
let score = 0
if (avgDecisionLag > 60) score += 35
if (processedRate >= 0.2 && processedRate <= 0.5) score += 15
if (avgWakeCount > 3) score += 25
if (chipDiversity > 2) score += 25  // 处理时确实在认真选
```

### 用户画像
节奏慢 / 完美主义 / 喜欢慢品 / 不被算法推着走的人。决策慢但稳定。区别于 HOARDER：HOARDER 是不处理，SLOW READER 是慢慢处理。

### 引导方向（核心：**降低节奏 + 立约替代频繁唤醒 + 不催**）

| 引导 | 怎么做 |
|---|---|
| 🌙 **降低推送频率** | 每日唤醒改成每 2-3 天；Echo Moment 阈值提高 |
| ⏳ **立约功能** 重点推 | 替代频繁唤醒——「30/60/90 天后再问」比每天问温柔 |
| 🚫 **不显示积压数** | 不显示"还有 N 条没处理"——对 SLOW READER 是焦虑源不是激励 |
| 📚 **慢品体验** | 处理界面延长动效；增加"先静静读一会儿"的等待状态 |
| 🎁 **慢的庆祝** | 「这条等了 60 天才决策——你给了它足够的时间」 |

---

# 维度 2：当下心境（Current Mindset）

回答："你最近 4-8 周处在什么状态？"——这是短期窗口的状态，会变化。

## 🌅 EXPLORER · 探索者

### 定义
最近多个新主题在涌现。求知爆发期，新方向在试。

### 数据信号
- `momentum_rising` findings ≥ 2
- 30 天 cluster 集合 vs 历史集合 Jaccard < 0.5
- 新增 cluster 至少 1 个（历史从未出现过的）
- 30 天保存量 > 历史月均 × 1.3

### 算法
```ts
let score = 0
if (risingClusters.length >= 2) score += 30
if (jaccardWithHistory < 0.5) score += 30
if (brandNewClusters.length >= 1) score += 20
if (recent30dSavings > histMonthlyAvg * 1.3) score += 20
```

### 用户画像
正处于人生的某个开放期——换工作 / 新爱好 / 新项目筹备。这个状态珍贵，通常 6-12 周。

### 引导方向（核心：**不打断 + 帮快速分类 + 给探索空间**）

| 引导 | 怎么做 |
|---|---|
| 🚫 **不强推老内容** | 老内容唤醒频率降低 50%——EXPLORER 在向前，不要把他拉回去 |
| 🏷 **快速分类** | 新主题保存时弹询问"这是个新方向吗？"，开新 cluster 不让他觉得"乱" |
| 🌊 **Echo Moment 冷却** | 老的 high-visit item 暂时不打扰 |
| 🗺 **心智地图** 推荐（变体 D） | 让 EXPLORER 看到新地形在涌现 |
| 🔥 **新冒火苗高亮** | Profile 重点显示 momentum_rising 主题 |

---

## 🎯 SEEKER · 求索者

### 定义
**当下**被单一主题强烈吸引。区别于 EXPLORER（多方向都在试）—— SEEKER 是认死一个方向往深里挖。

### 数据信号
- `momentum_rising` finding 命中
- 命中的 cluster 30 天新增 > 该用户历史最高单月
- 其他 cluster 30 天保存量平稳或下降
- 该 cluster 的 visitCount 总和 > 全书房总和的 40%

### 算法
```ts
let score = 0
if (topRisingExceedsHistMax) score += 35
if (topClusterVisitShare > 0.4) score += 35
if (otherClustersFlat) score += 30
```

### 用户画像
当下正处于"对某主题着魔期"。准备项目 / 考试 / 痴迷新工具 / 进入领域深水区。通常持续 4-8 周后自然衰退。

### 引导方向（核心：**全力支持当下聚焦 + 警惕泡沫**）

| 引导 | 怎么做 |
|---|---|
| 🎯 **专题视角** | Dashboard 顶部加一行「你正在求索：__主题名__」 |
| 🔍 **倾听模式** 重点用户 | SEEKER 经常脑子里浮现关键词，倾听让他能直接召唤 |
| 📈 **主题 timeline 强化** | 兴趣地形该主题气泡明显放大 + 历史曲线 |
| 🌅 **60 天后温柔回响** | 求索期通常 4-8 周。如果反转 → 温柔提醒「这个主题最近静下来了」 |
| 🚫 **不分散** | Echo Moment 通知只挑该主题，其他降权 |
| ⚠️ **警惕泡沫** | 处理率 < 5% 且 visit 低 → 转 illusion_anxiety 提醒 |

---

## 🌊 RETURNER · 回归者

### 定义
最近在主动处理 / 放手老内容。正在清理过去。

### 数据信号
- `growing_honest` finding 命中（本月放手 > 上月）
- 处理的 item 中老于 30 天的占 > 50%
- 30 天处理量 > 历史月均
- 释放 / 用过了 决策比 30 天前显著上升

### 算法
```ts
let score = 0
if (growingHonestHit) score += 25
if (oldItemProcessRatio > 0.5) score += 30
if (recent30dProcessed > histMonthlyAvg) score += 25
if (releasedDecisionGrowth > 0.3) score += 20
```

### 用户画像
正在认真清理过去——可能受新年 / 季末 / 整理欲望驱动。这种状态对产品来说是黄金窗口，要全力支持。

### 引导方向（核心：**批量处理 + 鼓励放手 + 完成感反馈**）

| 引导 | 怎么做 |
|---|---|
| ⚡ **批量处理入口** | 兴趣地形「快速扫一遍」按钮置顶 |
| 🌸 **鼓励放手** | 三向决策按钮顺序调整：「放手」加粗或加图标，"留下来"低调显示 |
| 🎁 **完成感反馈** | 实时显示「本周放手 X 条」「书房又轻了 Y 条」 |
| 🏆 **里程碑庆祝** | 处理 50/100/500 条触发特别动效 |
| 🚫 **暂停新内容焦虑** | 「现在的积压」不显示——RETURNER 已经在解决了 |

---

## 🍃 SETTLER · 沉淀者

### 定义
收藏减速 / 处理稳定 / 没有新方向。进入稳定期，注意力收敛。

### 数据信号
- `momentum_rising` 为空
- 30 天保存量 < 历史月均 × 0.6
- 30 天处理量与保存量持平
- 没有 cluster 在 30 天增长

### 算法
```ts
let score = 0
if (noRisingMomentum) score += 30
if (recent30dSavings < histAvg * 0.6) score += 30
if (processSaveBalanced) score += 25
if (noNewClusters) score += 15
```

### 用户画像
进入稳定期 / 工作生活节奏稳定 / 阶段性休止。可能在等下一个开放期到来。

### 引导方向（核心：**回顾性内容 + 沉淀成果 + 不强推新事**）

| 引导 | 怎么做 |
|---|---|
| 📜 **回顾性内容** | 「今年你保存最多的」「半年来你最常回访的」专题展示 |
| 📤 **导出 / 分享** | 把沉淀的内容打包成"年度阅读报告"等 |
| 🔕 **暂停今日唤醒** | 推送频率自动降低（已经平静，不要打扰平静） |
| 🧘 **极简体验** | 默认隐藏所有"动量"信息，UI 更安静 |
| 🌱 **温柔探索建议** | 偶尔（每月 1 次）推送"试试这个新方向？"——给沉淀期一个出口 |

---

# 维度 3：关注半径（Focus Radius）

回答："你的注意力分布有多宽？"——中长期结构。

## 🏔 SPECIALIST · 专精派

### 定义
注意力高度集中于少数主题。深耕领域，外延窄。区别于 SEEKER（临时聚焦）—— SPECIALIST 是长期结构。

### 数据信号
- max cluster 占总量 > 40%
- 前 3 cluster 占 > 70%
- 总 cluster 数 < 8
- 分布持续 ≥ 90 天

### 算法
```ts
let score = 0
if (maxClusterShare > 0.4) score += 30
if (top3Share > 0.7) score += 25
if (clusterCount < 8) score += 20
if (stableOver90Days) score += 25
```

### 用户画像
深耕某领域——从业者 / 研究生 / 长期爱好者。书房像专业图书馆。焦虑"深度不够"，不焦虑"涉猎不够"。

### 引导方向（核心：**强化深度 + 不强推广度 + 帮助看清结构**）

| 引导 | 怎么做 |
|---|---|
| 🏆 **专家身份认可** | 语言：「你是 X 领域的策展人」；不要"建议多看看别的" |
| 🧬 **L2 子分类** 重点用户 | 大 cluster 内的 80 条用 AI 再细分 8 个 L2 子类 |
| 🗺 **专属地形** | 兴趣地形主 cluster 占满视觉中心，其他降权 |
| 📚 **深度推荐** | 「这 5 条都在讨论同一个子话题」cross-reference |
| 🎓 **导出/分享** | Markdown / Notion 导出重点做 |
| 🚫 **不推广度** | 不要给"为什么不看看 X 主题"——那是 GENERALIST 的引导 |

---

## 🌍 GENERALIST · 广博派

### 定义
兴趣均匀分散在很多主题。杂食型读者。

### 数据信号
- max cluster 占 < 25%
- 前 5 cluster 占 < 50%
- 总 cluster 数 > 10
- entropy 高（cluster 分布熵接近 log(clusterCount)）

### 算法
```ts
let score = 0
if (maxClusterShare < 0.25) score += 30
if (top5Share < 0.5) score += 25
if (clusterCount > 10) score += 25
if (clusterEntropy / Math.log(clusterCount) > 0.85) score += 20
```

### 用户画像
杂食型读者 / 文艺复兴型人格 / "什么都看一点"。可能是产品经理 / 投资人 / 文化媒体人——需要广博视野的人。

### 引导方向（核心：**发现意外联系 + 俯瞰视角 + 不羞辱"不专精"**）

| 引导 | 怎么做 |
|---|---|
| 🌐 **跨主题推荐** | 「你在 AI 和心理学之间都收藏了 X 条——它们有联系」 |
| 🗺 **心智地图** 重点用户（变体 D） | 适合俯瞰——GENERALIST 享受看自己注意力分布的全貌 |
| 🚫 **不羞辱杂食** | 不要"建议聚焦"——GENERALIST 的杂食是 feature 不是 bug |
| 🎨 **多主题快速切换** | 处理界面侧边栏可快速跳到其他主题 |
| 📊 **多样性指标** | 显示「你今年涉猎了 X 个主题」作为正向反馈 |
| 🔥 **回响图谱** 推荐 | 看哪些主题"真有回响"——帮 GENERALIST 在杂食中识别真热情 |

---

## 🦘 SWITCHER · 跳跃者

### 定义
注意力在不同主题间剧烈切换。跟随节奏的人。

### 数据信号
- 30 天 cluster 集合 vs 60-90 天集合 Jaccard < 0.3
- 历史多 cluster 但当前集中
- 主题"换得快"——平均每个 cluster active 期 < 60 天
- 反复切换的模式（不是单向探索）

### 算法
```ts
let score = 0
if (jaccardOldVsNew < 0.3) score += 35
if (avgClusterActiveSpan < 60) score += 30
if (switchingPatternDetected) score += 35   // 多次切换历史
```

### 用户画像
跟随节奏的人 / 热点驱动 / 兴趣周期短。不是不专注，是兴趣周期短而已。可能是社交平台重度用户 / 内容创作者 / 趋势观察者。

### 引导方向（核心：**不 nag 老内容 + 识别潮汐 + 季度归档**）

| 引导 | 怎么做 |
|---|---|
| 🚫 **不 nag 老内容** | 沉睡主题的唤醒大幅降权——SWITCHER 已经换了 |
| 🌊 **潮汐识别** | Profile 加「你的潮汐」可视化：哪些主题来过又走了 |
| 📦 **季度自动归档** | 每季度自动建议"已沉睡 90 天的主题打包归档" |
| 🔄 **快速归零** | 提供"清理上个主题"批量操作——下个主题来临前 |
| 🚫 **不显示历史"未完成"** | SWITCHER 的"未完成"不是焦虑，是已经过去——不要提醒 |
| ⚡ **当下主题全力支持** | 类似 SEEKER 的引导，但更短期 |

---

# 三个维度的协同案例

身份不是孤立的——3 个维度组合才描述完整的人。下面是几种典型组合的 UI/引导决策。

## 案例 1：HOARDER + SEEKER + SPECIALIST
"长期专精某领域 + 当下深挖 + 但处理跟不上"

**典型用户**：工程师在新技术爆发期、研究生在写论文。

**Profile 顶部翻牌顺序**：HOARDER（最痛点）→ SEEKER（当下状态）→ SPECIALIST（长期身份）

**核心引导**：
1. **SPECIALIST 背景色**：认可专家身份，不推广度
2. **SEEKER 焦点动作**：突出当前求索主题，倾听模式置顶
3. **HOARDER 痛点解决**：Echo Moment + 回响之约重点对求索主题的 item 用

## 案例 2：CURATOR + SETTLER + GENERALIST
"杂食策展人 + 沉淀期"

**典型用户**：文化媒体人在年终复盘期、教师暑假整理资料。

**Profile 顶部**：CURATOR 显示居前（最稳定身份）

**核心引导**：
1. **CURATOR**：导出 / 分享功能突出
2. **SETTLER**：UI 极简化，今日唤醒静默
3. **GENERALIST**：年度回顾报告、心智地图全景

## 案例 3：EXECUTOR + EXPLORER + SWITCHER
"行动派 + 开放期 + 跳跃中"

**典型用户**：创业者在产品调研期、产品经理在新方向探索。

**Profile 顶部**：EXPLORER（当下状态最 dominant）

**核心引导**：
1. **EXPLORER**：开放期不打断，新主题快速分类
2. **EXECUTOR**：批量决策入口
3. **SWITCHER**：不强推老内容，季度归档提醒

## 案例 4：THINKER + RETURNER + SPECIALIST
"沉思型 + 清理期 + 专精派"

**典型用户**：哲学博士整理积压的文献、长期研究者反思过去阅读。

**核心引导**：
1. **THINKER**：笔记空间大，对话式自省入口
2. **RETURNER**：批量"扫一遍"工具放在专精主题内
3. **SPECIALIST**：L2 子分类帮助看清自己的思想发展

## 案例 5：SLOW READER + SETTLER + GENERALIST
"慢读者 + 沉淀期 + 杂食"

**典型用户**：退休知识分子 / 慢节奏生活者。

**核心引导**：
1. 几乎所有动效降到最低
2. 推送频率最低
3. 强调"享受不必处理"的合法性
4. UI 整体最静

---

# 数据模型与实现

## 类型定义

```ts
// packages/types/src/identity.ts
export type ConsumptionIdentity = 'HOARDER' | 'CURATOR' | 'EXECUTOR' | 'THINKER' | 'SLOW_READER'
export type MindsetIdentity = 'EXPLORER' | 'SEEKER' | 'RETURNER' | 'SETTLER'
export type RadiusIdentity = 'SPECIALIST' | 'GENERALIST' | 'SWITCHER'

export interface IdentityCard {
  id: string
  dimension: 'consumption' | 'mindset' | 'radius'
  enName: string                  // 'HOARDER'
  zhName: string                  // '收藏家'
  score: number                   // 0-100
  confidence: number              // 0-1
  claim: string                   // 一句话总结
  evidence: string[]              // 支撑数据
  guidanceHints: GuidanceHint[]   // 驱动 UI 决策
  gradient: string                // 卡片背景渐变
}

export interface GuidanceHint {
  type: 'tone' | 'feature' | 'frequency' | 'priority'
  scope: 'global' | 'cluster'     // 全局还是某 cluster 内
  value: string                   // 'no-shame', 'recommend-vow', 'reduce-notifications' 等
  weight: number                  // 优先级 1-10
}
```

## 服务层

```ts
// packages/core/src/services/IdentityService.ts
export class IdentityService {
  static computeAllIdentities(
    items: Item[],
    events: ChordEvent[],
    visitCounts: Map<string, number>,
  ): { consumption: IdentityCard; mindset: IdentityCard; radius: IdentityCard } { /* ... */ }

  static getGlobalGuidance(identities: IdentityCard[]): GuidanceHint[] {
    // 合并 3 个维度的 guidance，按 weight 排序
    // 同 type 冲突时取权重高的
  }
}
```

## 引导消费方

GuidanceHint 是**所有其他功能的输入**：

| 消费方 | 用 GuidanceHint 做什么 |
|---|---|
| Echo Moment | `frequency: reduce-notifications` → 提高阈值 |
| ResurfaceService | `priority: focus-cluster=X` → 优先选该 cluster 的 item |
| Process 决策按钮 | `feature: emphasize-release` → 放手按钮加粗 |
| Profile 文案 | `tone: no-shame` → 文案模板换温柔版 |
| Dashboard 区块 | `feature: recommend-vow` → 顶部加立约引导 |

这样 12 个身份不是 12 个独立的产品逻辑，是**12 套 GuidanceHint 配置**驱动同一套产品功能。

---

# 用户反馈回路

身份判断不应该是不可质疑的——用户可以反馈："不对，我不是 HOARDER"。

## 反馈机制

```
身份卡背面 →
  "这张说对了吗？"
  [ 准 ]  [ 部分对 ]  [ 不准 ]  [ 我来说 ]

点"不准" → 弹层：
  "那你觉得自己更像？"
  [其他 4 个 ConsumptionIdentity 候选] + [自己写]
```

反馈数据存 `chrome.storage.local['chord_identity_feedback']`：

```ts
interface IdentityFeedback {
  computedId: string              // 系统算的
  userCorrection?: string         // 用户改的
  customLabel?: string            // 用户自定义
  setAt: number
}
```

下次计算时如果用户上次纠正了 → 给用户选的那个加 +30 分作为"用户偏好加权"，让系统逐渐学到该用户的自我认同。

## 多次纠正升级为自定义身份

如果用户对 3 次以上算法结果都不满意 + 自己写了 label → 允许用户**自定义一个 ConsumptionIdentity**，存进个性化身份池。

例：用户三次都说"我不是 HOARDER，我是 ARCHIVIST 档案管理员"。系统接受这个新身份并把"ARCHIVIST"加入用户专属候选。

---

# 验证

## 单元测试

每个身份的 compute 函数都有对应测试：
- 边界 case（极少数据 / 极多数据）
- 典型 case（fixture 数据匹配该身份）
- 反例（fixture 数据 NOT 匹配该身份）

文件：`packages/core/src/services/IdentityService.test.ts`

## 真实数据验证

用 168 条真实数据集跑一次：
- 三个维度各得出一个身份
- 跟用户主观感受对比（用户答题"你觉得自己是 5 种 ConsumptionIdentity 哪一种"）
- 准确率 baseline ≥ 70%（3 维度都答对的比例）

## A/B 评估

为每种身份准备"假设引导"和"实际引导"两版 UI：
- 给 10 个 HOARDER 看「不羞辱版」+ 「直白版」文案
- 测留存 / 处理率 / 主观满意度

---

# 关键文件路径速查

| 文件 | 角色 |
|---|---|
| `packages/types/src/identity.ts` | 新增：IdentityCard / GuidanceHint 类型 |
| `packages/core/src/services/IdentityService.ts` | 新增：12 个 compute 函数 + 总入口 |
| `packages/core/src/services/IdentityService.test.ts` | 新增：每个身份单测 |
| `apps/extension/src/components/IdentityCardDeck.tsx` | 新增（变体 A 用） |
| `apps/extension/src/options/pages/Profile.tsx` | 改：调 IdentityService 并消费 GuidanceHint |
| `apps/extension/src/background/sw.ts` | 改：身份计算结果驱动 ResurfaceService / Echo Moment 阈值 |
| `chrome.storage.local['chord_identity_feedback']` | 反馈数据存储 |

---

# 跟其他文档的关系

- **`Chord_念念回响_功能设计.md`**：Echo Moment / Vow / 倾听等功能消费身份系统的 GuidanceHint
- **变体 A 身份卡牌**：身份系统的视觉化展现层（`设计稿/Profile_变体A_身份卡牌.html`）
- **`Chord_洞察性分类模型设计.md`**：身份系统是这份洞察模型的"人格层"补充——四层洞察模型描述行为，身份系统描述"这种行为属于哪种人"
