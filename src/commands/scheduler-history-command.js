import path from 'node:path';
import process from 'node:process';

import { resolveProjectKey } from '../project/resolve-project-key.js';
import { ensureDatabaseReady } from '../storage/database.js';

const DEFAULT_LIMIT = 20;

function parseSchedulerHistoryOptions(args = []) {
  let targetPath;
  let limit = DEFAULT_LIMIT;
  let outputJson = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

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

    if (arg === '--json') {
      outputJson = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`unsupported scheduler:history option: ${arg}`);
    }

    if (targetPath) {
      throw new Error('scheduler:history accepts at most one target path');
    }

    targetPath = arg;
  }

  return {
    targetPath,
    limit,
    outputJson,
  };
}

function parseSummary(summaryJson) {
  if (!summaryJson) {
    return null;
  }

  try {
    return JSON.parse(summaryJson);
  } catch {
    return {
      raw: summaryJson,
    };
  }
}

function formatLocalTime(isoString) {
  if (!isoString) {
    return '-';
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  const pad = (value) => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function formatDurationMs(startIso, endIso) {
  if (!startIso || !endIso) {
    return '-';
  }

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '-';
  }

  const seconds = Math.round((end - start) / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  return restSeconds === 0 ? `${minutes}m` : `${minutes}m${restSeconds}s`;
}

function statusLabel(status) {
  return {
    succeeded: '成功',
    failed: '失败',
    running: '运行中',
  }[status] ?? status;
}

function buildSummaryText(run) {
  const summary = parseSummary(run.summary_json);

  if (run.status === 'succeeded' && summary?.reason === 'no-unprocessed-prompts') {
    return '无待处理 prompt';
  }

  if (run.status === 'failed') {
    return summary?.code || summary?.message || summary?.reason || '失败';
  }

  if (run.status === 'running') {
    return '仍在运行';
  }

  return summary?.reason || summary?.code || '-';
}

function toHistoryItem(run) {
  return {
    id: run.id,
    status: run.status,
    statusLabel: statusLabel(run.status),
    triggerTime: run.created_at,
    completedTime: run.completed_at,
    durationMs:
      run.created_at && run.completed_at
        ? Math.max(0, new Date(run.completed_at).getTime() - new Date(run.created_at).getTime())
        : null,
    promptCount: run.prompt_count,
    inputExperienceCount: run.input_experience_count,
    outputExperienceCount: run.output_experience_count,
    modelName: run.model_name,
    summary: parseSummary(run.summary_json),
  };
}

function toStatusCounts(rows) {
  return rows.reduce((accumulator, row) => {
    accumulator[row.status] = row.count;
    return accumulator;
  }, {});
}

function renderTextReport({ project, total, statusCounts, runs, limit }) {
  const lines = [
    'Codex Evolution 自动学习历史',
    '',
    `项目: ${project.projectKey}`,
    `总计: ${total} 次`,
    `状态: 成功 ${statusCounts.succeeded ?? 0} / 失败 ${statusCounts.failed ?? 0} / 运行中 ${statusCounts.running ?? 0}`,
    `展示: 最近 ${Math.min(limit, runs.length)} 次`,
    '',
    '说明: 这里统计的是经验提取 run，不包含 watcher 每小时醒来但未进入学习的空转日志。',
    '',
  ];

  if (runs.length === 0) {
    lines.push('暂无学习记录。');
    return lines.join('\n');
  }

  lines.push('最近记录:');

  for (const [index, run] of runs.entries()) {
    lines.push(
      [
        `${index + 1}.`,
        `[${statusLabel(run.status)}]`,
        `触发: ${formatLocalTime(run.created_at)}`,
        `完成: ${formatLocalTime(run.completed_at)}`,
        `耗时: ${formatDurationMs(run.created_at, run.completed_at)}`,
        `prompt: ${run.prompt_count}`,
        `经验: ${run.output_experience_count}`,
        `摘要: ${buildSummaryText(run)}`,
      ].join(' '),
    );
  }

  return lines.join('\n');
}

export async function runSchedulerHistoryCommand({ appContext, args = [] }) {
  const options = parseSchedulerHistoryOptions(args);
  const launchCwd = options.targetPath ? path.resolve(options.targetPath) : process.cwd();
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const project = await resolveProjectKey({ cwd: launchCwd });
    const total = repositories.reconciliationRuns.countByProjectKey(project.projectKey);
    const statusCounts = toStatusCounts(
      repositories.reconciliationRuns.countByProjectKeyGroupedByStatus(project.projectKey),
    );
    const runs = repositories.reconciliationRuns.listRecentByProjectKey(project.projectKey, options.limit);

    if (options.outputJson) {
      console.log(
        JSON.stringify(
          {
            projectKey: project.projectKey,
            launchCwd: project.launchCwd,
            total,
            statusCounts,
            limit: options.limit,
            runs: runs.map(toHistoryItem),
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(
      renderTextReport({
        project,
        total,
        statusCounts,
        runs,
        limit: options.limit,
      }),
    );
  } finally {
    database.close();
  }
}

export { parseSchedulerHistoryOptions };
