import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
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
