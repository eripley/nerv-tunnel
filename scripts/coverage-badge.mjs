import { readFileSync, readdirSync, writeFileSync } from "node:fs";

// Node may list one module twice if a test imports it with a query string.
// Count each physical line once, including files the suite never loaded.
const covered = new Map();
for (const record of readFileSync("coverage/lcov.info", "utf8").split(
  "end_of_record",
)) {
  const file = /^SF:(.+)$/m.exec(record)?.[1];
  if (file) {
    const lines = covered.get(file) ?? new Set();
    for (const [, line, hits] of record.matchAll(/^DA:(\d+),(\d+)/gm)) {
      if (Number(hits) > 0) lines.add(Number(line));
    }
    covered.set(file, lines);
  }
}
if (!covered.size)
  throw new Error("No compiled CLI modules in coverage report");

let total = 0;
let hits = 0;
for (const name of readdirSync("dist").filter((file) => file.endsWith(".js"))) {
  const path = `dist/${name}`;
  total += readFileSync(path, "utf8").trimEnd().split("\n").length;
  hits += covered.get(path)?.size ?? 0;
}
const percent = Math.round((100 * hits) / total);
const label = `line coverage: ${percent}%`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="20" role="img" aria-label="${label}">
  <title>${label}</title>
  <clipPath id="r"><rect width="128" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)"><rect width="88" height="20" fill="#49515a"/><rect x="88" width="40" height="20" fill="#555080"/></g>
  <g fill="white" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="44" y="14">line coverage</text><text x="108" y="14">${percent}%</text></g>
</svg>
`;
writeFileSync("docs/coverage.svg", badge);
process.stdout.write(`CLI line coverage: ${hits}/${total} (${percent}%)\n`);
