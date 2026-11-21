import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

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
export async function save(p: Profile, original?: Profile) {
  validate(p);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = await open(`${file}.lock`, "wx", 0o600);
  const tmp = `${file}.${randomUUID()}`;
  try {
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
    await rm(tmp, { force: true });
    await lock.close();
    await rm(`${file}.lock`);
  }
}
