# Implementation Tasks

- [x] 1. 增加待处理项目发现能力
  Includes: 在 prompt event repository 中按 `project_key` 聚合 `processed_at IS NULL` 的项目列表，返回 pending 数量和时间范围。
  Outcome: 调度层能知道哪些项目需要执行学习。

- [x] 2. 实现全局 scheduler tick runner
  Includes: 新增全局 runner，复用现有 `runSchedulerTick`，逐项目处理并聚合 success/skipped/failed 结果。
  Outcome: 一次 watcher tick 可以消费多个项目，但每个项目仍独立学习。

- [x] 3. 扩展 `scheduler:watch`
  Includes: 支持 `--global`、`--max-projects`，输出全局汇总日志，同时保留原有单项目路径。
  Outcome: 可以前台运行和调试全局 watcher。

- [x] 4. 扩展 `scheduler:enable/status` 与 watcher state/lock
  Includes: state/lock 记录 `mode`、`maxProjects`；默认 enable 使用 global；显式路径使用 single；同步逻辑识别 mode mismatch。
  Outcome: 新安装和升级后的后台 watcher 都能按期望模式运行。

- [x] 5. 补充测试
  Includes: repository 聚合测试、全局 runner 成功/失败隔离测试、watch/enable 参数与状态测试、旧 state 兼容测试。
  Outcome: 证明多项目学习不会破坏现有单项目调度。

- [x] 6. 更新文档与发版元数据
  Includes: README 说明全局 watcher 行为与命令、CHANGELOG 添加版本记录、`package.json` 递增版本号。
  Outcome: 用户升级后能理解默认行为变化，并满足发版准备要求。
