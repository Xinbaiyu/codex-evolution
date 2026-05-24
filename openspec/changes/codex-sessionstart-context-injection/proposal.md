# Codex SessionStart Context Injection

## Why

当前 `codex-evolution` 已经具备：

- `UserPromptSubmit` hook 采集 prompt
- SQLite 持久化 prompt / experiences
- LLM 周期性重整经验
- 运行时上下文渲染

但“经验注入到会话”的主路径仍然依赖 wrapper 启动命令：

- 用户通过 `cdxe` 或 `codex-evolution` 启动时，会把运行时上下文注入到底层 `codex`
- 如果用户直接打开 Codex 客户端，而不是通过 wrapper 启动，本次会话就拿不到项目经验

这带来一个明显问题：

1. **桌面客户端用户覆盖不足**：很多用户是直接打开 Codex 客户端使用，而不是从命令行进入
2. **注入通道与使用习惯不一致**：学习链已经由 hooks 驱动，但注入仍绑定在 wrapper 启动路径上
3. **重复注入风险**：如果未来再引入项目文件或其他注入通道，wrapper 注入可能造成上下文重复

同时，Codex 现有 hooks 体系已经支持在 `SessionStart` 时通过 `hookSpecificOutput.additionalContext` 注入 model-visible context，因此我们可以把注入主路径从 wrapper 切换到原生 hook。

## What Changes

### 1. 引入 `SessionStart` hook 原生上下文注入

- 注册新的 `SessionStart` hook
- 在会话刚开始时，根据当前 `cwd` 解析 `project_key`
- 从本地 SQLite 读取当前项目的 `active / decaying` experiences
- 渲染运行时上下文
- 通过 `hookSpecificOutput.additionalContext` 返回给 Codex

### 2. 将 `SessionStart` hook 作为默认注入主路径

- 直接打开 Codex 客户端时，也能获得项目经验注入
- `cdxe` 不再承担默认上下文注入职责
- wrapper 保留为初始化、调试、手动学习、CLI 入口和兼容 fallback 工具

### 3. 保留现有学习链，不重写经验提取架构

以下能力继续沿用：

- `UserPromptSubmit` prompt 采集
- SQLite 本地持久化
- `scheduler:tick / scheduler:watch`
- LLM 经验提取与 `candidate -> active`
- `context:preview` 运行时上下文渲染逻辑

本次变更只重构“注入通道”，不推翻当前学习系统。

### 4. 避免侵入用户全局或项目配置

本次变更明确不走以下方案作为主路径：

- 不修改用户全局 `project_doc_fallback_filenames`
- 不托管项目级 `AGENTS.override.md`
- 不要求用户改变 Codex 客户端启动方式

### 5. 更新诊断、安装与调试路径

- `hooks:install` / `hooks:uninstall` 需要支持 `SessionStart`
- `hooks:doctor` / `doctor` 需要检查 `SessionStart` hook 是否安装、trust、启用
- 初始化流程需要更明确提示用户：首次必须在 Codex 里 trust hook，否则桌面客户端也无法自动注入

## Capabilities

### New Capabilities

- `sessionstart-context-injection`: 在会话开始时通过 `SessionStart.additionalContext` 注入项目经验

### Modified Capabilities

- `codex-wrapper-launch`: 从“默认注入通道”降级为“辅助启动与调试入口”
- `runtime-context-injection`: 主通道从 `developer_instructions` 切换为 `SessionStart` hook 输出
- `hooks-installation-and-diagnostics`: 扩展为管理 `SessionStart` 与 `UserPromptSubmit`

## Impact

**新增模块方向**：

- `SessionStart` hook handler
- Codex hook 输出格式构造层
- SessionStart 运行时上下文注入服务

**需要改动的既有模块**：

- wrapper 启动参数构造逻辑
- hooks 安装/卸载/doctor
- onboarding 文案
- doctor 汇总结果

**需要保留的既有模块**：

- `prompt_events`
- `experiences`
- `reconciliation_runs`
- 经验重整与衰减逻辑
- `context:preview` 渲染器

## Assumptions

1. Codex 当前支持 `SessionStart.additionalContext` 作为 model-visible context 注入
2. `SessionStart` 注入不需要额外修改用户全局文档读取配置
3. 运行时上下文仍应保持轻量，只注入压缩后的项目经验，而非完整历史
4. 学习链继续以 `UserPromptSubmit` 为主要事件来源

## Out of Scope

- 改造经验提取算法本身
- 新增 Web UI
- 使用 `AGENTS.override.md` 或 fallback 文件做注入
- 在 `PreToolUse` 等其他 hook 事件里做额外上下文注入实验
