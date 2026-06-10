# Chrome Web Store · Chord 上架资料

> 直接复制粘贴到 Chrome Web Store Developer Console 的对应字段。
> 中英双语都准备好——dev console 里可分语言填，让国际用户搜得到也读得懂。
> 更新于 v3.1.31 · 已切换到 v2 二向决策（留下来 / 放手）

---

## 🇨🇳 中文（简体）

### Name · 名称
```
Chord · 回响
```

### Summary · 简短描述（≤132 字符）
```
每天唤醒一条收藏，二向决策识别真实兴趣。不是书签管理器，是内容与自我的对话工具。
```
*44 字符 · 远小于 132 限制*

### Description · 详细描述
```
你收藏了多少篇「以后要读」的文章？那个书签夹里，是你的真实兴趣，还是一个个未兑现的承诺？

**Chord · 回响** 每天从你的书房里唤醒一条内容，轻声问一句：这个，你还记得吗？

然后，做出一个简单决定：
📌 留下来 —— 它还有价值
🌸 放手 —— 这是幻觉兴趣，告别它

3 个月后，Chord 画出你的「三和弦身份」—— 27 种可能之一，告诉你和内容的真实关系。

—— 核心体验 ——

🌸 每日回响
打开扩展 → 一条收藏静静浮出 → 二向决策 → 樱花动效送别。
两秒内决定，不让任何一条内容继续在你的书签夹里积压。

🏠 候响室
脉冲呼吸 + 「都还在，不急」副标 + 按主题分组的待响列表。等待时长用颜色区分：1 个月内绿色 / 3-6 个月橙色 / 超过 6 个月红色。

🗺️ 兴趣地形
泡泡越大你越「感兴趣」。
虚线 = 幻觉兴趣（保存多但不用）
实线 = 真实热情（保存少但常用）
点击虚线泡泡可以批量放手。

🔍 隐性自我（6 段对话式 Profile）
§1 你是谁 · 三和弦身份卡（消费风格 × 心境 × 半径，27 种组合之一）
§2 但有件事让我意外 · 数字反差洞察
§3 你的地形 · 焦虑沼泽 / 真实热情之林 / 新冒火苗 / 沉睡之地
§4 你正在变成另一个人 · 90 天行为轨迹
§5 心理引导 · CBT 命名 / 代价 / 实验 / 重构
§6 AI 反直觉发现

—— 隐私优先 ——

✓ 所有数据存本地（chrome.storage.local），不上报
✓ AI 调用可关 · 默认走免费的智谱 GLM-4-Flash（仅 title + excerpt 出网，URL 永不出网）
✓ 完整数据导出 / 一键删除
✓ 不收集任何分析数据 · 不卖你的信息 · 不用于广告
✓ 开源 · 代码可审 · https://github.com/hahalong/chord

—— 为谁而做 ——

Chord 不是给"想批量删 1 万条书签"的人做的。
Chord 是给"知道自己存了很多但很少回去看，对此感到一丝心虚"的人做的镜子。
```

### Category · 类别
```
Productivity
```

### Language · 语言
```
中文（简体）+ English
```

### Tags / Topics（dev console 选）
```
productivity / bookmarks / personal growth
```

---

## 🇺🇸 English

### Name
```
Chord · Re-meet your bookmarks
```
*若 store 表单不接受非 ASCII，去掉 "·" 即可*

### Summary（≤132 chars）
```
Wake one bookmark per day. Keep or release. Re-meet what you saved — and discover your real interests.
```
*101 chars*

### Description
```
How many "I'll read this later" articles did you save? Look at your bookmark bar — is that your real interests, or a graveyard of unkept promises to yourself?

**Chord** wakes one bookmark per day, gently asks: do you still remember this?

Then a simple decision:
📌 Keep — it still matters
🌸 Release — this was illusion interest, let it go

After 3 months, Chord reveals your "Chord Triad" identity — one of 27 patterns — telling you the truth about how you relate to content.

—— Core experience ——

🌸 Daily Resurface
Open the extension → one saved page quietly surfaces → keep or release → sakura petals send it off. Decide in two seconds. Stop letting bookmarks pile up.

🏠 Library
Pulse breathing animation + "they're all still here, no rush" sub-copy + theme-grouped queue. Waiting time is color-coded: green within a month / orange 3-6 months / red over 6 months.

🗺️ Interest Terrain
Bigger bubble = more "interested" you are.
Dashed border = illusion interest (saved many, used few)
Solid border = real passion (saved few, used often)
Click dashed bubbles to release in bulk.

🔍 Hidden Self (6-section conversational Profile)
§1 Who you are · Chord Triad cards (Consumption × Mindset × Radius, 1 of 27)
§2 But something surprised me · Data contrast insight
§3 Your terrain · Anxiety swamp / Real-passion forest / New ember / Dormant land
§4 You're becoming someone else · 90-day behavior trajectory
§5 Psychological guidance · CBT name / cost / experiment / reframe
§6 AI counter-intuitive finding

—— Privacy first ——

✓ All data stays local (chrome.storage.local), never uploaded
✓ AI calls are opt-in · Default uses free Zhipu GLM-4-Flash (title + excerpt only, URLs never leave)
✓ Full data export / one-click delete
✓ No analytics tracking · No selling your data · No ads
✓ Open source · Audit the code · https://github.com/hahalong/chord

—— Who this is for ——

Chord is not for people who want to bulk-delete 10,000 bookmarks.
Chord is a mirror for people who saved a lot, rarely went back, and feel a faint pang about that.
```

