import readline from 'node:readline/promises';
import process from 'node:process';

function normalizeAnswer(answer) {
  return typeof answer === 'string' ? answer.trim() : '';
}

export function createInteractivePromptIO({
  input = process.stdin,
  output = process.stderr,
} = {}) {
  const rl = readline.createInterface({
    input,
    output,
  });

  return {
    isInteractive() {
      return Boolean(input.isTTY && output.isTTY);
    },

    async text({ message, defaultValue = '' }) {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      const answer = normalizeAnswer(await rl.question(`${message}${suffix}: `));
      return answer || defaultValue;
    },

    async confirm({ message, defaultValue = false }) {
      const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
      const answer = normalizeAnswer(await rl.question(`${message}${suffix}: `)).toLowerCase();

      if (!answer) {
        return defaultValue;
      }

      return answer === 'y' || answer === 'yes';
    },

    async select({ message, options, defaultIndex = 0 }) {
      output.write(`${message}\n`);
      options.forEach((option, index) => {
        output.write(`${index + 1}. ${option}\n`);
      });

      const answer = normalizeAnswer(
        await rl.question(`请选择 [${defaultIndex + 1}]: `),
      );

      if (!answer) {
        return defaultIndex;
      }

      const index = Number.parseInt(answer, 10) - 1;

      if (!Number.isInteger(index) || index < 0 || index >= options.length) {
        throw new Error(`invalid selection: ${answer}`);
      }

      return index;
    },

    close() {
      rl.close();
    },
  };
}
