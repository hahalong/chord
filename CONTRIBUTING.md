# 给 Chord 贡献

谢谢你考虑给 Chord 出一份力。

Chord 是个独立项目，节奏不快但很认真。每个 issue 我都会看，每个 PR 我都会读完再回。

---

## 如果你发现 bug

1. 先看 [issues](https://github.com/YOUR_USERNAME/chord/issues) 是不是已经有人提了
2. 用 [bug_report 模板](.github/ISSUE_TEMPLATE/bug_report.md) 提一个 issue
3. 描述："**做了什么 → 期望发生什么 → 实际发生什么**" 三段式
4. 如果可能，**附 `pnpm chord:inspect` 的输出**（不包含 URL 完整路径，只有 title / status / cluster）

---

## 如果你有功能想法

1. 先看 [Discussions](https://github.com/YOUR_USERNAME/chord/discussions) 有没有讨论过
2. 用 [feature_request 模板](.github/ISSUE_TEMPLATE/feature_request.md) 开 issue
3. 描述：**你的场景 → 你想做什么 → 现在为什么不行**
4. 不要直接来 PR 大功能 —— 先开 issue 对齐方向，避免做完发现方向不对

---

## 提 PR 之前

```bash
pnpm install
pnpm test:all        # 必须全过（414 单测 + build）
```

`pnpm test:all` 包括：
- 单测（vitest）
- TypeScript 类型检查
- 扩展打包

**如果你改了身份相关的代码**（IdentityService / IdentityConfig / 任何 §1-§6 文案），还要确认：
- `pnpm test -- audit-cli` 18/18 ✓（27 身份跨段一致性回归）
- `pnpm test -- IdentityRegression` 全过

---

## 代码风格

- 已有 ESLint + TypeScript 严格模式 —— 跑 `pnpm typecheck` 不出错就行
- 文件命名：service / component 用 PascalCase，util 用 camelCase
- 注释**写"为什么"不写"是什么"** —— 代码本身能讲清楚的事别写注释
- **不要扩缩**已有的服务模块（如 IdentityService）—— 真要加大功能先开 issue 讨论结构

---

## 文案 / UI 改动

Chord 的差异化很大一部分在**文案语气**——见 [`产品文档/Chord_文案语气纪律.md`](产品文档/Chord_文案语气纪律.md)。

如果你的 PR 涉及任何用户可见文案：
- 必须读这份纪律文档
- 避免：数据报告腔 / 道理空话 / AI 总结腔 / 学术装腔
- 追求：像懂你的朋友说话 / 具体到让人发笑 / 温柔的反讽 / 不强加意义

---

## License

提交 PR 等同于同意你的代码以 [MIT](LICENSE) 协议开源。

---

不想正式贡献，只想说几句话？欢迎 [Discussions](https://github.com/YOUR_USERNAME/chord/discussions) 闲聊。Chord 是个内容工具，我也很想听你的真实反馈。
