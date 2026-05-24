import fs from 'node:fs/promises';
import path from 'node:path';

import { loadOnboardingState } from '../onboarding/onboarding-state.js';

const DEFAULT_LINES = 100;

export function parseSchedulerLogsOptions(args = []) {
  let lineCount = DEFAULT_LINES;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--lines') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('missing value for --lines');
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`invalid --lines value: ${value}`);
      }

      lineCount = parsed;
      index += 1;
      continue;
    }

    throw new Error(`unsupported scheduler:logs option: ${arg}`);
  }

  return {
    lineCount,
  };
}

function tailLines(text, lineCount) {
  const lines = text.split(/\r?\n/);
  const normalizedLines = lines.at(-1) === '' ? lines.slice(0, -1) : lines;
  const tail = normalizedLines.slice(-lineCount);

  return {
    availableLineCount: normalizedLines.length,
    content: tail.join('\n'),
  };
}

async function readTextFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function runSchedulerLogsCommand({
  appContext,
  args = [],
  loadStateFn = loadOnboardingState,
  readTextFileIfExistsFn = readTextFileIfExists,
}) {
  const options = parseSchedulerLogsOptions(args);
  const state = await loadStateFn(appContext.statePath);
  const logPath = state.autoLearning.logPath || path.join(appContext.homeDirectory, 'scheduler-watch.log');
  const logText = await readTextFileIfExistsFn(logPath);

  if (logText === null) {
    console.log(
      JSON.stringify(
        {
          logPath,
          exists: false,
          lineCountRequested: options.lineCount,
          availableLineCount: 0,
          content: '',
        },
        null,
        2,
      ),
    );
    return;
  }

  const tailed = tailLines(logText, options.lineCount);
  console.log(
    JSON.stringify(
      {
        logPath,
        exists: true,
        lineCountRequested: options.lineCount,
        availableLineCount: tailed.availableLineCount,
        content: tailed.content,
      },
      null,
      2,
    ),
  );
}
