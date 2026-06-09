# 历史评测数据归档

这个目录存放聚类工作各次评测的**原始数据**，用于历史溯源、回放、跨版本对比。

之前这些数据散落在 `/tmp/`（会被清掉），现在固化到项目内。

---

## 文件清单（按时间排）

| 文件 | 内容 | 在 git | 大小 |
|---|---|---|---|
| `2026-05-14-open-clustering-clusters.json` | **CR-028 之前**开放聚类的 21 个 cluster 原始 JSON。包含所有 item 的 title + domain | ❌ gitignored | 32K |
| `2026-05-14-open-clustering-report.md` | 上面 JSON 对应的 markdown 报告（含每个 cluster 的样本展示） | ❌ gitignored | 12K |
| `2026-05-14-ground-truth-seed.json` | CR-028 阶段 AI 生成的 ground truth seed（含 title+domain，等待人工修正） | ❌ gitignored | 38K |
| `2026-05-14-ground-truth-seed.md` | 上面 JSON 的可读版（按 AI 推荐的 L1 分组展示标题） | ❌ gitignored | 16K |
| `2026-05-14-cr029-iter1.log` | CR-029 第 1 轮 prompt 优化评测日志（指标摘要 + 错误样本 10 条） | ✓ commit | 2K |
| `2026-05-14-cr029-iter2.log` | CR-029 第 2 轮评测日志 | ✓ commit | 2K |
| `2026-05-14-cr029-iter3-real.log` | CR-029 第 3 轮在真实数据集的评测日志（最终 baseline 78.9%） | ✓ commit | 2K |
| `2026-05-14-cr029-iter3-synthetic.log` | CR-029 第 3 轮在合成数据集的评测日志（最终 baseline 90%） | ✓ commit | 2K |

---

## 为什么部分文件 gitignored

前 4 个文件包含用户**完整收藏标题 + 完整来源域名**（如「蔚来班车信息」「纹藏」「上海农商行 Fintech Offer 不完全指北」等）。即使这是私有仓库，最佳实践是把用户私人数据保持在本地、不进 git。

参考：`ground-truth-real.json`（在 git 里）只存 itemId + label + notes，**不含 title**——这是隐私边界。

---

## 怎么获取 gitignored 文件

**方案 1**：从原始 `chord-export-YYYY-MM-DD.json` 重新生成
```bash
# 假设你有 ~/chord-eval-data/private-dataset.json
cd chord/packages/core
node test/eval/seed-ground-truth.mjs      # 重生成 ground-truth-seed
# 旧版输出在 /tmp，新版应输出到 test/eval/.local/（待 mjs 改）
```

**方案 2**：找 heyrain 要这 4 个文件本地副本。

---

## 命名约定

`<YYYY-MM-DD>-<context>.{json,md,log}`

`<context>` 用 CR 编号或事件描述：
- `open-clustering-*`：CR-028 之前开放聚类时代的产物
- `ground-truth-seed-*`：CR-028 ground truth 标注种子
- `cr029-iter{N}-*`：CR-029 第 N 轮迭代

---

## 关联代码

- `packages/core/test/eval/run-eval.mjs` — 评测主脚本，每次跑生成的报告进 `eval-reports/`，关键 baseline 自动写 `baseline.json`
- `packages/core/test/eval/seed-ground-truth.mjs` — 生成 seed（产物默认应放 `.local/`）
- `packages/core/test/eval/apply-ground-truth-corrections.mjs` — 人工修正 patch 应用到 seed → `ground-truth-real.json`

如果未来这些脚本仍然把输出写到 `/tmp/`，是 bug，应该指向 `.local/` 或本目录。