### Category
```
Productivity
```

---

## Privacy Policy URL

填到 Chrome Web Store dev console 的 "Privacy Policy URL" 字段：

```
https://hahalong.github.io/chord/PRIVACY
```

⚠️ 提交前必须 **先启用 GitHub Pages**，让这个 URL 真的 200。启用步骤：
1. https://github.com/hahalong/chord/settings/pages
2. Source: Deploy from a branch · Branch: main · Folder: /docs
3. Save · 等 1-2 分钟

---

## Permission Justifications · 权限说明

**Chrome Web Store 会要求逐个解释为什么要每个 permission**。直接复制到 dev console 的 "Permission justification" 字段。

### `bookmarks`
```
Chord 同步 Chrome 原生书签作为唯一的"保存"入口——用户保存任何页面用 ⭐ 即可，Chord 监听 chrome.bookmarks 事件把新书签归入"书房"。如果不申请此权限，Chord 完全无法工作。

Chord uses native Chrome bookmarks as the only "save" entry point — users bookmark with ⭐, Chord listens to chrome.bookmarks events and ingests new ones into the "library". Without this, Chord cannot function.
```

### `history`
```
Chord 计算"真用过率"——判断一条收藏是否真的被阅读过——需要读最近 90 天书签的 visit count 和 last-visited 时间戳。仅在用户设备本地计算，URL 不出网。如果不申请，"真用过率"将退化为只看"是否处理过"，洞察质量明显下降。

Chord computes "really-used rate" — whether a bookmark was actually read — using the last 90 days of visit count and last-visited timestamps for bookmarks. Local computation only; URLs never leave the device. Without this, the metric degrades and insight quality drops significantly.
```

### `storage`
```
存储用户的决策（kept / released）、聚类缓存、身份卡分析、设置等到 chrome.storage.local。所有数据本地隔离，从不同步到 Google 账户。

Stores user decisions (kept / released), cluster cache, identity card analysis, and settings to chrome.storage.local. Local-only, never synced to Google account.
```

### `notifications`
```
"每日回响"可选提醒：在用户设定的时间通知一条收藏已浮出。默认关闭，opt-in。

Optional "daily resurface" reminder: notifies the user at their chosen time. Off by default, opt-in.
```

### `activeTab`
```
仅在用户点击 Chord 扩展图标时，读取当前活跃标签页的 URL/title 用于即时分类提示。从不读后台标签或用户未交互的页面。

Reads the active tab's URL/title only when the user clicks Chord's icon, used for instant classification hint. Never reads background tabs.
```

### `alarms`
```
调度每日回响提醒的触发时间。仅本地定时，无网络请求。

Schedules the daily resurface reminder. Local scheduling only, no network.
```

---

## Single Purpose Description

Chrome Web Store 现在要求声明"单一用途"——直接填：

```
Help users re-engage with their bookmarks through daily resurfacing and two-way decisions (keep / release), then reveal long-term patterns about their relationship with saved content.

通过每日唤醒一条收藏 + 二向决策（留下来 / 放手）帮用户重新面对自己保存的内容，并揭示他们与内容的长期关系模式。
```

---

## Asset 清单

| 资产 | 尺寸 | 数量 | 状态 |
|---|---|---|---|
| Icon | 128×128 PNG | 1 | ✅ `apps/extension/assets/icon-128.png` |
| Screenshots | 1280×800 或 640×400 PNG | 1-5 | ⬜ **待你截图后我帮拼** |
| Promotional tile (small) | 440×280 PNG | 0 或 1 | ✅ `store-assets/promo-tile-440x280.png` |
| Marquee promo | 1400×560 PNG | 0 或 1 | 🟢 可选（视需要做）|

---

## 截图建议（5 张）

按这个顺序截图给我（macOS Cmd+Shift+4 选区截图）：

1. **Popup 主界面** · 显示一条收藏 + 留下来/放手 二向按钮（reload 后跑出来的）
2. **Profile §1** · 三身份卡叠加，SPECIALIST 已显形
3. **Profile §3** · 地形分类（forest / swamp / ember / sleep）
4. **Terrain 兴趣地形** · 气泡可视化
5. **候响室** · 待处理队列 + 等待时长色标

每张截图直接 raw 发我，我帮你拼到 1280×800 + 加上文字 caption。
