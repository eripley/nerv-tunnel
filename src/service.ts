import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { token, type Profile } from "./config.js";

const exec = promisify(execFile);
const domain = "gui/" + process.getuid?.();
const agentDir = join(homedir(), "Library", "LaunchAgents");
const plist = (label: string) => join(agentDir, label + ".plist");
async function run(binary: string, args: string[], timeout = 5000) {
  return (await exec(binary, args, { timeout, maxBuffer: 1024 * 1024 })).stdout;
}
const launch = (...args: string[]) => run("/bin/launchctl", args);
export async function labels() {
  return (await readdir(agentDir))
    .filter((x) => x.endsWith(".plist"))
    .map((x) => x.slice(0, -6))
    .filter(token);
}
export async function definition(label: string) {
  if (!token(label)) throw new Error("Invalid launchd label");
  const json = JSON.parse(
    await run("/usr/bin/plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      "--",
      plist(label),
    ]),
  );
  if (json.Label !== label || !Array.isArray(json.ProgramArguments))
    throw new Error("Unsupported LaunchAgent");
  return json as { Program?: string; ProgramArguments: string[] };
}
export function tunnelHost(job: {
  Program?: string;
  ProgramArguments: string[];
}) {
  const a = job.ProgramArguments;
  if (
    (job.Program ?? a[0]) !== "/usr/bin/ssh" ||
    !a.some((x) => x.startsWith("-R"))
  )
    return undefined;
  return token(a.at(-1)) ? a.at(-1) : undefined;
}
export async function checkJobs(p: Profile) {
  if (tunnelHost(await definition(p.tunnel)) !== p.host)
    throw new Error("Tunnel job does not match SSH alias");
  if (p.listener) {
    const def = await definition(p.listener);
    if ((def.Program ?? def.ProgramArguments[0]) !== "/usr/sbin/sshd")
      throw new Error("Expected a dedicated sshd LaunchAgent");
  }
}
export interface Job {
  state: string;
  pid?: number;
}
export async function job(label: string): Promise<Job> {
  try {
    const text = await launch("print", domain + "/" + label);
    const pid = Number(/^\s*pid = (\d+)/m.exec(text)?.[1]) || undefined;
    return { state: /^\s*state = (.+)$/m.exec(text)?.[1] ?? "loaded", pid };
  } catch (e) {
    if (
      /could not find service/i.test(String((e as { stderr?: string }).stderr))
    )
      return { state: "off" };
    throw e;
  }
}
export async function control(
  p: Profile,
  action: "start" | "stop" | "restart",
) {
  await checkJobs(p);
  const target = domain + "/" + p.tunnel;
  if (action !== "start") {
    await launch("disable", target);
    if ((await job(p.tunnel)).state !== "off") await launch("bootout", target);
  }
  if (action !== "stop") {
    for (const label of [p.listener, p.tunnel]) {
      if (!label) continue;
      await launch("enable", domain + "/" + label);
      if ((await job(label)).state === "off")
        await launch("bootstrap", domain, plist(label));
    }
  }
}
export interface Check {
  ok: boolean;
  ms: number;
  at: number;
}
export async function probe(p: Profile): Promise<Check> {
  if (!token(p.reverse) || !token(p.host)) throw new Error("Invalid SSH alias");
  const opts = [
    "-nT",
    "-S",
    "none",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ConnectTimeout=4",
  ];
  const start = performance.now();
  let ok = false;
  try {
    const output = await run(
      "/usr/bin/ssh",
      [...opts, p.host, ["ssh", ...opts, p.reverse, "uname", "-s"].join(" ")],
      12000,
    );
    ok = output.trim().split("\n").at(-1) === "Darwin";
  } catch {
    /* An unavailable route is an expected monitoring result. */
  }
  return { ok, ms: Math.round(performance.now() - start), at: Date.now() };
}
export interface Counter {
  pid: number;
  rx: number;
  tx: number;
  time: number;
}
export function parseCounters(
  text: string,
  pid: number,
  time: number,
): Counter | undefined {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const columns = head.split(",");
  const data = rows
    .map((r) => r.split(","))
    .find((r) => r[0].endsWith("." + pid));
  if (!data) return;
  const fields = ["bytes_in", "bytes_out"].map((k) => data[columns.indexOf(k)]);
  if (!fields.every((n) => /^\d+$/.test(n))) return;
  return { pid, rx: Number(fields[0]), tx: Number(fields[1]), time };
}
export async function counters(pid: number) {
  try {
    return parseCounters(
      await run(
        "/usr/bin/nettop",
        [
          "-n",
          "-P",
          "-x",
          "-L",
          "1",
          "-p",
          String(pid),
          "-J",
          "bytes_in,bytes_out",
        ],
        2500,
      ),
      pid,
      performance.now(),
    );
  } catch {
    return undefined;
  }
}
export function rates(a?: Counter, b?: Counter) {
  if (
    !a ||
    !b ||
    a.pid !== b.pid ||
    a.time >= b.time ||
    b.rx < a.rx ||
    b.tx < a.tx
  )
    return;
  const seconds = (b.time - a.time) / 1000;
  return { rx: (b.rx - a.rx) / seconds, tx: (b.tx - a.tx) / seconds };
}
