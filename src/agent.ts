import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function setupGuide() {
  return readFileSync(
    new URL("../docs/agent-setup.md", import.meta.url),
    "utf8",
  );
}

export const copied = "Setup guide copied. Paste it into your agent chat.";

export const evaCopied =
  "Copied. Paste into AGENTS.md or CLAUDE.md on the EVA.";

function copy(input: string, failure: string) {
  try {
    execFileSync("/usr/bin/pbcopy", [], {
      input,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 3000,
      env: { ...process.env, LC_ALL: "en_US.UTF-8" },
    });
  } catch {
    throw new Error(failure);
  }
}

export function copySetupGuide() {
  copy(
    setupGuide(),
    "Clipboard unavailable. Run nerv agent --stdout for the setup guide.",
  );
}

export function evaInstructions() {
  return readFileSync(
    new URL("../docs/eva-instructions.md", import.meta.url),
    "utf8",
  );
}

export function copyEvaInstructions() {
  copy(
    evaInstructions(),
    "Clipboard unavailable. See the EVA instructions linked in the README.",
  );
}
