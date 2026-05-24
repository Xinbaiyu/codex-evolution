import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { redactReconcileConfig } from '../config/redact-reconcile-config.js';
import { installCodexEvolutionHooks } from '../hooks/install-user-prompt-submit-hook.js';
import { loadOnboardingState, saveOnboardingState } from '../onboarding/onboarding-state.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { createReconciliationProbe } from '../providers/create-reconciliation-provider.js';
import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';
import { ensureReconciliationPolicyFile } from '../reconciliation/ensure-reconciliation-policy-file.js';
import { loadReconciliationPolicy } from '../reconciliation/reconciliation-policy.js';
import {
  getSchedulerWatchLogPath,
  isProcessAlive,
  readSchedulerWatchLock,
  startDetachedSchedulerWatch,
} from '../scheduler/start-detached-scheduler-watch.js';
import { renderRuntimeContext } from '../runtime/render-runtime-context.js';
import { ensureDatabaseReady } from '../storage/database.js';
import { doctorCodexEvolutionHooks } from '../hooks/doctor-user-prompt-submit-hook.js';

const EXPECTED_CORE_TABLES = [
  'schema_migrations',
  'prompt_events',
  'experiences',
  'reconciliation_runs',
  'launcher_sessions',
];

const STATUS_PRIORITY = {
  '通过': 0,
  '提示': 1,
  '警告': 2,
  '失败': 3,
};

function formatDurationMs(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return '未知';
  }

  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  return `${Math.round(durationMs)}ms`;
}

function createSection({ key, title, status, summary, highlights = [], details = {} }) {
  return {
    key,
    title,
    status,
    summary,
    highlights,
    details,
  };
}

function createFixAction({ key, title, status, summary, details = {} }) {
  return {
    key,
    title,
    status,
    summary,
    details,
  };
}

function pickWorseStatus(left, right) {
  return STATUS_PRIORITY[right] > STATUS_PRIORITY[left] ? right : left;
}

function summarizeOverallStatus(sections) {
  const worst = sections.reduce((current, section) => pickWorseStatus(current, section.status), '通过');
  if (worst === '失败' || worst === '警告') {
    return worst;
  }

  return '通过';
}

function parseRecentRunSummary(summaryJson) {
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

function parseDoctorArgs(args = []) {
  let targetPath;
  let outputJson = false;
  let autoFix = false;

  for (const arg of args) {
    if (arg === '--json') {
      outputJson = true;
      continue;
    }

    if (arg === '--fix') {
      autoFix = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`unsupported doctor option: ${arg}`);
    }

    if (targetPath) {
      throw new Error(`doctor accepts at most one path argument, received: ${arg}`);
    }

    targetPath = arg;
  }

  return {
    autoFix,
    outputJson,
    targetPath,
  };
}

