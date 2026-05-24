import { computeEffectiveScore, deriveExperienceStatus } from './compute-effective-score.js';
import { CANDIDATE_ARCHIVE_AFTER_DAYS } from '../guidance/apply-project-guidance-policy.js';

function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }

  return Math.max(0, (to - from) / (24 * 60 * 60 * 1000));
}

export function applyProjectDecay({
  repositories,
  projectKey,
  now = new Date().toISOString(),
  halfLifeDays = 30,
}) {
  const experiences = repositories.experiences.listByProjectAndStatuses({
    projectKey,
    statuses: ['active', 'candidate', 'decaying'],
    limit: 500,
  });

  let updatedCount = 0;

  for (const experience of experiences) {
    const effectiveScore = computeEffectiveScore({
      confidence: experience.confidence,
      lastSeenAt: experience.last_seen_at,
      now,
      halfLifeDays,
    });
    const status = experience.status === 'candidate'
      ? daysBetween(experience.last_seen_at, now) >= CANDIDATE_ARCHIVE_AFTER_DAYS
        ? 'archived'
        : 'candidate'
      : deriveExperienceStatus(effectiveScore);

    repositories.experiences.applyDecayUpdate({
      id: experience.id,
      effectiveScore,
      status,
      lastReconciledAt: now,
      archivedAt: status === 'archived' ? now : null,
    });
    updatedCount += 1;
  }

  return {
    updatedCount,
  };
}
