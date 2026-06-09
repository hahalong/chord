# Chord 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [1.0.0] - 2026-05-24 · 首发

### Chord Triad · 三和弦身份系统
- 7 种消费风格 × 6 种心境 × 3 种半径 = **27 个 Chord Triad 身份**
- MBTI 风格 3 字母代码（HDG / CXG / MLP 等）
- 27 个身份各自的水彩人物图

### 隐性自我 · 6 段对话式 Profile
- **§1 你是谁** — 三和弦身份卡（主大次小同框）
- **§2 但有件事让我意外** — 11 种数字反差洞察模板
- **§3 你的地形** — 焦虑沼泽 / 真实热情之林 / 新冒火苗 / 沉睡之地
- **§4 你正在变成另一个人** — 90 天行为轨迹（平滑曲线 + 末端 pulsing dot）
- **§5 为什么会这样 · 你可以试试** — CBT 4 槽心理引导（命名 / 代价 / 实验 / 重构）
- **§6 AI 给你的反直觉发现** — 千人千面 AI Headline

### 兴趣地形 · 气泡可视化
- 11 种主题自动聚类（AI 驱动 + TF-IDF 兜底）
- 颜色 = 主要动机（aspire > 50% 紫 / 否则玫瑰）
- 边框粗细 = 参与度（深度 / 轻度 / 基本未动）
- 角标 = 生命状态（活跃 / 萌芽 / 渐退 / 休眠）

### 三向决策 + 樱花动效
- 二向决策（v2 简化）：📌 留下来 · 🌸 放手
- 放手 = Canvas 45 片自绘樱花 + 物理飞散动效
- 留下 = pin-stamp 弹簧上弹
- 放手原因系统（6 + 自由文本，AI 智能预填）

### 反馈闭环
- §1-§6 chip 反馈持久化到 chrome.storage
- 反馈作为 prompt context 喂下次 AI 调用（不重复犯错）
- "上次你说不准——这一次我换了角度" 可见性 hint

### 隐私
- "只存本地" 模式：零网络请求（DevTools 可验证）
- 私人注释永远不上报
- 数据导出（JSON）+ 一键删除

### 分享卡
- 1:1 微信生态友好
- 主大次小三卡同框（参照 §1 视觉关系）
- 一键下载 PNG（html2canvas-pro · 1280×1280 @ 2x）

### 工程
- 414 单测 + audit-cli 18/18 ✓ 跨段一致性回归
- pnpm workspace + Turbo monorepo
- IdentityConstraints 中心源（27 身份 banList 单一权威）
- IdentityConfig 阈值集中化（68 参数）

---

## 开发期里程碑（已合并到 1.0.0）

<details>
<summary>展开历史版本</summary>

- v3.1.28 · 反馈闭环 ① + ② / §3 真用过率主导 / 分享卡 1:1
- v3.1.27 · 阈值集中化 / 27 case 跨段一致性
- v3.1.26 · items 定义重构（active vs full）
- v3.1.25 · 文案语气纪律 v2 / IdentityConstraints 中心源
- v3.1.24 · §6 加 mindset/radius context 避免跟 §1 矛盾
- v3.1.20 · §2 意外维度扩展
- v3.1.6 · MBTI 3 字母编码
- v3.1.5 · BALANCED 平衡者
- v3.1.0 · 三维身份系统 + 6 段 Profile
- v3.0 · 二向决策 + 放手原因系统
- v2.0 · 隐性自我（4 条 Finding）
- v1.0 · 三向决策 + 候响室

</details>
