#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { createInterface } from "node:readline/promises";
import { profiles, save, validate, type Profile } from "./config.js";
import {
  checkJobs,
  control,
  definition,
  job,
  labels,
  probe,
  tunnelHost,
} from "./service.js";
import { Panel } from "./panel.js";

async function wizard() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Run nerv add in an interactive terminal.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const choices: { label: string; host: string }[] = [];
    for (const label of await labels()) {
      try {
        const host = tunnelHost(await definition(label));
        if (host) choices.push({ label, host });
      } catch {
        /* unrelated plist */
      }
    }
    if (!choices.length)
      throw new Error(
        "No existing reverse SSH LaunchAgent found. See README for supported jobs.",
      );
    choices.forEach((c, i) =>
      console.log(String(i + 1) + ". " + c.label + " → " + c.host),
    );
    const choice = choices[Number(await rl.question("Tunnel number: ")) - 1];
    if (!choice) throw new Error("Select a listed tunnel number.");
    const name = (
      await rl.question("Display name (letters, digits, dash): ")
    ).trim();
    const reverse = (
      await rl.question("SSH alias on that host for the return connection: ")
    ).trim();
    const listener = (
      await rl.question(
        "Optional companion sshd LaunchAgent label (Enter to skip): ",
      )
    ).trim();
    const p = validate({
      name,
      host: choice.host,
      reverse,
      tunnel: choice.label,
      ...(listener ? { listener } : {}),
    });
    await checkJobs(p);
    console.log(
      (await probe(p)).ok
        ? "Mac route verified."
        : "Route unavailable. Check the aliases or start this tunnel later.",
    );
    if (
      (await rl.question("Save this profile? [y/N] ")).trim().toLowerCase() !==
      "y"
    )
      return false;
    await save(p);
    return true;
  } finally {
    rl.close();
  }
}
async function main() {
  const [action = "monitor", name, ...rest] = process.argv.slice(2);
  if (action === "--help" || action === "-h") {
    console.log(
      "nerv [monitor | demo | add | status [PROFILE] | start PROFILE | stop PROFILE | restart PROFILE]",
    );
    return;
  }
  if (action !== "demo" && process.platform !== "darwin")
    throw new Error("NERV manages macOS user LaunchAgents.");
  if (rest.length || (name && ["monitor", "demo", "add"].includes(action)))
    throw new Error("Unexpected arguments. See nerv --help.");
  if (action === "add") {
    await wizard();
    return;
  }
  if (action === "demo" || action === "monitor") {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error("Dashboard requires a TTY. Use nerv status.");
    let list: Profile[] = [];
    if (action === "monitor") {
      list = await profiles();
      if (!list.length) {
        if (!(await wizard())) return;
        list = await profiles();
      }
    }
    await render(
      <Panel profiles={list} demo={action === "demo"} />,
    ).waitUntilExit();
    return;
  }
  const list = await profiles();
  const selected = name ? list.filter((p) => p.name === name) : list;
  if (!selected.length) throw new Error("Profile not found. Use nerv add.");
  if (action === "status") {
    for (const p of selected) {
      const service = await job(p.tunnel),
        check = service.pid ? await probe(p) : undefined;
      console.log(
        p.name,
        service.state,
        check?.ok ? "verified " + check.ms + " ms" : "unavailable",
      );
      if (!check?.ok) process.exitCode = 1;
    }
    return;
  }
  if (action !== "start" && action !== "stop" && action !== "restart")
    throw new Error("Unknown command. See nerv --help.");
  if (selected.length !== 1) throw new Error("Specify a profile name.");
  await control(selected[0], action);
}
main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
