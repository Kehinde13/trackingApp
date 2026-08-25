export type BuildEnvironment = Record<string, string | undefined>;

export type BuildExecution = (
  command: string,
  arguments_: string[],
  options: {
    env: BuildEnvironment;
    stdio: "inherit";
    shell: false;
  },
) => { error?: unknown; status: number | null };

export function getBuildScripts(environment: BuildEnvironment): string[];

export function runBuild(options?: {
  environment?: BuildEnvironment;
  execute?: BuildExecution;
  platform?: string;
}): number;
