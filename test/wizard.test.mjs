import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { afterEach, test } from "node:test";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import Wizard from "../dist/wizard.js";

afterEach(cleanup);

async function show(app, text) {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    if (stripVTControlCharacters(app.lastFrame() ?? "").includes(text)) {
      // Ink attaches input handlers in a passive effect after painting the frame.
      // eslint-disable-next-line no-await-in-loop
      await delay(35);
      return;
    }
    // Poll the real rendered frame between keyboard events.
    // eslint-disable-next-line no-await-in-loop
    await delay(15);
  }
  assert.fail(`Missing "${text}" in ${app.lastFrame()}`);
}

function setup(ok = true, original = undefined, overrides = {}) {
  const saved = [];
  const system = {
    discover: async () => ({
      existing: original ? [original] : [],
      tunnels: [{ label: "org.example.link", host: "station" }],
      listeners: ["org.example.listener"],
    }),
    checkJobs: async () => {},
    probe: async () => ({ ok, ms: 23, at: 0 }),
    ...overrides,
    save: async (profile) => {
      saved.push(profile);
    },
  };
  return {
    app: render(React.createElement(Wizard, { system, original })),
    saved,
  };
}

test("wizard accepts a suggested name, validates the alias, and saves the selected listener only after review", async () => {
  const { app, saved } = setup();
  await show(app, "Add an existing tunnel");
  app.stdin.write("\r");
  await show(app, "org.example.link");
  app.stdin.write("\r");
  await show(app, "What should we call");
  app.stdin.write("\r");
  await show(app, "SSH back");
  app.stdin.write("\r");
  await show(app, "Use 1–128");
  app.stdin.write("return-host");
  await show(app, "return-host");
  app.stdin.write("\r");
  await show(app, "org.example.listener");
  app.stdin.write("\u001B[B");
  await delay(40);
  app.stdin.write("\r");
  await show(app, "Route verified");
  assert.deepEqual(saved, []);
  app.stdin.write("\r");
  await delay(80);
  assert.deepEqual(saved, [
    {
      name: "station",
      host: "station",
      reverse: "return-host",
      tunnel: "org.example.link",
      listener: "org.example.listener",
    },
  ]);
});

test("offline review allows going back or discarding without writing the profile", async () => {
  const { app, saved } = setup(false);
  await show(app, "Add an existing tunnel");
  app.stdin.write("\r");
  await show(app, "org.example.link");
  app.stdin.write("\r");
  await show(app, "What should we call");
  app.stdin.write("EVA-A");
  await show(app, "EVA-A");
  app.stdin.write("\r");
  await show(app, "SSH back");
  app.stdin.write("\u001b");
  await show(app, "What should we call");
  await show(app, "EVA-A");
  app.stdin.write("\r");
  await show(app, "SSH back");
  app.stdin.write("offline");
  await show(app, "offline");
  app.stdin.write("\r");
  await show(app, "org.example.listener");
  app.stdin.write("\r");
  await show(app, "Route unavailable");
  assert.match(app.lastFrame(), /Managed separately/);
  app.stdin.write("\u001B[B");
  await delay(40);
  app.stdin.write("\u001B[B");
  await delay(40);
  app.stdin.write("\r");
  await delay(80);
  assert.deepEqual(saved, []);
});

test("edit a single field, review it and keep all other settings", async () => {
  const original = {
    name: "my-station",
    host: "station",
    tunnel: "org.example.link",
    reverse: "return-host",
    listener: "org.example.listener",
  };
  const { app, saved } = setup(true, original);
  await show(app, "Which setting");
  await show(app, original.reverse);
  app.stdin.write("\r");
  await show(app, "What should we call");
  app.stdin.write("-two");
  await show(app, "my-station-two");
  app.stdin.write("\r");
  await show(app, "Which setting");
  assert.deepEqual(saved, []);
  for (let i = 0; i < 4; i += 1) {
    app.stdin.write("\u001b[B");
    // Send individual key presses through Ink's input loop.
    // eslint-disable-next-line no-await-in-loop
    await delay(40);
  }
  app.stdin.write("\r");
  await show(app, "Save changes");
  assert.deepEqual(saved, []);
  app.stdin.write("\r");
  await delay(80);
  assert.deepEqual(saved, [{ ...original, name: "my-station-two" }]);
});

test("new EVA offers a guide even with available tunnels and Escape returns to the chooser", async () => {
  let copies = 0;
  const { app } = setup(true, undefined, {
    copySetupGuide() {
      copies += 1;
    },
  });
  await show(app, "Add an existing tunnel");
  app.stdin.write("\u001b[B");
  await delay(40);
  app.stdin.write("\r");
  await show(app, "Copy setup instructions");
  assert.equal(copies, 0);
  app.stdin.write("\r");
  await show(app, "Paste it into your agent chat");
  assert.equal(copies, 1);
  app.stdin.write("\u001b");
  await show(app, "Add an existing tunnel");
});

test("empty discovery opens the guide directly and lets the user rescan after setup", async () => {
  let scans = 0;
  const { app, saved } = setup(true, undefined, {
    discover: async () => {
      scans += 1;
      return {
        existing: [],
        listeners: [],
        tunnels:
          scans === 1 ? [] : [{ label: "org.example.new", host: "fresh" }],
      };
    },
    copySetupGuide() {
      throw new Error("Clipboard unavailable. Run nerv agent --stdout.");
    },
  });
  await show(app, "No new tunnels found");
  await show(app, "Copy setup instructions");
  app.stdin.write("\r");
  await show(app, "Run nerv agent --stdout");
  app.stdin.write("r");
  await show(app, "Add an existing tunnel");
  app.stdin.write("\r");
  await show(app, "org.example.new");
  assert.deepEqual(saved, []);
});
