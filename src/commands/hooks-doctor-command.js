import { doctorCodexEvolutionHooks } from '../hooks/doctor-user-prompt-submit-hook.js';

export async function runHooksDoctorCommand({ appContext }) {
  const result = await doctorCodexEvolutionHooks({
    sourceCodexHome: appContext.sourceCodexHome,
  });

  console.log(
    JSON.stringify(
      {
        hooksPath: result.hooksPath,
        codexConfigPath: result.codexConfigPath,
        hooksFeatureEnabled: result.hooksFeatureEnabled,
        installed: Object.values(result.events).every((event) => event.inspection.installed),
        trusted: Object.values(result.events).every((event) =>
          event.inspection.matchingHooks.some((hook) => hook.trusted),
        ),
        events: Object.fromEntries(
          Object.entries(result.events).map(([eventName, event]) => [
            eventName,
            {
              expectedCommand: event.expectedCommand,
              installed: event.inspection.installed,
              trusted: event.inspection.matchingHooks.some((hook) => hook.trusted),
              matchingHooks: event.inspection.matchingHooks,
              diagnosis: event.diagnosis,
            },
          ]),
        ),
        diagnosis: result.diagnosis,
      },
      null,
      2,
    ),
  );
}
