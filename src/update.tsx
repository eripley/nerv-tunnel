import React from "react";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Box, render, Text, useApp } from "ink";
import { Select, ThemeProvider } from "@inkjs/ui";
import semver from "semver";
import { palette, theme } from "./console.js";

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

function UpdatePrompt({ latest }: { latest: string }) {
  const { exit } = useApp();
  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        <Text bold color={palette.gold}>
          NERV update · {version} → {latest}
        </Text>
        <Select
          options={[
            { value: "continue", label: "Continue with the installed version" },
            { value: "install", label: `Update to ${latest} and open NERV` },
          ]}
          onChange={(choice) => exit(choice)}
        />
      </Box>
    </ThemeProvider>
  );
}

async function ask(latest: string) {
  const prompt = render(<UpdatePrompt latest={latest} />);
  return prompt.waitUntilExit();
}

function install(prefix: string, latest: string) {
  execFileSync(
    "npm",
    [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--registry",
      registry,
      "--ignore-scripts",
      `nerv-tunnel@${latest}`,
    ],
    { stdio: "inherit" },
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

// Return true when the caller should open the current dashboard.
export async function beforeMonitor(
  prefix = globalPrefix(packageRoot),
  system = { latestUpdate, ask, install, reopen },
) {
  if (!prefix || process.env.NERV_NO_UPDATE_CHECK === "1") return true;
  const latest = await system.latestUpdate(version);
  if (!latest) return true;
  const choice = await system.ask(latest);
  if (choice === "continue") return true;
  if (choice !== "install") return false;
  try {
    system.install(prefix, latest);
  } catch {
    process.stderr.write(
      "Update failed. Continuing with the installed version.\n",
    );
    return true;
  }
  system.reopen(prefix);
  return false;
}
