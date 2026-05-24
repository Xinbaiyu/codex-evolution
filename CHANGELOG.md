# Changelog

## 0.1.21

- 将 README 与 npm 包展示图片从 `docs/assets` 迁移到顶层 `assets`
- npm 发布文件改为包含 `assets/csdn-cover.png` 与 `assets/csdn-architecture.png`
- 本地 Git 仓库忽略 `docs/` 与 `tests/`，避免公开仓库带出测试路径或文档草稿

## 0.1.20

- 自动学习 watcher 默认升级为全局模式：扫描所有有 pending prompt 的项目，并按 `project_key` 分别执行学习
- 新增 `scheduler:watch --global`、`scheduler:enable --global` 与 `--max-projects`，可限制单轮最多处理的项目数
- watcher state/lock 新增 `mode` 与 `maxProjects`，升级后可识别旧单项目 watcher 并迁移到全局 watcher
- 单个项目学习失败不会阻断其他项目，本轮全局调度会汇总 success/skipped/failed 结果
- README、`cdxe -help`、`doctor` 与 `reconcile:status` 补充自动学习模式和项目上限信息

## 0.1.19

- 新增 `cdxe scheduler:history`，可查看当前项目自动学习总次数、状态分布、每次触发时间和执行结果
- 修复异常中断后 `reconciliation_runs` 长期停留在 `running`，导致 watcher 持续 `skipped=running-run-exists` 的问题
- 过期的 running run 会被自动标记为 failed，并释放已占用的 prompt claim，后续自动学习可继续推进
- README 与 `cdxe -help` 补充自动学习历史查询命令

## 0.1.18

- 修复 npm 全局升级后 postinstall 重启 watcher 时可能误用 npm 安装目录作为项目路径的问题
- `scheduler:enable` 会记录托管项目路径，并支持显式传入项目路径
- `doctor`、`reconcile:status` 和 watcher 锁文件会展示/保存自动学习的目标项目路径，便于排查后台学习是否跑在正确目录
- README 与 `cdxe -help` 补充 watcher 托管路径说明

## 0.1.17

- 全局安装或升级后，如果后台自动学习已开启，会 best-effort 自动同步 watcher 到当前包版本
- 普通 `cdxe` 命令启动前会自检 watcher 版本，发现旧版本或状态不一致时自动恢复
- watcher 收到停止信号后会中断等待中的 sleep，避免旧进程长期占用导致升级后仍运行旧代码

## 0.1.16

- 修复部分模型在 JSON 字符串中直接引用用户原话时未转义双引号，导致经验提取结果 `invalid_output_json` 的问题
- 强化 openai-compatible 提示词，要求引用用户原话时转义双引号或使用中文引号
- 保持 CLI 入口文件可执行，确保本地链接式全局安装后的 `cdxe` 可直接运行

## 0.1.15

- 修复部分 Claude/Bedrock OpenAI-compatible 网关不支持 `developer` role 导致经验提取 400 失败的问题
- openai-compatible 默认超时提升到 90 秒，降低大模型处理较多 prompt 时的误超时概率
- `cdxe doctor` 会提示 openai-compatible 的低 `timeoutMs` 配置，避免 Claude Opus 等模型在经验提取时误超时
- README 与配置示例补充 openai-compatible 超时建议
- 使用更自然的中文更新 README 与 CSDN 文章，减少模板化宣传表达

## 0.1.14

- `cdxe doctor` 新增“经验提取策略”检查项，可识别 `reconciliation-policy.md` 是否已生成，并在缺失时提示 fallback 与补建命令
- `cdxe -h`、README 与 CSDN 文案同步补充 doctor 对策略文件的诊断说明

## 0.1.13

- 重新递增发布版本，避免 npm registry 已存在 `0.1.12` 时无法覆盖发布

## 0.1.12

- 新增可编辑的经验提取策略 Markdown，首次初始化会自动生成中文默认模板
- `cdxe config:init` 也会自动补建默认策略文件，并提示用户可以编辑
- 支持 `cdxe policy:init --lang en` 生成英文策略模板，并支持 `cdxe policy:show` 查看当前生效策略
- reconciliation prompt 改为固定协议 + 用户策略 + 固定 schema/input 三层结构，避免用户策略破坏 JSON 输出协议
- 每次手动或后台经验提取都会重新读取策略文件，用户修改 `reconciliation-policy.md` 后下次提取立即生效
- README 与 CSDN 文案补充官方 Codex Memories 对比、自定义策略用法和生效时机

