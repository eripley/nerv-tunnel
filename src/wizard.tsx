import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Select, TextInput, ThemeProvider } from "@inkjs/ui";
import {
  Busy,
  Masthead,
  palette,
  Sweep,
  theme,
  useCompact,
} from "./console.js";
import { profiles, save, token, type Profile } from "./config.js";
import {
  checkJobs,
  definition,
  labels,
  probe,
  tunnelHost,
  type Check,
} from "./service.js";

type Tunnel = { label: string; host: string };
async function discover() {
  const existing = await profiles();
  const tunnels: Tunnel[] = [];
  const listeners: string[] = [];
  for (const label of (await labels()).sort()) {
    try {
      // Inspect one plist at a time to bound the number of child processes.
      // eslint-disable-next-line no-await-in-loop
      const agent = await definition(label);
      const host = tunnelHost(agent);
      if (host && !existing.some((p) => p.tunnel === label))
        tunnels.push({ label, host });
      if ((agent.Program ?? agent.ProgramArguments[0]) === "/usr/sbin/sshd")
        listeners.push(label);
    } catch {
      /* Other applications may use different plist formats. */
    }
  }
  return { tunnels, listeners, existing };
}
type Step =
  | "scan"
  | "tunnel"
  | "name"
  | "reverse"
  | "listener"
  | "verify"
  | "review"
  | "saving";
const steps: Record<Step, number> = {
  scan: 0,
  tunnel: 0,
  name: 1,
  reverse: 2,
  listener: 3,
  verify: 4,
  review: 4,
  saving: 4,
};
const stages = ["Tunnel", "Name", "Return", "Listener", "Review"];
const previous: Partial<Record<Step, Step>> = {
  name: "tunnel",
  reverse: "name",
  listener: "reverse",
  verify: "listener",
  review: "listener",
};
const questions: Record<Step, string> = {
  scan: "Find a tunnel",
  tunnel: "Which tunnel do you want to monitor?",
  name: "What should we call this EVA?",
  reverse: "How does the remote machine SSH back to this Mac?",
  listener: "Does this tunnel use a dedicated SSH listener?",
  verify: "Check the return route",
  review: "Review your connection",
  saving: "Save your profile",
};

const local = { discover, checkJobs, probe, save };

