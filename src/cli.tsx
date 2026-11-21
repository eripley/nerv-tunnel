#!/usr/bin/env node
import React from "react";
import { Command } from "commander";
import { render } from "ink";
import { profiles, type Profile } from "./config.js";
import { control, job, probe } from "./service.js";
import { copied, copySetupGuide, setupGuide } from "./agent.js";
import { Panel, type SetupRequest } from "./panel.js";
import GuideViewer from "./guide.js";
import Wizard from "./wizard.js";
import {
  restartUpdated,
  updateSession,
  type UpdateSession,
  version,
} from "./update.js";

async function wizard(original?: Profile, updates?: UpdateSession) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Profile setup requires an interactive terminal.");
  const setup = render(
    <Wizard
      updates={updates}
      original={original}
      clearScreen={(): void => setup.clear()}
    />,
  );
  const saved = await setup.waitUntilExit();
  if (saved === restartUpdated) return restartUpdated;
  if (saved) console.log("✓ Profile saved.");
  return typeof saved === "string" ? saved : undefined;
}

async function dashboard(demo: boolean) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Dashboard requires a TTY. Use nerv status.");
  const updates = demo ? undefined : updateSession();
  let list: Profile[] = [];
  if (!demo) {
    list = await profiles();
    if (!list.length) {
      const result = await wizard(undefined, updates);
      if (result === restartUpdated) {
        updates?.reopen();
        return;
      }
      if (!result) return;
      list = await profiles();
    }
  }
  let index = 0;
  // Input, editing and reloading are sequential screens on the same terminal.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    const panel = render(
      <Panel
        profiles={list}
        updates={updates}
        demo={demo}
        initialIndex={index}
        clearScreen={(): void => panel.clear()}
      />,
    );
    const request = (await panel.waitUntilExit()) as
      SetupRequest | typeof restartUpdated | undefined;
    if (request === restartUpdated) {
      updates?.reopen();
      return;
    }
    if (!request) return;
    const name =
      (await wizard(request.mode === "edit" ? request.profile : undefined)) ??
      request.profile.name;
    list = await profiles();
    if (!list.length) return;
    index = Math.max(
      0,
      list.findIndex((p) => p.name === name),
    );
  }
  /* eslint-enable no-await-in-loop */
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
  .version(version)
  .description(
    "Set up reverse SSH tunnels with your agent and monitor them from NERV.",
  )
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
  .command("agent")
  .description("View and copy the tunnel setup guide for your agent.")
  .option("--stdout", "Print the guide to standard output.")
  .action(async ({ stdout }: { stdout?: boolean }) => {
    if (stdout) process.stdout.write(setupGuide());
    else if (process.stdin.isTTY && process.stdout.isTTY) {
      await render(<GuideViewer kind="setup" />).waitUntilExit();
    } else {
      copySetupGuide();
      console.log(copied);
    }
  });
program
  .command("add")
  .description("Add an existing tunnel or set up a new EVA.")
  .action(async () => {
    await wizard();
  });
program
  .command("edit <PROFILE>")
  .description("Edit a saved connection profile interactively.")
  .action(async (name: string) => {
    const matches = await selectProfiles(name);
    if (matches.length !== 1) throw new Error("Profile name is ambiguous.");
    await wizard(matches[0]);
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