function inspectCoreTables(database) {
  const rows = database
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `)
    .all();

  const tableNames = rows.map((row) => row.name).sort();
  const missingTables = EXPECTED_CORE_TABLES.filter((name) => !tableNames.includes(name));

  return {
    tableNames,
    missingTables,
  };
}

function buildEnvironmentSection({
  appContext,
  ensureDatabaseReadyError,
  databaseCheck,
  existsSyncFn,
}) {
  const configFileExists = existsSyncFn(appContext.configPath);
  const stateFileExists = existsSyncFn(appContext.statePath);
  const databaseFileExists = existsSyncFn(appContext.databasePath);

  if (ensureDatabaseReadyError) {
    return createSection({
      key: 'environment',
      title: '基础环境',
      status: '失败',
      summary: '本地数据库初始化失败，核心环境暂不可用。',
      highlights: [
        `home 目录: ${appContext.homeDirectory}`,
        `数据库路径: ${appContext.databasePath}`,
        `错误: ${ensureDatabaseReadyError.message}`,
      ],
      details: {
        homeDirectory: appContext.homeDirectory,
        configPath: appContext.configPath,
        configFileExists,
        statePath: appContext.statePath,
        stateFileExists,
        databasePath: appContext.databasePath,
        databaseFileExists,
        error: ensureDatabaseReadyError.message,
      },
    });
  }

  if (databaseCheck.missingTables.length > 0) {
    return createSection({
      key: 'environment',
      title: '基础环境',
      status: '失败',
      summary: '数据库可打开，但核心数据表不完整。',
      highlights: [
        `home 目录: ${appContext.homeDirectory}`,
        `数据库路径: ${appContext.databasePath}`,
        `缺失数据表: ${databaseCheck.missingTables.join(', ')}`,
      ],
      details: {
        homeDirectory: appContext.homeDirectory,
        configPath: appContext.configPath,
        configFileExists,
        statePath: appContext.statePath,
        stateFileExists,
        databasePath: appContext.databasePath,
        databaseFileExists,
        tableNames: databaseCheck.tableNames,
        missingTables: databaseCheck.missingTables,
      },
    });
  }

  return createSection({
    key: 'environment',
    title: '基础环境',
    status: '通过',
    summary: '本地目录、配置文件和数据库状态正常。',
    highlights: [
      `home 目录: ${appContext.homeDirectory}`,
      `数据库: 正常（${EXPECTED_CORE_TABLES.length}/${EXPECTED_CORE_TABLES.length} 核心表就绪）`,
      `配置文件: ${configFileExists ? '已存在' : '未创建'}`,
      `状态文件: ${stateFileExists ? '已存在' : '未创建'}`,
    ],
    details: {
      homeDirectory: appContext.homeDirectory,
      configPath: appContext.configPath,
      configFileExists,
      statePath: appContext.statePath,
      stateFileExists,
      databasePath: appContext.databasePath,
      databaseFileExists,
      tableNames: databaseCheck.tableNames,
      missingTables: databaseCheck.missingTables,
    },
  });
}

function buildProjectSection({ project, launchCwd, error }) {
  if (error) {
    return createSection({
      key: 'project',
      title: '项目识别',
      status: '失败',
      summary: '当前目录无法解析为项目。',
      highlights: [
        `启动目录: ${launchCwd}`,
        `错误: ${error.message}`,
      ],
      details: {
        launchCwd,
        error: error.message,
      },
    });
  }

  const detectionMethod = project.projectKey === project.launchCwd ? 'cwd' : 'git_root';

  return createSection({
    key: 'project',
    title: '项目识别',
    status: '通过',
    summary:
      detectionMethod === 'git_root'
        ? '当前目录已按 Git root 正常识别为项目。'
        : '当前目录未命中 Git root，已按当前目录作为项目。',
    highlights: [
      `当前目录: ${project.launchCwd}`,
      `project_key: ${project.projectKey}`,
      `识别方式: ${detectionMethod === 'git_root' ? 'Git root' : '当前目录回退'}`,
    ],
    details: {
      launchCwd: project.launchCwd,
      projectKey: project.projectKey,
      detectionMethod,
    },
  });
}

function mapHookDiagnosisStatus(status) {
  if (status === 'ready') {
    return '通过';
  }

  if (status === 'missing_codex_config') {
    return '警告';
  }

  return '失败';
}

function buildHooksSection({ hookDoctorResult, error }) {
  if (error) {
    return createSection({
      key: 'hooks',
      title: 'Codex Hooks',
      status: '失败',
      summary: 'Codex hooks 诊断执行失败。',
      highlights: [
        `错误: ${error.message}`,
      ],
      details: {
        error: error.message,
      },
    });
  }

  return createSection({
    key: 'hooks',
    title: 'Codex Hooks',
    status: mapHookDiagnosisStatus(hookDoctorResult.diagnosis.status),
    summary: hookDoctorResult.diagnosis.message,
    highlights: [
      `hooks 功能: ${
        hookDoctorResult.hooksFeatureEnabled === true
          ? '已启用'
          : hookDoctorResult.hooksFeatureEnabled === false
            ? '未启用'
            : '未知'
      }`,
      `UserPromptSubmit: ${summarizeHookEventStatus(hookDoctorResult.events.UserPromptSubmit)}`,
      `SessionStart: ${summarizeHookEventStatus(hookDoctorResult.events.SessionStart)}`,
      `hooks 配置文件: ${hookDoctorResult.hooksPath}`,
    ],
    details: {
      hooksPath: hookDoctorResult.hooksPath,
      codexConfigPath: hookDoctorResult.codexConfigPath,
      hooksFeatureEnabled: hookDoctorResult.hooksFeatureEnabled,
      installed: Object.values(hookDoctorResult.events).every((event) => event.inspection.installed),
      trusted: Object.values(hookDoctorResult.events).every((event) =>
        event.inspection.matchingHooks.some((hook) => hook.trusted),
      ),
      events: Object.fromEntries(
        Object.entries(hookDoctorResult.events).map(([eventName, event]) => [
          eventName,
          {
            expectedCommand: event.expectedCommand,
            installed: event.inspection.installed,
            trusted: event.inspection.matchingHooks.some((hook) => hook.trusted),
            matchingHooks: event.inspection.matchingHooks,
            diagnosis: event.diagnosis,
          },
        ]),
      ),
      diagnosis: hookDoctorResult.diagnosis,
    },
  });
}

function summarizeHookEventStatus(eventResult) {
  const installed = eventResult.inspection.installed;
  const trusted = eventResult.inspection.matchingHooks.some((hook) => hook.trusted);

  if (installed && trusted) {
    return '已安装 / 已 trust';
  }

  if (installed) {
    return '已安装 / 未 trust';
  }

  return '未安装';
}

function buildProviderSection({ appContext, probeResult, probeError, probeDurationMs }) {
  const config = redactReconcileConfig(appContext.reconcileConfig);
  const timeoutMs = config.timeoutMs;
  const hasLowOpenAICompatibleTimeout =
    config.provider === 'openai-compatible'
    && Number.isFinite(timeoutMs)
    && timeoutMs < 60_000;

  if (probeError) {
    return createSection({
      key: 'provider',
      title: '学习模型',
      status: '失败',
      summary: `学习模型探测失败（${formatDurationMs(probeDurationMs)}）。`,
      highlights: [
        `provider: ${config.provider}`,
        `model: ${config.model ?? '未设置'}`,
        `baseUrl: ${config.baseUrl ?? '未设置'}`,
        `错误代码: ${probeError.code}`,
        `错误信息: ${probeError.message}`,
      ],
      details: {
        reconcile: config,
        durationMs: probeDurationMs,
        error: probeError,
      },
    });
  }

  return createSection({
    key: 'provider',
    title: '学习模型',
    status: hasLowOpenAICompatibleTimeout ? '警告' : '通过',
    summary: hasLowOpenAICompatibleTimeout
      ? `学习模型探测成功（${formatDurationMs(probeDurationMs)}），但 timeoutMs 偏低，经验提取时可能超时。`
      : `学习模型探测成功（${formatDurationMs(probeDurationMs)}）。`,
    highlights: [
      `provider: ${config.provider}`,
      `model: ${config.model ?? '未设置'}`,
      `baseUrl: ${config.baseUrl ?? '未设置'}`,
      `timeoutMs: ${config.timeoutMs ?? '默认值'}`,
      `metadata: ${JSON.stringify(probeResult.metadata)}`,
    ],
    details: {
      reconcile: config,
      durationMs: probeDurationMs,
      metadata: probeResult.metadata,
      output: probeResult.output,
    },
  });
}

function buildPolicySection({ appContext, policy, error }) {
  const policyPath = appContext.reconcileConfig?.policyPath ?? null;

  if (error) {
    return createSection({
      key: 'policy',
      title: '经验提取策略',
      status: '失败',
      summary: '经验提取策略读取失败，学习提取可能无法按预期执行。',
      highlights: [
        `策略路径: ${policyPath ?? '未配置'}`,
        `错误: ${error.message}`,
      ],
      details: {
        policyPath,
        fileExists: false,
        source: null,
        error: error.message,
      },
    });
  }

  if (policy.source !== 'file') {
    return createSection({
      key: 'policy',
      title: '经验提取策略',
      status: '提示',
      summary: '尚未检测到可编辑的策略文件，当前使用内置中文默认策略。',
      highlights: [
        `策略文件: 未生成 (${policy.path})`,
        '来源: 内置中文模板',
        '补建命令: cdxe policy:init',
      ],
      details: {
        policyPath: policy.path,
        fileExists: false,
        source: policy.source,
      },
    });
  }

  return createSection({
    key: 'policy',
    title: '经验提取策略',
    status: '通过',
    summary: '经验提取策略文件已生成，会在每次学习前重新读取。',
    highlights: [
      `策略文件: 已生成 (${policy.path})`,
      '来源: 用户 Markdown',
      '生效时机: 修改后下一次 scheduler:tick 或后台学习立即生效',
    ],
    details: {
      policyPath: policy.path,
      fileExists: true,
      source: policy.source,
    },
  });
}

function buildLearningSection({
  project,
  repositories,
  databaseReady,
  error,
}) {
  if (error) {
    return createSection({
      key: 'learning',
      title: '学习状态',
      status: '失败',
      summary: '无法读取当前项目的学习状态。',
      highlights: [
        `错误: ${error.message}`,
      ],
      details: {
        error: error.message,
      },
    });
  }

  if (!databaseReady || !project) {
    return createSection({
      key: 'learning',
      title: '学习状态',
      status: '失败',
      summary: '基础环境未就绪，无法读取学习状态。',
      details: {},
    });
  }

  const promptTotal = repositories.promptEvents.countByProjectKey(project.projectKey);
  const promptPending = repositories.promptEvents.countPendingByProjectKey(project.projectKey);
  const promptIgnored = repositories.promptEvents.countIgnoredByProjectKey(project.projectKey);
  const recentRuns = repositories.reconciliationRuns.listRecentByProjectKey(project.projectKey, 5);
  const latestRun = recentRuns[0] ?? null;
  const activeExperiences = repositories.experiences.listByProjectAndStatuses({
    projectKey: project.projectKey,
    statuses: ['active', 'decaying'],
    limit: 10,
  });
  const candidateExperienceCount = repositories.experiences.countByProjectAndStatuses({
    projectKey: project.projectKey,
    statuses: ['candidate'],
  });
  const processedCount = promptTotal - promptPending;

  let status = '通过';
  let summary = `当前项目共有 ${promptTotal} 条 prompt，其中 ${promptPending} 条待学习。`;

  if (latestRun?.status === 'failed') {
    status = '警告';
    summary = '最近一次学习执行失败，请优先检查失败原因。';
  } else if (promptPending > 0) {
    status = '警告';
    summary = `当前有 ${promptPending} 条 prompt 尚未处理。`;
  } else if (promptTotal === 0) {
    status = '提示';
    summary = '当前项目还没有采集到 prompt。';
  }

  return createSection({
    key: 'learning',
    title: '学习状态',
    status,
    summary,
    highlights: [
      `prompt: total=${promptTotal}, pending=${promptPending}, ignored=${promptIgnored}, processed=${processedCount}`,
      `最近 run: ${latestRun ? latestRun.status : '暂无'}`,
      `激活经验: ${activeExperiences.length} 条`,
      `候选经验: ${candidateExperienceCount} 条`,
    ],
    details: {
      prompts: {
        total: promptTotal,
        pending: promptPending,
        ignored: promptIgnored,
        processed: processedCount,
      },
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        status: run.status,
        modelName: run.model_name,
        promptCount: run.prompt_count,
        inputExperienceCount: run.input_experience_count,
        outputExperienceCount: run.output_experience_count,
        createdAt: run.created_at,
        completedAt: run.completed_at,
        summary: parseRecentRunSummary(run.summary_json),
      })),
      activeExperiences: activeExperiences.map((experience) => ({
        id: experience.id,
        kind: experience.kind,
        title: experience.title,
        canonicalText: experience.canonical_text,
        canonicalLanguage: experience.canonical_language ?? 'zh',
        status: experience.status,
        rankOrder: experience.rank_order,
        hitCount: experience.hit_count,
        lastSeenAt: experience.last_seen_at,
        lastReconciledAt: experience.last_reconciled_at,
      })),
      candidateExperienceCount,
    },
  });
}

function buildAutoLearningSection({
  appContext,
  state,
  lock,
  isRunning,
  logExists,
  lockAlive,
  error,
}) {
  if (error) {
    return createSection({
      key: 'autoLearning',
      title: '自动学习',
      status: '失败',
      summary: '自动学习状态读取失败。',
      highlights: [
        `错误: ${error.message}`,
      ],
      details: {
        error: error.message,
      },
    });
  }

  const intervalSeconds = state.autoLearning.intervalSeconds;
  const pid = state.autoLearning.pid;
  const hasInconsistentLock =
    Boolean(lock?.pid)
    && Boolean(pid)
    && lock.pid !== pid
    && lockAlive;

  let status = '通过';
  let summary = '自动学习已开启，watcher 正在运行。';

  if (!state.autoLearning.enabled) {
    status = '提示';
    summary = '自动学习当前未开启。';
  } else if (!isRunning) {
    status = '警告';
    summary = '自动学习标记为已开启，但 watcher 当前未运行。';
  } else if (hasInconsistentLock) {
    status = '警告';
    summary = '自动学习 watcher 正在运行，但锁文件和状态记录不一致。';
  }

  return createSection({
    key: 'autoLearning',
    title: '自动学习',
    status,
    summary,
    highlights: [
      `enabled: ${state.autoLearning.enabled ? '是' : '否'}`,
      `interval: ${intervalSeconds}s`,
      `mode: ${state.autoLearning.mode ?? 'global'}`,
      `maxProjects: ${state.autoLearning.maxProjects ?? 10}`,
      `target: ${state.autoLearning.targetPath ?? '未记录'}`,
      `pid: ${pid ?? '无'}`,
      `watcher 版本: ${state.autoLearning.packageVersion ?? '未知'}`,
      `运行状态: ${isRunning ? '运行中' : '未运行'}`,
      `日志文件: ${logExists ? '已存在' : '未创建'} (${state.autoLearning.logPath || getSchedulerWatchLogPath(appContext.homeDirectory)})`,
    ],
    details: {
      enabled: state.autoLearning.enabled,
      intervalSeconds,
      pid,
      running: isRunning,
      startedAt: state.autoLearning.startedAt,
      logPath: state.autoLearning.logPath || getSchedulerWatchLogPath(appContext.homeDirectory),
      mode: state.autoLearning.mode ?? 'global',
      maxProjects: state.autoLearning.maxProjects ?? 10,
      targetPath: state.autoLearning.targetPath ?? null,
      packageVersion: state.autoLearning.packageVersion ?? null,
      cliPath: state.autoLearning.cliPath ?? null,
      nodePath: state.autoLearning.nodePath ?? null,
      logExists,
      lock,
      lockAlive,
      onboardingCompletedAt: state.onboardingCompletedAt,
    },
  });
}

function buildContextSection({
  project,
  repositories,
  databaseReady,
  renderRuntimeContextFn,
  error,
}) {
  if (error) {
    return createSection({
      key: 'context',
      title: '上下文注入',
      status: '失败',
      summary: '运行时上下文渲染失败。',
      highlights: [
        `错误: ${error.message}`,
      ],
      details: {
        error: error.message,
      },
    });
  }

  if (!databaseReady || !project) {
    return createSection({
      key: 'context',
      title: '上下文注入',
      status: '失败',
      summary: '基础环境未就绪，无法渲染运行时上下文。',
      details: {},
    });
  }

  const experiences = repositories.experiences.listByProjectAndStatuses({
    projectKey: project.projectKey,
    statuses: ['active', 'decaying'],
    limit: 50,
  });
  const runtimeContext = renderRuntimeContextFn({
    projectKey: project.projectKey,
    experiences,
  });
  const injectableExperienceCount = Math.min(experiences.length, 20);

  if (experiences.length === 0) {
    return createSection({
      key: 'context',
      title: '上下文注入',
      status: '提示',
      summary: '当前还没有可注入的项目经验。',
      highlights: [
        '经验数量: 0',
        '可以先正常对话几轮，再执行学习任务。',
      ],
      details: {
        availableExperienceCount: 0,
        injectableExperienceCount: 0,
        runtimeContext,
      },
    });
  }

  return createSection({
    key: 'context',
    title: '上下文注入',
    status: '通过',
    summary: `运行时上下文渲染正常，可注入 ${injectableExperienceCount} 条经验。`,
    highlights: [
      `可用经验: ${experiences.length} 条`,
      `可注入经验: ${injectableExperienceCount} 条`,
    ],
    details: {
      availableExperienceCount: experiences.length,
      injectableExperienceCount,
      runtimeContext,
    },
  });
}

function buildSuggestions({ sections }) {
  const suggestions = [];
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const hooksSection = sectionByKey.get('hooks');
  const providerSection = sectionByKey.get('provider');
  const policySection = sectionByKey.get('policy');
  const learningSection = sectionByKey.get('learning');
  const autoLearningSection = sectionByKey.get('autoLearning');
  const contextSection = sectionByKey.get('context');
  const environmentSection = sectionByKey.get('environment');

  if (environmentSection?.status === '失败') {
    suggestions.push('执行 cdxe db:init 重新初始化本地数据库。');
  }

  const hookDiagnosis = hooksSection?.details?.diagnosis?.status;
  if (hookDiagnosis === 'missing_hook') {
    suggestions.push('执行 cdxe hooks:install 安装 UserPromptSubmit 与 SessionStart hooks。');
  }

  if (hookDiagnosis === 'untrusted_hook') {
    suggestions.push('启动 Codex 后执行 /hooks，并 trust 我们的 UserPromptSubmit 与 SessionStart 命令。');
  }

  if (hookDiagnosis === 'hooks_disabled') {
    suggestions.push('在 ~/.codex/config.toml 的 [features] 中开启 hooks = true。');
  }

  if (providerSection?.status === '失败') {
    const providerError = providerSection.details?.error;
    if (providerError?.code === 'provider_config_error') {
      suggestions.push('检查学习模型配置，或执行 cdxe config:init --force 重新生成配置模板。');
    } else {
      suggestions.push('执行 cdxe reconcile:probe 查看学习模型的详细错误。');
    }
  }

  const providerConfig = providerSection?.details?.reconcile;
  if (
    providerConfig?.provider === 'openai-compatible'
    && Number.isFinite(providerConfig.timeoutMs)
    && providerConfig.timeoutMs < 60_000
  ) {
    suggestions.push('openai-compatible 的 timeoutMs 建议设置为 90000，尤其是使用 Claude Opus 等较慢模型时。');
  }

  if (policySection?.status === '提示') {
    suggestions.push('执行 cdxe policy:init 生成可编辑的经验提取策略 Markdown。');
  }

  if (policySection?.status === '失败') {
    suggestions.push('检查 reconcile.policyPath 是否正确，或执行 cdxe policy:init --force 重新生成策略文件。');
  }

  if (learningSection?.details?.prompts?.pending > 0) {
    suggestions.push('执行 cdxe scheduler:tick 立即处理待学习 prompt。');
  }

  if (autoLearningSection?.status === '提示') {
    suggestions.push('如需持续自动学习，可执行 cdxe scheduler:enable --interval-seconds 3600。');
  }

  if (autoLearningSection?.status === '警告') {
    suggestions.push('执行 cdxe scheduler:enable --interval-seconds 3600 重新拉起后台自动学习。');
  }

  if (contextSection?.status === '提示') {
    suggestions.push('先在 Codex 中正常对话几轮，再执行 cdxe scheduler:tick 积累项目经验。');
  }

  return [...new Set(suggestions)];
}

function renderDoctorReport(report) {
  const lines = [
    'Codex Evolution 健康检查',
    '',
    `总体结果: ${report.overallStatus}`,
    `项目: ${report.projectKey ?? '未识别'}`,
    `启动目录: ${report.launchCwd}`,
    `耗时: ${formatDurationMs(report.durationMs)}`,
    '',
  ];

  for (const section of report.sections) {
    lines.push(`[${section.status}] ${section.title}: ${section.summary}`);

    for (const highlight of section.highlights) {
      lines.push(`  - ${highlight}`);
    }

    lines.push('');
  }

  if (report.fixActions.length > 0) {
    lines.push('自动修复:');

    for (const fixAction of report.fixActions) {
      lines.push(`- [${fixAction.status}] ${fixAction.title}: ${fixAction.summary}`);
    }

    lines.push('');
  }

  if (report.suggestions.length > 0) {
    lines.push('建议操作:');

    for (const suggestion of report.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join('\n').trimEnd();
}

function createProgressReporter({ enabled, writeLineFn }) {
  const startedAtByTitle = new Map();

  function formatStatusLabel(status) {
    return `[${status}]`;
  }

  function emit(message) {
    if (!enabled) {
      return;
    }

    writeLineFn(`[codex-evolution] ${message}`);
  }

  return {
    start(title) {
      startedAtByTitle.set(title, Date.now());
      emit(`正在检查：${title}...`);
    },
    finish(title, status, extra = '') {
      const startedAt = startedAtByTitle.get(title);
      const durationText = startedAt ? `（${formatDurationMs(Date.now() - startedAt)}）` : '';
      startedAtByTitle.delete(title);
      emit(`${formatStatusLabel(status)} ${title}${durationText}${extra ? ` - ${extra}` : ''}`);
    },
    info(message) {
      emit(message);
    },
    repair(title) {
      emit(`正在修复：${title}...`);
    },
  };
}

function safeCloseDatabase(database) {
  try {
    database?.close();
  } catch {
    // Ignore close errors during doctor cleanup.
  }
}

export async function runDoctorCommand({
  appContext,
  args = [],
  resolveProjectKeyFn = resolveProjectKey,
  doctorCodexEvolutionHooksFn = doctorCodexEvolutionHooks,
  installCodexEvolutionHooksFn = installCodexEvolutionHooks,
  createReconciliationProbeFn = createReconciliationProbe,
  loadOnboardingStateFn = loadOnboardingState,
  saveOnboardingStateFn = saveOnboardingState,
  isProcessAliveFn = isProcessAlive,
  readSchedulerWatchLockFn = readSchedulerWatchLock,
  startDetachedSchedulerWatchFn = startDetachedSchedulerWatch,
  renderRuntimeContextFn = renderRuntimeContext,
  ensureDatabaseReadyFn = ensureDatabaseReady,
  existsSyncFn = fs.existsSync,
  progressWriteLineFn = (message) => console.error(message),
}) {
  const startedAt = Date.now();
  const options = parseDoctorArgs(args);
  const launchCwd = options.targetPath ? path.resolve(options.targetPath) : process.cwd();
  const progress = createProgressReporter({
    enabled: !options.outputJson,
    writeLineFn: progressWriteLineFn,
  });
  let database = null;

  let databaseReady = false;
  let repositories = null;
  let databaseCheck = {
    tableNames: [],
    missingTables: EXPECTED_CORE_TABLES,
  };
  let databaseError = null;
  let project = null;
  let projectError = null;
  let hookDoctorResult = null;
  let hookDoctorError = null;
  let providerProbeResult = null;
  let providerProbeError = null;
  let providerProbeDurationMs = null;
  let policy = null;
  let policyError = null;
  let learningError = null;
  let onboardingState = null;
  let autoLearningError = null;
  let contextError = null;
  const fixActions = [];

  try {
    progress.start('基础环境');
    try {
      database = appContext.createDatabase();
      ensureDatabaseReadyFn(database);
      databaseCheck = inspectCoreTables(database);
      repositories = appContext.createRepositories(database);
      databaseReady = databaseCheck.missingTables.length === 0;
    } catch (error) {
      databaseError = error;
    }

    if (options.autoFix && (databaseError || databaseCheck.missingTables.length > 0)) {
      progress.repair('基础环境');
      safeCloseDatabase(database);
      database = null;

      try {
        database = appContext.createDatabase();
        ensureDatabaseReadyFn(database);
        databaseCheck = inspectCoreTables(database);
        repositories = appContext.createRepositories(database);
        databaseReady = databaseCheck.missingTables.length === 0;
        databaseError = databaseReady ? null : databaseError;
        fixActions.push(
          createFixAction({
            key: 'environment',
            title: '基础环境',
            status: databaseReady ? '通过' : '失败',
            summary: databaseReady
              ? '已重新初始化本地数据库和核心表。'
              : '已尝试修复数据库，但核心表仍不完整。',
            details: {
              databasePath: appContext.databasePath,
              missingTables: databaseCheck.missingTables,
            },
          }),
        );
      } catch (error) {
        databaseError = error;
        databaseReady = false;
        fixActions.push(
          createFixAction({
            key: 'environment',
            title: '基础环境',
            status: '失败',
            summary: `自动修复数据库失败：${error.message}`,
            details: {
              databasePath: appContext.databasePath,
              error: error.message,
            },
          }),
        );
      }
    }

    progress.finish(
      '基础环境',
      databaseError || databaseCheck.missingTables.length > 0 ? '失败' : '通过',
    );

    progress.start('项目识别');
    try {
      project = await resolveProjectKeyFn({
        cwd: launchCwd,
      });
    } catch (error) {
      projectError = error;
    }
    progress.finish('项目识别', projectError ? '失败' : '通过');

    progress.start('Codex Hooks');
    try {
      hookDoctorResult = await doctorCodexEvolutionHooksFn({
        sourceCodexHome: appContext.sourceCodexHome,
      });
    } catch (error) {
      hookDoctorError = error;
    }

    if (options.autoFix && hookDoctorResult?.diagnosis?.status === 'missing_hook') {
      progress.repair('Codex Hooks');

      try {
        const installed = await installCodexEvolutionHooksFn();
        hookDoctorResult = await doctorCodexEvolutionHooksFn({
          sourceCodexHome: appContext.sourceCodexHome,
        });
        hookDoctorError = null;
        fixActions.push(
          createFixAction({
            key: 'hooks',
            title: 'Codex Hooks',
            status: Object.values(hookDoctorResult.events).every((event) => event.inspection.installed)
              ? '通过'
              : '失败',
            summary: Object.values(hookDoctorResult.events).every((event) => event.inspection.installed)
              ? `已自动安装 Codex hooks（${installed.changed ? '已写入配置' : '配置已存在'}）。`
              : '已尝试安装 Codex hooks，但复检仍未通过。',
            details: {
              hooksPath: installed.hooksPath,
              changed: installed.changed,
              diagnosis: hookDoctorResult.diagnosis,
            },
          }),
        );
      } catch (error) {
        hookDoctorError = error;
        fixActions.push(
          createFixAction({
            key: 'hooks',
            title: 'Codex Hooks',
            status: '失败',
            summary: `自动安装 hook 失败：${error.message}`,
            details: {
              error: error.message,
            },
          }),
        );
      }
    }

    progress.finish(
      'Codex Hooks',
      hookDoctorError
        ? '失败'
        : mapHookDiagnosisStatus(hookDoctorResult.diagnosis.status),
    );

    const probe = createReconciliationProbeFn({
      appContext,
    });
    const probeProjectKey = project?.projectKey ?? launchCwd;
    const probeStartedAt = Date.now();
    progress.start('学习模型');
    progress.info('正在探测学习模型，这一步会执行真实 provider probe...');
    try {
      providerProbeResult = await probe.probe({
        projectKey: probeProjectKey,
      });
      providerProbeDurationMs = Date.now() - probeStartedAt;
    } catch (error) {
      providerProbeDurationMs = Date.now() - probeStartedAt;
      providerProbeError = summarizeReconciliationProviderError(error);
    }
    progress.finish(
      '学习模型',
      providerProbeError ? '失败' : '通过',
      `耗时 ${formatDurationMs(providerProbeDurationMs)}`,
    );

    let policySection;
    progress.start('经验提取策略');
    try {
      if (!appContext.reconcileConfig?.policyPath) {
        throw new Error('reconcile.policyPath is not configured');
      }

      policy = await loadReconciliationPolicy({
        appContext,
      });

      if (options.autoFix && policy.source !== 'file') {
        progress.repair('经验提取策略');
        const ensured = await ensureReconciliationPolicyFile({
          policyPath: appContext.reconcileConfig.policyPath,
        });
        policy = await loadReconciliationPolicy({
          appContext,
        });
        fixActions.push(
          createFixAction({
            key: 'policy',
            title: '经验提取策略',
            status: policy.source === 'file' ? '通过' : '失败',
            summary: policy.source === 'file'
              ? `已生成可编辑的经验提取策略文件：${ensured.policyPath}`
              : '已尝试生成经验提取策略文件，但复检仍未通过。',
            details: {
              policyPath: ensured.policyPath,
              created: ensured.created,
              source: policy.source,
            },
          }),
        );
      }
    } catch (error) {
      policyError = error;

      if (options.autoFix && appContext.reconcileConfig?.policyPath) {
        progress.repair('经验提取策略');

        try {
          const ensured = await ensureReconciliationPolicyFile({
            policyPath: appContext.reconcileConfig.policyPath,
          });
          policy = await loadReconciliationPolicy({
            appContext,
          });
          policyError = null;
          fixActions.push(
            createFixAction({
              key: 'policy',
              title: '经验提取策略',
              status: policy.source === 'file' ? '通过' : '失败',
              summary: policy.source === 'file'
                ? `已生成可编辑的经验提取策略文件：${ensured.policyPath}`
                : '已尝试生成经验提取策略文件，但复检仍未通过。',
              details: {
                policyPath: ensured.policyPath,
                created: ensured.created,
                source: policy.source,
              },
            }),
          );
        } catch (fixError) {
          policyError = fixError;
          fixActions.push(
            createFixAction({
              key: 'policy',
              title: '经验提取策略',
              status: '失败',
              summary: `自动生成经验提取策略失败：${fixError.message}`,
              details: {
                policyPath: appContext.reconcileConfig.policyPath,
                error: fixError.message,
              },
            }),
          );
        }
      }
    }

    policySection = buildPolicySection({
      appContext,
      policy,
      error: policyError,
    });
    progress.finish('经验提取策略', policySection.status);

    let learningSection;
    progress.start('学习状态');
    try {
      learningSection = buildLearningSection({
        project,
        repositories,
        databaseReady,
        error: learningError,
      });
    } catch (error) {
      learningError = error;
      learningSection = buildLearningSection({
        project,
        repositories,
        databaseReady,
        error,
      });
    }
    progress.finish('学习状态', learningSection.status);

    let autoLearningSection;
    progress.start('自动学习');
    try {
      onboardingState = await loadOnboardingStateFn(appContext.statePath);
      const logPath = onboardingState.autoLearning.logPath || getSchedulerWatchLogPath(appContext.homeDirectory);
      const lock = await readSchedulerWatchLockFn({
        homeDirectory: appContext.homeDirectory,
      });
      const running = isProcessAliveFn(onboardingState.autoLearning.pid);
      const lockAlive = isProcessAliveFn(lock?.pid ?? null);
      const logExists = existsSyncFn(logPath);

      autoLearningSection = buildAutoLearningSection({
        appContext,
        state: onboardingState,
        lock,
        isRunning: running,
        logExists,
        lockAlive,
        error: null,
      });

      const hasInconsistentLock =
        Boolean(lock?.pid)
        && Boolean(onboardingState.autoLearning.pid)
        && lock.pid !== onboardingState.autoLearning.pid
        && lockAlive;

      if (options.autoFix && onboardingState.autoLearning.enabled && (!running || hasInconsistentLock)) {
        progress.repair('自动学习');
        const started = await startDetachedSchedulerWatchFn({
          appContext,
          intervalSeconds: onboardingState.autoLearning.intervalSeconds,
          targetPath: onboardingState.autoLearning.targetPath ?? launchCwd,
          mode: onboardingState.autoLearning.mode ?? 'global',
          maxProjects: onboardingState.autoLearning.maxProjects ?? 10,
        });
        const startedMode = started.mode ?? onboardingState.autoLearning.mode ?? 'global';
        const startedTargetPath = startedMode === 'global'
          ? null
          : started.targetPath ?? onboardingState.autoLearning.targetPath ?? launchCwd;
        const nextState = {
          ...onboardingState,
          autoLearning: {
            ...onboardingState.autoLearning,
            enabled: true,
            intervalSeconds: onboardingState.autoLearning.intervalSeconds,
            pid: started.pid,
            startedAt: started.startedAt,
            logPath: started.logPath,
            targetPath: startedTargetPath,
            mode: startedMode,
            maxProjects: started.maxProjects ?? onboardingState.autoLearning.maxProjects ?? 10,
            packageVersion: started.packageVersion ?? null,
            cliPath: started.cliPath ?? null,
            nodePath: started.nodePath ?? null,
          },
        };
        await saveOnboardingStateFn(appContext.statePath, nextState);
        onboardingState = nextState;

        const nextLock = await readSchedulerWatchLockFn({
          homeDirectory: appContext.homeDirectory,
        });
        const nextRunning = isProcessAliveFn(onboardingState.autoLearning.pid);
        const nextLockAlive = isProcessAliveFn(nextLock?.pid ?? null);
        const nextLogPath =
          onboardingState.autoLearning.logPath || getSchedulerWatchLogPath(appContext.homeDirectory);
        const nextLogExists = existsSyncFn(nextLogPath);
        autoLearningSection = buildAutoLearningSection({
          appContext,
          state: onboardingState,
          lock: nextLock,
          isRunning: nextRunning,
          logExists: nextLogExists,
          lockAlive: nextLockAlive,
          error: null,
        });
        fixActions.push(
          createFixAction({
            key: 'autoLearning',
            title: '自动学习',
            status: nextRunning ? '通过' : '失败',
            summary: nextRunning
              ? `已重新拉起后台自动学习 watcher（pid: ${onboardingState.autoLearning.pid}）。`
              : '已尝试拉起后台自动学习 watcher，但复检仍未通过。',
            details: {
              pid: onboardingState.autoLearning.pid,
              startedAt: onboardingState.autoLearning.startedAt,
              logPath: onboardingState.autoLearning.logPath,
              alreadyRunning: Boolean(started.alreadyRunning),
            },
          }),
        );
      }
    } catch (error) {
      autoLearningError = error;
      autoLearningSection = buildAutoLearningSection({
        appContext,
        state: onboardingState ?? {
          onboardingCompletedAt: null,
          autoLearning: {
            enabled: false,
            intervalSeconds: 3600,
            pid: null,
            startedAt: null,
            logPath: null,
          },
        },
        lock: null,
        isRunning: false,
        logExists: false,
        lockAlive: false,
        error,
      });
    }
    progress.finish('自动学习', autoLearningSection.status);

    let contextSection;
    progress.start('上下文注入');
    try {
      contextSection = buildContextSection({
        project,
        repositories,
        databaseReady,
        renderRuntimeContextFn,
        error: null,
      });
    } catch (error) {
      contextError = error;
      contextSection = buildContextSection({
        project,
        repositories,
        databaseReady,
        renderRuntimeContextFn,
        error,
      });
    }
    progress.finish('上下文注入', contextSection.status);

    const sections = [
      buildEnvironmentSection({
        appContext,
        ensureDatabaseReadyError: databaseError,
        databaseCheck,
        existsSyncFn,
      }),
      buildProjectSection({
        project,
        launchCwd,
        error: projectError,
      }),
      buildHooksSection({
        hookDoctorResult,
        error: hookDoctorError,
      }),
      buildProviderSection({
        appContext,
        probeResult: providerProbeResult,
        probeError: providerProbeError,
        probeDurationMs: providerProbeDurationMs,
      }),
      policySection,
      learningSection,
      autoLearningSection,
      contextSection,
    ];

    const overallStatus = summarizeOverallStatus(sections);
    const suggestions = buildSuggestions({ sections });
    const report = {
      ok: overallStatus !== '失败',
      overallStatus,
      launchCwd,
      projectKey: project?.projectKey ?? null,
      durationMs: Date.now() - startedAt,
      sections,
      fixActions,
      suggestions,
    };

    if (options.outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      progress.info(`健康检查完成，正在输出最终报告（总体结果：${overallStatus}）...`);
      console.log(renderDoctorReport(report));
    }

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    safeCloseDatabase(database);
  }
}

export {
  parseDoctorArgs,
  renderDoctorReport,
};
