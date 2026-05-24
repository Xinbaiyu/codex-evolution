export class ReconciliationRunRepository {
  constructor(database) {
    this.database = database;
  }

  findRunningByProjectKey(projectKey) {
    return this.database
      .prepare(`
        SELECT *
        FROM reconciliation_runs
        WHERE project_key = ?
          AND status = 'running'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(projectKey);
  }

  listRecentByProjectKey(projectKey, limit = 5) {
    return this.database
      .prepare(`
        SELECT *
        FROM reconciliation_runs
        WHERE project_key = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(projectKey, limit);
  }

  countByProjectKey(projectKey) {
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM reconciliation_runs
        WHERE project_key = ?
      `)
      .get(projectKey);

    return row.count;
  }

  countByProjectKeyGroupedByStatus(projectKey) {
    return this.database
      .prepare(`
        SELECT status, COUNT(*) AS count
        FROM reconciliation_runs
        WHERE project_key = ?
        GROUP BY status
        ORDER BY status ASC
      `)
      .all(projectKey);
  }

  insert(run) {
    this.database
      .prepare(`
        INSERT INTO reconciliation_runs (
          id,
          project_key,
          window_start,
          window_end,
          status,
          prompt_count,
          input_experience_count,
          output_experience_count,
          model_name,
          created_at,
          completed_at,
          summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        run.id,
        run.projectKey,
        run.windowStart,
        run.windowEnd,
        run.status,
        run.promptCount,
        run.inputExperienceCount,
        run.outputExperienceCount,
        run.modelName,
        run.createdAt,
        run.completedAt ?? null,
        run.summaryJson ?? null,
      );
  }

  markSucceeded({ id, promptCount, inputExperienceCount, outputExperienceCount, summaryJson }) {
    this.database
      .prepare(`
        UPDATE reconciliation_runs
        SET status = 'succeeded',
            prompt_count = ?,
            input_experience_count = ?,
            output_experience_count = ?,
            summary_json = ?,
            completed_at = ?
        WHERE id = ?
      `)
      .run(
        promptCount,
        inputExperienceCount,
        outputExperienceCount,
        summaryJson ?? null,
        new Date().toISOString(),
        id,
      );
  }

  markFailed({ id, summaryJson, completedAt = new Date().toISOString() }) {
    this.database
      .prepare(`
        UPDATE reconciliation_runs
        SET status = 'failed',
            summary_json = ?,
            completed_at = ?
        WHERE id = ?
      `)
      .run(summaryJson ?? null, completedAt, id);
  }

  getById(id) {
    return this.database
      .prepare(`
        SELECT *
        FROM reconciliation_runs
        WHERE id = ?
      `)
      .get(id);
  }
}
