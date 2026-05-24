function readStringField(payload, candidates) {
  for (const candidate of candidates) {
    const value = payload[candidate];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function normalizeSessionStartPayload({ payload, fallbackCwd }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('hook payload must be a JSON object');
  }

  const hookEventName = readStringField(payload, ['hook_event_name', 'hookEventName']) ?? 'SessionStart';
  if (hookEventName !== 'SessionStart') {
    throw new Error(`unexpected hook event: ${hookEventName}`);
  }

  return {
    cwd: readStringField(payload, ['cwd']) ?? fallbackCwd,
    sessionId: readStringField(payload, ['session_id', 'sessionId']),
    transcriptPath: readStringField(payload, ['transcript_path', 'transcriptPath']),
  };
}
