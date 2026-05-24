const VALID_ACTIONS = new Set(['retain', 'update', 'merge', 'create']);
const VALID_KINDS = new Set([
  'communication',
  'workflow',
  'architecture',
  'constraint',
  'general',
]);

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
}

function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function assertNumber(value, fieldName) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
}

export function validateReconciliationOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('reconciliation output must be an object');
  }

  assertArray(output.experiences, 'experiences');

  return {
    experiences: output.experiences.map((experience, index) => {
      if (!experience || typeof experience !== 'object' || Array.isArray(experience)) {
        throw new Error(`experiences[${index}] must be an object`);
      }

      assertString(experience.action, `experiences[${index}].action`);
      if (!VALID_ACTIONS.has(experience.action)) {
        throw new Error(`experiences[${index}].action is invalid`);
      }

      assertArray(experience.existingExperienceIds, `experiences[${index}].existingExperienceIds`);
      assertString(experience.projectKey, `experiences[${index}].projectKey`);
      assertString(experience.kind, `experiences[${index}].kind`);
      if (!VALID_KINDS.has(experience.kind)) {
        throw new Error(`experiences[${index}].kind is invalid`);
      }

      assertString(experience.title, `experiences[${index}].title`);
      assertString(experience.canonicalText, `experiences[${index}].canonicalText`);
      assertArray(experience.matchedPromptIds, `experiences[${index}].matchedPromptIds`);
      assertNumber(experience.rankOrder, `experiences[${index}].rankOrder`);
      assertNumber(experience.confidence, `experiences[${index}].confidence`);

      return {
        action: experience.action,
        existingExperienceIds: experience.existingExperienceIds,
        projectKey: experience.projectKey,
        kind: experience.kind,
        title: experience.title,
        canonicalText: experience.canonicalText,
        rationale: typeof experience.rationale === 'string' ? experience.rationale : undefined,
        matchedPromptIds: experience.matchedPromptIds,
        rankOrder: experience.rankOrder,
        confidence: experience.confidence,
      };
    }),
  };
}
