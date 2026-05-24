# codex-evolution

[![npm version](https://img.shields.io/npm/v/codex-evolution)](https://www.npmjs.com/package/codex-evolution)
[![npm downloads](https://img.shields.io/npm/dm/codex-evolution)](https://www.npmjs.com/package/codex-evolution)
[![license](https://img.shields.io/npm/l/codex-evolution)](./LICENSE)

![codex-evolution：让 Codex 拥有项目记忆](https://raw.githubusercontent.com/Xinbaiyu/codex-evolution/main/assets/csdn-cover.png)

给 Codex 加一层看得见、管得住的项目记忆。

如果你经常反复告诉 Codex：

- “复杂需求先讨论方案，再进入实现”
- “这个项目用中文沟通”
- “发布前先更新版本号和 CHANGELOG”
- “不要改用户已有的 AGENTS.md”

Codex 官方 Memories 已经能记住偏好、工作流和项目约定。`codex-evolution` 做的是另一件更朴素的事：把这些长期会复用的项目经验存到本地 SQLite，按当前目录隔离，并在下一次会话开始时通过 `SessionStart` 明确注入给 Codex。

这样你不用每次开新会话都重新交代一遍，也不用猜“这次到底召回了什么”。经验可以预览，可以诊断，也可以清理。

## 为什么值得安装

- **直接适配 Codex 客户端和命令行**：靠 `SessionStart` hook 注入上下文，不要求你每次都从 wrapper 启动。
- **项目经验按目录隔离**：同一条协作规则只影响对应项目，不会随便污染别的仓库。
- **不接管用户项目文件**：默认不改 `AGENTS.md`，也不托管 `AGENTS.override.md`。
- **不会把口头禅当经验**：像“继续”“可以”“ok”这类 prompt 会被过滤，候选经验需要重复支撑才会进入上下文。
- **本地优先，随时可查可删**：prompt、经验和运行状态都在 `~/.codex-evolution`。
- **中文用户少一点折腾**：初始化、doctor、help、状态检查都优先输出中文。

当前能力：

- `project_key` 隔离
- `UserPromptSubmit` hook 采集 prompt
- `SessionStart` hook 注入项目经验
- candidate -> active 经验晋升
- 可编辑的经验提取策略 Markdown
- 全局自动学习 watcher：扫描所有有 pending prompt 的项目，并按项目分别学习
- 重复支撑会提升经验置信度，避免稳定经验被单次低分覆盖
- 经验重整、衰减与归档
- `openai-compatible` / `codex-exec` 学习 provider

## 核心思路

`codex-evolution` 没有去改全局 `AGENTS.md`。它走的是 hooks + 本地记忆：

- 通过 `UserPromptSubmit` hook 收集用户 prompt
- 后台定期扫描所有有 pending prompt 的项目
- 对每个项目分别用可配置 LLM 提取长期项目经验
- 系统根据当前目录识别项目
- 从本地数据库读取该项目经验
- 通过 `SessionStart` hook 在会话开始时注入上下文
- `cdxe` 负责初始化、安装 hooks、诊断、手动学习和启动底层 `codex`

## 和 Codex 官方 Memories 的关系

Codex 官方 Memories 是 Codex 自带的记忆能力。它可以从过往会话里学习稳定偏好、工作流、技术栈和项目约定，并在后续任务里召回。

官方文档可以参考：[Codex Memories](https://developers.openai.com/codex/memories)。

`codex-evolution` 更偏项目侧。它关心的是这几个问题：

- `context:preview` 能不能看到下一次会注入什么？
- 这条经验是候选、已激活，还是正在衰减？
- 当前仓库和其他仓库的经验有没有隔离？
- 学习链路失败了，能不能用 `doctor` 和 `reconcile:status` 查出来？
- provider 想换成 `codex-exec` 或 `openai-compatible`，是不是足够简单？

简单说：官方 Memories 是 Codex 的原生记忆；`codex-evolution` 是一层更透明的项目经验管理工具。

## 经验如何变得稳定

`codex-evolution` 不会把每一句话都立刻写进上下文。它会先把单次命中的长期规则放进 `candidate`，等语义相近的 prompt 再次出现后才升级为 `active`。

经验被重复支撑后，系统会给它更稳定的置信度下限：

- 2 条 prompt 支撑：`confidence` 至少 `0.7`
- 3 条 prompt 支撑：`confidence` 至少 `0.8`
- 5 条 prompt 支撑：`confidence` 至少 `0.9`

如果已有经验的置信度更高，后续命中不会因为 LLM 单次打低分而被降下来。长期不再命中的经验会逐步从 `active` 进入 `decaying`，最后归档为 `archived`，不再注入上下文。

## 自定义经验提取策略

默认情况下，`codex-evolution` 会使用中文策略来判断哪些 prompt 值得沉淀为长期经验。首次初始化会自动生成一份本地 Markdown 策略文件，方便高级用户直接编辑学习风格。

默认路径：

```text
~/.codex-evolution/reconciliation-policy.md
```

这份文件只控制“什么应该被学习、什么应该被忽略、经验应该怎么表达”。系统仍会固定维护 JSON 输出协议、kind 枚举、`matchedPromptIds` 校验、candidate -> active 晋升、confidence 下限、衰减和归档规则。

如果你之前没有生成过，或者想手动补建：

```bash
cdxe policy:init
```

如果想生成英文示例：

```bash
cdxe policy:init --lang en
```

查看当前实际生效的策略：

```bash
cdxe policy:show
```

改完 `reconciliation-policy.md` 后不需要重启。下一次手动执行 `cdxe scheduler:tick`，或后台自动学习 watcher 下一轮运行时，都会重新读取这个 Markdown 文件并立即使用最新策略。

如果这个文件不存在，系统仍会自动 fallback 到内置中文模板，开箱行为不变。

`cdxe doctor` 会检查这份策略文件是否已经生成：已生成时显示“通过”，未生成但可 fallback 时显示“提示”，并给出 `cdxe policy:init` 补建建议。

## 30 秒开始

```bash
npm install -g codex-evolution
cdxe
```

首次启动会自动初始化本地数据库、安装 hooks，并引导你配置学习模型。

进入 Codex 后执行：

```text
/hooks
```

然后 trust 这两条命令：

- `UserPromptSubmit`：采集你的 prompt，用于后续学习
- `SessionStart`：会话开始时注入项目经验

完成后，即使你后续直接从 Codex 客户端打开项目，也会在 `SessionStart` 时读取当前目录的项目经验并注入到本次会话。

## 日常只记住 4 个命令

```bash
cdxe                  # 启动 Codex，并确保初始化流程已完成
cdxe doctor           # 检查 hooks、学习模型、自动学习和上下文注入是否健康
cdxe context:preview  # 预览当前项目会注入给 Codex 的经验
cdxe scheduler:tick   # 手动触发一次经验提取
```

## 目录结构

- [src/cli.js](./src/cli.js): CLI 入口
- [src/hooks](./src/hooks): Codex hooks、prompt 采集与 SessionStart 注入
- [src/reconciliation](./src/reconciliation): 经验重整
- [src/runtime](./src/runtime): 运行时上下文渲染
- [src/providers](./src/providers): 学习 provider
- [src/storage](./src/storage): SQLite 与 repositories

## 快速开始

### 安装

全局安装：

```bash
npm install -g codex-evolution
```

安装后推荐直接使用：

```bash
cdxe
```

完整命令也保留可用：

```bash
codex-evolution
```

开发联调时也可以直接在仓库里：

```bash
npm link
```

### 首次启动

直接运行推荐使用短命令：

```bash
cdxe
```

完整命令也同样可用：

```bash
codex-evolution
```

如果你还没做全局安装，也可以直接本地运行：

```bash
npm start
```

如果想把命令链接到全局：

```bash
npm link
cdxe -help
```

查看中文帮助：

```bash
cdxe -help
codex-evolution -help
```

如果你想快速跑一轮完整体验，不自己手动造 prompt，可以直接执行：

```bash
cdxe demo:experience
```

或者：

```bash
npm run demo:e2e
```

如果想重新体验初始化流程：

```bash
cdxe onboarding:reset
```

如果想连学习模型配置一起清掉，重新走完整初始化：

```bash
cdxe onboarding:reset --include-config
```

首次启动现在会自动做这些事：

- 初始化本地 SQLite 数据库
- 检查并自动安装 `UserPromptSubmit` 与 `SessionStart` hooks
- 在终端明确提醒你：进入 Codex 后需要执行 `/hooks` 并 trust 这两条命令
- 如果还没配置学习模型，进入一次简短引导
- 连通性检查通过后，可选开启后台自动学习

trust 完成后，即使你后续直接从 Codex 客户端打开项目，也会在 `SessionStart` 时读取当前目录的项目经验并注入到本次会话。

如果你更喜欢手动控制，也可以继续用下面这些显式命令。

### 升级

如果你是全局安装的，升级到最新版：

```bash
npm install -g codex-evolution@latest
```

如果你已经开启了后台自动学习，升级完成后会 best-effort 自动同步 watcher：旧进程会被停止，新版本会按原来的 `intervalSeconds` 重新拉起。新版默认使用全局自动学习模式，不再只盯着某一个项目路径，而是扫描本地数据库里所有有 pending prompt 的项目，并按项目分别学习。

这个同步只发生在“自动学习已开启”的情况下，不会在安装时替你擅自开启新进程。你也可以随时用 `cdxe scheduler:enable /path/to/project` 显式切回单项目 watcher。

升级后建议执行一次：

```bash
cdxe doctor
```

### 卸载

由于 npm 不会自动帮我们执行卸载清理，推荐先运行：

```bash
cdxe cleanup
```

如果你还想一并删除本地数据库、状态文件和日志：

```bash
cdxe cleanup --include-home
```

然后再卸载全局包：

```bash
npm uninstall -g codex-evolution
```

### 1. 初始化数据库

```bash
cdxe db:init
```

### 2. 安装 hooks

```bash
cdxe hooks:install
```

检查 hook 是否真的安装并被 Codex trust：

```bash
cdxe hooks:doctor
```

如果你只想移除 hook：

```bash
cdxe hooks:uninstall
```

想一次性检查整套系统是否健康：

```bash
cdxe doctor
```

如果你想直接查看 SQLite 里最近收集到的 prompt：

```bash
cdxe prompts:list
cdxe prompts:list --limit 50
cdxe prompts:list --guidance-only
cdxe prompts:list --pending-only
cdxe prompts:list --json
```

如果你想拿结构化输出：

```bash
cdxe doctor --json
```

如果你希望它顺手自动修一部分本地问题：

```bash
cdxe doctor --fix
```

### 3. 初始化学习 provider 配置

默认生成 `openai-compatible` 配置：

```bash
cdxe config:init
```

如果你只想继续试 `codex-exec`：

```bash
cdxe config:init codex-exec
```

配置模板见：

- [config.example.json](./config.example.json)

### 4. 填学习模型配置

默认配置文件位置：

```text
~/.codex-evolution/config.json
```

本地调试时也可以用：

```bash
CODEX_EVOLUTION_HOME=.codex-evolution-local npm start -- config:init
```

例如：

```json
{
  "reconcile": {
    "provider": "openai-compatible",
    "model": "gpt-4.1-mini",
    "baseURL": "https://api.openai.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "policyPath": "reconciliation-policy.md",
    "timeoutMs": 90000
  }
}
```

说明：

- `baseUrl` 和 `baseURL` 都支持
- 也可以不用内嵌 `apiKey`，改用 `apiKeyEnv`
- `policyPath` 是可选项，默认解析到 `~/.codex-evolution/reconciliation-policy.md`
- `timeoutMs` 默认 90000；如果使用 Claude Opus 这类较慢模型，不建议设得过低
- 环境变量优先级高于配置文件

### 5. 验证配置

查看当前实际解析出来的配置：

```bash
cdxe config:show
```

这里会同时显示：

- `configPath`
- `statePath`
- `configFileExists`
- 脱敏后的学习 provider 配置摘要

探测学习 provider 是否可用：

```bash
cdxe reconcile:probe
```

### 6. 跑一次真实学习

```bash
cdxe scheduler:tick
```

### 6.1 一键体验完整链路

如果你已经配好了学习 provider，想快速验证：

- prompt 入库
- 学习执行
- 经验生成
- 上下文更新

可以直接跑：

```bash
cdxe demo:experience
```

它会在当前项目根目录下创建一个隔离的 demo home：

```text
<project>/.codex-evolution-demo
```

默认行为：

- 注入 3 条示例 prompt
- 执行一次真实学习
- 输出最终经验和运行时上下文预览

如果你想保留上一次 demo 数据，不重置 demo home：

```bash
cdxe demo:experience --keep-home
```

如果你想拿结构化结果：

```bash
cdxe demo:experience --json
```

### 7. 启动持续学习循环

```bash
cdxe scheduler:watch --global --interval-seconds 3600
```

如果想把后台自动学习交给系统托管，也可以用：

```bash
cdxe scheduler:enable --interval-seconds 3600
```

默认情况下，`scheduler:enable` 会开启全局 watcher。它每小时扫描一次本地数据库，把所有有 pending prompt 的项目找出来，然后逐个项目执行学习。每个项目仍然有自己的 `project_key`、经验库和 reconciliation run，不会把不同仓库的经验混在一起。

如果你只想调试或托管单个项目，可以显式指定项目路径：

```bash
cdxe scheduler:enable /path/to/project --interval-seconds 3600
```

调试时可以只跑一次：

```bash
cdxe scheduler:watch --global --interval-seconds 5 --max-runs 1
```

如果你担心一次扫描项目太多，可以限制单轮最多处理几个项目：

```bash
cdxe scheduler:enable --max-projects 5
```

### 8. 查看学习结果

```bash
cdxe reconcile:status
cdxe context:preview
```

### 9. 停止或关闭后台自动学习

临时停止当前 watcher：

```bash
cdxe scheduler:stop
```

彻底关闭自动学习，并阻止后续启动时自动拉起：

```bash
cdxe scheduler:disable
```

查看后台自动学习日志：

```bash
cdxe scheduler:logs
cdxe scheduler:logs --lines 200
```

查看自动学习历史、每次触发时间和执行结果：

```bash
cdxe scheduler:history
cdxe scheduler:history --limit 50
cdxe scheduler:history --json
```

## 常用命令

```bash
cdxe [codex args...]
cdxe db:init
cdxe cleanup [--include-home]
cdxe demo:experience [path] [--keep-home] [--json]
cdxe config:init [provider] [--force]
cdxe config:show
cdxe policy:init [--lang zh|en] [--force]
cdxe policy:show [--json]
cdxe doctor [path] [--fix] [--json]
cdxe onboarding:reset [--include-config]
cdxe hooks:install [hooks-path]
cdxe hooks:doctor
cdxe hooks:uninstall [hooks-path]
cdxe hook:user-prompt-submit
cdxe hook:session-start
cdxe prompts:list [path] [--limit N] [--guidance-only] [--ignored-only] [--pending-only] [--json]
cdxe project-key [path]
cdxe reconcile:probe [path]
cdxe reconcile:status [path]
cdxe reconcile:prepare [path]
cdxe reconcile:apply <run-id>
cdxe reconcile:decay [path]
cdxe scheduler:tick [path]
cdxe scheduler:enable [path] [--global] [--interval-seconds N] [--max-projects N]
cdxe scheduler:stop
cdxe scheduler:disable
cdxe scheduler:logs [--lines N]
cdxe scheduler:history [path] [--limit N] [--json]
cdxe scheduler:watch [path] [--global] [--interval-seconds N] [--max-runs N] [--max-projects N]
cdxe context:preview [path]
```

`codex-evolution` 完整命令名与 `cdxe` 等价，文档里默认使用短命令。

## 发布到 npm

当前机器的默认 npm registry 如果不是官方源，发布前请先确认：

```bash
npm config get registry
```

这个项目已经在 `package.json` 里设置了：

- `publishConfig.registry = https://registry.npmjs.org/`

所以正常发布时会优先走官方 npm registry。

推荐发布前执行：

```bash
npm test
env npm_config_cache=$(pwd)/.npm-cache npm pack --dry-run
npm publish --registry https://registry.npmjs.org/
```

如果你想先确认当前登录的官方 npm 账号，也可以执行：

```bash
npm whoami --registry https://registry.npmjs.org/
```

## 学习 provider

### `codex-exec`

优点：

- 零额外配置
- 直接复用本机 `codex`

限制：

- 容易受本机 Codex 网络、认证、skills 环境影响

### `openai-compatible`

优点：

- 更稳定
- 更容易接 OneAPI / OpenRouter / 兼容网关
- 不依赖 `codex exec`

要求：

- 兼容 `POST /chat/completions`
- 返回标准 chat completion JSON
- 如果接入 Claude / Bedrock 这类 OpenAI-compatible 网关，`codex-evolution` 会只发送 `user` role，避免部分网关不支持 `developer` role 导致 400
- 默认 `timeoutMs` 为 90000；如果使用 Claude Opus 等较慢模型，不建议改回 30000

## `reconcile:status` 会看什么

这个命令会输出：

- 当前项目 `project_key`
- 当前生效的学习 provider 配置摘要
- 当前 auto-learning 状态
- auto-learning 当前是 `global` 还是 `single` 模式
- prompt 总数 / pending 数
- 最近 5 次 reconciliation run
- 当前 active/decaying experiences

它是目前最直接的“学习链有没有在工作”的观察入口。

## `doctor` 会看什么

`doctor` 默认会做一轮完整健康检查，并且会真实调用当前学习 provider 做一次 probe。

它会检查：

- 本地目录、配置文件、数据库和核心表是否正常
- 当前目录如何解析为 `project_key`
- `UserPromptSubmit` / `SessionStart` hooks 是否安装、启用、已 trust
- 当前学习 provider 是否真实可用
- openai-compatible 的 `timeoutMs` 是否过低
- 当前项目 prompt / learning run / experience 状态
- 自动学习 watcher 是否运行、锁文件和日志是否正常
- 自动学习 watcher 当前模式、单轮项目上限和托管状态
- 运行时上下文是否可正常渲染

默认输出是中文摘要，适合人直接看：

```bash
cdxe doctor
```

如果你愿意让它自动修一部分安全的本地问题，例如：

- 初始化/修复数据库
- 自动安装缺失的 Codex hooks
- 当自动学习本来就已开启但 watcher 挂掉时，尝试重新拉起

可以用：

```bash
cdxe doctor --fix
```

如果你想让别的脚本消费结果，可以用：

```bash
cdxe doctor --json
```

## 当前验证状态

当前代码已经验证过这些链路：

- `UserPromptSubmit` prompt 入库
- `scheduler:tick` 经验提取
- `context:preview` 上下文预览
- `SessionStart` hook 返回 `additionalContext`
- `hooks:install` 同时安装 `UserPromptSubmit` 与 `SessionStart`
- `hooks:doctor` 检查双 hook 安装和 trust 状态
- `cdxe` 默认透传启动参数，避免重复注入 `developer_instructions`
- 全局 watcher 按项目发现 pending prompt，并隔离处理单项目失败

并且测试已覆盖：

- provider 配置解析
- prompt 入库
- 经验重整
- 衰减
- 配置初始化与展示
- 运行时上下文渲染
- SessionStart fail-open
- 双 hook 安装、卸载与诊断
- 全局自动学习调度、项目失败隔离和 watcher mode 迁移

## 测试

```bash
npm test
```

## 发布前检查

发布前建议至少执行：

```bash
npm run release:check
```

如果你只想看最终会被发布哪些文件：

```bash
npm run pack:check
```

建议发布流程：

1. `npm test`
2. `npm run pack:check`
3. 先更新 [package.json](./package.json) 中的版本号
4. 再更新 [CHANGELOG.md](./CHANGELOG.md)
5. 再执行 `npm publish`
