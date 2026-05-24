import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { redactReconcileConfig } from '../config/redact-reconcile-config.js';
import { ingestUserPromptSubmit } from '../hooks/ingest-user-prompt-submit.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { runSchedulerTickOnce } from './run-scheduler-tick-once.js';
import { renderRuntimeContext } from '../runtime/render-runtime-context.js';
import { createDatabase, ensureDatabaseReady } from '../storage/database.js';
import { createRepositories } from '../storage/repositories/index.js';

const DEFAULT_SAMPLE_PROMPTS = [
  '以后复杂需求先讨论方案边界，再开始实现',
  '复杂功能先确认设计方向和风险，再进入编码',
  '当需求存在边界情况时，先提问澄清，不要直接实现',
];

function parseDemoExperienceArgs(args = []) {
  let targetPath;
  let outputJson = false;
  let keepHome = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      outputJson = true;
      continue;
    }

    if (arg === '--keep-home') {
      keepHome = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`unsupported demo:experience option: ${arg}`);
    }

    if (targetPath) {
      throw new Error(`demo:experience accepts at most one path argument, received: ${arg}`);
    }

    targetPath = arg;
  }

  return {
    outputJson,
    keepHome,
    targetPath,
  };
}

function buildDemoHomeDirectory(projectKey) {
  return path.join(projectKey, '.codex-evolution-demo');
}

function buildDemoAppContext({ appContext, demoHomeDirectory }) {
  const databasePath = path.join(demoHomeDirectory, 'codex-evolution.db');
  const configPath = path.join(demoHomeDirectory, 'config.json');
  const statePath = path.join(demoHomeDirectory, 'state.json');

  return {
    homeDirectory: demoHomeDirectory,
    databasePath,
    configPath,
    statePath,
    configFileExists: appContext.configFileExists,
    reconcileConfig: appContext.reconcileConfig,
    codexBinary: appContext.codexBinary,
    sourceCodexHome: appContext.sourceCodexHome,
    createDatabase: () => createDatabase({ databasePath }),
    createRepositories,
  };
}

function renderDemoSummary(report) {
  const lines = [
    'Codex Evolution 端到端体验完成',
    '',
    `项目: ${report.projectKey}`,
    `启动目录: ${report.launchCwd}`,
    `demo home: ${report.demoHomeDirectory}`,
    `学习模型: ${report.reconcile.provider}${report.reconcile.model ? ` / ${report.reconcile.model}` : ''}`,
    `示例 prompt: ${report.samplePrompts.length} 条`,
    `prompt 状态: total=${report.prompts.total}, pending=${report.prompts.pending}, processed=${report.prompts.processed}`,
    `经验数量: ${report.experiences.count} 条`,
    '',
    '学习执行结果:',
    `- skipped: ${report.scheduler.reconcile.skipped ? '是' : '否'}`,
  ];

  if (!report.scheduler.reconcile.skipped) {
    lines.push(`- claimedPromptCount: ${report.scheduler.reconcile.claimedPromptCount}`);
    lines.push(`- runStatus: ${report.scheduler.reconcile.run.status}`);
  }

  lines.push('');
  lines.push('运行时上下文预览:');
  lines.push(report.runtimeContext);
  lines.push('');
  lines.push('后续可继续检查:');
  lines.push(`- CODEX_EVOLUTION_HOME=${report.demoHomeDirectory} node src/cli.js reconcile:status ${report.launchCwd}`);
  lines.push(`- CODEX_EVOLUTION_HOME=${report.demoHomeDirectory} node src/cli.js context:preview ${report.launchCwd}`);

  return lines.join('\n');
}

export async function runDemoExperienceCommand({
  appContext,
  args = [],
  samplePrompts = DEFAULT_SAMPLE_PROMPTS,
  resolveProjectKeyFn = resolveProjectKey,
  ingestUserPromptSubmitFn = ingestUserPromptSubmit,
  runSchedulerTickOnceFn = runSchedulerTickOnce,
  renderRuntimeContextFn = renderRuntimeContext,
  rmFn = fs.rm,
  mkdirFn = fs.mkdir,
}) {
  const options = parseDemoExperienceArgs(args);
  const launchCwd = options.targetPath ? path.resolve(options.targetPath) : process.cwd();
  const project = await resolveProjectKeyFn({
    cwd: launchCwd,
  });
  const demoHomeDirectory = buildDemoHomeDirectory(project.projectKey);
  const demoAppContext = buildDemoAppContext({
    appContext,
    demoHomeDirectory,
  });

  if (!options.keepHome) {
    await rmFn(demoHomeDirectory, {
      recursive: true,
      force: true,
    });
  }

  await mkdirFn(demoHomeDirectory, {
    recursive: true,
  });

  const bootstrapDatabase = demoAppContext.createDatabase();
  try {
    ensureDatabaseReady(bootstrapDatabase);
    const repositories = demoAppContext.createRepositories(bootstrapDatabase);

    for (let index = 0; index < samplePrompts.length; index += 1) {
      const promptText = samplePrompts[index];
      await ingestUserPromptSubmitFn({
        payload: {
          hook_event_name: 'UserPromptSubmit',
          session_id: `demo-session-${index + 1}`,
          turn_id: `demo-turn-${index + 1}`,
          cwd: project.projectKey,
          prompt: promptText,
          created_at: new Date(Date.now() + index * 1000).toISOString(),
        },
        fallbackCwd: launchCwd,
        repositories,
      });
    }
  } finally {
    bootstrapDatabase.close();
  }

  const tick = await runSchedulerTickOnceFn({
    appContext: demoAppContext,
    targetPath: launchCwd,
  });

  const inspectDatabase = demoAppContext.createDatabase();
  try {
    ensureDatabaseReady(inspectDatabase);
    const repositories = demoAppContext.createRepositories(inspectDatabase);
    const promptsTotal = repositories.promptEvents.countByProjectKey(project.projectKey);
    const promptsPending = repositories.promptEvents.countPendingByProjectKey(project.projectKey);
    const experiences = repositories.experiences.listByProjectAndStatuses({
      projectKey: project.projectKey,
      statuses: ['active', 'decaying'],
      limit: 50,
    });
    const runtimeContext = renderRuntimeContextFn({
      projectKey: project.projectKey,
      experiences,
    });

    const report = {
      launchCwd,
      projectKey: project.projectKey,
      demoHomeDirectory,
      reconcile: redactReconcileConfig(demoAppContext.reconcileConfig),
      samplePrompts,
      scheduler: tick.result,
      prompts: {
        total: promptsTotal,
        pending: promptsPending,
        processed: promptsTotal - promptsPending,
      },
      experiences: {
        count: experiences.length,
        items: experiences.map((experience) => ({
          id: experience.id,
          kind: experience.kind,
          title: experience.title,
          canonicalText: experience.canonical_text,
          status: experience.status,
          rankOrder: experience.rank_order,
        })),
      },
      runtimeContext,
    };

    if (options.outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderDemoSummary(report));
    }
  } finally {
    inspectDatabase.close();
  }
}

export {
  buildDemoAppContext,
  buildDemoHomeDirectory,
  parseDemoExperienceArgs,
};
