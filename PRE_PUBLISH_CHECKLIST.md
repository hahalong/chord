# GitHub 公开前 · 审核清单

> 这份清单是给你的，不公开到 repo。审完按底部的 push 命令执行即可。
> （push 完后可以删除本文件，或者在 `.gitignore` 加 `PRE_PUBLISH_CHECKLIST.md` 永久排除）

---

## ✅ 已为你准备的文件

| 文件 | 用途 |
|---|---|
| `README.md` | 对外门面（覆盖了旧的"待开发"版本） |
| `LICENSE` | MIT 协议 |
| `CONTRIBUTING.md` | 贡献指南 |
| `CHANGELOG.md` | v1.0.0 首发说明 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | bug 模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | feature 模板 |
| `.github/ISSUE_TEMPLATE/identity_feedback.md` | Triad 反馈模板（差异化 ·  推荐传播） |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 模板 |
| `.gitignore` | 已补 `.claude/` / `eval-reports/` / `tmp/` 等 |
| `docs/product-intro.md` | 产品介绍长文（从对外版搬过来）|
| `docs/identity-system.md` | Chord Triad 算法设计 |
| `docs/identity-roster.md` | 27 身份花名册 |

---

## ⚠️ 你必须亲自 review 的事

### 1. 把 README 里 `YOUR_USERNAME` 全部替换成你的 GitHub username

```bash
cd chord
grep -rn "YOUR_USERNAME" README.md CONTRIBUTING.md
# 找到后 sed 替换：
sed -i '' 's/YOUR_USERNAME/你的名字/g' README.md CONTRIBUTING.md
```

### 2. 确认敏感信息没泄露

```bash
# 应该返回空（或只有 .env.example 模板，没有真实 key）
grep -rn "VITE_CHORD_BUNDLED_AI_KEY=." --include="*.env*" .
grep -rn "sk-[a-zA-Z0-9]\{20,\}" . --include="*.ts" --include="*.json" --exclude-dir=node_modules
```

**敏感信息分布**：
- ✅ `.env.local` 在 `.gitignore`，不会上传
- ✅ `.env.example` 是空模板，安全公开
- ⚠️ **你的真实智谱 token 在本地 `.env.local`**，永远别提交。其他人想跑 `pnpm build` 启用 AI 时，他们自己填自己的 key

### 3. 决定要不要带 `CLAUDE.md`

`chord/CLAUDE.md`（22KB）是项目工程指南——含色板、动效规范、测试纪律、bug 历史等。

**带的优势**：
- 展示工程严肃度（这本身就是营销）
- 帮助贡献者快速上手
- 是 Chord "认真 ship" 调性的证明

**带的风险**：
- 暴露你的决策思路（竞品可能学）
- 22KB 让 README 区不那么干净

**我的建议**：带。这是 Chord 的差异化之一。

### 4. 决定要不要带 `chord/产品文档/`

`chord/产品文档/Chord_隐性自我v3.1_主画像算法设计.md`——只有 1 个文档，但是核心算法的设计推理。

跟 `docs/identity-system.md` 内容有交叉。

**建议**：保留（展示思考过程）。或者合并到 `docs/identity-system.md` 然后删掉这个目录。

### 5. 浏览全部要 push 的文件清单

```bash
cd chord
# 列出"如果现在 git init 会被加入的文件"
git init -q
git add .
git status --short | head -60
```

特别要看：
- 没有 `*.env.local` / `*.env` 出现
- 没有 `dist/` 出现
- 没有 `node_modules/` 出现
- 没有 `.claude/launch.json` 出现
- 没有 `/tmp/` 任何文件
- 没有你的真实 storage 数据

如果都对，往下走。如果有意外文件 → 加 `.gitignore` → `git rm --cached <文件>` → 再 status 一遍。

---

## 🚀 Push 命令（确认上面都 OK 后）

```bash
cd chord

# 如果还没 git init
git init
git branch -m main

# 检查文件
git add .
git status

# 第一次 commit
git commit -m "v1.0.0 · Chord 回响 首发

完整 changelog 见 CHANGELOG.md。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 在 GitHub 上创建一个 empty repo（不要勾选 README/LICENSE/.gitignore，会冲突）
# 然后：
git remote add origin git@github.com:<你的名字>/chord.git
git push -u origin main
```

---

## 🎉 Push 后的事

1. **在 GitHub repo 设置里开**：
   - ✅ Issues
   - ✅ Discussions（推荐 ——对非技术用户友好）
   - ✅ Wiki（可选 ——也可以放在 docs/）

2. **加 GitHub Topics**（让人能搜到）：
   - `chrome-extension` · `bookmarks` · `self-reflection` · `mbti-like` · `cbt` · `chinese` · `productivity` · `preact` · `typescript`

3. **设置 About 区**（repo 顶部右上角的小齿轮）：
   - Description: `Chord · 回响 — 把数字囤积变成和自己的对话 · Chrome 扩展`
   - Website: 暂时填 GitHub repo URL，Chrome Web Store 上架后改
   - Topics: 见上

4. **创建第一个 Release**：
   - Tag: `v1.0.0`
   - Release notes: 从 `CHANGELOG.md` 复制 v1.0.0 段
   - 可选附件：编译好的 .zip（让非技术用户能下载 unpacked extension）

---

## 删除本文件

```bash
rm PRE_PUBLISH_CHECKLIST.md
# 或加到 .gitignore
echo "PRE_PUBLISH_CHECKLIST.md" >> .gitignore
```
