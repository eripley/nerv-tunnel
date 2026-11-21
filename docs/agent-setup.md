# Set up an EVA for NERV

Help me connect my primary machine (NERV) to a remote machine I administer (EVA). Work from NERV. Set up the outbound SSH connection, its return path, and, where supported, a local monitoring profile. Answer in my language. Use my supplied settings or ask for missing host, port, account, display name and aliases. Keep addresses, identities and service labels in local configuration. This guide uses symbolic names.

## Inspect the two ends

1. Identify the operating system, available OpenSSH tools and service manager on each machine. Check the existing EVA alias, reverse tunnels, SSH listeners and any saved NERV profiles. Reuse working settings. For a new forward, choose an unused high loopback port on the EVA and record the approved NERV account and listener port.
2. For dashboard monitoring, check the package's supported platforms and Node.js requirement (22.13+). Run `nerv --help` if installed. On a supported host, install the released CLI with `npm install -g nerv-tunnel` or build a development checkout with `npm ci --ignore-scripts` and `npm run build`. From a checkout, use `node dist/cli.js` in place of `nerv`.
3. Use a regular SSH account on the EVA. Confirm which parts of the workspace the owner wants and verify the tunnel independently of the dashboard.

## Prepare the requested workspace

- **Terminal and agent.** Install tmux and Git on the EVA. Use the owner's supplied tmux configuration and preserve their prefix. In a new remote tmux session, verify detach and reattach. Install requested tools for this user, including Python 3, the current Node.js LTS via nvm, and Claude Code using its official installer. Check their versions in a fresh shell. Leave subscription sign-in to the owner.
- **Shared files.** If requested, run Syncthing under the NERV and EVA users, pair their devices and share the owner's chosen directories under the same folder ID. Keep the management UI local. Verify both directions with a temporary test file in each directory.
- **Desktop and developer tools.** If requested, install XFCE and xrdp, configure the EVA user's XFCE session, and carry RDP over the existing NERV-to-EVA SSH connection with a local forward. Keep the RDP listener private. Install Google Chrome if supported by the guest architecture and check it as the regular user. Install Docker and Homebrew on Linux only when requested. Verify the requested tools individually, and report anything that requires an owner login.

## Establish the SSH route

1. **NERV → EVA.** Configure a local OpenSSH host alias for the EVA with its host, SSH port, user and dedicated identity. Generate a key on NERV if needed and install its public half for the EVA account. Verify the EVA host key against an independently trusted fingerprint, then test unattended authentication to that alias.
2. **NERV listener.** Reuse the owner's approved SSH listener and account. If a private listener is needed, configure a dedicated OpenSSH server on the NERV loopback interface and an unused high port, with its own host key, public-key authentication and access for the selected NERV user. Validate its configuration with `sshd -t -f` and the selected config path. Record the listener port. If the dashboard supports managing that listener, record its service label as well.
3. **Reverse forward.** Create a service on NERV that keeps one SSH client connected to this EVA and retries after disconnects. Use the service manager available on NERV. Pass the following arguments to the local OpenSSH executable, substituting the owner’s values. Keep the destination alias last.

   ```text
   ssh
   -NT
   -o
   BatchMode=yes
   -o
   StrictHostKeyChecking=yes
   -o
   ExitOnForwardFailure=yes
   -o
   ServerAliveInterval=30
   -o
   ServerAliveCountMax=3
   -R
   127.0.0.1:EVA_RETURN_PORT:127.0.0.1:NERV_SSH_PORT
   EVA_ALIAS
   ```

   For dashboard discovery on a host with launchd, use a user LaunchAgent in `~/Library/LaunchAgents/LABEL.plist` with a matching `Label`, `RunAtLoad`, `KeepAlive`, a retry throttle and separate `ProgramArguments` beginning with `/usr/bin/ssh`. Validate it with `plutil -lint`. Start the service under the intended user. Confirm that the selected port on the EVA is listening only on loopback and that the server permits remote forwarding. Resolve conflicts before proceeding.
4. **EVA → NERV.** Generate or reuse a separate return identity on the EVA. Install only its public key for the approved NERV account. In the EVA account's OpenSSH config, point the chosen return alias at `127.0.0.1`, the EVA return port, the NERV username and this identity. Verify the NERV listener's host key against its fingerprint obtained on NERV. Keep private keys where they were generated and keep host-key checking enabled.
5. Compare the hostname returned by `ssh -o BatchMode=yes RETURN_ALIAS hostname` on the EVA with the hostname observed locally on NERV. From NERV, repeat the check through the EVA alias. If a hop fails, identify it and preserve the owner's existing access.

## Register and verify

On a host supported by the dashboard, open `nerv` in a terminal or tmux pane. Press **a** or run `nerv add`. Register the discovered tunnel, enter the display name and return alias, and select a companion listener if applicable. Review and save the profile. Use **e** to edit an existing profile. Run `nerv status PROFILE` to verify the route. Close the dashboard with **q** and check that the service still owns the tunnel.

On other hosts, verify the tunnel with the service manager and the SSH round trip above.

Report the display name, local aliases, verification results and the command to check the connection. If the owner wants a remote agent instruction, tell it to use the return alias for projects on NERV when the owner explicitly requests access. Keep real environment values in that private workspace.