export default function Wizard({ system = local }: { system?: typeof local }) {
  const { exit } = useApp();
  const compact = useCompact();
  const [step, setStep] = useState<Step>("scan");
  const [found, setFound] = useState<Awaited<ReturnType<typeof discover>>>();
  const [draft, setDraft] = useState<Profile>({
    name: "",
    host: "",
    tunnel: "",
    reverse: "",
  });
  const [check, setCheck] = useState<Check>();
  const [error, setError] = useState("");
  function go(next: Step) {
    setError("");
    setStep(next);
  }
  useInput((_input, key) => {
    if (!key.escape || step === "saving") return;
    const back = previous[step];
    if (back) go(back);
    else exit();
  });
  useEffect(() => {
    if (step !== "scan") return undefined;
    let active = true;
    system
      .discover()
      .then((result) => {
        if (!active) return;
        setFound(result);
        go("tunnel");
      })
      .catch((err: Error) => {
        if (active) exit(err);
      });
    return () => {
      active = false;
    };
  }, [step, exit, system]);
  useEffect(() => {
    if (step !== "verify") return undefined;
    const controller = new AbortController();
    async function verify() {
      await system.checkJobs(draft);
      if (controller.signal.aborted) return;
      const result = await system.probe(draft, controller.signal);
      if (controller.signal.aborted) return;
      setCheck(result);
      go("review");
    }
    verify().catch((err: Error) => {
      if (controller.signal.aborted) return;
      setError(err.message);
      setStep("listener");
    });
    return () => controller.abort();
  }, [step, draft, system]);
  const submitField = (input: string) => {
    const value = input.trim() || (step === "name" ? draft.host : "");
    if (!token(value)) {
      setError(
        "Use 1–128 letters, digits, dots, dashes or underscores. Start with a letter or digit.",
      );
      return;
    }
    if (step === "name" && found?.existing.some((p) => p.name === value)) {
      setError("That profile name is already in use.");
      return;
    }
    setDraft({ ...draft, [step]: value });
    go(step === "name" ? "reverse" : "listener");
  };
  const confirm = async (action: string) => {
    if (action === "edit") {
      go("name");
      return;
    }
    if (action === "cancel") {
      exit();
      return;
    }
    go("saving");
    try {
      await system.save(draft);
      exit(true);
    } catch (err) {
      setError((err as Error).message);
      setStep("review");
    }
  };

  const listenerOptions = [
    { value: "-", label: "Skip · keep the listener managed separately" },
    ...(found?.listeners ?? []).map((value) => ({ value, label: value })),
  ];
  // Select focuses the first item on mount. Preserve the choice when going back.
  const listeners = draft.listener
    ? [
        ...listenerOptions.filter((o) => o.value === draft.listener),
        ...listenerOptions.filter((o) => o.value !== draft.listener),
      ]
    : listenerOptions;
  const editable = step === "name" || step === "reverse";
  const empty = step === "tunnel" && !found?.tunnels.length;
  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column" paddingX={1}>
        <Masthead title="LINK SETUP" compact={compact} />
        <Box gap={1} marginTop={compact ? 0 : 1}>
          <Sweep key={step} />
          {compact ? (
            <Text>
              {steps[step] + 1}/5 · {stages[steps[step]]}
            </Text>
          ) : (
            stages.map((stage, i) => (
              <Text
                key={stage}
                color={i <= steps[step] ? palette.gold : palette.line}
                bold={i === steps[step]}
              >
                {i === steps[step] ? "▸ " : ""}
                {stage}
              </Text>
            ))
          )}
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={palette.line}
          paddingX={1}
        >
          <Text bold>{questions[step]}</Text>
          {step === "scan" && (
            <Busy label="Finding reverse SSH LaunchAgents…" />
          )}
          {empty && (
            <Text>
              {found?.existing.length
                ? "No new tunnels found. Open nerv monitor for your saved profiles."
                : "No reverse SSH LaunchAgent found. See the first connection instructions in the README."}
            </Text>
          )}
          {step === "tunnel" && !empty && found && (
            <Select
              key="tunnel"
              options={found.tunnels.map((t) => ({
                value: t.label,
                label: `${t.host}  ·  ${t.label}`,
              }))}
              onChange={(label) => {
                const choice = found.tunnels.find((t) => t.label === label);
                if (!choice) return;
                if (choice.label !== draft.tunnel)
                  setDraft({
                    tunnel: choice.label,
                    host: choice.host,
                    name: "",
                    reverse: "",
                  });
                go("name");
              }}
            />
          )}
          {editable && (
            <>
              <Text dimColor>
                {step === "name"
                  ? `Choose a display name. Default: ${draft.host}.`
                  : "Enter the SSH alias you use on the remote machine."}
              </Text>
              <Box gap={1}>
                <Text color={palette.gold}>❯</Text>
                <TextInput
                  key={step}
                  defaultValue={step === "name" ? draft.name : draft.reverse}
                  placeholder={step === "name" ? draft.host : "SSH alias"}
                  onSubmit={submitField}
                />
              </Box>
            </>
          )}
          {step === "listener" && found && (
            <Select
              key="listener"
              options={listeners}
              onChange={(value) => {
                setDraft({
                  ...draft,
                  listener: value === "-" ? undefined : value,
                });
                go("verify");
              }}
            />
          )}
          {step === "verify" && (
            <Busy label={`Checking Mac → ${draft.host} → ${draft.reverse}…`} />
          )}
          {step === "review" && (
            <>
              <Text bold color={check?.ok ? palette.mint : palette.gold}>
                {check?.ok
                  ? `✓ Route verified · ${check.ms} ms`
                  : "△ Route unavailable · you can still save this profile"}
              </Text>
              <Text>
                {draft.name} · Mac → {draft.host} → {draft.reverse}
              </Text>
              <Text>Tunnel {draft.tunnel}</Text>
              <Text>Listener {draft.listener ?? "Managed separately"}</Text>
              <Select
                key="review"
                options={[
                  { value: "save", label: "Save profile" },
                  { value: "edit", label: "Edit connection" },
                  { value: "cancel", label: "Discard and exit" },
                ]}
                onChange={confirm}
              />
            </>
          )}
          {step === "saving" && <Busy label="Writing local profile…" />}
          {error && <Text color={palette.flame}>! {error}</Text>}
        </Box>
        <Text dimColor>
          {step !== "saving" && (previous[step] ? "Esc back" : "Esc close")}
          {step === "saving" ? "" : "   ·   Ctrl+C exit"}
          {editable && "   ·   Enter continue"}
          {!empty && ["listener", "tunnel", "review"].includes(step)
            ? "   ·   ↑↓ choose   Enter select"
            : ""}
        </Text>
      </Box>
    </ThemeProvider>
  );
}
