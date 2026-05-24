# Reconciliation Policy

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
