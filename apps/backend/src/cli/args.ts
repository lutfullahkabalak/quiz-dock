/** Parsed command line: positional arguments and `--flag[=value]` options. */
export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const option = arg.slice(2);
      const separator = option.indexOf('=');
      const key = separator === -1 ? option : option.slice(0, separator);
      flags[key] = separator === -1 ? true : option.slice(separator + 1);
    } else {
      positional.push(arg);
    }
  }
  const [command = null, ...rest] = positional;
  return { command, positional: rest, flags };
}
