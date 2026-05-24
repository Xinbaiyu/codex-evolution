## ADDED Requirements

### Requirement: Global Watcher Discovers Pending Projects

Codex Evolution SHALL provide a global scheduler watch mode that discovers projects with unprocessed prompt events from local storage instead of requiring a single target path.

#### Scenario: Run global learning for multiple projects

- **GIVEN** prompt events for multiple `project_key` values are stored locally
- **AND** each project has unprocessed prompt events
- **WHEN** the global watcher tick runs
- **THEN** Codex Evolution processes each discovered project independently up to the configured project limit
- **AND** each project's reconciliation uses only prompts and experiences belonging to that project

#### Scenario: Skip global tick with no pending projects

- **GIVEN** there are no unprocessed prompt events for any project
- **WHEN** the global watcher tick runs
- **THEN** Codex Evolution reports that no projects need learning
- **AND** no reconciliation run is created

### Requirement: Project Failure Isolation

Codex Evolution SHALL isolate failures between projects during a global scheduler tick.

#### Scenario: One project fails while another succeeds

- **GIVEN** two projects have unprocessed prompt events
- **AND** reconciliation fails for the first project
- **WHEN** the global watcher tick runs
- **THEN** the first project records or reports its failure using the existing failure path
- **AND** the second project is still attempted
- **AND** the global tick summary includes both project outcomes

### Requirement: Single-Project Scheduler Compatibility

Codex Evolution SHALL keep a single-project scheduler mode for explicit target path usage.

#### Scenario: Enable scheduler for a specific project path

- **GIVEN** the user provides a target project path
- **WHEN** the user runs `cdxe scheduler:enable <path>`
- **THEN** Codex Evolution starts or records a single-project watcher for that path
- **AND** the watcher does not scan unrelated projects

### Requirement: Watcher Mode Persistence

Codex Evolution SHALL persist watcher mode in scheduler state and lock metadata so upgrade and sync flows can distinguish global and single-project watchers.

#### Scenario: Restart stale single-project watcher when global mode is desired

- **GIVEN** scheduler state expects global mode
- **AND** an existing watcher lock describes a single-project watcher
- **WHEN** Codex Evolution synchronizes the auto-learning watcher
- **THEN** it treats the existing watcher as stale or mismatched
- **AND** it restarts the watcher in global mode
