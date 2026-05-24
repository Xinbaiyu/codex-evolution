export const DEFAULT_RECONCILIATION_POLICY_LANGUAGE = 'zh';

export const RECONCILIATION_POLICY_TEMPLATES = {
  zh: `# 经验提取策略

## 目标

从用户 prompt 中提取长期可复用的项目协作经验。

只保留未来 session 中仍然有价值的项目规则、协作偏好、工程流程或硬约束。

## 优先提取

- 沟通偏好
- 工作流偏好
- 架构偏好
- 安全或发布约束
- 稳定的项目约定

## 应该提取

- 复杂需求先讨论方案，再进入实现。
- 这个项目统一使用中文交流。
- 大型变更前先使用 OpenSpec 做系统分析。
- 发布前先更新版本号和 CHANGELOG。
- 不要改用户已有的 AGENTS.md。
- 重构风险逻辑前先补测试。

## 应该忽略

- 继续
- 可以
- ok
- 单次任务指令
- 临时调试上下文
- 当前回合才有效的信息
- 纯反馈或情绪表达

## 表达风格

如果用户 prompt 是中文或中英混合，经验使用中文。

如果用户 prompt 明确是英文，经验可以使用英文。

经验应该写成直接的项目规则，而不是用户画像。

推荐：

- 复杂需求先讨论方案，再进入实现。
- 发布前先更新版本号和 CHANGELOG。

避免：

- 用户喜欢先讨论方案。
- 用户希望发布前更新版本号。

## 排序偏好

优先保留：

- 会影响很多后续任务的规则
- 能减少用户重复提醒的规则
- 能避免危险、破坏性或不可逆操作的约束
- 用户重复表达或强烈强调的偏好

降低优先级：

- 只适用于当前任务的细节
- 过于抽象、不可执行的总结
- 与已有经验语义重复但没有新增信息的内容

## 项目自定义偏好

- 如果用户提到 OpenSpec，优先判断为 workflow 类长期经验。
- 如果用户提到 TDD，优先判断为 workflow 或 constraint 类经验。
- 如果用户提到 npm 发布，优先提取发布流程相关经验。
`,
  en: `# Reconciliation Policy

## Goal

Extract long-term, reusable project collaboration experiences from user prompts.

Only keep project rules, collaboration preferences, engineering workflows, or hard constraints that should remain useful across future sessions.

## Extraction Priorities

- Communication preferences
- Workflow preferences
- Architecture preferences
- Safety or release constraints
- Stable project conventions

## Keep

- Discuss the plan before implementing complex requirements.
- Use Chinese for this project.
- Use OpenSpec for system analysis before large changes.
- Update version and CHANGELOG before publishing.
- Do not modify user-owned AGENTS.md files.
- Add tests before refactoring risky logic.

## Ignore

- Continue.
- OK.
- Looks good.
- One-off task instructions.
- Temporary debugging context.
- Information that only applies to the current turn.
- Pure feedback or emotional reactions.

## Language Style

Use the main language of the supporting prompts.

When the prompt is Chinese or mixed Chinese-English, write the experience in Chinese.

When the prompt is clearly English, write the experience in English.

Write each experience as a direct project rule, not as a user profile.

Prefer:

- Discuss the plan before implementing complex requirements.
- Update version and CHANGELOG before publishing.

Avoid:

- The user likes discussing plans first.
- The user wants version and CHANGELOG updates before publishing.

## Ranking

Rank higher when the experience:

- Affects many future tasks.
- Reduces repeated user reminders.
- Prevents risky, destructive, or irreversible behavior.
- Reflects a repeated or strongly worded user preference.

Rank lower when the experience:

- Only applies to the current task.
- Is too vague to execute.
- Duplicates an existing experience without adding meaning.

## Project-Specific Preferences

- If the user mentions OpenSpec, prefer treating it as workflow guidance.
- If the user mentions TDD, prefer treating it as workflow or constraint guidance.
- If the user mentions npm publishing, prefer extracting release-process guidance.
`,
};

export function normalizePolicyLanguage(language) {
  return language === 'en' ? 'en' : DEFAULT_RECONCILIATION_POLICY_LANGUAGE;
}

export function getReconciliationPolicyTemplate(language = DEFAULT_RECONCILIATION_POLICY_LANGUAGE) {
  return RECONCILIATION_POLICY_TEMPLATES[normalizePolicyLanguage(language)];
}
