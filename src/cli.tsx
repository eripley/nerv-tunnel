#!/usr/bin/env node
import React from "react";
import { Command } from "commander";
import { render } from "ink";
import { profiles, type Profile } from "./config.js";
import { control, job, probe } from "./service.js";
import { Panel } from "./panel.js";
import Wizard from "./wizard.js";

async function wizard() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Run nerv add in an interactive terminal.");
  const setup = render(<Wizard />);
  const saved = (await setup.waitUntilExit()) === true;
  setup.clear();
  if (saved) console.log("✓ Profile saved.");
  return saved;
}

async function dashboard(demo: boolean) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Dashboard requires a TTY. Use nerv status.");
  let list: Profile[] = [];
  if (!demo) {
    list = await profiles();
    if (!list.length) {
      if (!(await wizard())) return;
      list = await profiles();
    }
  }
  await render(<Panel profiles={list} demo={demo} />).waitUntilExit();
}

async function selectProfiles(name?: string) {
  const list = await profiles();
  const selected =
    name === undefined ? list : list.filter((p) => p.name === name);
  if (!selected.length) throw new Error("Profile not found. Use nerv add.");
  return selected;
}

async function status(name?: string) {
  const selected = await selectProfiles(name);
  // Probe one route at a time and print results as they arrive.
  for (const p of selected) {
    // eslint-disable-next-line no-await-in-loop
    const service = await job(p.tunnel);
    // eslint-disable-next-line no-await-in-loop
    const check = service.pid ? await probe(p) : undefined;
    console.log(
      p.name,
      service.state,
      check?.ok ? `verified ${check.ms} ms` : "unavailable",
    );
    if (!check?.ok) process.exitCode = 1;
  }
}

const program = new Command()
  .name("nerv")
  .description("Monitor and control existing reverse SSH tunnels.")
  .showHelpAfterError("(Run the command with --help for usage.)")
  .hook("preAction", (_root, command) => {
    if (command.name() !== "demo" && process.platform !== "darwin")
      throw new Error("NERV manages macOS user LaunchAgents.");
  });

program
  .command("monitor")
  .description("Open the live dashboard (default).")
  .action(() => dashboard(false));
program
  .command("demo")
  .description("Open the dashboard with fictional profiles.")
  .action(() => dashboard(true));
program
  .command("add")
  .description("Configure an existing tunnel interactively.")
  .action(async () => {
    await wizard();
  });
program
  .command("status [PROFILE]")
  .description("Check one profile or all configured routes.")
  .action(status);

const lifecycleCommands = [
  ["start", "Enable and start the selected tunnel."],
  ["stop", "Disable and stop the selected tunnel."],
  ["restart", "Restart the selected tunnel."],
] as const;

for (const [action, description] of lifecycleCommands) {
  program
    .command(`${action} <PROFILE>`)
    .description(description)
    .action(async (name: string) => {
      const selected = await selectProfiles(name);
      if (selected.length !== 1) throw new Error("Profile name is ambiguous.");
      await control(selected[0], action);
    });
}

const args = process.argv.slice(2);
program
  .parseAsync(args.length ? args : ["monitor"], { from: "user" })
  .catch((err: Error) => {
    console.error(err.message);
    process.exitCode = 1;
  });
