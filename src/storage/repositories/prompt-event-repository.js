export class PromptEventRepository {
  constructor(database) {
    this.database = database;
  }

  insertIfAbsent(event) {
    const statement = this.database.prepare(`
      INSERT OR IGNORE INTO prompt_events (
        id,
        fingerprint,
        project_key,
        launch_cwd,
        session_id,
        thread_id,
        prompt_text,
        prompt_language,
        source,
        created_at,
        ingested_at,
        metadata_json,
        is_guidance_candidate,
        guidance_reason,
        learning_decision,
        learning_reason,
        claimed_by_run_id,
        claimed_at,
        processed_by_run_id,
        processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = statement.run(
      event.id,
      event.fingerprint,
      event.projectKey,
      event.launchCwd,
      event.sessionId ?? null,
      event.threadId ?? null,
      event.promptText,
      event.promptLanguage ?? null,
      event.source,
      event.createdAt,
      event.ingestedAt,
      event.metadataJson ?? null,
      event.isGuidanceCandidate == null ? null : event.isGuidanceCandidate ? 1 : 0,
      event.guidanceReason ?? null,
      event.learningDecision ?? null,
      event.learningReason ?? null,
      event.claimedByRunId ?? null,
      event.claimedAt ?? null,
      event.processedByRunId ?? null,
      event.processedAt ?? null,
    );

    return result.changes > 0;
  }

  count() {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM prompt_events').get();
    return row.count;
  }

  countByProjectKey(projectKey) {
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM prompt_events
        WHERE project_key = ?
      `)
      .get(projectKey);

    return row.count;
  }

  countPendingByProjectKey(projectKey) {
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM prompt_events
        WHERE project_key = ?
          AND processed_at IS NULL
      `)
      .get(projectKey);

    return row.count;
  }

  listPendingProjectSummaries({ limit = 10 } = {}) {
    return this.database
      .prepare(`
        SELECT
          project_key AS projectKey,
          COUNT(*) AS pendingCount,
          MIN(created_at) AS oldestPendingAt,
          MAX(created_at) AS newestPendingAt
        FROM prompt_events
        WHERE processed_at IS NULL
        GROUP BY project_key
        ORDER BY oldestPendingAt ASC, project_key ASC
        LIMIT ?
      `)
      .all(limit);
  }

  countIgnoredByProjectKey(projectKey) {
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM prompt_events
        WHERE project_key = ?
          AND learning_decision IN ('engine_ignored', 'llm_ignored')
      `)
      .get(projectKey);

    return row.count;
  }

  countByLearningDecision({ projectKey, decisions }) {
    if (decisions.length === 0) {
      return 0;
    }

    const placeholders = decisions.map(() => '?').join(', ');
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM prompt_events
        WHERE project_key = ?
          AND learning_decision IN (${placeholders})
      `)
      .get(projectKey, ...decisions);

    return row.count;
  }

  listAll() {
    return this.database
      .prepare('SELECT * FROM prompt_events ORDER BY ingested_at ASC, id ASC')
      .all();
  }

  listUnclassifiedByProjectKey(projectKey, limit = 500) {
    return this.database
      .prepare(`
        SELECT *
        FROM prompt_events
        WHERE project_key = ?
          AND (
            is_guidance_candidate IS NULL
            OR prompt_language IS NULL
            OR learning_decision IS NULL
          )
        ORDER BY created_at ASC, ingested_at ASC, id ASC
        LIMIT ?
      `)
      .all(projectKey, limit);
  }

  listByProjectKey({
    projectKey,
    limit = 20,
    guidanceCandidate = null,
    pendingOnly = false,
  }) {
    const conditions = ['project_key = ?'];
    const parameters = [projectKey];

    if (guidanceCandidate === true) {
      conditions.push('is_guidance_candidate = 1');
    } else if (guidanceCandidate === false) {
      conditions.push(`learning_decision IN ('engine_ignored', 'llm_ignored')`);
    }

    if (pendingOnly) {
      conditions.push('processed_at IS NULL');
    }

    parameters.push(limit);

    return this.database
      .prepare(`
        SELECT *
        FROM prompt_events
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC, ingested_at DESC, id DESC
        LIMIT ?
      `)
      .all(...parameters);
  }

  updateGuidanceClassification({
    id,
    isGuidanceCandidate,
    guidanceReason,
    promptLanguage,
    processedAt,
    processedByRunId,
    learningDecision,
    learningReason,
  }) {
    this.database
      .prepare(`
        UPDATE prompt_events
        SET is_guidance_candidate = ?,
            guidance_reason = ?,
            prompt_language = ?,
            learning_decision = CASE
              WHEN learning_decision IN ('llm_selected', 'llm_ignored') THEN learning_decision
              ELSE ?
            END,
            learning_reason = CASE
              WHEN learning_decision IN ('llm_selected', 'llm_ignored') THEN learning_reason
              ELSE ?
            END,
            processed_at = CASE
              WHEN ? IS NOT NULL AND processed_at IS NULL THEN ?
              ELSE processed_at
            END,
            processed_by_run_id = CASE
              WHEN ? IS NOT NULL AND processed_by_run_id IS NULL THEN ?
              ELSE processed_by_run_id
            END
        WHERE id = ?
      `)
      .run(
        isGuidanceCandidate ? 1 : 0,
        guidanceReason,
        promptLanguage ?? null,
        learningDecision ?? null,
        learningReason ?? null,
        processedAt ?? null,
        processedAt ?? null,
        processedByRunId ?? null,
        processedByRunId ?? null,
        id,
      );
  }

  markLearningOutcomeByRunId({
    runId,
    selectedPromptIds,
  }) {
    this.database
      .prepare(`
        UPDATE prompt_events
        SET learning_decision = 'llm_ignored',
            learning_reason = 'not_matched_by_any_experience'
        WHERE claimed_by_run_id = ?
      `)
      .run(runId);

    if (!selectedPromptIds || selectedPromptIds.length === 0) {
      return;
    }

    const placeholders = selectedPromptIds.map(() => '?').join(', ');
    this.database
      .prepare(`
        UPDATE prompt_events
        SET learning_decision = 'llm_selected',
            learning_reason = 'matched_experience'
        WHERE claimed_by_run_id = ?
          AND id IN (${placeholders})
      `)
      .run(runId, ...selectedPromptIds);
  }

  claimBatch({
    projectKey,
    runId,
    claimAt,
    claimTimeoutBefore,
    limit,
  }) {
    const statement = this.database.prepare(`
      WITH candidate_events AS (
        SELECT id
        FROM prompt_events
        WHERE project_key = ?
          AND processed_at IS NULL
          AND (
            claimed_by_run_id IS NULL
            OR claimed_at IS NULL
            OR claimed_at < ?
          )
        ORDER BY created_at ASC, ingested_at ASC, id ASC
        LIMIT ?
      )
      UPDATE prompt_events
      SET claimed_by_run_id = ?,
          claimed_at = ?
      WHERE id IN (SELECT id FROM candidate_events)
      RETURNING *
    `);

    return statement.all(projectKey, claimTimeoutBefore, limit, runId, claimAt);
  }

  listClaimedByRunId(runId) {
    return this.database
      .prepare(`
        SELECT *
        FROM prompt_events
        WHERE claimed_by_run_id = ?
        ORDER BY created_at ASC, ingested_at ASC, id ASC
      `)
      .all(runId);
  }

  markProcessedByRunId({ runId, processedAt }) {
    const result = this.database
      .prepare(`
        UPDATE prompt_events
        SET processed_at = ?,
            processed_by_run_id = ?,
            claimed_by_run_id = NULL,
            claimed_at = NULL
        WHERE claimed_by_run_id = ?
      `)
      .run(processedAt, runId, runId);

    return result.changes;
  }

  releaseClaimByRunId(runId) {
    const result = this.database
      .prepare(`
        UPDATE prompt_events
        SET claimed_by_run_id = NULL,
            claimed_at = NULL
        WHERE claimed_by_run_id = ?
          AND processed_at IS NULL
      `)
      .run(runId);

    return result.changes;
  }
}
