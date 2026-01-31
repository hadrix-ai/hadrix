import readline from "node:readline";
import pc from "picocolors";

type PromptSelectOptions = {
  defaultIndex?: number;
  allowCancel?: boolean;
};

function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  if (length <= 0) return 0;
  const next = Math.trunc(value);
  if (next < 0) return 0;
  if (next >= length) return length - 1;
  return next;
}

function isTerminalInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function displayLineCount(value: string, columns: number): number {
  const plain = stripAnsi(value);
  if (!plain) return 1;
  const width = Math.max(1, columns);
  return Math.max(1, Math.ceil(plain.length / width));
}

function fitToWidth(value: string, columns: number): string {
  const width = Math.max(4, columns);
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  const trimmed = plain.slice(0, Math.max(1, width - 3));
  return `${trimmed}...`;
}

export async function promptSelect(
  question: string,
  choices: string[],
  options: PromptSelectOptions = {}
): Promise<number | null> {
  if (!isTerminalInteractive()) return null;
  if (choices.length === 0) return null;

  const defaultIndex = clampIndex(options.defaultIndex ?? 0, choices.length);
  let selected = defaultIndex;
  let rendered = false;
  let renderedLines = 0;
  const questionLines = question.split("\n");

  const render = () => {
    if (rendered && renderedLines > 0) {
      process.stdout.write(`\x1b[${renderedLines}A`);
    }
    const columns = Math.max(process.stdout.columns ?? 80, 20);
    const lines = [
      ...questionLines,
      ...choices.map((choice, index) => {
        const active = index === selected;
        const marker = active ? "[x]" : "[ ]";
        const line = fitToWidth(`${marker} ${choice}`, columns);
        return active ? pc.green(line) : line;
      })
    ];
    renderedLines = 0;
    for (const line of lines) {
      process.stdout.write("\x1b[2K\r");
      process.stdout.write(line);
      process.stdout.write("\n");
      renderedLines += displayLineCount(line, columns);
    }
    rendered = true;
  };

  return await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    readline.emitKeypressEvents(process.stdin, rl);

    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdout.write("\x1b[?25l");

    const cleanup = (result: number | null) => {
      process.stdout.write("\x1b[?25h");
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(Boolean(wasRaw));
      }
      process.stdin.off("keypress", onKeypress);
      rl.close();
      resolve(result);
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if (key?.ctrl && key.name === "c") {
        cleanup(null);
        process.exit(130);
        return;
      }
      if (key?.name === "up" || str === "k") {
        selected = (selected - 1 + choices.length) % choices.length;
        render();
        return;
      }
      if (key?.name === "down" || str === "j") {
        selected = (selected + 1) % choices.length;
        render();
        return;
      }
      if (key?.name === "return" || key?.name === "enter") {
        cleanup(selected);
        return;
      }
      if (key?.name === "escape" && options.allowCancel) {
        cleanup(null);
        return;
      }
      if (/^[1-9]$/.test(str)) {
        const idx = Number(str) - 1;
        if (idx >= 0 && idx < choices.length) {
          selected = idx;
          render();
        }
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

export async function promptYesNo(
  question: string,
  options: { defaultYes?: boolean } = {}
): Promise<boolean> {
  const defaultIndex = options.defaultYes ? 0 : 1;
  const selection = await promptSelect(question, ["Yes", "No"], {
    defaultIndex,
    allowCancel: true
  });
  return selection === 0;
}

export async function promptHidden(question: string): Promise<string> {
  if (!isTerminalInteractive()) return "";
  return await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput?: (chunk: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput?: (chunk: string) => void })._writeToOutput = (chunk: string) => {
      if (chunk.startsWith(question)) {
        process.stdout.write(chunk);
        return;
      }
      if (chunk === "\n" || chunk === "\r\n") {
        process.stdout.write(chunk);
        return;
      }
      process.stdout.write("*");
    };
    rl.question(question, (answer) => {
      if (write) {
        (rl as unknown as { _writeToOutput?: (chunk: string) => void })._writeToOutput = write;
      }
      rl.close();
      resolve(answer);
    });
  });
}
