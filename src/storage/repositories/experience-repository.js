export class ExperienceRepository {
  constructor(database) {
    this.database = database;
  }

  countByProjectAndStatuses({ projectKey, statuses }) {
    const placeholders = statuses.map(() => '?').join(', ');
    const statement = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM experiences
      WHERE project_key = ?
        AND status IN (${placeholders})
    `);

    return statement.get(projectKey, ...statuses).count;
  }

  listByProjectAndStatuses({ projectKey, statuses, limit = 50 }) {
    const placeholders = statuses.map(() => '?').join(', ');
    const statement = this.database.prepare(`
      SELECT *
      FROM experiences
      WHERE project_key = ?
        AND status IN (${placeholders})
      ORDER BY rank_order ASC
      LIMIT ?
    `);

    return statement.all(projectKey, ...statuses, limit);
  }

  getByIds(ids) {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(', ');
    return this.database
      .prepare(`
        SELECT *
        FROM experiences
        WHERE id IN (${placeholders})
      `)
      .all(...ids);
  }

  upsert(experience) {
    this.database
      .prepare(`
        INSERT INTO experiences (
          id,
          project_key,
          kind,
          title,
          canonical_text,
          canonical_language,
          rationale,
          confidence,
          effective_score,
          status,
          first_seen_at,
          last_seen_at,
          last_reconciled_at,
          hit_count,
          rank_order,
          source_prompt_count,
          content_hash,
          archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_key = excluded.project_key,
          kind = excluded.kind,
          title = excluded.title,
          canonical_text = excluded.canonical_text,
          canonical_language = excluded.canonical_language,
          rationale = excluded.rationale,
          confidence = excluded.confidence,
          effective_score = excluded.effective_score,
          status = excluded.status,
          first_seen_at = excluded.first_seen_at,
          last_seen_at = excluded.last_seen_at,
          last_reconciled_at = excluded.last_reconciled_at,
          hit_count = excluded.hit_count,
          rank_order = excluded.rank_order,
          source_prompt_count = excluded.source_prompt_count,
          content_hash = excluded.content_hash,
          archived_at = excluded.archived_at
      `)
      .run(
        experience.id,
        experience.projectKey,
        experience.kind,
        experience.title,
        experience.canonicalText,
        experience.canonicalLanguage ?? null,
        experience.rationale ?? null,
        experience.confidence,
        experience.effectiveScore,
        experience.status,
        experience.firstSeenAt,
        experience.lastSeenAt,
        experience.lastReconciledAt,
        experience.hitCount,
        experience.rankOrder,
        experience.sourcePromptCount,
        experience.contentHash,
        experience.archivedAt ?? null,
      );
  }

  archiveByIds(ids, { archivedAt, lastReconciledAt }) {
    if (ids.length === 0) {
      return 0;
    }

    const placeholders = ids.map(() => '?').join(', ');
    const result = this.database
      .prepare(`
        UPDATE experiences
        SET status = 'archived',
            archived_at = ?,
            last_reconciled_at = ?
        WHERE id IN (${placeholders})
      `)
      .run(archivedAt, lastReconciledAt, ...ids);

    return result.changes;
  }

  touchLastReconciledForProjectStatuses({ projectKey, statuses, at, excludeIds = [] }) {
    if (statuses.length === 0) {
      return 0;
    }

    const statusPlaceholders = statuses.map(() => '?').join(', ');
    const params = [at, projectKey, ...statuses];
    let sql = `
      UPDATE experiences
      SET last_reconciled_at = ?
      WHERE project_key = ?
        AND status IN (${statusPlaceholders})
    `;

    if (excludeIds.length > 0) {
      const excludePlaceholders = excludeIds.map(() => '?').join(', ');
      sql += ` AND id NOT IN (${excludePlaceholders})`;
      params.push(...excludeIds);
    }

    const result = this.database.prepare(sql).run(...params);
    return result.changes;
  }

  applyDecayUpdate(experience) {
    this.database
      .prepare(`
        UPDATE experiences
        SET effective_score = ?,
            status = ?,
            last_reconciled_at = ?,
            archived_at = ?
        WHERE id = ?
      `)
      .run(
        experience.effectiveScore,
        experience.status,
        experience.lastReconciledAt,
        experience.archivedAt ?? null,
        experience.id,
      );
  }
}
