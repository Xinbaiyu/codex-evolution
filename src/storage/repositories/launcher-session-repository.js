export class LauncherSessionRepository {
  constructor(database) {
    this.database = database;
  }

  insert(session) {
    this.database
      .prepare(`
        INSERT INTO launcher_sessions (
          id,
          project_key,
          launch_cwd,
          context_hash,
          started_at,
          codex_args_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.id,
        session.projectKey,
        session.launchCwd,
        session.contextHash,
        session.startedAt,
        session.codexArgsJson ?? null,
      );
  }

  count() {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM launcher_sessions').get();
    return row.count;
  }
}
