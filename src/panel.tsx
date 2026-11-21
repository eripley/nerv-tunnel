import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { initial, watch, type Frame } from "./monitor.js";
import { control } from "./service.js";
import type { Profile } from "./config.js";

const color = (hex: string) =>
  process.env.NO_COLOR !== undefined ? undefined : hex;
const mint = color("#79dbad"),
  amber = color("#ffaf62"),
  red = color("#ef768a");
function formatBytes(n?: number) {
  if (n === undefined) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(i ? 1 : 0) + " " + units[i];
}
function spark(values: number[]) {
  const max = Math.max(1, ...values);
  return values
    .map((v) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor((v / max) * 7))])
    .join("");
}
export function View({
  names,
  frames,
  index,
  compact,
  message,
  demo = false,
}: {
  names: string[];
  frames: Frame[];
  index: number;
  compact: boolean;
  message: string;
  demo?: boolean;
}) {
  const f = frames[index] ?? initial();
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={amber}>
        NERV <Text dimColor>{demo ? "SIMULATION" : "LINK MONITOR"}</Text>
      </Text>
      <Box flexDirection="column" marginY={1}>
        {names.map((name, i) => (
          <Text key={name} bold={i === index}>
            {i === index ? "› " : "  "}
            {name}{" "}
            <Text color={frames[i]?.phase === "Connected" ? mint : amber}>
              {frames[i]?.phase ?? "Checking"}
            </Text>
          </Text>
        ))}
      </Box>
      <Text>
        Uptime {f.uptime || "—"} PID {f.process.pid ?? "—"}
      </Text>
      {(["rx", "tx"] as const).map((k) => (
        <Text key={k}>
          {k === "rx" ? "Receive    " : "Send       "}
          {(formatBytes(f.speed?.[k]) + "/s").padEnd(14)}
          <Text color={k === "rx" ? mint : amber}>
            {compact ? "" : spark(f[k]).padEnd(22)}
          </Text>
          {formatBytes(f.count?.[k])}
        </Text>
      ))}
      <Text>
        SSH check{" "}
        {f.check
          ? (f.check.ok ? f.check.ms + " ms" : "failed") +
            "   " +
            new Date(f.check.at).toLocaleTimeString()
          : "—"}
      </Text>
      <Box flexDirection="column" marginY={1}>
        {f.events.map((e, i) => (
          <Text dimColor key={i}>
            {e}
          </Text>
        ))}
      </Box>
      {message && <Text color={red}>{message}</Text>}
      <Text dimColor>
        {demo
          ? "↑/↓ select   q quit"
          : "↑/↓ select   s start   r restart   x stop   q quit"}
      </Text>
    </Box>
  );
}
export function demoFrame(i: number): Frame {
  return {
    ...initial(),
    phase: "Connected",
    process: { state: "running", pid: 200 + i },
    uptime: "01:42:18",
    check: { ok: true, ms: 328 + i * 46, at: Date.now() },
    count: { pid: 200 + i, rx: 48729300, tx: 8402332, time: 0 },
    speed: { rx: 18450, tx: 2180 },
    rx: [0, 2, 1, 4, 6, 2, 5, 3, 1, 8, 5],
    tx: [0, 1, 1, 2, 0, 1, 4, 3, 2, 4, 1],
    events: ["Link verified"],
  };
}
export function Panel({
  profiles,
  demo,
}: {
  profiles: Profile[];
  demo: boolean;
}) {
  const names = demo ? ["EVA-A", "EVA-B"] : profiles.map((p) => p.name);
  const [frames, setFrames] = useState<Frame[]>(() =>
    names.map((_, i) => (demo ? demoFrame(i) : initial())),
  );
  const [index, select] = useState(0),
    [message, setMessage] = useState("");
  const busy = useRef(false);
  const { exit } = useApp(),
    { stdout } = useStdout();
  useEffect(() => {
    if (demo) return;
    const stops = profiles.map((p, i) =>
      watch(p, (f) => setFrames((old) => old.map((v, n) => (n === i ? f : v)))),
    );
    return () => stops.forEach((stop) => stop());
  }, [profiles, demo]);
  useInput((key, k) => {
    if (key === "q" || k.escape) {
      exit();
      return;
    }
    if (busy.current) return;
    if (k.upArrow || k.downArrow) {
      select((index + (k.upArrow ? -1 : 1) + names.length) % names.length);
      setMessage("");
      return;
    }
    const action = ({ s: "start", r: "restart", x: "stop" } as const)[
      key as "s" | "r" | "x"
    ];
    if (!demo && action) {
      busy.current = true;
      setMessage(action + "…");
      void control(profiles[index], action)
        .then(() => setMessage(""))
        .catch((e: Error) => setMessage(e.message))
        .finally(() => {
          busy.current = false;
        });
    }
  });
  return (
    <View
      names={names}
      frames={frames}
      index={index}
      compact={(stdout.columns ?? 80) < 66}
      message={message}
      demo={demo}
    />
  );
}
