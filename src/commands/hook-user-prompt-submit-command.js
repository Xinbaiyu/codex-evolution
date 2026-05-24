import process from 'node:process';

import { ingestUserPromptSubmit } from '../hooks/ingest-user-prompt-submit.js';
import { buildUserPromptSubmitHookOutput } from '../hooks/user-prompt-submit-hook-output.js';
import { ensureDatabaseReady } from '../storage/database.js';

async function readJsonFromStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    throw new Error('missing hook JSON payload on stdin');
  }

  return JSON.parse(text);
}

export async function runHookUserPromptSubmitCommand({ appContext }) {
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const payload = await readJsonFromStdin();

    const result = await ingestUserPromptSubmit({
      payload,
      fallbackCwd: process.cwd(),
      repositories,
    });

    if (result.inserted) {
      console.error(
        `[codex-evolution] ingested prompt event fingerprint=${result.fingerprint} project_key=${result.projectKey}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex-evolution] user prompt hook failed: ${message}`);
  } finally {
    database.close();
  }

  process.stdout.write(`${JSON.stringify(buildUserPromptSubmitHookOutput())}\n`);
}
