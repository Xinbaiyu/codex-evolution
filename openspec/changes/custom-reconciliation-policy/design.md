# Design: Custom Reconciliation Policy

## Policy Model

The final reconciliation prompt is composed from three layers:

1. Fixed system protocol maintained by `codex-evolution`.
2. User-editable Markdown policy.
3. Fixed output schema and input payload.

The user-editable layer influences extraction preferences, examples, ranking, and language style. The fixed layers preserve machine-readable output and application-level invariants.

## Policy Location

Default path:

```text
~/.codex-evolution/reconciliation-policy.md
```

Configuration:

```json
{
  "reconcile": {
    "policyPath": "~/.codex-evolution/reconciliation-policy.md"
  }
}
```

Environment override:

```text
CODEX_EVOLUTION_RECONCILE_POLICY_PATH
```

If no file exists at the effective path, the built-in Chinese policy template is used in memory.

## Commands

`cdxe policy:init`

- Creates the effective policy file using the Chinese template.
- Refuses to overwrite existing files unless `--force` is provided.

`cdxe policy:init --lang en`

- Creates the effective policy file using the English template.

`cdxe policy:show`

- Prints the effective policy text.
- Indicates whether it came from a custom file or built-in default.

## Prompt Construction

`buildReconciliationPrompt(input, { policyText, policySource })` includes:

- fixed task and protocol rules
- policy text under a dedicated `userPolicy` field
- fixed output schema
- input payload

The existing output validation remains unchanged.

## Failure Behavior

If the configured policy file cannot be read, reconciliation should fail with a clear local error. This is safer than silently ignoring a user-provided policy that they expected to be active.

If the file is missing at the default path, fallback to the built-in Chinese policy.
