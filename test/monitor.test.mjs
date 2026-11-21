import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToString } from "ink";
import React from "react";
import { control, rates, parseCounters, tunnelHost } from "../dist/service.js";
import { View, demoFrame } from "../dist/panel.js";

const fixture = {
  name: "EVA-A",
  host: "unit-a",
  reverse: "return-host",
  tunnel: "org.example.link",
};
test("restart only interrupts the tunnel and stop works even without the companion definition", async () => {
  const profile = { ...fixture, listener: "org.example.listener" };
  const states = new Map([
    [profile.tunnel, "running"],
    [profile.listener, "running"],
  ]);
  const calls = [];
  const validated = [];
  let listenerExists = true;
  const system = {
    checkJobs: async (candidate) => {
      validated.push(candidate.listener);
      if (candidate.listener && !listenerExists)
        throw new Error("Missing listener definition");
    },
    job: async (label) => ({ state: states.get(label) ?? "off" }),
    launch: async (cmd, target, path) => {
      const label = path
        ? path
            .split("/")
            .at(-1)
            .replace(/\.plist$/, "")
        : target.split("/").at(-1);
      calls.push([cmd, label]);
      if (cmd === "bootout") states.delete(label);
      if (cmd === "bootstrap") states.set(label, "waiting");
      if (cmd === "kickstart") states.set(label, "running");
    },
  };
  await control(profile, "restart", system);
  assert.deepEqual(calls, [
    ["disable", profile.tunnel],
    ["bootout", profile.tunnel],
    ["enable", profile.listener],
    ["enable", profile.tunnel],
    ["bootstrap", profile.tunnel],
    ["kickstart", profile.tunnel],
  ]);
  calls.length = 0;
  listenerExists = false;
  await control(profile, "stop", system);
  assert.deepEqual([...states.keys()], [profile.listener]);
  await control(profile, "stop", system);
  assert.equal(calls.filter(([cmd]) => cmd === "bootout").length, 1);
  assert.deepEqual(validated, [profile.listener, undefined, undefined]);
});
test("start kicks a loaded idle tunnel and preserves a listener that starts on bootstrap", async () => {
  const profile = { ...fixture, listener: "org.example.listener" };
  const calls = [];
  let listenerLoaded = false;
  const system = {
    checkJobs: async () => {},
    job: async (label) => {
      if (label === profile.tunnel) return { state: "waiting" };
      return listenerLoaded ? { state: "running", pid: 23 } : { state: "off" };
    },
    launch: async (cmd, target) => {
      calls.push([cmd, target.split("/").at(-1)]);
      if (cmd === "bootstrap") listenerLoaded = true;
    },
  };
  await control(profile, "start", system);
  assert.deepEqual(
    calls.map(([cmd]) => cmd),
    ["enable", "bootstrap", "enable", "kickstart"],
  );
  assert.deepEqual(calls.at(-1), ["kickstart", profile.tunnel]);
});
test("configuration is local, private and rejects unsafe alias values and duplicate tunnels", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "link-test-"));
  const originalHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmp;
  try {
    const { save, profiles, validate } = await import("../dist/config.js?test");
    assert.deepEqual(await profiles(), []);
    for (const invalid of ["-oProxyCommand=sh", "a;uname", "a\nb", "a/b"])
      assert.throws(() => validate({ ...fixture, reverse: invalid }));
    await save(fixture);
    await assert.rejects(save({ ...fixture, name: "another" }));
    assert.deepEqual(await profiles(), [fixture]);
    const other = { ...fixture, name: "other", tunnel: "org.example.other" };
    await save(other);
    const edited = {
      ...fixture,
      name: "renamed",
      reverse: "new-return",
      listener: "org.example.listener",
    };
    await save(edited, fixture);
    assert.deepEqual(await profiles(), [edited, other]);
    await assert.rejects(
      save({ ...edited, name: other.name }, edited),
      /already in use/,
    );
    await assert.rejects(
      save({ ...edited, tunnel: other.tunnel }, edited),
      /already in use/,
    );
    const latest = { ...edited, listener: undefined };
    await save(latest, edited);
    await assert.rejects(save(edited, edited), /changed since opening/);
    await assert.rejects(save(fixture, fixture), /changed since opening/);
    const withoutListener = {
      ...fixture,
      name: edited.name,
      reverse: edited.reverse,
    };
    assert.deepEqual(await profiles(), [withoutListener, other]);
    assert.equal(
      // Mask the file type to compare the POSIX permission bits.
      // eslint-disable-next-line no-bitwise
      (await stat(join(tmp, "nerv/config.json"))).mode & 0o777,
      0o600,
    );
    assert.equal(
      JSON.parse(await readFile(join(tmp, "nerv/config.json"), "utf8")).version,
      1,
    );
  } finally {
    if (originalHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalHome;
    await rm(tmp, { recursive: true, force: true });
  }
});
test(
  "config lock excludes a live writer and recovers after it is killed",
  { timeout: 15000 },
  async () => {
    const tmp = await mkdtemp(join(tmpdir(), "link-lock-"));
    const originalHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmp;
    try {
      const { dir, save, profiles } = await import("../dist/config.js?lock");
      await save(fixture);
      const lockFile = join(dir, "config.json.lock");
      const writer = spawn("/usr/bin/perl", [
        "-MFcntl=:flock",
        "-e",
        'open(my $lock, ">>", $ARGV[0]) or die $!; flock($lock, LOCK_EX) or die $!; $|=1; print "locked"; sleep 30;',
        lockFile,
      ]);
      const exit = once(writer, "exit");
      try {
        const [ready] = await Promise.race([
          once(writer.stdout, "data"),
          exit.then(() => {
            throw new Error("Lock holder exited early");
          }),
        ]);
        assert.equal(ready.toString(), "locked");
        const other = {
          ...fixture,
          name: "other",
          tunnel: "org.example.other",
        };
        await assert.rejects(save(other), /config is busy/);
        writer.kill("SIGKILL");
        assert.deepEqual(await exit, [null, "SIGKILL"]);
        assert.equal((await stat(lockFile)).size, 0);

        const third = {
          ...fixture,
          name: "third",
          tunnel: "org.example.third",
        };
        await Promise.all([save(other), save(third)]);
        assert.deepEqual((await profiles()).map((p) => p.name).sort(), [
          fixture.name,
          other.name,
          third.name,
        ]);
      } finally {
        writer.kill("SIGKILL");
        await exit;
      }
    } finally {
      if (originalHome === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalHome;
      await rm(tmp, { recursive: true, force: true });
    }
  },
);
test("read only matching PID; handle a missing sample or a process restart", () => {
  const csv = ",bytes_out,bytes_in,\nssh.18,50,100,\n";
  const a = parseCounters(csv, 18, 1000);
  assert.deepEqual(a, { pid: 18, rx: 100, tx: 50, time: 1000 });
  assert.equal(parseCounters(csv, 81, 1000), undefined);
  assert.equal(parseCounters(",bytes_out,\nssh.18,5,", 18, 1000), undefined);
  const b = { ...a, time: 3000, rx: 300, tx: 150 };
  assert.deepEqual(rates(a, b), { rx: 100, tx: 50 });
  for (const bad of [{ pid: 19 }, { time: 900 }, { rx: 90 }])
    assert.equal(rates(a, { ...b, ...bad }), undefined);
});
test("discover only SSH jobs with an explicit reverse forward before the final alias", () => {
  const forward = "localhost:2222:localhost:22";
  for (const args of [
    ["-NT", "-o", "BatchMode=yes", "-R", forward],
    ["-NTR", forward],
    ["-NT", `-R${forward}`, "-p2222"],
    ["-NTR[::1]:2222:[::1]:22", "-oBatchMode=yes", "--"],
    ["-R", "2222:localhost:ssh"],
    ["-R", "2222:/tmp/example.sock"],
    ["-R", "/tmp/example.sock"],
    ["-R", "localhost:2222"],
  ])
    assert.equal(
      tunnelHost({ ProgramArguments: ["/usr/bin/ssh", ...args, "unit-a"] }),
      "unit-a",
    );
  assert.equal(
    tunnelHost({
      Program: "/usr/bin/ssh",
      ProgramArguments: ["ssh", "-R", forward, "unit-a"],
    }),
    "unit-a",
  );
  for (const args of [
    ["/usr/bin/ssh", "-L", "a", "b"],
    ["/bin/sh", "-R", forward, "unit-a"],
    ["/usr/bin/ssh", "backup-host", "ls", "-R", "archive"],
    ["/usr/bin/ssh", "backup-host", "-R", forward, "unit-a"],
    ["/usr/bin/ssh", "-R", forward, "backup-host", "true"],
    ["/usr/bin/ssh", "-o", `-R${forward}`, "unit-a"],
    ["/usr/bin/ssh", "-o", "-R", "unit-a"],
    ["/usr/bin/ssh", "-R", "unit-a"],
    ["/usr/bin/ssh", "-R", "", "unit-a"],
    ["/usr/bin/ssh", "-R", " ", "unit-a"],
    ["/usr/bin/ssh", "-R", "-q", "unit-a"],
    ["/usr/bin/ssh", "-R-q", "unit-a"],
    ["/usr/bin/ssh", "-O", "cancel", "-R", forward, "unit-a"],
    ["/usr/bin/ssh", "-G", "-R", forward, "unit-a"],
  ])
    assert.equal(tunnelHost({ ProgramArguments: args }), undefined);
});
test("demo and narrow panel render without reading local configuration", () => {
  for (const compact of [true, false]) {
    const output = renderToString(
      React.createElement(View, {
        names: ["EVA-A"],
        frames: [demoFrame(0)],
        index: 0,
        compact,
        message: "",
        demo: true,
      }),
      { columns: compact ? 48 : 84 },
    );
    assert.match(output, /SIMULATION/);
    assert.match(output, /Connected/);
    assert.match(output, /SSH check/);
  }
});
