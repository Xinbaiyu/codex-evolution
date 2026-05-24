import process from 'node:process';

import { buildSessionStartContext } from '../hooks/build-session-start-context.js';
import { buildSessionStartHookOutput } from '../hooks/session-start-hook-output.js';
import { ensureDatabaseReady } from '../storage/database.js';

async function readJsonFromStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {
      hook_event_name: 'SessionStart',
      cwd: process.cwd(),
    };
  }

  return JSON.parse(text);
}

export async function runHookSessionStartCommand({ appContext }) {
  let database = null;
  let additionalContext = '';

  try {
    database = appContext.createDatabase();
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const payload = await readJsonFromStdin();
    const result = await buildSessionStartContext({
      payload,
      fallbackCwd: process.cwd(),
      repositories,
    });
    additionalContext = result.additionalContext;

    console.error(
      `[codex-evolution] session start context project_key=${result.projectKey} ` +
        `launch_cwd=${result.launchCwd} experiences=${result.experienceCount}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex-evolution] session start hook failed: ${message}`);
  } finally {
    try {
      database?.close();
    } catch {
      // Hook output must remain fail-open even if database cleanup fails.
    }
  }

  process.stdout.write(`${JSON.stringify(buildSessionStartHookOutput({ additionalContext }))}\n`);
}
