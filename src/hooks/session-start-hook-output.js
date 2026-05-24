export function buildSessionStartHookOutput({ additionalContext = '' } = {}) {
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };
}
