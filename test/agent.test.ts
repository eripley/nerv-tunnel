import assert from "node:assert/strict";
import childProcess from "node:child_process";
import type { ExecFileSyncOptions } from "node:child_process";
import { jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import React from "react";
import { stripVTControlCharacters } from "node:util";
import { render, cleanup } from "ink-testing-library";
import interact from "./interact.js";

const write =
  jest.fn<
    (file: string, args: string[], options: ExecFileSyncOptions) => void
  >();
jest.unstable_mockModule("node:child_process", () => ({
  ...childProcess,
  execFileSync: write,
}));
const { default: GuideViewer } = await import("../src/guide.js");
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
    const app = await interact(() =>
      render(React.createElement(Panel, { profiles: [], demo: false })),
    );
    const press = (key: string) => interact(() => app.stdin.write(key));
    const frame = () => stripVTControlCharacters(app.lastFrame() ?? "");
    assert.match(frame(), /\[g\] EVA instructions/);
    await press("g");
    assert.match(frame(), /Copied\. Paste into/);
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
    await press("i");
    await press("r");
    assert.equal(write.mock.calls.length, 1);
    await press("c");
    assert.equal(write.mock.calls.length, 2);
    assert.equal(write.mock.calls[1][2].input, input);
    await press("\u001b");
    assert.match(frame(), /LINK MONITOR/);
    write.mockImplementation(() => {
      throw new Error("pbcopy failed");
    });
    await press("i");
    assert.match(frame(), /Clipboard unavailable/);
    assert.equal(write.mock.calls[2][2].input, setupGuide());
    const first = app.lastFrame() ?? "";
    assert.match(first, /Set up an EVA for NERV/);
    Object.defineProperties(app.stdout, {
      columns: { value: 46 },
      rows: { value: 14 },
    });
    await interact(() => {
      app.stdout.emit("resize");
    });
    assert.equal(frame().split("\n")[0].length, 46);
    const narrow = app.lastFrame() ?? "";
    assert.ok(narrow.split("\n").length <= 14, narrow);
    assert.equal(write.mock.calls.length, 3);
    await press("\u001b[6~");
    assert.doesNotMatch(frame(), /Set up an EVA for NERV/);
    await press("\u001b[5~");
    assert.equal(app.lastFrame(), narrow);
  } finally {
    cleanup();
  }
});

test("Escape closes the standalone setup guide", async () => {
  write.mockReset();
  try {
    const app = await interact(() =>
      render(React.createElement(GuideViewer, { kind: "setup" })),
    );
    assert.match(app.lastFrame() ?? "", /Tunnel setup guide/);
    await interact(() => app.stdin.write("\u001b"));
    assert.equal(app.stdin.listenerCount("readable"), 0);
    assert.equal(write.mock.calls.length, 1);
  } finally {
    cleanup();
  }
});
