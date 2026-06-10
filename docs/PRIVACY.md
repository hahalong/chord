# Privacy Policy · 隐私政策

> Effective date · 生效日期: 2026-06-10
> Last updated · 更新日期: 2026-06-10

---

## English

### TL;DR

**Chord does not sell, share, or transmit your personal data anywhere.** All your bookmarks, decisions, and behavioral data stay on your device. The only network requests Chord makes are AI clustering / questioning calls — and only when you've explicitly enabled them.

### What Chord stores locally on your device

Chord reads from and writes to `chrome.storage.local` (an isolated per-extension storage that is **not** synced to your Google account):

- **Bookmark snapshots** copied from Chrome's bookmark store (title, URL, favicon, save time, source domain)
- **Your decisions** (kept / released, release reasons, private notes you write)
- **Computed identity / cluster / terrain analysis** (Chord Triad, 90-day behavioral metrics)
- **Settings** (chosen AI engine, skin, daily resurface time)
- **Anonymous device ID and user ID** (random strings, never associated with you)

We never read your Google account, real name, email, phone, payment info, browsing history beyond the 90-day window we need for "really-used-rate" computation, or any other tab content outside what you explicitly bookmark.

### What leaves your device

Network requests happen in exactly **two** scenarios. Both are clearly opt-in:

#### 1. AI clustering (theme detection)

When Chord needs to group your bookmarks into themes (e.g., "AI Tools" / "Investing"), it sends **title + excerpt** of each bookmark to one AI provider:

- **Default engine (chord_bundled)**: titles/excerpts are sent to **Zhipu AI (智谱 / GLM-4-Flash)** via `open.bigmodel.cn`. Your raw bookmark URLs are **not** sent — only titles and short excerpts.
- **Custom engine (if you configure one)**: titles/excerpts are sent to **the AI provider you choose** (OpenAI, Anthropic, OpenRouter, DashScope, etc.) using **your own API key** that you store locally. Chord has no access to those keys.

You can disable AI clustering entirely in Settings → AI Engine → "off". When disabled, Chord still works using local TF-IDF clustering; only the categorization quality drops.

#### 2. AI question generation ("daily resurface" question)

When Chord generates the daily italic question (e.g., *"You said you wanted to learn this — three months later, did you ever actually use it once?"*), it sends the **specific bookmark's title + your save note** to the AI provider (same options as above) and receives one short question in return. The question is shown only to you and stored only on your device.

### What we never collect or transmit

- ❌ Personal identifiers (name, email, phone, address, payment info)
- ❌ Google account information
- ❌ Browsing history outside the 90-day window used for `reallyUsedRate`
- ❌ Cookies, tracking pixels, fingerprints
- ❌ Analytics or telemetry of any kind (no Google Analytics, no Sentry, no Mixpanel, no Posthog)
- ❌ Anything from tabs you did **not** bookmark

### Permissions justification

| Permission | Why Chord needs it |
|---|---|
| `bookmarks` | Read your Chrome bookmarks so Chord has something to resurface; also detect when you save a new one. |
| `history` | Read visit counts and last-visited timestamps for bookmarks within a 90-day window — used **only** to compute "really-used rate" locally. No URLs leave your device for this purpose. |
| `storage` | Persist your decisions, identity cards, cluster cache, and settings to `chrome.storage.local`. |
| `notifications` | Show daily resurface reminder (off by default; opt-in). |
| `activeTab` | Read the URL of the currently active tab **only when you click Chord's icon** to bookmark it. Never reads background tabs. |
| `alarms` | Schedule daily resurface reminders if enabled. |

### Data export and deletion

You own your data. At any time you can:

- **Export everything** to a JSON file: Settings → Data → Export
- **Delete everything** with one click: Settings → Data → Delete all data
- **Uninstall Chord** — Chrome removes all `chrome.storage.local` data automatically when an extension is uninstalled

### Children

Chord is not directed at children under 13. We do not knowingly collect data from children.

### Compliance

- **No selling** of user data — ever.
- **No use of data for unrelated purposes** beyond what's described above.
- **No use of data for creditworthiness or lending** decisions.
- Chord complies with Chrome Web Store's Limited Use Policy.

### Contact

For privacy questions, file an issue at: <https://github.com/hahalong/chord/issues>

