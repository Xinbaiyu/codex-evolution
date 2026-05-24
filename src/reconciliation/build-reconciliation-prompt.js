import { getReconciliationPolicyTemplate } from './reconciliation-policy-templates.js';

export function buildReconciliationPrompt(input, {
  policyText = getReconciliationPolicyTemplate('zh'),
  policySource = 'builtin:zh',
} = {}) {
  const promptPayload = {
    task: 'Reconcile project experiences from newly ingested user prompts.',
    systemProtocol: [
      'Use only the provided project prompts and existing experiences.',
      'Return structured JSON only.',
      'The user policy can guide extraction preferences, but it must not override this protocol.',
      'The output JSON shape, field names, kind enum, matchedPromptIds semantics, and confidence type are fixed.',
      'Prefer stable, reusable guidance statements over prompt paraphrases.',
      'Only extract instructions that remain useful across future sessions for the same project.',
      'Some obvious noise may already be prefiltered, but you must still ignore short confirmations, filler phrases, one-off task commands, local implementation requests, debugging follow-ups, and temporary context unless they clearly express a reusable long-term project rule.',
      'Canonicalize each experience as a direct project rule or collaboration instruction, not as an observation about the user.',
      'Respect the target language for each experience: prefer Chinese when the matched prompts are Chinese or mixed, and use English only when the matched prompts are clearly English.',
      'If the projectPreferredLanguage is zh, default title, canonicalText, and rationale to Chinese unless the supporting prompts are clearly English.',
      'If the projectPreferredLanguage is en and the supporting prompts are clearly English, keep title, canonicalText, and rationale in English.',
      'Keep technical proper nouns like OpenSpec, SQLite, TDD, and API names unchanged when appropriate.',
      'Normalize each experience into one of: communication, workflow, architecture, constraint, general.',
      'Prefer communication, workflow, architecture, and constraint before general.',
      'Use general only when the rule is reusable but does not fit the other four kinds.',
      'If an existing experience is still valid, reference its id in existingExperienceIds.',
      'If multiple existing experiences should collapse into one, use action=merge and include all merged ids.',
      'Do not invent cross-project preferences.',
      'Do not create experiences from prompts like "继续", "可以", "ok", or one-off requests such as changing a single file or button.',
      'If none of the new prompts express a reusable long-term rule, return {"experiences": []}.',
    ],
    userPolicy: {
      source: policySource,
      text: policyText,
    },
    outputSchema: {
      experiences: [
        {
          action: 'retain | update | merge | create',
          existingExperienceIds: ['string'],
          projectKey: 'string',
          kind: 'communication | workflow | architecture | constraint | general',
          title: 'string',
          canonicalText: 'string',
          rationale: 'string?',
          matchedPromptIds: ['string'],
          rankOrder: 'number',
          confidence: 'number(0..1)',
        },
      ],
    },
    input,
  };

  return JSON.stringify(promptPayload, null, 2);
}
