import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import { Panel } from "../dist/panel.js";
import { copySetupGuide, setupGuide } from "../dist/agent.js";

test("clipboard action sends only the bundled guide to pbcopy and reports delivery failures", (t) => {
  const write = t.mock.method(childProcess, "execFileSync", () => {});
  syncBuiltinESMExports();
  try {
    copySetupGuide();
    const [file, args, options] = write.mock.calls[0].arguments;
    assert.equal(file, "/usr/bin/pbcopy");
    assert.deepEqual(args, []);
    assert.equal(options.input, setupGuide());
    write.mock.mockImplementation(() => {
      throw new Error("clipboard unavailable");
    });
    assert.throws(copySetupGuide, /agent --stdout/);
  } finally {
    write.mock.restore();
    syncBuiltinESMExports();
  }
});

test("g copies the EVA rule and i still copies the setup guide", async (t) => {
  const write = t.mock.method(childProcess, "execFileSync", () => {});
  syncBuiltinESMExports();
  try {
    const app = render(
      React.createElement(Panel, { profiles: [], demo: false }),
    );
    await delay(50);
    assert.match(app.lastFrame(), /g EVA instructions/);
    app.stdin.write("g");
    await delay(50);
    const [binary, args, { input }] = write.mock.calls[0].arguments;
    assert.equal(binary, "/usr/bin/pbcopy");
    assert.deepEqual(args, []);
    assert.equal(
      input,
      readFileSync(
        new URL("../docs/eva-instructions.md", import.meta.url),
        "utf8",
      ),
    );
    assert.match(input, /ssh nerv 'ls ~\/projects'/);
    assert.match(app.lastFrame(), /AGENTS\.md or CLAUDE\.md/);
    app.stdin.write("i");
    await delay(50);
    assert.equal(write.mock.calls[1].arguments[2].input, setupGuide());
    write.mock.mockImplementation(() => {
      throw new Error("pbcopy failed");
    });
    app.stdin.write("g");
    await delay(50);
    assert.match(app.lastFrame(), /Clipboard unavailable/);
  } finally {
    cleanup();
    write.mock.restore();
    syncBuiltinESMExports();
  }
});
