import { randomUUID } from 'node:crypto';

import { resolveProjectKey } from '../project/resolve-project-key.js';
import {
  GUIDANCE_FILTER_PROCESSED_BY_RUN_ID,
} from '../guidance/apply-project-guidance-policy.js';
import { classifyGuidanceText } from '../guidance/classify-guidance-text.js';
import { detectTextLanguage } from '../language/detect-text-language.js';
import { buildPromptEventFingerprint } from './build-prompt-event-fingerprint.js';
import { normalizeUserPromptSubmitPayload } from './normalize-user-prompt-submit-payload.js';

export async function ingestUserPromptSubmit({ payload, fallbackCwd, repositories }) {
  const normalizedPayload = normalizeUserPromptSubmitPayload({
    payload,
    fallbackCwd,
  });
  const project = await resolveProjectKey({
    cwd: normalizedPayload.cwd,
  });

  const fingerprint = buildPromptEventFingerprint({
    hookEventName: 'UserPromptSubmit',
    projectKey: project.projectKey,
    launchCwd: project.launchCwd,
    sessionId: normalizedPayload.sessionId,
    threadId: normalizedPayload.threadId,
    promptText: normalizedPayload.promptText,
    createdAt: normalizedPayload.createdAt,
  });
  const ingestedAt = new Date().toISOString();
  const guidanceClassification = classifyGuidanceText({
    text: normalizedPayload.promptText,
    mode: 'prompt',
  });
  const promptLanguage = detectTextLanguage(normalizedPayload.promptText);

  const inserted = repositories.promptEvents.insertIfAbsent({
    id: randomUUID(),
    fingerprint,
    projectKey: project.projectKey,
    launchCwd: project.launchCwd,
    sessionId: normalizedPayload.sessionId,
    threadId: normalizedPayload.threadId,
    promptText: normalizedPayload.promptText,
    promptLanguage,
    source: 'codex-hook',
    createdAt: normalizedPayload.createdAt,
    ingestedAt,
    metadataJson: normalizedPayload.metadataJson,
    isGuidanceCandidate: guidanceClassification.isGuidanceCandidate,
    guidanceReason: guidanceClassification.reason,
    learningDecision: guidanceClassification.isGuidanceCandidate ? 'pending' : 'engine_ignored',
    learningReason: guidanceClassification.isGuidanceCandidate
      ? 'llm_review'
      : guidanceClassification.reason,
    processedByRunId: guidanceClassification.isGuidanceCandidate
      ? null
      : GUIDANCE_FILTER_PROCESSED_BY_RUN_ID,
    processedAt: guidanceClassification.isGuidanceCandidate ? null : ingestedAt,
  });

  return {
    inserted,
    fingerprint,
    projectKey: project.projectKey,
    launchCwd: project.launchCwd,
    isGuidanceCandidate: guidanceClassification.isGuidanceCandidate,
    guidanceReason: guidanceClassification.reason,
    promptLanguage,
  };
}
