import { test, jest, expect } from "@jest/globals";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import { Panel } from "../src/panel.js";
import interact from "./interact.js";
import {
  updateSession,
  globalPrefix,
  latestUpdate,
  type UpdateSession,
} from "../src/update.js";

test("only a matching global installation can update itself", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "nerv-prefix-"));
  try {
    const root = join(tmp, "lib/node_modules/nerv-tunnel");
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(tmp, "bin"));
    await writeFile(join(root, "dist/cli.js"), "");
    expect(globalPrefix(tmp)).toBeUndefined();
    expect(globalPrefix(root)).toBeUndefined();
    await symlink(join(root, "dist/cli.js"), join(tmp, "bin/nerv"));
    expect(globalPrefix(root)).toBe(tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("reads the official latest tag and compares semantic versions", async () => {
  const request = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ name: "nerv-tunnel", version: "1.10.0" }),
    );
  await expect(latestUpdate("1.9.9", request)).resolves.toBe("1.10.0");
  expect(request).toHaveBeenCalledWith(
    "https://registry.npmjs.org/nerv-tunnel/latest",
    { signal: expect.anything() },
  );
  for (const version of ["1.9.9", "1.9.8", "1.9.9-beta.1", "--version"]) {
    request.mockResolvedValueOnce(
      Response.json({ name: "nerv-tunnel", version }),
    );
    // Consume each queued registry response before setting up the next one.
    // eslint-disable-next-line no-await-in-loop
    await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
  }
  request.mockResolvedValueOnce(
    Response.json({ name: "other", version: "8.0.0" }),
  );
  await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
  request.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
  request.mockRejectedValueOnce(new Error("offline"));
  await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
});

test("disabled checks skip the registry", () => {
  const original = process.env.NERV_NO_UPDATE_CHECK;
  const lookup = jest.spyOn(globalThis, "fetch");
  try {
    process.env.NERV_NO_UPDATE_CHECK = "1";
    expect(updateSession("/fixture")).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  } finally {
    lookup.mockRestore();
    if (original === undefined) delete process.env.NERV_NO_UPDATE_CHECK;
    else process.env.NERV_NO_UPDATE_CHECK = original;
  }
});

test("the dashboard opens before lookup, keeps its selection and owns input again after Later", async () => {
  let available!: (tag: string) => void;
  const session = {
    latest: new Promise<string>((resolve) => {
      available = resolve;
    }),
    dismiss: jest.fn(),
    install: jest.fn<UpdateSession["install"]>(),
    reopen: jest.fn(),
  };
  try {
    const app = await interact(() =>
      render(
        React.createElement(Panel, {
          profiles: [],
          demo: true,
          updates: session,
        }),
      ),
    );
    expect(app.lastFrame()).toContain("SIMULATION");
    expect(app.lastFrame()).not.toContain("NERV update");
    await interact(() => app.stdin.write("\u001b[B"));
    await interact(() => available("1.2.0"));
    expect(app.lastFrame()).toContain("NERV update");
    expect(app.lastFrame()).toContain("SIMULATION");
    await interact(() => app.stdin.write("\u001b[A"));
    await interact(() => app.stdin.write("\u001b"));
    expect(app.lastFrame()).not.toContain("NERV update");
    expect(app.lastFrame()).toContain("▸ EVA-B");
    expect(session.dismiss).toHaveBeenCalledTimes(1);
    expect(session.install).not.toHaveBeenCalled();
  } finally {
    cleanup();
  }
});

test("Update shows progress, ignores repeated keys and keeps npm errors visible for retry", async () => {
  let fail!: (e: Error) => void;
  const install = jest
    .fn<UpdateSession["install"]>()
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValue(undefined);
  const session = {
    latest: Promise.resolve("1.2.0"),
    dismiss: jest.fn(),
    install,
    reopen: jest.fn(),
  };
  try {
    const app = await interact(() =>
      render(
        React.createElement(Panel, {
          profiles: [],
          demo: true,
          updates: session,
        }),
      ),
    );
    const press = (key: string) => interact(() => app.stdin.write(key));
    await press("\u001b[A");
    await press("\r");
    expect(app.lastFrame()).toContain("Installing 1.2.0");
    await press("u");
    await press("\u001b");
    expect(install).toHaveBeenCalledTimes(1);
    await interact(() => fail(new Error("npm ETARGET: retry shortly.")));
    expect(app.lastFrame()).toContain("npm ETARGET");
    expect(app.lastFrame()).toContain("Retry update");
    await press("\r");
    expect(install).toHaveBeenCalledTimes(2);
    expect(app.stdin.listenerCount("readable")).toBe(0);
  } finally {
    cleanup();
  }
});

test("npm revalidates the selected release in its own prefix and verifies the installed version", async () => {
  const prefix = await mkdtemp(join(tmpdir(), "nerv-upgrade-"));
  const bin = join(prefix, "bin");
  const root = join(prefix, "lib/node_modules/nerv-tunnel");
  try {
    await mkdir(bin);
    await mkdir(root, { recursive: true });
    const args = [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--registry",
      "https://registry.npmjs.org",
      "--prefer-online",
      "--prefer-offline=false",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "nerv-tunnel@1.2.0",
    ];
    const stub = `#!${process.execPath}
const assert = require("node:assert/strict");
assert.deepEqual(process.argv.slice(2), ${JSON.stringify(args)});
if (process.env.FAIL_NPM) {console.error("npm error code ETARGET"); process.exit(1);}
`;
    await writeFile(join(bin, "npm"), stub, { mode: 0o755 });
    const invoke = (failure = "") =>
      promisify(execFile)(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "import {install} from './dist/update.js'; await install(process.argv[1], '1.2.0', new AbortController().signal);",
          prefix,
        ],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            FAIL_NPM: failure,
          },
        },
      );
    await expect(invoke("1")).rejects.toThrow(/npm ETARGET/);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ version: "1.1.0" }),
    );
    await expect(invoke()).rejects.toThrow(/installed version/);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ version: "1.2.0" }),
    );
    await expect(invoke()).resolves.toMatchObject({ stdout: "" });
  } finally {
    await rm(prefix, { recursive: true, force: true });
  }
});
