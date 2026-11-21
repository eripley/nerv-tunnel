import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [pack]: { filename: string; files: { path: string }[] }[] = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  }),
);
const allowed = [
  "package.json",
  "README.md",
  "README.ru.md",
  "docs/control-room.jpg",
  "docs/coverage.svg",
  "docs/architecture.svg",
  "docs/agent-setup.md",
  "docs/eva-instructions.md",
  "docs/terminal.png",
  ...[
    "agent",
    "cli",
    "config",
    "console",
    "monitor",
    "panel",
    "service",
    "update",
    "wizard",
  ].map((name) => `dist/${name}.js`),
].sort();
const actual = pack.files.map((f) => f.path).sort();
if (JSON.stringify(allowed) !== JSON.stringify(actual))
  throw Error(`Unexpected package files: ${actual.join(", ")}`);
const temp = mkdtempSync(join(tmpdir(), "nerv-pack-"));
try {
  execFileSync(
    "npm",
    [
      "install",
      "--prefix",
      temp,
      "--ignore-scripts",
      "--no-fund",
      "--no-audit",
      join(process.cwd(), pack.filename),
    ],
    { stdio: "inherit" },
  );
  execFileSync(join(temp, "node_modules", ".bin", "nerv"), ["--help"], {
    stdio: "inherit",
  });
  const guide = execFileSync(
    join(temp, "node_modules", ".bin", "nerv"),
    ["agent", "--stdout"],
    { encoding: "utf8" },
  );
  if (!guide.startsWith("# Set up an EVA"))
    throw Error("Packaged setup guide missing");
} finally {
  rmSync(temp, { force: true, recursive: true });
}
