const SECTION_LIMITS = {
  communication: 3,
  workflow: 3,
  architecture: 3,
  constraint: 3,
  general: 8,
};

const SECTION_ORDER = [
  ['communication', 'Communication'],
  ['workflow', 'Workflow'],
  ['architecture', 'Architecture'],
  ['constraint', 'Constraints'],
  ['general', 'Learned Experiences'],
];

const MAX_TOTAL_ITEMS = 20;

function groupExperiences(experiences) {
  return experiences
    .filter((experience) => experience.status !== 'candidate')
    .reduce(
    (groups, experience) => {
      const kind = experience.kind in SECTION_LIMITS ? experience.kind : 'general';
      groups[kind].push(experience);
      return groups;
    },
    {
      communication: [],
      workflow: [],
      architecture: [],
      constraint: [],
      general: [],
    },
  );
}

function buildSection(title, items) {
  if (items.length === 0) {
    return '';
  }

  return [`# ${title}`, ...items.map((item) => `- ${item.canonical_text}`), ''].join('\n');
}

export function renderRuntimeContext({ projectKey, experiences }) {
  const groups = groupExperiences(experiences);
  let remaining = MAX_TOTAL_ITEMS;

  const sections = SECTION_ORDER.map(([kind, title]) => {
    if (remaining <= 0) {
      return '';
    }

    const sectionItems = groups[kind].slice(0, Math.min(SECTION_LIMITS[kind], remaining));
    remaining -= sectionItems.length;
    return buildSection(title, sectionItems);
  }).filter(Boolean);

  const header = [
    '以下内容是当前项目的动态经验补充，请在本次会话中作为项目级协作参考。',
    '如果与用户当前明确要求冲突，以用户当前要求为准。',
    '',
    '# Project',
    `- project_key: ${projectKey}`,
    '',
  ];

  if (sections.length === 0) {
    return [
      ...header,
      '# Learned Experiences',
      '- 当前项目尚未积累可注入的经验，按用户当前需求正常协作。',
      '',
    ].join('\n');
  }

  return [...header, ...sections].join('\n');
}
