# Codex Hook Memory Learning

## Why

当前我们希望把 `claude-evolution` 的核心思想迁移到 Codex，但不再沿用 `claude-mem + 历史会话扫描` 的重方案。

这次要解决的问题是：

1. **数据入口过重**：如果继续依赖外部会话存储，再做离线检索和分析，系统复杂度会明显偏高。
2. **Codex 场景更适合原生采集**：Codex 已有 hooks 机制，用户 prompt 可以在输入时直接收集，不必事后补抓。
3. **经验需要生命周期**：经验不应该只是一次性总结结果，而应该记录首次发现、最近命中、命中频次，并随着时间逐步衰减。
4. **经验库需要可重整**：每一轮总结时，都应该让 LLM 基于“已有经验 + 新 prompt 批次”重新归并、排序、更新，而不是只做 append。
5. **项目经验需要运行时动态注入**：系统需要在启动 Codex 时，根据当前目录动态选择项目经验，并将它们作为本次会话的项目级上下文注入，而不是依赖静态全局配置文件。

因此，我们需要一套更轻、更贴近 Codex 的经验学习系统：

- 通过 Codex hooks 采集用户 prompt 事件
- 将 prompt 事件落库
- 周期性读取新 prompt 和当前经验库
- 交给 LLM 进行经验重整
- 未命中的旧经验保持 `last_seen_at` 不变，交给后续时间衰减机制自然淘汰
- 通过 wrapper 启动命令在运行时动态注入项目经验

## What Changes

### 1. 引入 Codex hooks 原生采集链路

- 注册 Codex hooks，在用户每次发送 prompt 时记录原始输入
- 每条记录以事件形式持久化，作为后续经验学习的唯一原始来源
- 首版只采集用户 prompt，不采集 assistant reply、tool calls、文件改动

### 2. 建立双层存储模型

系统将维护两类核心数据：

- **Prompt Events**：原始 prompt 事件表
- **Experiences**：经验表，存储已经提炼出的稳定经验

经验表需要至少保存以下生命周期字段：

- `first_seen_at`
- `last_seen_at`
- `last_reconciled_at`
- `hit_count`
- `status`（如 active / decaying / archived）

### 3. 引入周期性经验重整任务

每个总结周期，系统需要取出：

- 当前周期内新增的 prompt events
- 当前已有的 experiences

并将两者一起交给 LLM 做一次经验重整，LLM 负责：

- 识别哪些新 prompt 命中了已有经验
- 更新同类经验的内容、排序、权重和命中信息
- 合并重复或高度相似的经验
- 发现新的稳定经验并写入经验库

### 4. 固化“未命中不刷新”的生命周期规则

如果某条已有经验在本轮新 prompt 中没有被命中：

- 保留这条经验
- 不更新它的 `last_seen_at`
- 不人为补充命中次数

这条规则是后续时间衰减的基础，确保系统能识别“长期未再出现”的经验。

### 5. 引入时间衰减与归档机制

系统需要基于 `last_seen_at` 对经验做持续衰减：

- 长时间未命中的经验逐步降权
- 降权到阈值以下时转为 `decaying`
- 继续长期未命中时转为 `archived` 或从主经验集移除

### 6. 为后续实现保留清晰扩展点

本次变更会为后续实现预留以下方向，但不在首版范围内完成：

- assistant / tool / file change 的补充采集
- 经验人工审核界面
- 更复杂的 monorepo / 子项目边界识别
- 更复杂的冲突消解和证据追踪

### 7. 引入 wrapper 启动与运行时上下文注入能力

由于项目未来会以独立命令形式包裹底层 `codex` 启动，系统需要支持：

- 用户通过项目包装命令启动 Codex，而不是直接裸用 `codex`
- 系统在启动时识别当前项目目录
- 系统读取该项目经验并生成本次会话的动态上下文
- 系统再启动底层 `codex`，并把上下文注入本次会话

同时必须满足以下产品约束：

- 动态注入内容必须按当前 `project_key` 选择，不能混入其他项目经验
- 动态注入内容应当作为项目级补充上下文，而不是污染全局静态配置
- 用户绕过 wrapper 直接执行裸 `codex` 时，本次会话不保证获得项目经验注入

## Capabilities

### New Capabilities

- `codex-hook-prompt-ingestion`: 通过 Codex hooks 采集并持久化用户 prompt 事件
- `experience-reconciliation`: 使用“已有经验 + 新 prompt 批次”驱动 LLM 重整经验库
- `experience-lifecycle-decay`: 基于 `last_seen_at` 对经验执行衰减、淡出和归档
- `codex-wrapper-launch`: 通过 wrapper 命令接管 Codex 启动流程
- `runtime-context-injection`: 根据当前项目经验动态渲染并注入本次会话上下文

### Modified Capabilities

<!-- 当前仓库为空，本次为新增能力，无需修改既有能力 -->

## Impact

**新增模块方向**：

- Hook 注册与事件采集模块
- Prompt 事件存储模块
- 经验存储与生命周期模块
- 周期性 reconciliation 调度模块
- LLM 经验重整 prompt / schema 模块
- 项目解析与 wrapper 启动模块
- 运行时上下文渲染与注入模块

**新增数据对象**：

- `prompt_events`
- `experiences`
- 可选的 `reconciliation_runs`（用于记录每轮重整结果）
- 可选的 `launcher_sessions`（用于记录 wrapper 启动和上下文注入摘要）

**实现约束**：

- 首版以用户 prompt 为唯一学习来源
- 每轮重整必须显式区分“命中已有经验”和“未命中已有经验”
- 经验衰减依赖真实的 `last_seen_at`，不可由总结任务误刷新
- 动态注入内容必须仅来自当前项目的经验集

## Assumptions

1. 首版只针对单个本地工作区运行
2. 首版总结任务按时间周期触发，而不是逐条 prompt 实时总结
3. LLM 负责语义归并与经验排序，生命周期字段更新由程序按规则落库
4. 本轮未命中的旧经验会被保留，以支持后续时间衰减
5. 项目未来会通过 wrapper 命令启动底层 `codex`

## Out of Scope

- Web UI
- 团队共享经验库
- 跨设备同步
- assistant/tool/file 级别的多模态经验提取
- 底层 Codex 注入通道的最终选择细节（如 `developer_instructions` 或启动 prompt）留在 design 阶段明确
