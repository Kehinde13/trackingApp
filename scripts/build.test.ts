import { describe, expect, it, vi } from "vitest";

import { getBuildScripts, runBuild } from "./build.mjs";

const success = () => ({ status: 0, signal: null, output: [], pid: 1, stdout: null, stderr: null });

describe("build orchestration", () => {
  it("runs only the application build locally", () => {
    expect(getBuildScripts({})).toEqual(["build:next"]);
  });

  it("runs only the application build for Vercel Preview", () => {
    expect(getBuildScripts({ VERCEL: "1", VERCEL_ENV: "preview" })).toEqual(["build:next"]);
  });

  it("runs migration before the application build for Vercel Production", () => {
    expect(getBuildScripts({ VERCEL: "1", VERCEL_ENV: "production" })).toEqual(["db:deploy", "build:next"]);
    const execute = vi.fn().mockReturnValue(success());
    expect(runBuild({ environment: { VERCEL: "1", VERCEL_ENV: "production", npm_execpath: "/tools/npm-cli.js" }, execute })).toBe(0);
    expect(execute.mock.calls.map((call) => call[1].slice(1))).toEqual([["run", "db:deploy"], ["run", "build:next"]]);
  });

  it("does not build when migration deployment fails", () => {
    const execute = vi.fn().mockReturnValueOnce({ ...success(), status: 1 }).mockReturnValue(success());
    expect(runBuild({ environment: { VERCEL: "1", VERCEL_ENV: "production", npm_execpath: "/tools/npm-cli.js" }, execute, platform: "linux" })).toBe(1);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(process.execPath, ["/tools/npm-cli.js", "run", "db:deploy"], expect.objectContaining({ shell: false, stdio: "inherit" }));
  });

  it("fails closed for an unknown Vercel environment", () => {
    const execute = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runBuild({ environment: { VERCEL: "1", VERCEL_ENV: "unexpected" }, execute })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Build stopped: unrecognized Vercel environment.");
    error.mockRestore();
  });
});
