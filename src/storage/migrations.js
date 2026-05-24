import { withTransaction } from './database.js';

const MIGRATIONS = [
  {
    id: '001_initial_schema',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS prompt_events (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        project_key TEXT NOT NULL,
        launch_cwd TEXT NOT NULL,
        session_id TEXT,
        thread_id TEXT,
        prompt_text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        metadata_json TEXT,
        claimed_by_run_id TEXT,
        claimed_at TEXT,
        processed_by_run_id TEXT,
        processed_at TEXT
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        project_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_text TEXT NOT NULL,
        rationale TEXT,
        confidence REAL NOT NULL,
        effective_score REAL NOT NULL,
        status TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_reconciled_at TEXT NOT NULL,
        hit_count INTEGER NOT NULL,
        rank_order INTEGER NOT NULL,
        source_prompt_count INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        archived_at TEXT
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id TEXT PRIMARY KEY,
        project_key TEXT NOT NULL,
        window_start TEXT NOT NULL,
        window_end TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt_count INTEGER NOT NULL,
        input_experience_count INTEGER NOT NULL,
        output_experience_count INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS launcher_sessions (
        id TEXT PRIMARY KEY,
        project_key TEXT NOT NULL,
        launch_cwd TEXT NOT NULL,
        context_hash TEXT NOT NULL,
        started_at TEXT NOT NULL,
        codex_args_json TEXT
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_prompt_events_project_created_at ON prompt_events(project_key, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_prompt_events_project_processed_at ON prompt_events(project_key, processed_at)`,
      `CREATE INDEX IF NOT EXISTS idx_prompt_events_project_claimed_at ON prompt_events(project_key, claimed_at)`,
      `CREATE INDEX IF NOT EXISTS idx_experiences_project_status_rank ON experiences(project_key, status, rank_order)`,
      `CREATE INDEX IF NOT EXISTS idx_experiences_project_last_seen_at ON experiences(project_key, last_seen_at)`,
      `CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_project_status ON reconciliation_runs(project_key, status, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_launcher_sessions_project_started_at ON launcher_sessions(project_key, started_at)`
    ],
  },
  {
    id: '002_guidance_prompt_columns',
    statements: [
      `ALTER TABLE prompt_events ADD COLUMN is_guidance_candidate INTEGER`,
      `ALTER TABLE prompt_events ADD COLUMN guidance_reason TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_prompt_events_project_guidance_candidate ON prompt_events(project_key, is_guidance_candidate)`,
    ],
  },
  {
    id: '003_language_columns',
    statements: [
      `ALTER TABLE prompt_events ADD COLUMN prompt_language TEXT`,
      `ALTER TABLE experiences ADD COLUMN canonical_language TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_prompt_events_project_prompt_language ON prompt_events(project_key, prompt_language)`,
      `CREATE INDEX IF NOT EXISTS idx_experiences_project_canonical_language ON experiences(project_key, canonical_language)`,
    ],
  },
  {
    id: '004_prompt_learning_decision_columns',
    statements: [
      `ALTER TABLE prompt_events ADD COLUMN learning_decision TEXT`,
      `ALTER TABLE prompt_events ADD COLUMN learning_reason TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_prompt_events_project_learning_decision ON prompt_events(project_key, learning_decision)`,
      `
      UPDATE prompt_events
      SET learning_decision = 'engine_ignored',
          learning_reason = COALESCE(guidance_reason, 'engine_ignored')
      WHERE learning_decision IS NULL
        AND processed_at IS NOT NULL
        AND processed_by_run_id = 'system:guidance-filter'
      `,
      `
      UPDATE prompt_events
      SET learning_decision = 'llm_selected',
          learning_reason = 'selected_by_historical_run'
      WHERE learning_decision IS NULL
        AND processed_at IS NOT NULL
        AND processed_by_run_id IS NOT NULL
        AND processed_by_run_id <> 'system:guidance-filter'
      `,
      `
      UPDATE prompt_events
      SET learning_decision = 'pending',
          learning_reason = 'llm_review'
      WHERE learning_decision IS NULL
        AND processed_at IS NULL
      `,
    ],
  },
];

export function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of MIGRATIONS) {
    const existingMigration = database
      .prepare('SELECT id FROM schema_migrations WHERE id = ?')
      .get(migration.id);

    if (existingMigration) {
      continue;
    }

    withTransaction(database, () => {
      for (const statement of migration.statements) {
        try {
          database.exec(statement);
        } catch (error) {
          if (
            error instanceof Error
            && /duplicate column name|already exists/i.test(error.message)
          ) {
            continue;
          }

          throw error;
        }
      }

      database
        .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
    });
  }
}
