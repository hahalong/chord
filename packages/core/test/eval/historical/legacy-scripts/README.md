# Legacy 评测脚本归档

这些是 CR-028 / CR-029 期间开发评测体系时的**早期一次性脚本**，**已被 `packages/core/test/eval/run-eval.mjs` 完全替代**。

留在这里只是为了追溯当时的探索过程（开放聚类失败 → L1 验证 → 正式评测体系），**不要再用**。

| 脚本 | 当时用途 | 已被替代为 |
|---|---|---|
| `2026-05-14-eval-clustering.mjs` | 第一次评测开放聚类，跑出 ~20% 准确率的数字 | `run-eval.mjs` 整体评测流程 |
| `2026-05-14-eval-l1.mjs` | 第一次验证 L1 N 选 1 方案，跑出 87% 数字（temp 0.2 抽样） | `run-eval.mjs` + `synthetic-eval.test.ts` |

如果未来要做新的评测实验，复制一份新脚本到 `test/eval/experiments/<date>-<name>.mjs`，不要修改这两个 legacy 文件——它们是历史 artifact。
