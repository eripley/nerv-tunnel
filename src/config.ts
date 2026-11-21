import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

export interface Profile {
  name: string;
  host: string;
  reverse: string;
  tunnel: string;
  listener?: string;
}
export const dir = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "nerv",
);
const file = join(dir, "config.json");
export function token(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  );
}
export function validate(p: Profile) {
  for (const key of ["name", "host", "reverse", "tunnel"] as const)
    if (!token(p?.[key])) throw new Error(`Invalid profile field: ${key}`);
  if (
    p.listener !== undefined &&
    (!token(p.listener) || p.listener === p.tunnel)
  )
    throw new Error("Invalid listener label");
  return p;
}
export async function profiles(): Promise<Profile[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.profiles))
    throw new Error(`Unsupported config: ${file}`);
  return data.profiles.map(validate);
}
async function lockConfig(fd: number) {
  // The kernel holds the flock on the inherited descriptor until Node closes
  // it, including when Node exits unexpectedly. Keep the same lock file inode.
  const child = spawn(
    "/usr/bin/perl",
    [
      "-MFcntl=:flock",
      "-e",
      "$SIG{ALRM} = sub { exit 75 }; alarm 5; flock(STDIN, LOCK_EX) or exit 1;",
    ],
    { stdio: [fd, "ignore", "ignore"] },
  );
  const [code] = await once(child, "exit");
  if (code === 75) throw new Error("NERV config is busy. Try saving again.");
  if (code !== 0) throw new Error("Could not lock the NERV config");
}
export async function save(p: Profile, original?: Profile) {
  validate(p);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = await open(`${file}.lock`, "a+", 0o600);
  const tmp = `${file}.${randomUUID()}`;
  try {
    await lockConfig(lock.fd);
    const list = await profiles();
    const index = original
      ? list.findIndex((x) => x.name === original.name)
      : -1;
    if (
      original &&
      (index < 0 ||
        !(["host", "reverse", "tunnel", "listener"] as const).every(
          (key) => list[index][key] === original[key],
        ))
    )
      throw new Error(
        "Profile changed since opening the editor. Reopen it to load the current settings.",
      );
    if (
      list.some(
        (x, i) => i !== index && (x.name === p.name || x.tunnel === p.tunnel),
      )
    )
      throw new Error("Profile name or tunnel already in use");
    if (index === -1) list.push(p);
    else list[index] = p;
    const out = await open(tmp, "wx", 0o600);
    try {
      await out.writeFile(
        `${JSON.stringify({ version: 1, profiles: list }, null, 2)}\n`,
      );
    } finally {
      await out.close();
    }
    await rename(tmp, file);
  } finally {
    try {
      await rm(tmp, { force: true });
    } finally {
      await lock.close();
    }
  }
}
