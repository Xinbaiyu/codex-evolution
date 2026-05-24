import path from 'node:path';

import { resolveProjectKey } from '../project/resolve-project-key.js';

export async function runProjectKeyCommand({ appContext, targetPath }) {
  const result = await resolveProjectKey({
    cwd: targetPath ? path.resolve(targetPath) : process.cwd(),
  });

  console.log(JSON.stringify(result, null, 2));
}