## 0.1.11

- 新增基于重复支撑次数的经验置信度下限，减少 LLM 单次低分导致的经验降级抖动
- 已有高置信度经验再次命中时不再被较低的 LLM 分数覆盖
- README 补充经验晋升、置信度提升与衰减归档规则说明
- CSDN 文章图片链接改为 GitHub raw 地址，方便复制发布后直接展示

## 0.1.10

- 将 README 顶部封面图改为 GitHub raw 链接，修复 npm 包页相对图片无法稳定展示的问题

## 0.1.9

- 更新 CSDN 文章草稿，改成更适合传播的项目记忆故事化介绍
- 新增 CSDN 封面图与架构图配图资源，方便文章发布和项目展示
- README 顶部新增封面图，提升 GitHub 与 npm 包页的第一眼吸引力
- 将 README 使用的图片加入 npm 发布文件，确保 npm 包页可以正常展示

## 0.1.8

- 重写 README 开头，突出“让 Codex 记住每个项目协作偏好”的使用价值
- 新增 npm version / downloads / license badges，并增加 30 秒开始与日常 4 个命令说明
- 清理 README 中的本机绝对路径、内部网关示例和过时的 `node src/cli.js` 用户命令
- 更新 npm package description 与 keywords，增强 npm 搜索和展示效果

## 0.1.7

- 新增 Codex `SessionStart` hook 注入通道，直接打开 Codex 客户端也可以注入项目经验
- `hooks:install` / `hooks:uninstall` / `hooks:doctor` 扩展为同时管理 `UserPromptSubmit` 与 `SessionStart`
- `cdxe` 默认不再通过 `developer_instructions` 重复注入上下文，避免和 `SessionStart` 双注入
- 更新 onboarding、doctor、cleanup、help 与 README 文案，明确提示用户需要 trust 两条 hooks
- 增加 `SessionStart` hook、双 hook 安装诊断、fail-open 与 wrapper 透传相关测试

## 0.1.6

- 补充 GitHub 仓库元信息，包括 `repository`、`homepage` 和 `bugs`
- 补充对外发布文档，增加 GitHub 发布清单与 CSDN 文章草稿
- 进一步完善 npm 发布前的对外展示与仓库落地准备

## 0.1.5

- 短命令别名从 `cex` 调整为 `cdxe`
- 中文帮助文案、README 示例与诊断建议改为优先使用 `cdxe`

## 0.1.3

- 修复指导性经验重筛时对包含“可以”的正常规则句误判为口头禅的问题
- 修复历史 OpenSpec 流程经验可能被错误归档的问题
- `cex -h` 帮助文案优先展示短命令写法

## 0.1.2

- 新增 `prompts:list` 命令，支持按当前项目查看最近收集到的 prompt
- 支持按指导性、已忽略、待学习等维度筛选 prompt
- 新增中文可读输出，并保留 `--json` 便于脚本化处理

## 0.1.1

- 新增短命令别名 `cex`
- 首次启动时增强 hook trust 中文提示，明确提醒用户进入 Codex 后执行 `/hooks`
- 默认自动学习频率调整为 1 小时一次，减少不必要的 token 消耗
- 发布配置固定为官方 npm registry，改进 npm 发布体验

## 0.1.0

- 初始 CLI 包骨架，提供 `codex-evolution` wrapper 入口
- 支持通过 Codex `UserPromptSubmit` hook 收集 prompt
- 支持本地 SQLite 存储、经验重整与时间衰减
- 支持 `openai-compatible` 与 `codex-exec` 学习 provider
- 支持运行时项目经验上下文注入
- 支持首次启动引导、自动学习 watcher、状态查看与日志查看
- 支持 `doctor` / `doctor --fix` 健康检查与本地自动修复
- 支持 `demo:experience` 端到端体验命令
- 支持发布前清理命令 `cleanup`
