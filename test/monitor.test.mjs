import test from "node:test";
import assert from "node:assert/strict";
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
test("stop and restart only interrupt the selected tunnel, preserving its companion", async () => {
  const profile = { ...fixture, listener: "org.example.listener" };
  const loaded = new Set([profile.tunnel, profile.listener]);
  const calls = [];
  const system = {
    checkJobs: async () => {},
    job: async (label) => ({ state: loaded.has(label) ? "running" : "off" }),
    launch: async (cmd, target, path) => {
      const label = path
        ? path
            .split("/")
            .at(-1)
            .replace(/\.plist$/, "")
        : target.split("/").at(-1);
      calls.push([cmd, label]);
      if (cmd === "bootout") loaded.delete(label);
      if (cmd === "bootstrap") loaded.add(label);
    },
  };
  await control(profile, "restart", system);
  assert.deepEqual(calls, [
    ["disable", profile.tunnel],
    ["bootout", profile.tunnel],
    ["enable", profile.listener],
    ["enable", profile.tunnel],
    ["bootstrap", profile.tunnel],
  ]);
  calls.length = 0;
  await control(profile, "stop", system);
  assert.deepEqual([...loaded], [profile.listener]);
  await control(profile, "stop", system);
  assert.equal(calls.filter(([cmd]) => cmd === "bootout").length, 1);
});
test("configuration is local, private and rejects unsafe alias values and duplicate tunnels", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "link-test-"));
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
    await rm(tmp, { recursive: true, force: true });
  }
});
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
test("discover SSH reverse forward jobs, exclude unrelated LaunchAgents", () => {
  assert.equal(
    tunnelHost({
      ProgramArguments: [
        "/usr/bin/ssh",
        "-NT",
        "-R",
        "localhost:2222:localhost:22",
        "unit-a",
      ],
    }),
    "unit-a",
  );
  for (const args of [
    ["/usr/bin/ssh", "-L", "a", "b"],
    ["/bin/sh", "-R", "b"],
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
