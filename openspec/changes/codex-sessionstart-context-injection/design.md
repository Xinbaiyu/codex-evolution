# Technical Design: Codex SessionStart Context Injection

## Context

### Current State

- 当前系统的学习闭环已经成立：
  - `UserPromptSubmit` 采集 prompt
  - SQLite 持久化
  - LLM 周期性提取经验
  - `context:preview` 渲染运行时上下文
- 当前默认注入路径是 wrapper 启动时使用 `developer_instructions`
- 用户直接打开 Codex 客户端时，不会走 wrapper，因此无法得到项目经验注入

### Proposed State

系统改成“双层结构”：

1. hooks 负责：
   - 采集 prompt
   - 在 `SessionStart` 时把最新项目经验注入当前会话
2. wrapper 负责：
   - 初始化与安装
   - 调试与手动控制
   - 保留可选 fallback 注入模式，但不再作为默认路径

这意味着：

- 桌面客户端用户无需改变启动习惯
- CLI 用户依然可以使用 `cdxe`
- 学习与注入都统一在 Codex 原生 hooks 体系下完成

## Goals / Non-Goals

### Goals

- 让直接打开 Codex 客户端的用户也能获得项目经验注入
- 使用 `SessionStart.additionalContext` 作为默认注入通道
- 复用现有 SQLite、经验提取、衰减和渲染逻辑
- 避免修改用户全局 `project_doc_fallback_filenames`
- 避免托管项目级 `AGENTS.override.md`

### Non-Goals

- 不重写学习系统本身
- 不让 `SessionStart` 承担 LLM 推理或经验提取
- 不增加新的项目文档托管文件
- 不在本次重构里引入多种默认注入通道并行工作

## Decisions

### Decision 1: `SessionStart.additionalContext` 成为默认注入主路径

**选择**：在会话启动时，通过 `SessionStart` hook 返回：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<runtime-context>"
  }
}
```

**Rationale**

- 直接适配 Codex 客户端用户
- 不依赖 wrapper 启动
- 与 `claude-mem` 的核心注入思路一致，但不需要引入额外 worker
- 避免全局配置或项目文件托管带来的副作用

### Decision 2: `SessionStart` 只读本地状态，不调用 LLM

**选择**：`SessionStart` 注入必须是轻量、同步、可快速返回的路径。

**Behavior**

- 解析当前 `cwd`
- 解析 `project_key`
- 读取 `active / decaying` experiences
- 渲染运行时上下文
- 直接返回 `additionalContext`

**Rationale**

- hook 注入应尽量快，避免影响会话启动体验
- 启动时调用 LLM 会增加时延、费用和失败面
- 经验学习仍由 `scheduler:tick / scheduler:watch` 负责

### Decision 3: wrapper 默认不再追加 `developer_instructions`

**选择**：当前 `buildCodexLaunchArgs()` 默认模式从 `developer_instructions` 调整为 `none` 或等价的“纯透传”模式。

**Behavior**

- `cdxe` 默认仅启动底层 Codex，不重复注入上下文
- 真正的上下文注入依赖 `SessionStart`
- 保留显式调试开关：
  - `developer_instructions`
  - `startup_prompt`
  - `none`

**Rationale**

- 避免与 `SessionStart` 双注入
- 让桌面客户端和 CLI 用户走统一的默认注入通道
- 为调试留出显式 fallback 能力

### Decision 4: 不改用户全局 fallback 配置，不托管 `AGENTS.override.md`

**选择**：不使用：

- `project_doc_fallback_filenames`
- `AGENTS.override.md`

作为默认注入主路径。

**Rationale**

- `project_doc_fallback_filenames` 会影响用户全局 Codex 文档发现策略
- `AGENTS.override.md` 可能压过用户现有 `AGENTS.md`
- 两者都比 `SessionStart.additionalContext` 更侵入用户环境

### Decision 5: hooks 安装器扩展为管理多事件 hook

**选择**：当前仅管理 `UserPromptSubmit` 的 hooks 安装逻辑，要升级为至少支持：

- `UserPromptSubmit`
- `SessionStart`

**Behavior**

- 安装时幂等追加或更新命令
- 卸载时只移除 `codex-evolution` 自己的 hook
- `hooks:doctor` 明确区分：
  - 是否安装
  - 是否 trust
  - 是否启用

### Decision 6: 运行时上下文渲染器复用现有实现

**选择**：`SessionStart` 使用现有的 `renderRuntimeContext()` 结果，不另起一套注入模板。

**Rationale**

- 避免同一项目同时存在两套上下文表达
- 保持 `context:preview` 与实际注入一致
- 降低重构风险

### Decision 7: fail-open，注入失败不阻断 Codex 启动

**选择**：如果 `SessionStart` 过程中发生以下问题：

- 数据库不可读
- `project_key` 解析失败
- 渲染失败

则 hook 返回空上下文或最小安全结果，不阻断 Codex 会话启动。

**Rationale**

- 经验注入是增强能力，不应成为会话可用性的单点故障
- 与当前学习链的“失败安全”原则一致

## Architecture

### Current

```text
cdxe launch
  -> resolve project_key
  -> query experiences
  -> render runtime context
  -> codex -c developer_instructions=...
