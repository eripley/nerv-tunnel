# Working on NERV

- Use macOS and Node.js 22.13+. Install the locked dependencies with `npm ci --ignore-scripts`.
- Register commands in `src/cli.tsx` with Commander. Keep Ink screens keyboard-first and usable in narrow tmux panes. Reuse the palette and components in `src/console.tsx`.
- Keep launchd and OpenSSH operations in `src/service.ts`, sampling in `src/monitor.ts`, and profile validation and atomic writes in `src/config.ts`.
- Use fictional machines in tests, docs and artwork. Exercise setup with temporary profiles. Keep real aliases, IPs, local paths and credentials out of Git and npm.
- Update both READMEs for user-facing changes. Keep the agent setup handoff in `docs/agent-setup.md` and update the tarball allowlist if shipped files change.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` and `node scripts/check-pack.mjs`. Open a PR and wait for **Verify CLI**. Publication requires a separate release request.
