import path from 'node:path';
import process from 'node:process';

import { applyProjectGuidancePolicy } from '../guidance/apply-project-guidance-policy.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { ensureDatabaseReady } from '../storage/database.js';

function parsePromptsListArgs(args = []) {
  let targetPath;
  let limit = 20;
  let outputJson = false;
  let guidanceOnly = false;
  let ignoredOnly = false;
  let pendingOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      outputJson = true;
      continue;
    }

    if (arg === '--guidance-only') {
      guidanceOnly = true;
      continue;
    }

    if (arg === '--ignored-only') {
      ignoredOnly = true;
      continue;
    }

    if (arg === '--pending-only') {
      pendingOnly = true;
      continue;
    }

    if (arg === '--limit') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('missing value for --limit');
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`invalid --limit value: ${value}`);
      }

      limit = parsed;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`unsupported prompts:list option: ${arg}`);
    }

    if (targetPath) {
      throw new Error(`prompts:list accepts at most one path argument, received: ${arg}`);
    }

    targetPath = arg;
  }

  if (guidanceOnly && ignoredOnly) {
    throw new Error('cannot combine --guidance-only and --ignored-only');
  }

  return {
    targetPath,
    limit,
    outputJson,
    guidanceOnly,
    ignoredOnly,
    pendingOnly,
  };
}

function mapGuidanceReason(reason) {
  switch (reason) {
    case 'guidance_rule':
      return '明确规则表达';
    case 'guidance_pattern':
      return '可复用指导模式';
    case 'llm_review':
      return '交给 LLM 进一步判断';
    case 'short_confirmation':
      return '过短确认词';
    case 'non_guidance':
      return '非长期指导性表达';
    case 'empty':
      return '空内容';
    case 'descriptive_summary':
      return '描述性总结';
    case 'filler_habit':
      return '口头禅/推进词';
    case 'system_noise':
      return '系统噪音/日志内容';
    case 'matched_experience':
      return '已被经验提取采用';
    case 'selected_by_historical_run':
      return '历史学习已采用';
    case 'not_matched_by_any_experience':
      return 'LLM 判断为不值得沉淀的长期经验';
    default:
      return reason || '未分类';
  }
}

function formatPromptCategory(promptEvent) {
  if (promptEvent.learning_decision === 'engine_ignored') {
    return '工程已忽略 prompt';
  }

  if (promptEvent.learning_decision === 'llm_ignored') {
    return 'LLM 未采用 prompt';
  }

  if (promptEvent.learning_decision === 'llm_selected') {
    return '已学习 prompt';
  }

  if (promptEvent.processed_at == null) {
    return '待学习 prompt';
  }

  return '已处理 prompt';
}

function printHumanReadableList({ project, rows, options }) {
  console.log('Codex Evolution Prompt 列表');
  console.log(`项目: ${project.projectKey}`);
  console.log(`目录: ${project.launchCwd}`);
  console.log(`显示条数: 最近 ${rows.length} / limit=${options.limit}`);

  if (options.guidanceOnly) {
    console.log('筛选: 仅指导性 prompt');
  } else if (options.ignoredOnly) {
    console.log('筛选: 仅已忽略 prompt');
  } else if (options.pendingOnly) {
    console.log('筛选: 仅待学习 prompt');
  }

  console.log('');

  if (rows.length === 0) {
    console.log('当前没有匹配的 prompt。');
    return;
  }

  rows.forEach((row, index) => {
    console.log(
      `[${index + 1}] ${row.created_at} ｜ ${formatPromptCategory(row)} ｜ 语言: ${row.prompt_language ?? 'unknown'}`,
    );
    console.log(`原因: ${mapGuidanceReason(row.guidance_reason)}`);
    console.log(`内容: ${row.prompt_text}`);
    console.log('');
  });
}

export async function runPromptsListCommand({ appContext, args = [] }) {
  const options = parsePromptsListArgs(args);
  const launchCwd = options.targetPath ? path.resolve(options.targetPath) : process.cwd();
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const project = await resolveProjectKey({ cwd: launchCwd });

    applyProjectGuidancePolicy({
      repositories,
      projectKey: project.projectKey,
    });

    const rows = repositories.promptEvents.listByProjectKey({
      projectKey: project.projectKey,
      limit: options.limit,
      guidanceCandidate: options.guidanceOnly ? true : options.ignoredOnly ? false : null,
      pendingOnly: options.pendingOnly,
    });

    const payload = {
      projectKey: project.projectKey,
      launchCwd: project.launchCwd,
      limit: options.limit,
      filters: {
        guidanceOnly: options.guidanceOnly,
        ignoredOnly: options.ignoredOnly,
        pendingOnly: options.pendingOnly,
      },
      prompts: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        ingestedAt: row.ingested_at,
        promptLanguage: row.prompt_language ?? 'unknown',
        isGuidanceCandidate: row.is_guidance_candidate === null ? null : row.is_guidance_candidate === 1,
        guidanceReason: row.guidance_reason ?? null,
        learningDecision: row.learning_decision ?? null,
        learningReason: row.learning_reason ?? null,
        processed: Boolean(row.processed_at),
        processedAt: row.processed_at ?? null,
        promptText: row.prompt_text,
        source: row.source,
        sessionId: row.session_id ?? null,
        threadId: row.thread_id ?? null,
      })),
    };

    if (options.outputJson) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    printHumanReadableList({
      project,
      rows,
      options,
    });
  } finally {
    database.close();
  }
}

export {
  parsePromptsListArgs,
};
