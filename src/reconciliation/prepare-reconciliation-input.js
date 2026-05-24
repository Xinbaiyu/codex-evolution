import { deriveProjectPreferredLanguage } from '../language/derive-project-preferred-language.js';

export function prepareReconciliationInput({
  repositories,
  projectKey,
  runId,
  now = new Date().toISOString(),
}) {
  const prompts = repositories.promptEvents.listClaimedByRunId(runId);
  const experiences = repositories.experiences.listByProjectAndStatuses({
    projectKey,
    statuses: ['active', 'candidate', 'decaying'],
    limit: 50,
  });

  const promptRecords = prompts.map((prompt) => ({
      id: prompt.id,
      projectKey: prompt.project_key,
      launchCwd: prompt.launch_cwd,
      promptText: prompt.prompt_text,
      promptLanguage: prompt.prompt_language ?? 'other',
      createdAt: prompt.created_at,
      sessionId: prompt.session_id,
      threadId: prompt.thread_id,
    }));
  const experienceRecords = experiences.map((experience) => ({
      id: experience.id,
      projectKey: experience.project_key,
      kind: experience.kind,
      title: experience.title,
      canonicalText: experience.canonical_text,
      canonicalLanguage: experience.canonical_language ?? 'zh',
      rationale: experience.rationale,
      confidence: experience.confidence,
      effectiveScore: experience.effective_score,
      status: experience.status,
      firstSeenAt: experience.first_seen_at,
      lastSeenAt: experience.last_seen_at,
      lastReconciledAt: experience.last_reconciled_at,
      hitCount: experience.hit_count,
      rankOrder: experience.rank_order,
      sourcePromptCount: experience.source_prompt_count,
      contentHash: experience.content_hash,
      archivedAt: experience.archived_at,
    }));

  return {
    projectPreferredLanguage: deriveProjectPreferredLanguage({
      prompts: promptRecords,
      experiences: experienceRecords,
    }),
    prompts: promptRecords,
    experiences: experienceRecords,
    now,
  };
}
