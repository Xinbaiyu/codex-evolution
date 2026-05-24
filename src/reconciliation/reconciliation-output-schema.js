export const RECONCILIATION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['experiences'],
  properties: {
    experiences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'action',
          'existingExperienceIds',
          'projectKey',
          'kind',
          'title',
          'canonicalText',
          'matchedPromptIds',
          'rankOrder',
          'confidence',
        ],
        properties: {
          action: {
            type: 'string',
            enum: ['retain', 'update', 'merge', 'create'],
          },
          existingExperienceIds: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          projectKey: {
            type: 'string',
          },
          kind: {
            type: 'string',
            enum: ['communication', 'workflow', 'architecture', 'constraint', 'general'],
          },
          title: {
            type: 'string',
          },
          canonicalText: {
            type: 'string',
          },
          rationale: {
            type: 'string',
          },
          matchedPromptIds: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          rankOrder: {
            type: 'number',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
          },
        },
      },
    },
  },
};
