# Implementation Tasks

- [x] 1. 实现 `SessionStart` hook handler 与 Codex hook 输出构造
  Includes: 新增 `hook:session-start` 命令、读取 hook payload、解析 `cwd`、构造 `hookSpecificOutput.additionalContext` JSON。
  Outcome: Codex 在会话开始时可以拿到 model-visible 项目经验上下文。

- [x] 2. 复用现有经验查询与上下文渲染链路
  Includes: `resolveProjectKey`、SQLite 仓储、`renderRuntimeContext` 在 `SessionStart` 路径上的复用与异常兜底。
  Outcome: `SessionStart` 无需调用 LLM，仅基于本地经验快速渲染注入内容。

- [x] 3. 扩展 hooks 安装与卸载逻辑
  Includes: 在 `hooks:install` / `hooks:uninstall` 中幂等管理 `SessionStart` 与 `UserPromptSubmit` 两类 hook。
  Outcome: 初始化后，桌面客户端和 CLI 会话都能接入统一 hook 体系。

- [x] 4. 扩展 hooks 诊断能力
  Includes: `hooks:doctor` 检查 `SessionStart` 的安装、trust、启用状态，并更新 `doctor` 汇总输出。
  Outcome: 用户能直接定位“为什么桌面客户端没注入记忆”。

- [x] 5. 调整 wrapper 默认注入模式
  Includes: `buildCodexLaunchArgs` 增加 `none` 模式，并把默认模式从 `developer_instructions` 切换为 `none`；保留显式调试 fallback。
  Outcome: `cdxe` 与 `SessionStart` 不会发生双注入。

- [x] 6. 更新 onboarding 与帮助文案
  Includes: 首次初始化提示用户 trust `SessionStart` hook；说明直接打开 Codex 客户端也可获得项目记忆。
  Outcome: 用户安装后的心智模型与新架构一致。

- [x] 7. 保持学习链兼容
  Includes: 验证 `UserPromptSubmit`、`scheduler:tick`、`scheduler:watch`、candidate/active 流程在新注入架构下不回归。
  Outcome: 重构注入通道后，经验学习主链路仍然稳定。

- [x] 8. 增加自动化测试与端到端验证
  Includes: `SessionStart` hook 单测、hooks 安装/doctor 测试、`debug prompt-input` 验证、无经验 fail-open 场景验证。
  Outcome: 能证明桌面客户端与 CLI 两种入口都能正确获得项目经验上下文。
