# Chord 聚类持续评测

> 设计文档见 `产品文档/Chord_聚类持续评测方案.md`。
> 这里是脚手架代码 + 怎么跑。

## 目录结构

```
test/eval/
├── README.md                       — 本文件
├── synthetic-dataset.json          — 100 条合成数据集（可公开 commit）
├── synthetic-labels.json           — 合成数据集的 ground truth
├── ground-truth-real.json          — 真实数据集的人工标注（用 itemId 索引）
├── run-eval.mjs                    — 主评测脚本
├── L1Categories.ts                 — L1 类别定义（10 个）
└── eval-reports/                   — 历次评测报告（git-ignored，除了 baseline.json）
    ├── baseline.json               — 当前基线，每次通过的跑覆盖
    ├── 2026-05-14-1157-real.md     — 历次报告
    └── ...
```

## 跑法

### 合成数据集（CI、确定性、< 30 秒）

```bash
pnpm --filter @chord/core eval:synthetic
```

用 mock AIEngine，输出绑死的标签。验证：
- 评测脚本本身正确
- 指标计算正确
- 阈值检查正确

### 真实数据集（手动、用真实 AI、~2 分钟）

需要先把用户导出的 chord-export-YYYY-MM-DD.json 放到 `~/chord-eval-data/private-dataset.json`：

```bash
mkdir -p ~/chord-eval-data
cp ~/Downloads/chord-export-2026-05-14.json ~/chord-eval-data/private-dataset.json
```

然后：
```bash
pnpm --filter @chord/core eval:real
```

需要 `VITE_CHORD_BUNDLED_AI_KEY` 环境变量（从 `apps/extension/.env.local` 读）。

## 隐私边界

- 真实数据集**永远不进 git**（`.gitignore` 守护）
- 评测脚本**只读 title + sourceDomain**，不读 url 完整路径、不读 privateNote/userNote
- ground-truth-real.json 用 itemId 索引（不含标题/URL），可以 commit

## 通过/失败阈值

| 指标 | 阈值 |
|---|---|
| 覆盖率 | = 100% |
| 互斥违反 | = 0% |
| 整体准确率 | ≥ baseline - 2% |
| 各 L1 类别准确率 | ≥ 70% |
| 命名稳定性 | ≥ 95% |
| TF-IDF fallback 触发 | = 0 |

任一硬阈值不过 → 脚本 exit 1 → CI fail。

## 当前 baseline（2026-05-14）

整体准确率 **87.0%**。详见 `eval-reports/baseline.json`。
