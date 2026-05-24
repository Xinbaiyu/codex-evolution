## ADDED Requirements

### Requirement: User Editable Reconciliation Policy

Codex Evolution SHALL let users customize the semantic policy used for experience extraction without allowing that policy to override the machine-readable reconciliation protocol.

#### Scenario: Initialize default Chinese policy

- **GIVEN** no user policy file exists at the effective policy path
- **WHEN** the user runs `cdxe policy:init`
- **THEN** Codex Evolution creates a Markdown policy file using the Chinese template
- **AND** the command reports the created file path

#### Scenario: Initialize English policy template

- **GIVEN** no user policy file exists at the effective policy path
- **WHEN** the user runs `cdxe policy:init --lang en`
- **THEN** Codex Evolution creates a Markdown policy file using the English template

#### Scenario: Preserve existing policy by default

- **GIVEN** a user policy file already exists
- **WHEN** the user runs `cdxe policy:init`
- **THEN** Codex Evolution does not overwrite the file
- **AND** the command tells the user how to overwrite intentionally

#### Scenario: Show effective policy

- **GIVEN** a user policy file exists or the built-in fallback policy is active
- **WHEN** the user runs `cdxe policy:show`
- **THEN** Codex Evolution prints the effective policy text
- **AND** the output identifies whether the policy came from a user file or built-in fallback

### Requirement: Fixed Reconciliation Protocol Boundary

Codex Evolution SHALL keep JSON output schema, experience kind enum, matched prompt semantics, and application-level state transitions outside the editable policy.

#### Scenario: Compose policy with fixed protocol

- **GIVEN** a custom policy is available
- **WHEN** Codex Evolution builds a reconciliation prompt
- **THEN** the prompt includes the custom policy text
- **AND** the prompt still includes fixed protocol instructions requiring structured JSON
- **AND** the prompt still includes the fixed experience kind enum

#### Scenario: Fallback to built-in policy

- **GIVEN** no policy file exists at the default policy path
- **WHEN** Codex Evolution builds a reconciliation prompt
- **THEN** the prompt uses the built-in Chinese policy template

#### Scenario: Fail clearly for missing custom policy path

- **GIVEN** the user configured a non-default policy path
- **AND** no file exists at that path
- **WHEN** Codex Evolution tries to load the policy
- **THEN** the operation fails with a clear local file-not-found error
