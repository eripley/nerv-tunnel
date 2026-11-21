import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function setupGuide() {
  return readFileSync(
    new URL("../docs/agent-setup.md", import.meta.url),
    "utf8",
  );
}

export const copied = "Setup guide copied. Paste it into your agent chat.";

export function copySetupGuide() {
  const input = setupGuide();
  try {
    execFileSync("/usr/bin/pbcopy", [], {
      input,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 3000,
      env: { ...process.env, LC_ALL: "en_US.UTF-8" },
    });
  } catch {
    throw new Error(
      "Clipboard unavailable. Run nerv agent --stdout for the setup guide.",
    );
  }
}
