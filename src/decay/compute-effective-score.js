function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }

  return Math.max(0, (to - from) / (24 * 60 * 60 * 1000));
}

export function computeEffectiveScore({
  confidence,
  lastSeenAt,
  now,
  halfLifeDays = 30,
}) {
  const staleDays = daysBetween(lastSeenAt, now);
  const lambda = Math.log(2) / halfLifeDays;
  return confidence * Math.exp(-lambda * staleDays);
}

export function deriveExperienceStatus(effectiveScore) {
  if (effectiveScore >= 0.6) {
    return 'active';
  }

  if (effectiveScore >= 0.3) {
    return 'decaying';
  }

  return 'archived';
}
