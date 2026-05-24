## Why

当前自动学习 watcher 只绑定一个启动目录，导致 hooks 已经采集到其他项目的 prompt，却不会被周期性 reconciliation 消费。用户从 Codex 客户端跨项目工作时，学习链路需要按 `project_key` 自动发现并处理所有待学习项目，而不是只盯住安装或启动 watcher 时所在的项目。

## What Changes

- 将自动学习 watcher 扩展为支持全局模式，周期性扫描本地 `prompt_events` 中所有存在未处理 prompt 的 `project_key`。
- 每个项目独立执行一次学习批次，继续保持经验、reconciliation run、上下文注入都按项目隔离。
- 单个项目失败不阻断其他项目学习，失败项目保留原有 claim 释放和 run 记录。
- 保留单项目 watcher 兼容能力，方便调试或明确只处理某个项目。
- 更新 scheduler 相关命令、doctor/状态输出和 README，使用户能理解“全局采集、按项目学习”的默认行为。

## Capabilities

### New Capabilities

- `global-auto-learning-scheduler`: 自动学习 watcher 能发现并处理多个项目的待学习 prompt。

### Modified Capabilities

- `auto-learning-scheduler`: 默认自动学习从单项目目标演进为全局按项目分组调度，单项目模式作为显式兼容路径保留。

## Impact

- 影响 CLI 命令：`scheduler:enable`、`scheduler:watch`、`scheduler:status`、`scheduler:history` 的文案和部分参数。
- 影响调度实现：需要新增按 `project_key` 查询待处理 prompt、全局 tick runner、全局 watcher 日志汇总。
- 影响 watcher 进程管理：state/lock 需要记录 mode 与 maxProjects，升级后能识别旧单项目 watcher 并重启到新模式。
- 影响文档和发版元数据：README、CHANGELOG、`package.json` 需要同步更新。
