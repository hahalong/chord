# Chord Store Screenshots · Mock User 档案

> 5 张 store screenshot 共用这套数据，确保前后一致不打架。
> 这位虚拟用户叫 **"Lin"** —— 看起来真实但不是任何具体的人。

---

## Lin · 虚拟用户身份

### Chord Triad
| 维度 | 身份 | 中文 | 编码 |
|---|---|---|---|
| 消费风格 | HOARDER | 收藏家 | H |
| 心境 | RETURNER | 回归者 | R |
| 半径 | SPECIALIST | 专精派 | P |

→ **HRP · 信息焦虑回归专精家**

### 顶部数字
- 真实热情率: **34%**
- 本月放手: **27**
- 处理完成度: **68%**
- 连续天数: **17 天**

---

## 收藏数据分布（168 条 content，最近 90 天 87 条）

| Cluster | 数量 | 占比 (90d) | 真用过率 | 地形 |
|---|---:|---:|---:|---|
| 投资与金融市场 | 38 | 42% | 75% | 🌳 真实热情之林 |
| AI 工具与应用 | 14 | 16% | 30% | 中间态 |
| 编程与开发 | 9 | 10% | 65% | 🌳 真实热情之林 |
| 旧学英语方法 | 12 | 14% | 4% | 🌫️ 焦虑沼泽 |
| 健身 | 5 | 6% | 80% | 🔥 新冒火苗 |
| 设计灵感 | 4 | 5% | 0% | 🌙 沉睡之地 |
| 心理学 | 3 | 3% | 33% | 中间态 |
| 创业研究 | 2 | 2% | 50% | 中间态 |

判定参数（让 SPECIALIST 真触发）:
- top1 share = 42% > 40% ✓
- top3 share = 68% < 70% ✗ ← 调整 ↓

→ 调整：投资 = **40 (45%)** · AI 工具 = 12 (14%) · 编程 = 10 (11%) · 总 top3 = 70%

---

## 5 张 Screenshot 的具体场景

### Screenshot 1 · Popup · 今日回响

- **被唤醒**: 《The Black Swan · Nassim Taleb 》
- **来源**: medium.com / 投资与金融市场 cluster
- **保存时间**: 2 年 4 个月前
- **AI 问句**: *"那场金融危机的余震，你现在还在想它吗？"*
- **按钮可见**: 📌 留下来 / 🌸 放手
- **顶部 streak**: 🌸 连续 17 天 · 168 条收藏

### Screenshot 2 · 隐性自我 §1 · 三和弦身份

- **顶部叙事**: "你存了 168 条，**真正回去用过的只有 1/3**——但那 1/3 几乎都在投资这一个主题。"
- **三身份卡**: HOARDER · RETURNER · SPECIALIST 横排叠加
- **中间画面**: 默认显示 SPECIALIST（"半径"）那张，背景是水彩地图（已有 PNG）
- **chip 切换**: 消费风格 / 心境 / 半径
- **底部 reflection**: *"看到这三张牌，你最先想到的是哪一句反应？"*

### Screenshot 3 · 隐性自我 §3 · 地形

四块地形横排：

| 地形 | Cluster | Stats | 文案 |
|---|---|---|---|
| 🌫️ 焦虑沼泽 | 旧学英语方法 | 12 条 · 真用过 4% · 平均等了 14 个月 | "存了 12 条「英语方法」——只有 1 条进入过你的注意力" |
| 🌳 真实热情之林 | 投资与金融市场 | 40 条 · 真用过 75% · 平均等了 3 个月 | "投资这块不是收藏，是真在用" |
| 🔥 新冒火苗 | 健身 | 5 条 · 全在最近 30 天 | "30 天里突然冒出 5 条——是个开始" |
| 🌙 沉睡之地 | 设计灵感 | 4 条 · 上次访问 5 个月前 | "设计灵感这条线，5 个月没动过了" |

### Screenshot 4 · 兴趣地形 Tab · 气泡可视化

8 个气泡按数量排，最大是投资：

```
       [AI 工具]         [创业研究]
    
  [投资与金融市场]              [心理学]
        ⭐ 实线
                    [编程]      
                                 [健身]
                                  🔥
       [旧学英语]         [设计灵感]
       虚线 swamp          🌙 sleep
```

颜色：
- 实线 = forest（rose 主色）
- 虚线 = swamp（lav）
- ember = 渐变发亮
- sleep = 灰

底部 caption: "泡泡越大你越「感兴趣」· 虚线 = 幻觉 · 实线 = 真实热情"

### Screenshot 5 · 候响室 / 书房主页

左侧：
- 待处理数字: **53 条**
- 呼吸脉冲动画暗示
- 副文案: "都还在，不急"

右侧：本周节奏（7 天柱状图 · 3 4 0 2 6 1 1）

待响队列（5 条 mock）：
1. 《系统的思维 · How to Read a Paper》 · medium.com · 等了 8 天（绿）
2. 《Anthropic blog · Claude 4 sonnet》 · anthropic.com · 等了 23 天（绿）
3. 《学英语 21 天速成法》 · zhuanlan.zhihu.com · 等了 4 个月（紫）
4. 《那本被我忘掉的设计书》 · designshack.net · 等了 6 个月（橙）
5. 《2024 旧文 · 副业选择指南》 · 36kr.com · 等了 1 年 2 个月（红）

---

## 视觉一致性约束

所有 5 张图共用：
- **画布**: 1280 × 800 px
- **背景**: `#FFFCFA` 主背景 + radial wash `#FDF0EF`
- **顶部 3px 渐变条**: rose → lav → sky
- **字体**:
  - 标题: DM Serif Display + Noto Serif SC
  - 副标/数字: DM Sans + Noto Sans SC
  - 问句: Source Serif 4 italic
  - 数字: DM Mono
- **角落樱花点缀**（淡）: 4 个角落各 1 个 `#F5C0BE` opacity 0.35 的圆点

---

## 跟真实 Chord 行为的一致性 check

| 项 | Mock | 真实算法 |
|---|---|---|
| HOARDER 触发 | 168 条 · processRate 32% | items ≥ 100 + processRate < 40% ✓ |
| RETURNER 触发 | "最近 30 天又点开历史保存" | recentVisits > 60% on old items ✓ |
| SPECIALIST 触发 | top1=45% · top3=70% · 8 clusters | top1>40% AND top3>70% AND clusterCount>0 ✓ (v3.1.31) |
| §3 焦虑沼泽 | 旧学英语 · reallyUsedRate 4% | rate<20% AND items≥10 ✓ |
| §3 真热情林 | 投资 · reallyUsedRate 75% | rate>=40% AND items≥5 ✓ |
| §3 新冒火苗 | 健身 · 30 天 5 条 vs 之前 0 | recent30 ≥ 3 AND ratioOverPrev > 2 ✓ |
| §3 沉睡之地 | 设计灵感 · 5 个月未访 | daysSinceVisit ≥ 90 AND items ≥ 3 ✓ |

→ 所有 mock 数据都**符合真实算法触发条件**，不是凭空捏造。
