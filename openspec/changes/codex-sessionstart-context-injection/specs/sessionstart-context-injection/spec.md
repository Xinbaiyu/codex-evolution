## ADDED Requirements

### Requirement: SessionStart Hook Context Injection

Codex Evolution SHALL provide a `SessionStart` hook command that resolves the current project, reads local active or decaying experiences, renders the standard runtime context, and returns it through Codex `hookSpecificOutput.additionalContext`.

#### Scenario: Inject learned project context at session start

- **GIVEN** the current project has active or decaying experiences in the local database
- **WHEN** Codex invokes `codex-evolution hook:session-start` for a `SessionStart` event
- **THEN** the command returns JSON containing `hookSpecificOutput.hookEventName` set to `SessionStart`
- **AND** `hookSpecificOutput.additionalContext` contains the rendered project runtime context

#### Scenario: Fail open when context rendering is unavailable

- **GIVEN** the local database or project resolution is unavailable
- **WHEN** Codex invokes `codex-evolution hook:session-start`
- **THEN** the command still returns valid JSON for the `SessionStart` hook
- **AND** `hookSpecificOutput.additionalContext` is empty
- **AND** Codex startup is not blocked by the hook failure

### Requirement: Multi-Event Hook Management

Codex Evolution SHALL install, uninstall, and diagnose both `UserPromptSubmit` and `SessionStart` hooks as one managed hook set.

#### Scenario: Install both managed hooks

- **GIVEN** the hooks config does not contain Codex Evolution managed hooks
- **WHEN** the user runs `codex-evolution hooks:install`
- **THEN** the hooks config contains a `UserPromptSubmit` command hook for prompt collection
- **AND** the hooks config contains a `SessionStart` command hook for context injection

#### Scenario: Diagnose trust state for both hooks

- **GIVEN** Codex Evolution hooks are installed
- **WHEN** the user runs `codex-evolution hooks:doctor` or `codex-evolution doctor`
- **THEN** the diagnostic output reports installation and trust state for `UserPromptSubmit`
- **AND** the diagnostic output reports installation and trust state for `SessionStart`

### Requirement: Wrapper Launch Defaults To No Direct Context Injection

Codex Evolution SHALL keep `cdxe` as an initialization and launch wrapper while avoiding duplicate model-visible context injection by default.

#### Scenario: Wrapper passes through Codex args by default

- **GIVEN** runtime context is available for the current project
- **WHEN** the user starts Codex through `cdxe`
- **THEN** the wrapper does not append runtime context through `developer_instructions` by default
- **AND** project context injection is delegated to the `SessionStart` hook

#### Scenario: Explicit fallback injection remains available

- **GIVEN** the user explicitly selects a fallback injection mode
- **WHEN** the wrapper builds Codex launch arguments
- **THEN** `developer_instructions` or `startup_prompt` injection remains available for debugging
