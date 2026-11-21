import React, { useEffect, useRef, useState } from "react";
import { createRequire } from "node:module";
import { execFile, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Box, Text, useApp, useInput } from "ink";
import semver from "semver";
import { palette, Busy, Muted, useTerminalSize } from "./console.js";

const registry = "https://registry.npmjs.org";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export const { version }: { version: string } = createRequire(import.meta.url)(
  "../package.json",
);

export function globalPrefix(root: string) {
  const prefix = resolve(root, "../../..");
  if (resolve(root) !== join(prefix, "lib/node_modules/nerv-tunnel"))
    return undefined;
  try {
    if (
      realpathSync(join(prefix, "bin/nerv")) ===
      realpathSync(join(root, "dist/cli.js"))
    )
      return prefix;
  } catch {
    // A local checkout or an installation owned by another package manager.
  }
  return undefined;
}

export async function latestUpdate(current: string, request = fetch) {
  try {
    const response = await request(`${registry}/nerv-tunnel/latest`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return undefined;
    const pkg: { name?: unknown; version?: unknown } = await response.json();
    if (
      pkg.name === "nerv-tunnel" &&
      typeof pkg.version === "string" &&
      semver.valid(pkg.version) === pkg.version &&
      semver.gt(pkg.version, current)
    )
      return pkg.version;
  } catch {
    // The dashboard also works when the registry is unreachable.
  }
  return undefined;
}

const run = promisify(execFile);
export async function install(
  prefix: string,
  latest: string,
  signal: AbortSignal,
) {
  try {
    await run(
      "npm",
      [
        "install",
        "--global",
        "--prefix",
        prefix,
        "--registry",
        registry,
        "--prefer-online",
        "--prefer-offline=false",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `nerv-tunnel@${latest}`,
      ],
      { signal, timeout: 120000 },
    );
  } catch (err) {
    const failure = err as NodeJS.ErrnoException & {
      stderr?: string;
      killed?: boolean;
    };
    const code =
      /npm (?:error|ERR!) code ([A-Z0-9_]+)/i.exec(failure.stderr ?? "")?.[1] ??
      failure.code;
    if (code === "ETARGET" || code === "E404")
      throw new Error(
        `npm ${code}: this release is not available yet. Retry shortly.`,
      );
    if (code === "EACCES" || code === "EPERM")
      throw new Error(
        `npm ${code}: the installation directory is not writable.`,
      );
    if (failure.killed)
      throw new Error("npm timed out. Check your connection and retry.");
    throw new Error(`npm install failed (${code ?? "unknown error"}).`);
  }
  const pkg = JSON.parse(
    await readFile(
      join(prefix, "lib/node_modules/nerv-tunnel/package.json"),
      "utf8",
    ),
  );
  if (pkg.version !== latest)
    throw new Error(
      "npm finished but the installed version did not change to the requested release.",
    );
}

function reopen(prefix: string) {
  const child = spawnSync(
    process.execPath,
    [join(prefix, "lib/node_modules/nerv-tunnel/dist/cli.js"), "monitor"],
    {
      stdio: "inherit",
      env: { ...process.env, NERV_NO_UPDATE_CHECK: "1" },
    },
  );
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}

export const restartUpdated = Symbol("restart updated NERV");

export function updateSession(prefix = globalPrefix(packageRoot)) {
  if (!prefix || process.env.NERV_NO_UPDATE_CHECK === "1") return undefined;
  let offer = latestUpdate(version);
  return {
    get latest() {
      return offer;
    },
    dismiss() {
      offer = Promise.resolve(undefined);
    },
    install: (latest: string, signal: AbortSignal) =>
      install(prefix, latest, signal),
    reopen: () => reopen(prefix),
  };
}
export type UpdateSession = NonNullable<ReturnType<typeof updateSession>>;

export function useUpdateOffer(session?: UpdateSession) {
  const [latest, setLatest] = useState<string>();
  useEffect(() => {
    let active = true;
    void session?.latest.then((value) => {
      if (active) setLatest(value);
    });
    return () => {
      active = false;
    };
  }, [session]);
  function dismiss() {
    session?.dismiss();
    setLatest(undefined);
  }
  return { latest, dismiss };
}

function UpdateDialog({
  latest,
  session,
  dismiss,
}: {
  latest: string;
  session: UpdateSession;
  dismiss: () => void;
}) {
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const [listening, setListening] = useState(false);
  const [choice, select] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function start() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    try {
      await session.install(latest, controller.signal);
      if (!controller.signal.aborted) exit(restartUpdated);
    } catch (err) {
      if (!controller.signal.aborted) {
        setPending(false);
        setError((err as Error).message);
        select(true);
      }
    } finally {
      request.current = null;
    }
  }
  useInput((input, key) => {
    if (request.current) return;
    if (key.escape) dismiss();
    else if (key.upArrow || key.downArrow) select((old) => !old);
    else if (input === "u" || (key.return && choice)) void start();
    else if (key.return) dismiss();
  });
  // Ink attaches useInput in a passive effect. Advertise the keys once it is active.
  useEffect(() => setListening(true), []);
  if (!listening) return null;
  return (
    <Box
      position="absolute"
      width="100%"
      height="100%"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        width={Math.min(54, columns)}
        flexDirection="column"
        paddingX={1}
        borderStyle="round"
        borderColor={palette.gold}
        backgroundColor="#212128"
      >
        <Text bold color={palette.gold}>
          NERV update
        </Text>
        <Text>
          {version} → {latest}
        </Text>
        {pending ? (
          <Busy label={`Installing ${latest} with npm…`} />
        ) : (
          <>
            {error && <Text color={palette.flame}>{error}</Text>}
            <Text bold={choice} color={choice ? palette.mint : undefined}>
              {choice ? "❯" : " "}{" "}
              {error ? "Retry update" : "Update and reopen"}
            </Text>
            <Text bold={!choice} color={!choice ? palette.mint : undefined}>
              {choice ? " " : "❯"} Later
            </Text>
            <Text dimColor>
              ↑↓ select · Enter confirm · u update · Esc later
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
}

export function UpdateFrame({
  children,
  latest = undefined,
  session = undefined,
  dismiss,
}: {
  children: React.ReactNode;
  latest?: string;
  session?: UpdateSession;
  dismiss: () => void;
}) {
  const visible = Boolean(latest && session);
  return (
    <Box flexDirection="column" minHeight={visible ? 12 : undefined}>
      <Muted.Provider value={visible}>
        <Box flexDirection="column" aria-hidden={visible}>
          {children}
        </Box>
      </Muted.Provider>
      {latest && session && (
        <UpdateDialog latest={latest} session={session} dismiss={dismiss} />
      )}
    </Box>
  );
}
