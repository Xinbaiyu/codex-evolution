export function buildHelpText() {
  return `cdxe / codex-evolution

一个包在 codex 外层的轻量记忆系统。

用法:
  cdxe [codex args...]
  cdxe launch [codex args...]
  cdxe help | --help | -h | -help
  codex-evolution [codex args...]

配置与初始化:
  cdxe db:init
  cdxe cleanup [--include-home]
  cdxe demo:experience [path] [--keep-home] [--json]
  cdxe config:init [provider] [--force]
  cdxe config:show
  cdxe policy:init [--lang zh|en] [--force]
  cdxe policy:show [--json]
  cdxe doctor [path] [--fix] [--json]
  cdxe hooks:install [hooks-path]
  cdxe hooks:doctor
  cdxe hooks:uninstall [hooks-path]
  cdxe onboarding:reset [--include-config]

学习与状态:
  cdxe reconcile:probe [path]
  cdxe reconcile:status [path]
  cdxe reconcile:prepare [path]
  cdxe reconcile:apply <run-id>
  cdxe reconcile:decay [path]
  cdxe context:preview [path]
  cdxe project-key [path]
  cdxe prompts:list [path] [--limit N] [--guidance-only] [--ignored-only] [--pending-only] [--json]

调度控制:
  cdxe scheduler:tick [path]
  cdxe scheduler:enable [path] [--global] [--interval-seconds N] [--max-projects N]
  cdxe scheduler:stop
  cdxe scheduler:disable
  cdxe scheduler:logs [--lines N]
  cdxe scheduler:history [path] [--limit N] [--json]
  cdxe scheduler:watch [path] [--global] [--interval-seconds N] [--max-runs N] [--max-projects N]

诊断:
  cdxe codex:probe [path]
  cdxe hook:user-prompt-submit
  cdxe hook:session-start

说明:
  - \`cdxe\` 是 \`codex-evolution\` 的短命令别名
  - 默认行为等价于 \`cdxe launch\`
  - 首次启动会自动初始化本地数据库、检查并安装 Codex hooks
  - hooks 包含 UserPromptSubmit（采集 prompt）和 SessionStart（注入项目经验）
  - 首次安装 hooks 后，仍需你在 Codex 内执行 \`/hooks\` 并 trust 这两条命令
  - 如果还没配置学习 provider，会进入中文引导流程
  - \`policy:init\` 会生成可编辑的经验提取策略 Markdown，默认使用中文模板
  - \`scheduler:enable\` 默认开启全局自动学习：每小时扫描所有有 pending prompt 的项目并分别学习
  - 如果只想调试单个项目，可执行 \`cdxe scheduler:enable /path/to/project\`
  - \`doctor\` 会检查 hooks、学习模型、策略文件、自动学习和上下文注入
  - 全局升级后，已开启的后台自动学习 watcher 会 best-effort 同步到当前包版本
  - 项目经验默认通过 SessionStart 注入；直接打开 Codex 客户端也能生效
  - \`cdxe\` 默认不重复追加 developer_instructions，避免和 SessionStart 双注入
  - \`doctor\` 会执行真实学习模型探测，可能产生少量网络请求与模型调用开销
`;
}