---

## 中文

### 一句话总结

**Chord 不出售、不共享、不传输你的任何个人数据。** 所有的书签、决策和行为数据都留在你的设备上。Chord 唯一的网络请求是 AI 聚类 / 问句生成——并且只在你明确开启时才会发生。

### Chord 在你设备本地存什么

Chord 读写 `chrome.storage.local`（Chrome 给每个扩展的独立隔离存储，**不会**同步到你的 Google 账户）：

- **书签快照** 从 Chrome 书签库复制过来（标题、URL、favicon、保存时间、来源域名）
- **你的决策**（留下来 / 放手、放手原因、你写的私人注释）
- **计算出的身份 / 聚类 / 地形分析**（Chord Triad、90 天行为指标）
- **设置**（选择的 AI 引擎、皮肤、每日唤醒时间）
- **匿名设备 ID 和用户 ID**（随机字符串，不与你关联）

我们从不读取：你的 Google 账户、真实姓名、邮箱、电话、支付信息、超过 90 天窗口的浏览历史，或任何你没有明确收藏的标签页内容。

### 什么数据会离开你的设备

网络请求只在两个场景下发生，都是 opt-in：

#### 1. AI 聚类（主题分类）

Chord 把书签分组成主题时（如「AI 工具」/「投资」），它会把每条书签的**标题 + 摘要** 发给一个 AI 服务方：

- **默认引擎（chord_bundled）**：标题/摘要发给 **智谱 AI (GLM-4-Flash)**，通过 `open.bigmodel.cn`。**完整 URL 不发**，只发标题和短摘要。
- **自定义引擎**（如果你配置了）：发给**你选的服务方**（OpenAI / Anthropic / OpenRouter / DashScope 等），用你**本地保存的 API key**。Chord 永远拿不到你的 key。

你可以在 设置 → AI 引擎 中完全关闭 AI 聚类。关闭后 Chord 改用本地 TF-IDF 聚类继续工作；只是分类质量降低。

#### 2. AI 问句生成（每日回响问句）

Chord 生成每日斜体问句时（如 *"你说要研究这个方法——三个月过去了，有没有真的用起来过哪怕一次？"*），它会把**那一条书签的标题 + 你的保存备注** 发给 AI 服务方（选项同上），换回一句问句。问句只显示给你，只存在你设备上。

### 我们从不收集或传输

- ❌ 个人标识（姓名、邮箱、电话、地址、支付信息）
- ❌ Google 账户信息
- ❌ 超过 90 天窗口（用于「真用过率」计算）的浏览历史
- ❌ Cookie、追踪像素、指纹
- ❌ 任何 Analytics 或埋点（没有 Google Analytics、Sentry、Mixpanel、Posthog）
- ❌ 你**没有**收藏的标签页内容

### 权限申请说明

| 权限 | Chord 为什么要 |
|---|---|
| `bookmarks` | 读你的 Chrome 书签让 Chord 有内容可以"回响"；同时监听你新保存的书签 |
| `history` | 读 90 天窗口内书签的访问次数和最后访问时间——**仅用于**本地计算「真用过率」。URL **不离开**你的设备 |
| `storage` | 把你的决策 / 身份卡 / 聚类缓存 / 设置存到 `chrome.storage.local` |
| `notifications` | 每日回响提醒（默认关，需 opt-in）|
| `activeTab` | **只在你点击 Chord 图标保存当前页时**读当前活跃标签页 URL。永不读后台标签 |
| `alarms` | 如果你开了每日提醒，调度它的触发时间 |

### 数据导出 / 删除

你拥有你的数据。任何时候你可以：

- **完整导出 JSON**：设置 → 数据 → 导出
- **一键删除全部**：设置 → 数据 → 删除所有数据
- **卸载 Chord** —— Chrome 自动清除所有 `chrome.storage.local` 数据

### 关于儿童

Chord 不面向 13 岁以下儿童。我们不会有意收集儿童数据。

### 合规声明

- **绝不出售**用户数据
- **不用于其他用途**——除上述场景外
- **不用于信用评估或贷款**决策
- 遵守 Chrome Web Store Limited Use Policy

### 联系方式

隐私相关问题，请在 GitHub 提 issue：<https://github.com/hahalong/chord/issues>
