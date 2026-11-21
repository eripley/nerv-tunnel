import React, { useEffect, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { Select, TextInput, ThemeProvider } from "@inkjs/ui";
import {
  ScreenText as Text,
  Busy,
  Masthead,
  KeyHint,
  palette,
  Sweep,
  theme,
  useCompact,
} from "./console.js";
import { UpdateFrame, useUpdateOffer, type UpdateSession } from "./update.js";
import GuideViewer from "./guide.js";
import { copySetupGuide } from "./agent.js";
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
async function discover(original?: Profile) {
  const existing = await profiles();
  const tunnels: Tunnel[] = [];
  const listeners: string[] = [];
  for (const label of (await labels()).sort()) {
    try {
      // Inspect one plist at a time to bound the number of child processes.
      // eslint-disable-next-line no-await-in-loop
      const agent = await definition(label);
      const host = tunnelHost(agent);
      if (
        host &&
        !existing.some((p) => p.tunnel === label && p.name !== original?.name)
      )
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
  | "edit"
  | "add"
  | "guide"
  | "scan"
  | "tunnel"
  | "name"
  | "reverse"
  | "listener"
  | "verify"
  | "review"
  | "saving";
const steps: Record<Step, number> = {
  edit: 0,
  add: 0,
  guide: 0,
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
  tunnel: "add",
  name: "tunnel",
  reverse: "name",
  listener: "reverse",
  verify: "listener",
  review: "listener",
};
const questions: Record<Step, string> = {
  edit: "Which setting would you like to change?",
  scan: "Find a tunnel",
  add: "How would you like to add an EVA?",
  guide: "Set up a new EVA",
  tunnel: "Which tunnel do you want to monitor?",
  name: "What should we call this EVA?",
  reverse: "How does the remote machine SSH back to NERV?",
  listener: "Does this tunnel use a dedicated SSH listener?",
  verify: "Check the return route",
  review: "Review your connection",
  saving: "Save your profile",
};

const local = { discover, checkJobs, probe, save, copySetupGuide };

export default function Wizard({
  original = undefined,
  clearScreen = undefined,
  system = local,
  updates = undefined,
}: {
  original?: Profile;
  clearScreen?: () => void;
  system?: typeof local;
  updates?: UpdateSession;
}) {
  const { exit } = useApp();
  const compact = useCompact();
  const [step, setStep] = useState<Step>("scan");
  const [found, setFound] = useState<Awaited<ReturnType<typeof discover>>>();
  const [draft, setDraft] = useState<Profile>(
    original ?? {
      name: "",
      host: "",
      tunnel: "",
      reverse: "",
    },
  );
  const [check, setCheck] = useState<Check>();
  const [guideOpen, setGuideOpen] = useState(false);
  const offer = useUpdateOffer(updates);
  const latest =
    !guideOpen && (step === "guide" || step === "add")
      ? offer.latest
      : undefined;
  const [error, setError] = useState("");
  function finish(name?: string) {
    clearScreen?.();
    exit(name);
  }
  function go(next: Step) {
    setError("");
    setStep(next);
  }
  const back =
    original && step !== "scan" && step !== "edit" ? "edit" : previous[step];
  const returnStep = step === "guide" && found?.tunnels.length ? "add" : back;
  useInput(
    (input, key) => {
      if (latest) return;
      if (step === "guide" && input === "r") {
        go("scan");
        return;
      }
      if (
        (step === "guide" && key.return) ||
        (input === "i" && (step === "tunnel" || step === "guide"))
      ) {
        setGuideOpen(true);
        return;
      }
      if (!key.escape || step === "saving") return;
      if (returnStep) go(returnStep);
      else finish();
    },
    { isActive: !guideOpen },
  );
  useEffect(() => {
    if (step !== "scan") return undefined;
    let active = true;
    system
      .discover(original)
      .then((result) => {
        if (!active) return;
        setFound(result);
        if (original) go("edit");
        else go(result.tunnels.length ? "add" : "guide");
      })
      .catch((err: Error) => {
        if (active) exit(err);
      });
    return () => {
      active = false;
    };
  }, [step, exit, system, original]);
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
      setStep(original ? "edit" : "listener");
    });
    return () => controller.abort();
  }, [step, draft, system, original]);
  const submitField = (input: string) => {
    const value = input.trim() || (step === "name" ? draft.host : "");
    if (!token(value)) {
      setError(
        "Use 1–128 letters, digits, dots, dashes or underscores. Start with a letter or digit.",
      );
      return;
    }
    if (
      step === "name" &&
      found?.existing.some((p) => p.name === value && p.name !== original?.name)
    ) {
      setError("That profile name is already in use.");
      return;
    }
    setDraft({ ...draft, [step]: value });
    if (original) go("edit");
    else go(step === "name" ? "reverse" : "listener");
  };
  const confirm = async (action: string) => {
    if (action === "edit") {
      go(original ? "edit" : "name");
      return;
    }
    if (action === "cancel") {
      finish();
      return;
    }
    go("saving");
    try {
      await system.save(draft, original);
      finish(draft.name);
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
  const screen = (
    <ThemeProvider theme={theme}>
      {guideOpen && (
        <GuideViewer
          kind="setup"
          copy={system.copySetupGuide}
          onClose={() => setGuideOpen(false)}
        />
      )}
      <Box
        display={guideOpen ? "none" : "flex"}
        flexDirection="column"
        paddingX={1}
      >
        <Masthead
          title={original ? "EDIT PROFILE" : "LINK SETUP"}
          compact={compact}
        />
        <Box gap={1} marginTop={compact ? 0 : 1}>
          <Sweep key={step} />
          {original && <Text bold>{original.name}</Text>}
          {!original &&
            (compact ? (
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
            ))}
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={palette.line}
          paddingX={1}
        >
          <Text bold>{questions[step]}</Text>
          {step === "edit" && (
            <Select
              key="edit"
              options={[
                { value: "name", label: `Display name   · ${draft.name}` },
                {
                  value: "tunnel",
                  label: `Tunnel         · ${draft.host} / ${draft.tunnel}`,
                },
                {
                  value: "reverse",
                  label: `Return alias   · ${draft.reverse}`,
                },
                {
                  value: "listener",
                  label: `Listener       · ${draft.listener ?? "Managed separately"}`,
                },
                { value: "verify", label: "Review changes" },
                { value: "cancel", label: "Discard and exit" },
              ]}
              visibleOptionCount={6}
              onChange={(value) => {
                if (value === "cancel") finish();
                else go(value as Step);
              }}
            />
          )}
          {step === "scan" && (
            <Busy label="Finding reverse SSH LaunchAgents…" />
          )}
          {step === "add" && (
            <Select
              key="add"
              isDisabled={Boolean(latest)}
              options={[
                { value: "existing", label: "Add an existing tunnel" },
                { value: "new", label: "Set up a new EVA" },
              ]}
              onChange={(value) =>
                go(value === "existing" ? "tunnel" : "guide")
              }
            />
          )}
          {step === "guide" && (
            <>
              {!found?.tunnels.length && <Text>No new tunnels found.</Text>}
              <Text>
                Give the instructions to your setup agent, then scan for the
                tunnel it creates.
              </Text>
              <KeyHint
                shortcut="Enter"
                label="View and copy setup instructions"
              />
              <KeyHint shortcut="r" label="Scan again for new tunnels" />
            </>
          )}
          {empty && (
            <Text>
              No matching tunnel found. Press Esc to return to profile settings.
            </Text>
          )}
          {step === "tunnel" && !empty && found && (
            <Select
              key="tunnel"
              isDisabled={guideOpen}
              options={[...found.tunnels]
                .sort(
                  (a, b) =>
                    Number(b.label === draft.tunnel) -
                    Number(a.label === draft.tunnel),
                )
                .map((t) => ({
                  value: t.label,
                  label: `${t.host}  ·  ${t.label}`,
                }))}
              onChange={(label) => {
                const choice = found.tunnels.find((t) => t.label === label);
                if (!choice) return;
                if (original) {
                  setDraft({
                    ...draft,
                    tunnel: choice.label,
                    host: choice.host,
                  });
                  go("edit");
                } else {
                  if (choice.label !== draft.tunnel)
                    setDraft({
                      tunnel: choice.label,
                      host: choice.host,
                      name: "",
                      reverse: "",
                    });
                  go("name");
                }
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
                go(original ? "edit" : "verify");
              }}
            />
          )}
          {step === "verify" && (
            <Busy label={`Checking NERV → ${draft.host} → ${draft.reverse}…`} />
          )}
          {step === "review" && (
            <>
              <Text bold color={check?.ok ? palette.mint : palette.gold}>
                {check?.ok
                  ? `✓ Route verified · ${check.ms} ms`
                  : "△ Route unavailable · you can still save this profile"}
              </Text>
              <Text>
                {draft.name} · NERV → {draft.host} → {draft.reverse}
              </Text>
              <Text>Tunnel {draft.tunnel}</Text>
              <Text>Listener {draft.listener ?? "Managed separately"}</Text>
              <Select
                key="review"
                options={[
                  {
                    value: "save",
                    label: original ? "Save changes" : "Save profile",
                  },
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
        {step !== "saving" && (
          <Box flexWrap="wrap" columnGap={2}>
            <KeyHint shortcut="Esc" label={returnStep ? "back" : "close"} />
            <KeyHint shortcut="Ctrl+C" label="close setup" />
            {step === "tunnel" && <KeyHint shortcut="i" label="setup guide" />}
            {editable && <KeyHint shortcut="Enter" label="continue" />}
            {!empty &&
              ["add", "edit", "listener", "tunnel", "review"].includes(
                step,
              ) && (
                <>
                  <KeyHint shortcut="↑↓" label="choose" />
                  <KeyHint shortcut="Enter" label="select" />
                </>
              )}
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
  return (
    <UpdateFrame session={updates} latest={latest} dismiss={offer.dismiss}>
      {screen}
    </UpdateFrame>
  );
}
