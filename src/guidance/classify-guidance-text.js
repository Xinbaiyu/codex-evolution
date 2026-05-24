const EXACT_NON_GUIDANCE_TEXTS = new Set([
  '继续',
  '继续吧',
  '可以',
  '可以的',
  'ok',
  'okay',
  '好的',
  '好',
  '对',
  '对的',
  '收到',
  '行',
  '嗯',
  '恩',
  '明白',
  '了解',
  '没问题',
  '先这样',
  '就这样',
  '谢谢',
  '感谢',
]);

const SHORT_CONFIRMATION_PATTERN =
  /^(继续|继续吧|可以|可以的|ok|okay|好的|好|对|对的|收到|行|嗯|恩|明白|了解|没问题|先这样|就这样|谢谢|感谢)([!！。,.，\s]*)$/i;

const DESCRIPTIVE_PREFIX_PATTERN =
  /^(习惯|倾向于|采用|通过|频繁|明确要求|强烈要求|主动|重视|在描述|开发涉及|使用Swiper库实现|提出|通过提供|the user|user prefers|user tends to|the project often|frequently uses)/i;

const FILLER_HABIT_DESCRIPTOR_PATTERN =
  /(单字|短语|口头禅|推进词|确认词|确认语|快速推进|增量式交互|这类表达|类似表达)/i;

const FILLER_HABIT_EXAMPLE_PATTERN =
  /(^|[\s,，、:：;；"'“”‘’()（）【】[\]{}])(?:继续|可以|ok|okay|好的|收到)(?=$|[\s,，、:：;；"'“”‘’()（）【】[\]{}])/i;

const GUIDANCE_SIGNAL_PATTERNS = [
  /(使用|优先|不要|必须|默认|始终|统一|保持|use|prefer|must|should|always|never|default|avoid|keep)/i,
  /(以后|遇到|如果|当|不理解|不懂|复杂需求|复杂功能|边界情况|when|if|whenever|before|after|during|complex requirements|complex features)/i,
  /(先(?!这样|看下|看看|处理下|处理一下|分析下|分析一下|总结下|总结一下|解释下|解释一下))/,
  /\bfirst\b/i,
];

const GUIDANCE_DOMAIN_PATTERN =
  /(中文|沟通|交流|提问|ask|OpenSpec|openspec|系分|方案|设计|边界|架构|测试|TDD|安全|SQLite|sqlite|agent|skill|hook|prompt|代码审查|流程|实现|communication|workflow|architecture|constraint|system analysis|specification|implementation|clarify|discussion|design direction)/i;

function normalizeText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasGuidanceSignals(text) {
  return GUIDANCE_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function hasGuidanceDomain(text) {
  return GUIDANCE_DOMAIN_PATTERN.test(text);
}

function isMetaFillerHabitSummary(text) {
  return (
    FILLER_HABIT_DESCRIPTOR_PATTERN.test(text)
    && FILLER_HABIT_EXAMPLE_PATTERN.test(text)
  );
}

function isObviousSystemNoise(text) {
  return (
    text.includes('ExperimentalWarning: SQLite is an experimental feature')
    || text.includes('scheduler:watch started interval_seconds=')
    || (
      text.includes('"logPath"')
      && text.includes('scheduler-watch.log')
    )
  );
}

export function classifyGuidanceText({ text, mode = 'prompt' }) {
  const normalizedText = normalizeText(text);
  const compactLowerText = normalizedText.toLowerCase();

  if (normalizedText === '') {
    return {
      isGuidanceCandidate: false,
      reason: 'empty',
      normalizedText,
    };
  }

  if (
    EXACT_NON_GUIDANCE_TEXTS.has(compactLowerText)
    || SHORT_CONFIRMATION_PATTERN.test(normalizedText)
  ) {
    return {
      isGuidanceCandidate: false,
      reason: 'short_confirmation',
      normalizedText,
    };
  }

  if (mode === 'prompt' && isObviousSystemNoise(normalizedText)) {
    return {
      isGuidanceCandidate: false,
      reason: 'system_noise',
      normalizedText,
    };
  }

  const hasSignals = hasGuidanceSignals(normalizedText);
  const hasDomain = hasGuidanceDomain(normalizedText);

  if (mode === 'experience') {
    if (DESCRIPTIVE_PREFIX_PATTERN.test(normalizedText)) {
      return {
        isGuidanceCandidate: false,
        reason: 'descriptive_summary',
        normalizedText,
      };
    }

    if (hasSignals && hasDomain) {
      return {
        isGuidanceCandidate: true,
        reason: 'guidance_rule',
        normalizedText,
      };
    }

    if (isMetaFillerHabitSummary(normalizedText)) {
      return {
        isGuidanceCandidate: false,
        reason: 'filler_habit',
        normalizedText,
      };
    }
  }

  if (mode === 'prompt') {
    if (hasSignals && hasDomain) {
      return {
        isGuidanceCandidate: true,
        reason: 'guidance_rule',
        normalizedText,
      };
    }

    return {
      isGuidanceCandidate: true,
      reason: 'llm_review',
      normalizedText,
    };
  }

  if (hasSignals && (hasDomain || normalizedText.length >= 8)) {
    return {
      isGuidanceCandidate: true,
      reason: hasDomain ? 'guidance_rule' : 'guidance_pattern',
      normalizedText,
    };
  }

  return {
    isGuidanceCandidate: false,
    reason: 'non_guidance',
    normalizedText,
  };
}