```

### Proposed

```text
direct Codex launch OR cdxe launch
  -> Codex SessionStart hook
    -> codex-evolution hook:session-start
      -> resolve project_key by cwd
      -> query active/decaying experiences
      -> render runtime context
      -> return hookSpecificOutput.additionalContext

UserPromptSubmit hook
  -> prompt ingested into SQLite

scheduler:tick / scheduler:watch
  -> reconcile prompts into experiences
  -> next session sees updated context
```

## Data Model Impact

本次重构原则上不新增核心表。

可选扩展：

- `launcher_sessions` 可以增加一项字段，标识本次启动使用的注入通道：
  - `sessionstart`
  - `developer_instructions`
  - `startup_prompt`
  - `none`

这样便于排障与验证迁移效果。

## Runtime Behavior

### SessionStart Hook Flow

1. 读取 hook payload
2. 提取 `cwd`
3. `resolveProjectKey(cwd)`
4. 打开 SQLite
5. 查询当前项目 `active / decaying` experiences
6. `renderRuntimeContext(projectKey, experiences)`
7. 输出：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<rendered-context>"
  }
}
```

### Wrapper Launch Flow

1. 执行 onboarding
2. 确保 hooks / provider / db 就绪
3. 默认直接透传到底层 `codex`
4. 不再默认附加 `developer_instructions`

## Migration Strategy

### Phase 1: Additive

- 新增 `SessionStart` hook handler
- hooks installer 增加 `SessionStart`
- `context:preview` 继续可用
- `developer_instructions` 注入保留为可选调试模式

### Phase 2: Default Switch

- 把 wrapper 默认注入模式切到 `none`
- `SessionStart` 成为唯一默认注入主路径

### Phase 3: Cleanup

- 更新 doctor / onboarding / README
- 把“桌面客户端也支持项目记忆”作为默认产品行为说明

## Risks

### Risk 1: 用户未 trust `SessionStart` hook

**Impact**

- 直接打开 Codex 客户端时看不到经验注入

**Mitigation**

- onboarding 明确提示
- `hooks:doctor` / `doctor` 明确给出修复建议

### Risk 2: `SessionStart` 注入与 wrapper 注入重复

**Impact**

- 同一经验进入上下文两次

**Mitigation**

- 默认禁用 wrapper 注入
- 仅保留显式调试开关

### Risk 3: hook 返回过长上下文

**Impact**

- 增加 token 消耗，影响模型聚焦

**Mitigation**

- 继续沿用 `renderRuntimeContext()` 的条数限制
- 仅注入 `active / decaying`

## Test Plan

- `SessionStart` hook 在有经验时返回 `hookSpecificOutput.additionalContext`
- `SessionStart` hook 在无经验时返回空或最小上下文，不报错
- 直接打开 Codex 客户端时，`debug prompt-input` 能看到注入内容
- `cdxe` 默认启动时不再重复注入 `developer_instructions`
- `hooks:install` 会幂等安装 `SessionStart` 和 `UserPromptSubmit`
- `hooks:doctor` 能识别 `SessionStart` 的安装、trust、启用状态
- `context:preview` 与 `SessionStart` 实际注入内容保持一致
