import { runSchedulerTickOnce } from './run-scheduler-tick-once.js';

export async function runSchedulerTickCommand({ appContext, targetPath }) {
  const { result } = await runSchedulerTickOnce({
    appContext,
    targetPath,
  });

  console.log(JSON.stringify(result, null, 2));
}
