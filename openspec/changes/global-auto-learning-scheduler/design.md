# Technical Design: Global Auto Learning Scheduler

## Context

Codex Evolution 现在已经通过 `UserPromptSubmit` hook 全局采集 prompt，并用 `project_key` 区分项目。但 watcher 进程启动时只拿一个 `targetPath`，后续每小时只对这个路径对应的项目执行 `scheduler:tick`。这会造成一个断层：采集是全局的，学习却是单项目的。

本次改造把 watcher 的默认工作方式改成“全局扫描 + 按项目分组消费”。它不改变经验提取模型，也不混合项目经验，只修复自动调度入口太窄的问题。

## Goals

- 自动发现所有有待处理 prompt 的项目。
- 每个项目独立执行 reconciliation，保持经验隔离。
- 单个项目失败时不影响其他项目。
- 保留显式单项目 watcher，用于调试或用户主动限制范围。
- 让已安装用户在升级后可以自动从旧 watcher 迁移到新 watcher。

## Non-Goals

- 不改变 `prompt_events`、`experiences`、`reconciliation_runs` 的核心关系模型。
- 不在一次 reconciliation 中混合多个项目的 prompt。
- 不引入新的后台服务或队列系统。
- 不改变每个项目单批最多处理约 50 条 prompt 的策略。

## Decisions

### Decision 1: watcher 默认使用 global mode

`scheduler:enable` 在未传入目标路径时启用 `global` 模式。全局模式不需要固定 `targetPath`，而是从数据库中找出存在未处理 prompt 的项目。

显式传入路径时仍启用 `single` 模式：

```bash
cdxe scheduler:enable /path/to/project
```

### Decision 2: 每个 project_key 单独跑现有 runSchedulerTick

全局 runner 不重写 reconciliation。它只负责：

1. 查询待处理项目列表
2. 按项目调用现有 `runSchedulerTick({ projectKey })`
3. 聚合结果并输出日志

这样可以复用现有 claim、stale run、candidate/active、失败保护和 provider 错误摘要逻辑。

### Decision 3: 项目发现来自 prompt_events

新增 repository 方法按 `project_key` 聚合未处理 prompt：

```sql
SELECT project_key, COUNT(*) AS pending_count, MIN(created_at), MAX(created_at)
FROM prompt_events
WHERE processed_at IS NULL
GROUP BY project_key
ORDER BY MIN(created_at) ASC
LIMIT ?
```

claim 是否 stale 仍由每个项目的 `claimBatch` 负责判断。全局扫描只回答“哪些项目值得尝试”。

### Decision 4: 全局 runner 对项目失败 fail-soft

如果某个项目 reconciliation 失败：

- 当前项目 run 按现有逻辑标记 failed
- 当前项目 prompt claim 按现有逻辑释放
- 全局 runner 记录该项目失败摘要
- 继续处理下一个项目

这样 provider 对某一批输入失败不会让其他项目长期饥饿。

### Decision 5: watcher state/lock 记录 mode

新增或扩展以下字段：

- `autoLearning.mode`: `global` 或 `single`
- `autoLearning.maxProjects`: 单轮最多处理的项目数
- watcher lock 中记录同样字段

启动同步逻辑在发现旧 watcher 仍是 `single`，但 state 期望是 `global` 时，应停止旧进程并重启。

## Runtime Flow

```text
UserPromptSubmit hook
  -> prompt_events(project_key=A/B/C)

scheduler:watch --global
  -> every interval
  -> list project_keys with unprocessed prompts
  -> for each project_key up to maxProjects
      -> runSchedulerTick(projectKey)
      -> write reconciliation_runs
      -> update experiences for that project
  -> log global summary
```

## CLI Behavior

### Default enable

```bash
cdxe scheduler:enable
```

启用全局 watcher。

### Single-project compatibility

```bash
cdxe scheduler:enable /path/to/project
cdxe scheduler:watch /path/to/project
```

只处理该项目。

### Manual global watch

```bash
cdxe scheduler:watch --global
```

用于前台调试全局 watcher。

## Risks

### Risk: 一轮处理项目太多导致 token 或时间不可控

Mitigation: 引入 `--max-projects`，默认限制为 10。每个项目仍使用现有单批 prompt 上限。

### Risk: 旧 watcher 升级后继续单项目运行

Mitigation: state/lock 记录 mode，同步逻辑把期望 mode 纳入 runtime current 判断。

### Risk: 某个项目长期失败造成噪音

Mitigation: fail-soft 记录失败摘要，并保留 `scheduler:history <project>` 查看项目级失败。后续可加 backoff，本次先不引入复杂策略。

## Open Questions

- 是否需要在 `scheduler:history` 增加全局聚合视图。首版可以先保留项目级历史，并在 README 说明查看方式。
