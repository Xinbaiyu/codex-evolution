# Implementation Tasks

- [x] 1. 搭建 npm 包基础结构与 wrapper CLI 入口
  Includes: 创建包入口、`bin` 命令、参数透传、基础目录约定、运行时配置装载。
  Outcome: 用户可以通过项目命令启动系统，而不是直接裸用 `codex`。

- [x] 2. 实现 `project_key` 解析器
  Includes: 从 `cwd` 向上查找 Git root、路径规范化、Git root 缺失时回退到当前目录、记录 `launch_cwd`。
  Outcome: 系统可以稳定识别当前会话所属项目。

- [x] 3. 建立 SQLite 启动与迁移能力
  Includes: 数据库连接管理、迁移执行入口、基础索引与唯一约束。
  Outcome: 本地持久化层可稳定初始化并支持后续数据写入。

- [x] 4. 创建核心数据表与仓储接口
  Includes: `prompt_events`、`experiences`、`reconciliation_runs`、`launcher_sessions` 的 schema 与 repository 抽象。
  Outcome: 事件、经验、运行记录、启动记录都有统一的数据访问层。

- [x] 5. 实现 hook payload 标准化与幂等指纹生成
  Includes: 提取 `prompt_text`、时间戳、`cwd`、可选 `session_id/thread_id`、元信息裁剪与指纹生成策略。
  Outcome: Hook 输入能被稳定转换成可落库的标准事件对象。

- [x] 6. 实现 prompt 事件入库链路
  Includes: 事件去重写入、`ingested_at/created_at` 处理、元信息持久化、hook ingestion service。
  Outcome: 每次用户 prompt 都能以 append-only 方式安全进入数据库。

- [x] 7. 接入 Codex hooks 安装与触发入口
  Includes: hooks 注册/更新命令、`UserPromptSubmit` 到入库逻辑的绑定、重复安装幂等处理。
  Outcome: 系统可以正式接管 prompt 采集，而不需要手工拼接流程。

- [x] 8. 实现经验重整 run 与事件认领机制
  Includes: `running` run 创建、单项目单 run 限制、未处理事件批量认领、claim 超时回收。
  Outcome: 新 prompt 能被可靠分批消费，不会因为进程中断而丢失。

- [x] 9. 实现经验重整输入组装器
  Includes: 加载已认领 prompt、加载当前 `active/decaying` experiences、按 `project_key` 隔离、控制 active 上限为 `50`。
  Outcome: LLM 能收到稳定、可控、项目隔离的重整输入。

- [x] 10. 实现 LLM 经验重整适配层
  Includes: 结构化输出 schema、`retain/update/merge/create` 动作解析、`kind` 规范化到五类、异常输出兜底。
  Outcome: 模型返回结果可以被程序稳定消费，而不是依赖自由文本解析。

- [x] 11. 实现经验生命周期更新与最终事务提交
  Includes: experience upsert/merge/archive、`first_seen_at/last_seen_at/last_reconciled_at/hit_count` 更新、event `processed_at` 标记、run 成败落库。
  Outcome: 经验更新与事件消费在同一最终事务内完成，避免半成功状态。

- [x] 12. 实现时间衰减与状态迁移
  Includes: `effective_score` 计算、`active/decaying/archived` 阈值规则、命中后重新激活逻辑。
  Outcome: 经验会随着时间自然降权，而不是永久累积。

- [x] 13. 实现运行时上下文渲染器
  Includes: 固定 section 模板、按 `kind` 分组、仅渲染 `canonical_text`、运行时注入条数限制为前 `20` 条。
  Outcome: 数据库经验可以被稳定转换成适合 Codex 会话消费的项目级上下文。

- [x] 14. 实现底层 Codex 启动器与注入策略抽象
  Includes: wrapper 调起底层 `codex`、优先指令层注入、失败时回退到启动 prompt、`launcher_sessions` 记录。
  Outcome: 启动流程可以在不改全局 `AGENTS.md` 的前提下完成动态上下文注入。

- [x] 15. 串联 wrapper 端到端启动闭环
  Includes: `cwd -> project_key -> experiences -> runtime_context -> codex launch` 全链路编排、无经验场景降级处理、参数透传。
  Outcome: 用户通过 wrapper 启动时能拿到当前项目的动态经验上下文。

- [x] 16. 提供经验重整调度入口
  Includes: 手动执行命令、周期执行入口、按项目避免重复并发、空批次跳过逻辑。
  Outcome: 系统可以按周期持续学习，而不是只停留在采集阶段。

- [x] 17. 补充最低必要的运维与诊断命令
  Includes: 数据库初始化命令、hook setup 命令、手动 reconcile 命令、当前项目上下文预览命令。
  Outcome: 首版具备最小可操作性，便于安装、调试和验证学习结果。
