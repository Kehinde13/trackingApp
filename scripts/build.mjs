import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const KNOWN_VERCEL_ENVIRONMENTS = new Set(["production", "preview", "development"]);

export function getBuildScripts(environment) {
  if (environment.VERCEL !== "1") return ["build:next"];
  const vercelEnvironment = environment.VERCEL_ENV;
  if (!KNOWN_VERCEL_ENVIRONMENTS.has(vercelEnvironment)) throw new Error("UNKNOWN_VERCEL_ENVIRONMENT");
  return vercelEnvironment === "production" ? ["db:deploy", "build:next"] : ["build:next"];
}

export function runBuild({ environment = process.env, execute = spawnSync, platform = process.platform } = {}) {
  let scripts;
  try { scripts = getBuildScripts(environment); }
  catch { console.error("Build stopped: unrecognized Vercel environment."); return 1; }

  void platform;
  const npmCliPath = environment.npm_execpath;
  if (!npmCliPath) {
    console.error("Build stopped: npm execution path is unavailable.");
    return 1;
  }
  for (const script of scripts) {
    const result = execute(process.execPath, [npmCliPath, "run", script], {
      env: environment,
      stdio: "inherit",
      shell: false,
    });
    if (result.error || result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

const isDirectInvocation = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectInvocation) process.exitCode = runBuild();
