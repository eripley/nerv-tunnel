# Set up an EVA for NERV

Help me connect my Mac and one Linux machine I administer. Work from the Mac. Set up the outbound SSH connection, its return path, and a local NERV profile. Answer in my language. Use my supplied settings or ask for missing host, port, account, display name and aliases. Keep addresses, identities and service labels in local configuration. This guide uses symbolic names.

## Inspect the two ends

1. Check the available OpenSSH client, macOS user LaunchAgents, NERV profiles, and the existing SSH alias for this EVA. Reuse a working tunnel or listener. Choose an unused high loopback port on the EVA for a new forward. Record the Mac account and local SSH listener port. Preserve other profiles and running jobs.
2. On the Mac, use Node.js 22.13+ and npm. In the NERV checkout run `npm ci --ignore-scripts`, `npm run build`, then `node dist/cli.js --help`. Use this entry point wherever the guide says `nerv` if the binary is not linked.
3. On the EVA, use a regular SSH account. Confirm the distribution and which parts of the workspace the owner wants. Set up the tunnel first so you can verify it independently.

## Prepare the requested workspace

- **Terminal and agent.** Install tmux and Git on the EVA. Use the owner's supplied tmux configuration and preserve their prefix. In a new remote tmux session, verify detach and reattach. Install requested tools for this user, including Python 3, the current Node.js LTS via nvm, and Claude Code using its official installer. Check their versions in a fresh shell. Leave subscription sign-in to the owner.
- **Shared files.** If requested, run Syncthing under the Mac and EVA users, pair their devices and share the owner's chosen directories under the same folder ID. Keep the management UI local. Verify both directions with a temporary test file in each directory.
- **Desktop and developer tools.** If requested, install XFCE and xrdp, configure the EVA user's XFCE session, and carry RDP over the existing Mac-to-EVA SSH connection with a local forward. Keep the RDP listener private. Install Google Chrome if supported by the guest architecture and check it as the regular user. Install Docker and Homebrew on Linux only when requested. Verify the requested tools individually, and report anything that requires an owner login.

## Establish the SSH route

1. **Mac → EVA.** Configure a local OpenSSH host alias for the EVA with its host, SSH port, user and dedicated identity. Generate a key on the Mac if needed and install its public half for the EVA account. Verify the EVA host key against an independently trusted fingerprint, then test unattended authentication to that alias.
2. **Mac listener.** Reuse the owner's approved SSH listener and account. If a private listener is needed, configure a dedicated OpenSSH server on Mac loopback and an unused high port, with its own host key, public-key authentication and access for the selected Mac user. Validate its configuration with `sshd -t -f` and the selected config path. If managed by NERV, use a user LaunchAgent whose executable is `/usr/sbin/sshd`. Record its label. A system-managed listener can be left out of the profile.
3. **Reverse forward.** Create a user LaunchAgent in `~/Library/LaunchAgents/LABEL.plist` using a unique matching `Label`, `RunAtLoad`, `KeepAlive`, and a retry throttle. Use the following as separate `ProgramArguments` entries. Replace the capitalized values locally. Keep the destination alias last so NERV can discover it.

   ```text
   /usr/bin/ssh
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
   127.0.0.1:EVA_RETURN_PORT:127.0.0.1:MAC_SSH_PORT
   EVA_ALIAS
   ```

   Validate the plist with `plutil -lint`. Bootstrap a new job in the logged-in user's `gui/UID` launchd domain. Confirm that the selected port on the EVA is listening only on loopback and that the server permits remote forwarding. Resolve conflicts before proceeding.
4. **EVA → Mac.** Generate or reuse a separate return identity on the EVA. Install only its public key for the approved Mac account. In the EVA account's OpenSSH config, point the chosen return alias at `127.0.0.1`, the EVA return port, the Mac username and this identity. Verify the Mac listener's host key against its fingerprint obtained on the Mac. Keep private keys where they were generated and keep host-key checking enabled.
5. From the EVA run `ssh -o BatchMode=yes RETURN_ALIAS uname -s`; expect `Darwin`. From the Mac verify the complete route via the EVA alias. If either hop fails, identify the failing hop and keep the owner's existing access working.

## Register and verify

Open NERV in a Mac terminal or tmux pane. Press **a** in the live panel, or run `nerv add`. Register the chosen LaunchAgent, give the EVA its display name, enter the return alias and select the companion listener if applicable. Confirm the route and save. For an existing profile use **e**. Verify `nerv status PROFILE` exits successfully and shows a verified route. Close the dashboard with **q** and check that launchd still owns the tunnel.

Report the display name, local aliases, verification results and the command to reopen the panel. If the owner wants a remote agent instruction, tell it to use the return alias for Mac projects only when the owner explicitly asks to work on the Mac. Keep real environment values in that private workspace.
