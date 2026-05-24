import { createHash, randomUUID } from 'node:crypto';

import { ACTIVE_SUPPORT_THRESHOLD } from '../guidance/apply-project-guidance-policy.js';
import { deriveProjectPreferredLanguage } from '../language/derive-project-preferred-language.js';
import {
  detectTextLanguage,
  normalizeCanonicalLanguage,
} from '../language/detect-text-language.js';
import { withTransaction } from '../storage/database.js';

function buildContentHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function normalizeAction(action) {
  if (action === 'retain' || action === 'update' || action === 'merge' || action === 'create') {
    return action;
  }

  return 'create';
}

function chooseTargetExperience({ draft, existingById }) {
  for (const id of draft.existingExperienceIds ?? []) {
    const experience = existingById.get(id);
    if (experience) {
      return experience;
    }
  }

  return null;
}

function buildPromptLanguageMap(promptEvents) {
  return new Map(
    promptEvents.map((prompt) => [
      prompt.id,
      prompt.prompt_language ?? detectTextLanguage(prompt.prompt_text),
    ]),
  );
}

function deriveExperienceLanguage({
  draft,
  existing,
  promptLanguageById,
  projectPreferredLanguage,
}) {
  let zhWeight = 0;
  let enWeight = 0;

  for (const promptId of draft.matchedPromptIds ?? []) {
    const language = promptLanguageById.get(promptId);

    if (language === 'zh' || language === 'mixed') {
      zhWeight += 1;
    } else if (language === 'en') {
      enWeight += 1;
    }
  }

  if (zhWeight === 0 && enWeight === 0) {
    return normalizeCanonicalLanguage(
      existing?.canonical_language || detectTextLanguage(draft.canonicalText) || projectPreferredLanguage,
    );
  }

  return zhWeight >= enWeight ? 'zh' : 'en';
}

function deriveSupportConfidenceFloor(sourcePromptCount) {
  if (sourcePromptCount >= 5) {
    return 0.9;
  }

  if (sourcePromptCount >= 3) {
    return 0.8;
  }

  if (sourcePromptCount >= ACTIVE_SUPPORT_THRESHOLD) {
    return 0.7;
  }

  return 0;
}

function deriveNextConfidence({ draftConfidence, existingConfidence, sourcePromptCount }) {
  return Math.min(
    1,
    Math.max(
      draftConfidence,
      existingConfidence ?? 0,
      deriveSupportConfidenceFloor(sourcePromptCount),
    ),
  );
}

function buildExperienceRecord({
  draft,
  existing,
  projectKey,
  now,
  promptLanguageById,
  projectPreferredLanguage,
}) {
  const matchedCount = draft.matchedPromptIds?.length ?? 0;
  const existingHitCount = existing ? existing.hit_count : 0;
  const existingSourcePromptCount = existing ? existing.source_prompt_count : 0;
  const sourcePromptCount = existingSourcePromptCount + matchedCount;
  const nextStatus = sourcePromptCount >= ACTIVE_SUPPORT_THRESHOLD ? 'active' : 'candidate';
  const nextConfidence = deriveNextConfidence({
    draftConfidence: draft.confidence,
    existingConfidence: existing?.confidence,
    sourcePromptCount,
  });
  const canonicalLanguage = deriveExperienceLanguage({
    draft,
    existing,
    promptLanguageById,
    projectPreferredLanguage,
  });

  return {
    id: existing ? existing.id : randomUUID(),
    projectKey,
    kind: draft.kind,
    title: draft.title,
    canonicalText: draft.canonicalText,
    canonicalLanguage,
    rationale: draft.rationale ?? null,
    confidence: nextConfidence,
    effectiveScore: nextConfidence,
    status: nextStatus,
    firstSeenAt: existing ? existing.first_seen_at : now,
    lastSeenAt: matchedCount > 0 ? now : existing ? existing.last_seen_at : now,
    lastReconciledAt: now,
    hitCount: existingHitCount + matchedCount,
    rankOrder: draft.rankOrder,
    sourcePromptCount,
    contentHash: buildContentHash(draft.canonicalText),
    archivedAt: null,
  };
}

export function applyReconciliationOutput({
  database,
  repositories,
  runId,
  projectKey,
  output,
  now = new Date().toISOString(),
}) {
  const drafts = Array.isArray(output?.experiences) ? output.experiences : [];
  const mentionedIds = [
    ...new Set(
      drafts.flatMap((draft) =>
        Array.isArray(draft.existingExperienceIds) ? draft.existingExperienceIds : [],
      ),
    ),
  ];
  const existingExperiences = repositories.experiences.getByIds(mentionedIds);
  const existingById = new Map(existingExperiences.map((experience) => [experience.id, experience]));
  const claimedPromptEvents = repositories.promptEvents.listClaimedByRunId(runId);
  const promptLanguageById = buildPromptLanguageMap(claimedPromptEvents);
  const projectPreferredLanguage = deriveProjectPreferredLanguage({
    prompts: claimedPromptEvents.map((prompt) => ({
      promptLanguage: prompt.prompt_language ?? detectTextLanguage(prompt.prompt_text),
    })),
    experiences: existingExperiences.map((experience) => ({
      canonicalLanguage: normalizeCanonicalLanguage(
        experience.canonical_language || detectTextLanguage(experience.canonical_text),
      ),
    })),
  });

  return withTransaction(database, () => {
    const touchedIds = [];
    const archivedIds = [];
    const selectedPromptIds = new Set();

    for (const draft of drafts) {
      const action = normalizeAction(draft.action);
      const targetExperience = chooseTargetExperience({
        draft,
        existingById,
      });
      const nextRecord = buildExperienceRecord({
        draft,
        existing: targetExperience,
        projectKey,
        now,
        promptLanguageById,
        projectPreferredLanguage,
      });

      repositories.experiences.upsert(nextRecord);
      touchedIds.push(nextRecord.id);
      for (const promptId of draft.matchedPromptIds ?? []) {
        selectedPromptIds.add(promptId);
      }

      if (action === 'merge' && Array.isArray(draft.existingExperienceIds)) {
        for (const id of draft.existingExperienceIds.slice(1)) {
          if (id && id !== nextRecord.id) {
            archivedIds.push(id);
          }
        }
      }
    }

    repositories.experiences.touchLastReconciledForProjectStatuses({
      projectKey,
      statuses: ['active', 'candidate', 'decaying'],
      at: now,
      excludeIds: touchedIds,
    });

    repositories.experiences.archiveByIds(archivedIds, {
      archivedAt: now,
      lastReconciledAt: now,
    });

    repositories.promptEvents.markLearningOutcomeByRunId({
      runId,
      selectedPromptIds: [...selectedPromptIds],
    });

    const processedPromptCount = repositories.promptEvents.markProcessedByRunId({
      runId,
      processedAt: now,
    });

    repositories.reconciliationRuns.markSucceeded({
      id: runId,
      promptCount: processedPromptCount,
      inputExperienceCount: output.inputExperienceCount ?? 0,
      outputExperienceCount: drafts.length,
      summaryJson: toJson({
        processedPromptCount,
        touchedExperienceCount: touchedIds.length,
        archivedExperienceCount: archivedIds.length,
      }),
    });

    return {
      processedPromptCount,
      touchedExperienceCount: touchedIds.length,
      archivedExperienceCount: archivedIds.length,
    };
  });
}
