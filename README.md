# NERV

![NERV control room receiving three EVA signals](docs/control-room.jpg)

<p align="center">
  <a href="https://www.npmjs.com/package/nerv-tunnel"><img src="https://img.shields.io/npm/v/nerv-tunnel.svg" alt="Latest npm version"></a>
  <a href="https://github.com/eripley/nerv-tunnel/actions/workflows/build.yml"><img src="https://github.com/eripley/nerv-tunnel/actions/workflows/build.yml/badge.svg" alt="Build"></a>
  <a href="https://github.com/eripley/nerv-tunnel/actions/workflows/ci.yml"><img src="https://github.com/eripley/nerv-tunnel/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/eripley/nerv-tunnel/actions/workflows/ci.yml"><img src="docs/coverage.svg" alt="Line coverage"></a>
</p>

[Русский](README.ru.md)

NERV is a terminal dashboard for the reverse SSH tunnels your VPS agents use to reach your primary machine.

In *Evangelion*, NERV is the command centre that directs the Evangelions. Here, **NERV** is your primary machine and each VPS you connect is an **EVA**.

---

## Install NERV with npm

```sh
npm install -g nerv-tunnel
```

Requires Node.js 22.13 or later. Run `nerv demo` to explore the dashboard with sample data, or `nerv` to add your own connection.

When you open the dashboard from a global npm installation, NERV checks the latest npm version. Press Enter to continue with your installed version, or choose **Update** to install the displayed version and reopen the dashboard. An offline registry does not prevent startup. Use `NERV_NO_UPDATE_CHECK=1 nerv` to skip the check, or `nerv --version` to see the installed version.

## When NERV helps

Suppose Claude Code runs on one VPS, Codex on another and Kimi on a third, while the project they need lives on NERV. Open a reverse SSH tunnel from NERV to each EVA. An agent can then use a familiar SSH alias to read files or run commands on NERV with the permissions of its SSH account. One terminal dashboard shows which routes work, when each was last checked and how much traffic each tunnel carries.

![NERV terminal dashboard showing EVA-A connected, traffic and SSH latency](docs/terminal.png)

## How the link works

NERV keeps a separate outbound SSH connection to each VPS using a user LaunchAgent. On each EVA, the alias `ssh nerv` points to a loopback port on that VPS. Traffic to that port travels back through its tunnel to the SSH listener on NERV. The monitor checks each active route every 15 seconds with `uname -s`.

![Three tunnels connect NERV to VPS hosts running Claude Code, Codex and Kimi. Each agent can SSH back through its own tunnel.](docs/architecture.svg)

## Using NERV with agents

1. **Set up the link.** On NERV, run `nerv agent` (from a checkout, `node dist/cli.js agent`) or press **i** in the dashboard. Paste the copied instructions into your setup agent’s chat. The guide covers keys, aliases, the tunnel service and a round-trip check. Choose a return alias such as `nerv` for each EVA. [Agent setup guide](docs/agent-setup.md)
2. **Register the EVA.** Press **a** and choose **Add an existing tunnel** to register it. Choose **Set up a new EVA** for the agent instructions. If no new tunnels are available, the wizard offers to copy the instructions immediately. After the agent finishes, select **Scan again for new tunnels**. Repeat for each VPS. You can run `nerv agent --stdout` to read the guide in the terminal.
3. **Give the EVA agent its operating instructions.** Press **g** in the NERV dashboard and paste the copied text into `AGENTS.md` or `CLAUDE.md` on the EVA. The agent works on the EVA by default and uses `ssh nerv` when you explicitly ask it to work on NERV. [EVA agent instructions](docs/eva-instructions.md)
4. **Give the agent a concrete task.** For example, ask the agent on an EVA, “The project is on NERV. Run `ssh nerv 'ls ~/projects'` and show me the available projects.” Commands that use this alias execute on NERV. Other commands in the agent’s shell run on its EVA.

## Run from source

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js demo
```

Use `node dist/cli.js` in place of `nerv` when running from a checkout.

## First connection

1. Start with a working reverse tunnel. NERV supports a user LaunchAgent in `~/Library/LaunchAgents` that runs `/usr/bin/ssh` with an explicit `-R` forward and ends with the destination SSH alias.
2. On first launch, choose a discovered tunnel and give it a display name. Enter the alias the remote machine uses to SSH back to NERV. Use ↑/↓ and Enter to select its dedicated local `sshd` listener, or choose **Skip**. Esc takes you back one step.
3. The wizard checks the round trip using `uname -s`. Review the result and confirm to save. An offline tunnel can also be saved. Each hop must already support unattended key authentication and trust its host key.

Profiles are stored in `${XDG_CONFIG_HOME:-~/.config}/nerv/config.json` with mode `0600`. Addresses and key paths stay in OpenSSH configuration. Use `nerv add` for another EVA. Use `nerv edit PROFILE` to change its display name, tunnel, return SSH alias or listener. Choose **Review changes**, then **Save changes** to apply them.

## Dashboard

| Key | Action |
| --- | --- |
| ↑ / ↓ | Select an EVA |
| a | Add an existing tunnel or set up a new EVA |
| i | Copy the environment setup guide for your agent |
| g | Copy instructions for `AGENTS.md` or `CLAUDE.md` on the EVA |
| e | Edit the selected profile and review changes before saving |
| s | Enable and start its tunnel and configured listener |
| r | Restart the selected tunnel |
| x | Disable and stop the selected tunnel until started again |
| q | Close the dashboard |

Stop only acts on the tunnel; a companion listener can serve other connections. Closing the panel leaves launchd in control. A tunnel job with `RunAtLoad` and `KeepAlive` can recover when NERV wakes or the network returns.

Traffic counters come from `nettop` for each tunnel PID. Receive/send are from the perspective of NERV and include SSH overhead. The one-second sampler computes rates from counter differences. A dash means a counter is unavailable or a fresh process needs a second sample. Every 15 seconds a separate SSH check runs from NERV to the EVA and back; its duration includes both SSH handshakes. The probe executes only `uname -s` on the return host.

For scripts use `nerv status [PROFILE]`, `nerv start PROFILE`, `nerv stop PROFILE` or `nerv restart PROFILE`. Status exits with code 1 if any selected route is unavailable. Set `NO_COLOR=1` for a monochrome display.

## License

[MIT License](LICENSE) · © 2026 Denis Chen
