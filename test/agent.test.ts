import assert from "node:assert/strict";
import childProcess from "node:child_process";
import type { ExecFileSyncOptions } from "node:child_process";
import { jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import React from "react";
import { render, cleanup } from "ink-testing-library";

const write =
  jest.fn<
    (file: string, args: string[], options: ExecFileSyncOptions) => void
  >();
jest.unstable_mockModule("node:child_process", () => ({
  ...childProcess,
  execFileSync: write,
}));
const { Panel } = await import("../src/panel.js");
const { copySetupGuide, setupGuide } = await import("../src/agent.js");

test("clipboard action sends only the bundled guide to pbcopy and reports delivery failures", () => {
  write.mockReset();
  copySetupGuide();
  const [file, args, options] = write.mock.calls[0];
  assert.equal(file, "/usr/bin/pbcopy");
  assert.deepEqual(args, []);
  assert.equal(options.input, setupGuide());
  write.mockImplementation(() => {
    throw new Error("clipboard unavailable");
  });
  assert.throws(copySetupGuide, /agent --stdout/);
});

test("guide windows show and copy the original document, scroll, and capture input", async () => {
  write.mockReset();
  try {
    const app = render(
      React.createElement(Panel, { profiles: [], demo: false }),
    );
    await delay(50);
    assert.match(app.lastFrame() ?? "", /\[g\] EVA instructions/);
    app.stdin.write("g");
    await delay(50);
    const [binary, args, { input }] = write.mock.calls[0];
    assert.equal(binary, "/usr/bin/pbcopy");
    assert.deepEqual(args, []);
    assert.equal(
      input,
      readFileSync(
        new URL("../docs/eva-instructions.md", import.meta.url),
        "utf8",
      ),
    );
    assert.match(String(input), /ssh nerv 'ls ~\/projects'/);
    assert.match(app.lastFrame() ?? "", /AGENTS\.md or CLAUDE\.md/);
    assert.match(app.lastFrame() ?? "", /ssh nerv 'ls ~\/projects'/);
    app.stdin.write("i");
    app.stdin.write("r");
    await delay(50);
    assert.equal(write.mock.calls.length, 1);
    app.stdin.write("c");
    await delay(50);
    assert.equal(write.mock.calls[1][2].input, input);
    app.stdin.write("\u001b");
    await delay(50);
    assert.match(app.lastFrame() ?? "", /LINK MONITOR/);
    write.mockImplementation(() => {
      throw new Error("pbcopy failed");
    });
    app.stdin.write("i");
    await delay(50);
    assert.equal(write.mock.calls[2][2].input, setupGuide());
    const first = app.lastFrame() ?? "";
    assert.match(first, /Clipboard unavailable/);
    assert.match(first, /Set up an EVA for NERV/);
    Object.defineProperties(app.stdout, {
      columns: { value: 46 },
      rows: { value: 14 },
    });
    app.stdout.emit("resize");
    await delay(50);
    const narrow = app.lastFrame() ?? "";
    assert.ok(narrow.split("\n").length <= 14, narrow);
    assert.equal(write.mock.calls.length, 3);
    app.stdin.write("\u001b[6~");
    await delay(50);
    assert.doesNotMatch(app.lastFrame() ?? "", /Set up an EVA for NERV/);
    app.stdin.write("\u001b[5~");
    await delay(50);
    assert.equal(app.lastFrame(), narrow);
  } finally {
    cleanup();
  }
});
