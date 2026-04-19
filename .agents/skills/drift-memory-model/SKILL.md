---
name: drift-memory-model
description: T0→T1→T2→T3 四层记忆模型的设计原理。触发条件：修改 Observer/Synthesizer/Convergence 的输入输出、调整 token 阈值、新增记忆层。
---

# 四层记忆模型

## 定位

Drift 的记忆是**连续压缩流水线**，不是 Stello 那样的批量触发。每一层解决一个特定问题。

---

## 四层 + 各自的 why

| 层 | 名称 | 范围 | why |
|----|------|------|-----|
| T0 | Raw Messages | per-branch | LLM 需要原始上下文才能续写对话 |
| T1 | Observations | per-branch | 压缩长对话，保留结构化要素（topic/stage/keyPoints/openQuestions/directionSignal），使跨分支关联和收敛输出成为可能 |
| T2 | GlobalMap | cross-branch | 单个分支看不到全局，需要有人站在上面看所有分支的关系 |
| T3 | Deliverables | user-selected | 用户最终要交付的东西，不是中间产物 |

---

## 核心设计决策

### T1 必须是结构化的，不是自由文本

Mastra 的 Observer 产出自由文本 observation。Drift 的 Observer 产出结构化 JSON（topic/stage/keyPoints/openQuestions/directionSignal）。

**Why**：自由文本只能被人读或被 LLM 再次处理。结构化输出可以被 Synthesizer 程序化消费（按 topic 和 keyPoints 做跨分支语义分析）、被 Convergence Engine 按字段聚合、被 Intent Detector 对比（当前消息 vs 分支 topic）。

如果改回自由文本，Synthesizer 和 Convergence 的准确度会显著下降。

### Convergence 只读 T1/T2，不读 T0

**Why**：
1. 速度——T0 可能有几万 token，T1 已压缩 5-40x
2. 一致性——结构化 observation 是干净输入，不会被 raw message 中的噪声干扰
3. 成本——强模型（Opus/GPT-4）处理少量 T1 比处理大量 T0 便宜得多

退化策略：分支太短没触发 Observer 时，Convergence fallback 读 T0。但这是例外路径，不是常规路径。

### T2 是 GlobalMap 而不是简单的 synthesis 文本

Stello 的 integration 产出 synthesis（文本）+ insights（推送列表）。Drift 的 T2 是结构化的 GlobalMap，包含 overallTheme（主次议题）、branchLandscape（分支摘要 + 7 种关系类型）、crossThemeConnections（跨主题隐含关联）、explorationCoverage（盲区分析）、convergenceReadiness（收敛就绪度）和 navigationSuggestions（导航建议）。

**Why**：GlobalMap 驱动 UI——力导向图的节点标签来自 branchLandscape.summaries，跨主题连线来自 crossThemeConnections，导航建议来自 navigationSuggestions。如果 T2 只是文本，UI 无法程序化消费。

---

## 与 Stello L1/L2/L3 的映射

- T0 = L3（相同）
- T1 ≈ L2，但连续生成（Observer 替代 ConsolidateFn）且结构化
- T2 ≈ synthesis + insights，但多了 branchLandscape、crossThemeConnections 和 navigationSuggestions
- T3 = 无对应（Stello 没有交付物概念）

关键差异：Stello 的 L2 在 consolidation 事件时批量生成，之间不存在。Drift 的 T1 在 token 超阈值时自动生成，分支始终有最新 observation。
