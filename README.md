# NERV

![NERV control room receiving three EVA signals](docs/control-room.jpg)

[![Build](https://github.com/eripley/nerv-tunnel/actions/workflows/build.yml/badge.svg)](https://github.com/eripley/nerv-tunnel/actions/workflows/build.yml) [![CI](https://github.com/eripley/nerv-tunnel/actions/workflows/ci.yml/badge.svg)](https://github.com/eripley/nerv-tunnel/actions/workflows/ci.yml) [![Line coverage](docs/coverage.svg)](https://github.com/eripley/nerv-tunnel/actions/workflows/ci.yml)

[Русский](README.ru.md)

In *Evangelion*, NERV is the command centre that directs the Evangelions. Here, **NERV** is your primary machine and each VPS you connect is an **EVA**.

## When NERV helps

Suppose Claude Code runs on one VPS, Codex on another and Kimi on a third, while the project they need lives on NERV. Open a reverse SSH tunnel from NERV to each EVA. An agent can then use a familiar SSH alias to read files or run commands on NERV with the permissions of its SSH account. One terminal dashboard shows which routes work, when each was last checked and how much traffic each tunnel carries.

![Terminal panel with fictional EVA profiles](docs/terminal.svg)

## How the link works

![NERV opens the SSH tunnel. The EVA connects back to NERV through its forwarded loopback port.](docs/architecture.svg)

A user LaunchAgent on NERV keeps an outbound SSH connection to the EVA. The return alias on that EVA points to a loopback port forwarded back to the SSH listener on NERV. Every 15 seconds the monitor tests the full NERV → EVA → NERV route with `uname -s`.

## Using NERV with agents

1. **Set up the link.** On NERV, run `nerv agent` (from a checkout, `node dist/cli.js agent`) or press **i** in the dashboard. Paste the copied instructions into your setup agent’s chat. The guide covers keys, aliases, the tunnel service and a round-trip check. Choose a return alias such as `nerv` for each EVA. [Agent setup guide](docs/agent-setup.md)
2. **Register the EVA.** Press **a** and choose **Add an existing tunnel** to register it. Choose **Set up a new EVA** for the agent instructions. If no new tunnels are available, the wizard offers to copy the instructions immediately. After the agent finishes, select **Scan again for new tunnels**. Repeat for each VPS. You can run `nerv agent --stdout` to read the guide in the terminal.
3. **Give the agent a concrete task.** For example, ask the agent on an EVA, “The project is on NERV. Run `ssh nerv 'ls ~/projects'` and show me the available projects.” Commands that use this alias execute on NERV. Other commands in the agent’s shell run on its EVA.

## Try it

On NERV, use Node.js 22.13 or later. Run these commands from the checkout.

```sh
npm ci
npm run build
node dist/cli.js demo
```

Demo mode uses fictional data. To configure a real connection, run `node dist/cli.js` in a terminal. Once you want the global `nerv` command, run `npm link` in the checkout. If another tool already owns that command, use the checkout directly.

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
| e | Edit the selected profile and review changes before saving |
| s | Enable and start its tunnel and configured listener |
| r | Restart the selected tunnel |
| x | Disable and stop the selected tunnel until started again |
| q | Close the dashboard |

Stop only acts on the tunnel; a companion listener can serve other connections. Closing the panel leaves launchd in control. A tunnel job with `RunAtLoad` and `KeepAlive` can recover when NERV wakes or the network returns.

Traffic counters come from `nettop` for each tunnel PID. Receive/send are from the perspective of NERV and include SSH overhead. The one-second sampler computes rates from counter differences. A dash means a counter is unavailable or a fresh process needs a second sample. Every 15 seconds a separate SSH check runs from NERV to the EVA and back; its duration includes both SSH handshakes. The probe executes only `uname -s` on the return host.

For scripts use `nerv status [PROFILE]`, `nerv start PROFILE`, `nerv stop PROFILE` or `nerv restart PROFILE`. Status exits with code 1 if any selected route is unavailable. Set `NO_COLOR=1` for a monochrome display.
