function readStringField(payload, candidates) {
  for (const candidate of candidates) {
    const value = payload[candidate];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readIsoTimestamp(payload) {
  const rawValue = readStringField(payload, ['timestamp', 'created_at', 'createdAt']);
  if (!rawValue) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
}

function buildMetadata(payload) {
  return {
    hook_event_name: readStringField(payload, ['hook_event_name', 'hookEventName']) ?? 'UserPromptSubmit',
    session_id: readStringField(payload, ['session_id', 'sessionId']),
    thread_id: readStringField(payload, ['thread_id', 'threadId']),
    turn_id: readStringField(payload, ['turn_id', 'turnId']),
    agent_id: readStringField(payload, ['agent_id', 'agentId']),
    agent_type: readStringField(payload, ['agent_type', 'agentType']),
    cwd: readStringField(payload, ['cwd']),
  };
}

export function normalizeUserPromptSubmitPayload({ payload, fallbackCwd }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('hook payload must be a JSON object');
  }

  const hookEventName = readStringField(payload, ['hook_event_name', 'hookEventName']) ?? 'UserPromptSubmit';
  if (hookEventName !== 'UserPromptSubmit') {
    throw new Error(`unexpected hook event: ${hookEventName}`);
  }

  const promptText = readStringField(payload, ['prompt', 'prompt_text', 'promptText', 'user_prompt']);
  if (!promptText) {
    throw new Error('hook payload is missing prompt text');
  }

  const cwd = readStringField(payload, ['cwd']) ?? fallbackCwd;
  const sessionId = readStringField(payload, ['session_id', 'sessionId']);
  const threadId =
    readStringField(payload, ['thread_id', 'threadId', 'turn_id', 'turnId']) ?? null;

  return {
    promptText,
    cwd,
    createdAt: readIsoTimestamp(payload),
    sessionId,
    threadId,
    metadataJson: JSON.stringify(buildMetadata(payload)),
  };
}
