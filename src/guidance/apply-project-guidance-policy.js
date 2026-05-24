import { classifyGuidanceText } from './classify-guidance-text.js';
import {
  detectTextLanguage,
  normalizeCanonicalLanguage,
} from '../language/detect-text-language.js';

export const GUIDANCE_FILTER_PROCESSED_BY_RUN_ID = 'system:guidance-filter';
export const ACTIVE_SUPPORT_THRESHOLD = 2;
export const CANDIDATE_ARCHIVE_AFTER_DAYS = 14;

function toRowExperienceRecord(experience, overrides = {}) {
  return {
    id: experience.id,
    projectKey: experience.project_key,
    kind: experience.kind,
    title: experience.title,
    canonicalText: experience.canonical_text,
    canonicalLanguage: overrides.canonicalLanguage ?? experience.canonical_language,
    rationale: experience.rationale,
    confidence: experience.confidence,
    effectiveScore: overrides.effectiveScore ?? experience.effective_score,
    status: overrides.status ?? experience.status,
    firstSeenAt: experience.first_seen_at,
    lastSeenAt: experience.last_seen_at,
    lastReconciledAt: overrides.lastReconciledAt ?? experience.last_reconciled_at,
    hitCount: overrides.hitCount ?? experience.hit_count,
    rankOrder: overrides.rankOrder ?? experience.rank_order,
    sourcePromptCount: overrides.sourcePromptCount ?? experience.source_prompt_count,
    contentHash: overrides.contentHash ?? experience.content_hash,
    archivedAt: overrides.archivedAt ?? experience.archived_at,
  };
}

function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }

  return Math.max(0, (to - from) / (24 * 60 * 60 * 1000));
}

function deriveRescreenedStatus(experience, now) {
  const classification = classifyGuidanceText({
    text: experience.canonical_text,
    mode: 'experience',
  });
  const supportCount = Math.max(
    experience.source_prompt_count ?? 0,
    experience.hit_count ?? 0,
  );
  const canonicalLanguage = normalizeCanonicalLanguage(
    experience.canonical_language || detectTextLanguage(experience.canonical_text),
  );

  if (!classification.isGuidanceCandidate) {
    return {
      nextStatus: 'archived',
      reason: classification.reason,
      archivedAt: now,
      canonicalLanguage,
    };
  }

  if (supportCount < ACTIVE_SUPPORT_THRESHOLD) {
    const staleDays = daysBetween(experience.last_seen_at, now);
    return {
      nextStatus: staleDays >= CANDIDATE_ARCHIVE_AFTER_DAYS ? 'archived' : 'candidate',
      reason: staleDays >= CANDIDATE_ARCHIVE_AFTER_DAYS
        ? 'candidate_stale'
        : 'insufficient_support',
      archivedAt: staleDays >= CANDIDATE_ARCHIVE_AFTER_DAYS ? now : null,
      canonicalLanguage,
    };
  }

  if (experience.status === 'decaying') {
    return {
      nextStatus: 'decaying',
      reason: 'preserve_decaying',
      archivedAt: null,
      canonicalLanguage,
    };
  }

  return {
    nextStatus: 'active',
    reason: 'stable_guidance',
    archivedAt: null,
    canonicalLanguage,
  };
}

export function backfillPromptGuidanceClassification({
  repositories,
  projectKey,
  now = new Date().toISOString(),
  limit = 500,
}) {
  let updatedCount = 0;
  let ignoredCount = 0;

  while (true) {
    const events = repositories.promptEvents.listUnclassifiedByProjectKey(projectKey, limit);

    if (events.length === 0) {
      break;
    }

    for (const event of events) {
      const classification = classifyGuidanceText({
        text: event.prompt_text,
        mode: 'prompt',
      });

      repositories.promptEvents.updateGuidanceClassification({
        id: event.id,
        isGuidanceCandidate: classification.isGuidanceCandidate,
        guidanceReason: classification.reason,
        promptLanguage: detectTextLanguage(event.prompt_text),
        learningDecision: classification.isGuidanceCandidate ? 'pending' : 'engine_ignored',
        learningReason: classification.isGuidanceCandidate ? 'llm_review' : classification.reason,
        processedAt: classification.isGuidanceCandidate ? null : now,
        processedByRunId: classification.isGuidanceCandidate
          ? null
          : GUIDANCE_FILTER_PROCESSED_BY_RUN_ID,
      });

      updatedCount += 1;
      if (!classification.isGuidanceCandidate) {
        ignoredCount += 1;
      }
    }

    if (events.length < limit) {
      break;
    }
  }

  return {
    updatedCount,
    ignoredCount,
  };
}

export function rescreenProjectExperiences({
  repositories,
  projectKey,
  now = new Date().toISOString(),
}) {
  const experiences = repositories.experiences.listByProjectAndStatuses({
    projectKey,
    statuses: ['active', 'candidate', 'decaying'],
    limit: 500,
  });

  let updatedCount = 0;
  let archivedCount = 0;
  let candidateCount = 0;

  for (const experience of experiences) {
    const next = deriveRescreenedStatus(experience, now);

    if (
      next.nextStatus === experience.status
      && next.canonicalLanguage === (experience.canonical_language ?? null)
      && (next.archivedAt ?? null) === (experience.archived_at ?? null)
    ) {
      continue;
    }

    repositories.experiences.upsert(
      toRowExperienceRecord(experience, {
        status: next.nextStatus,
        archivedAt: next.archivedAt,
        lastReconciledAt: now,
        canonicalLanguage: next.canonicalLanguage,
      }),
    );

    updatedCount += 1;
    if (next.nextStatus === 'archived') {
      archivedCount += 1;
    }
    if (next.nextStatus === 'candidate') {
      candidateCount += 1;
    }
  }

  return {
    updatedCount,
    archivedCount,
    candidateCount,
  };
}

export function applyProjectGuidancePolicy({
  repositories,
  projectKey,
  now = new Date().toISOString(),
}) {
  const promptBackfill = backfillPromptGuidanceClassification({
    repositories,
    projectKey,
    now,
  });
  const experienceRescreen = rescreenProjectExperiences({
    repositories,
    projectKey,
    now,
  });

  return {
    promptBackfill,
    experienceRescreen,
  };
}
