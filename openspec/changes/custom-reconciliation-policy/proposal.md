# Proposal: Custom Reconciliation Policy

## Summary

Allow users to customize the semantic policy used when extracting long-term project experiences from prompt history.

## Motivation

The current reconciliation prompt is fully embedded in source code. This keeps the output protocol stable, but advanced users cannot tune what should or should not be learned for their project or team.

We want to expose only the editable policy layer while keeping the JSON protocol, kind enum, matched prompt validation, candidate/active promotion, confidence rules, and decay behavior controlled by the application.

## Scope

- Add a default Chinese reconciliation policy Markdown template.
- Add an English template for non-Chinese users.
- Add CLI commands to initialize and view the effective policy.
- Support a configurable policy path with a safe default under `~/.codex-evolution`.
- Include the policy text in the reconciliation prompt while preserving fixed output protocol constraints.
- Update help, README, CSDN article, and tests.

## Non-Goals

- Do not let users customize the JSON schema.
- Do not let users add arbitrary experience kinds in this change.
- Do not let users customize candidate/active/decaying/archived state transitions.
- Do not customize SessionStart rendering in this change.
