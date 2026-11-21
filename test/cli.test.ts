import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, test } from "@jest/globals";

let configHome: string;
beforeAll(async () => {
  configHome = await mkdtemp(join(tmpdir(), "nerv-cli-"));
  const configDir = join(configHome, "nerv");
  await mkdir(configDir);
  const profiles = ["alpha", "beta"].map((name) => ({
    name,
    host: name,
    reverse: "return-host",
    tunnel: `org.example.nerv-test.${process.pid}.${name}`,
  }));
  await writeFile(
    join(configDir, "config.json"),
    JSON.stringify({ version: 1, profiles }),
  );
});
afterAll(async () => {
  await rm(configHome, { recursive: true, force: true });
});

function run(...args: string[]) {
  const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
    env: { ...process.env, XDG_CONFIG_HOME: configHome, NO_COLOR: "1" },
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.error) throw result.error;
  return result;
}

test("help lists all commands and describes the required profile", () => {
  const root = run("--help");
  assert.equal(root.status, 0, root.stderr);
  for (const command of [
    "monitor",
    "demo",
    "agent",
    "add",
    "edit",
    "status",
    "start",
    "stop",
    "restart",
  ])
    assert.match(root.stdout, new RegExp(`^\\s+${command}\\b`, "m"));
  const help = run("stop", "-h");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: nerv stop .*<PROFILE>/);
});

test("bare nerv opens monitor and interactive commands require a terminal", () => {
  for (const args of [[], ["monitor"], ["demo"], ["add"]]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      args[0] === "add" ? /interactive terminal/ : /Dashboard requires a TTY/,
    );
  }
});

test("status reports all offline routes or just the requested profile", () => {
  const all = run("status");
  assert.equal(all.status, 1, all.stderr);
  assert.equal(
    all.stdout.trim(),
    "alpha off unavailable\nbeta off unavailable",
    all.stderr,
  );
  const one = run("status", "beta");
  assert.equal(one.status, 1, one.stderr);
  assert.equal(one.stdout.trim(), "beta off unavailable", one.stderr);
});

test("profile commands require a profile and reject unknown names", () => {
  for (const action of ["edit", "start", "stop", "restart"]) {
    const missing = run(action);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /missing required argument 'PROFILE'/);
    const unknown = run(action, "unknown");
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Profile not found/);
  }
});

test("Commander rejects unknown commands, unknown options and extra arguments", () => {
  for (const [args, error] of [
    [["typo"], /unknown command/],
    [["status", "--typo"], /unknown option/],
    [["monitor", "alpha"], /too many arguments/],
    [["stop", "alpha", "beta"], /too many arguments/],
  ] as const) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
  }
});

test("agent can print the bundled guide without reading configured profiles", async () => {
  const expected = await readFile(
    new URL("../docs/agent-setup.md", import.meta.url),
    "utf8",
  );
  const result = run("agent", "--stdout");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, expected);
});
