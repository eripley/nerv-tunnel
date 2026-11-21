import { readFileSync, writeFileSync } from "node:fs";

const report = JSON.parse(
  readFileSync("coverage/coverage-summary.json", "utf8"),
);
const { total, covered }: { total: number; covered: number } =
  report.total.lines;
if (
  !Number.isInteger(total) ||
  total <= 0 ||
  !Number.isInteger(covered) ||
  covered < 0 ||
  covered > total
)
  throw new Error("Invalid CLI line coverage summary");
const percent = Math.round((100 * covered) / total);
const label = `line coverage: ${percent}%`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="20" role="img" aria-label="${label}">
  <title>${label}</title>
  <clipPath id="r"><rect width="128" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)"><rect width="88" height="20" fill="#49515a"/><rect x="88" width="40" height="20" fill="#555080"/></g>
  <g fill="white" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="44" y="14">line coverage</text><text x="108" y="14">${percent}%</text></g>
</svg>
`;
writeFileSync("docs/coverage.svg", badge);
process.stdout.write(`CLI line coverage: ${covered}/${total} (${percent}%)\n`);
