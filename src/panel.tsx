import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { initial, watch, type Frame } from "./monitor.js";
import { control } from "./service.js";
import type { Profile } from "./config.js";

import { Masthead, palette, Sweep, Busy, useCompact } from "./console.js";

function formatBytes(n?: number) {
  if (n === undefined) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
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
  const connected = f.phase === "Connected";
  return (
    <Box flexDirection="column" paddingX={1}>
      <Masthead
        compact={compact}
        title={demo ? "SIMULATION" : "LINK MONITOR"}
      />
      <Box gap={1} marginTop={compact ? 0 : 1}>
        <Sweep key={names[index]} />
        <Text bold>{names[index]}</Text>
        <Text color={connected ? palette.mint : palette.gold}>
          {connected ? "●" : "◇"} {f.phase}
        </Text>
      </Box>
      {names.length > 1 && (
        <Box columnGap={2} flexWrap="wrap">
          {names.map((name, i) => (
            <Text
              key={name}
              color={i === index ? palette.gold : palette.line}
              bold={i === index}
            >
              {i === index ? "▸" : "·"} {name}{" "}
              <Text
                color={
                  frames[i]?.phase === "Connected" ? palette.mint : palette.gold
                }
              >
                {frames[i]?.phase === "Connected" ? "●" : "◇"}
              </Text>
            </Text>
          ))}
        </Box>
      )}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={palette.line}
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text bold color={palette.gold}>
            TRAFFIC
          </Text>
          <Text dimColor>rate / total</Text>
        </Box>
        {(["rx", "tx"] as const).map((k) => (
          <Text key={k}>
            <Text bold color={k === "rx" ? palette.mint : palette.violet}>
              {k === "rx" ? "↓ RX  " : "↑ TX  "}
            </Text>
            <Text bold>
              {`${formatBytes(f.speed?.[k])}/s`.padEnd(compact ? 12 : 15)}
            </Text>
            {!compact && (
              <Text color={k === "rx" ? palette.mint : palette.violet}>
                {spark(f[k]).padEnd(22)}
              </Text>
            )}
            {formatBytes(f.count?.[k])}
          </Text>
        ))}
      </Box>
      <Box
        flexDirection="column"
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        borderRight={false}
        borderColor={palette.violet}
      >
        <Text>
          <Text bold>SSH check </Text>
          {f.check
            ? `${f.check.ok ? `${f.check.ms} ms` : "failed"}  ·  ${new Date(f.check.at).toLocaleTimeString()}`
            : "—"}
        </Text>
        <Text dimColor>
          Uptime {f.uptime || "—"} · PID {f.process.pid ?? "—"}
        </Text>
        {f.events.length > 0 && (
          <Text dimColor>{f.events.slice(0, compact ? 1 : 3).join("\n")}</Text>
        )}
      </Box>
      {message &&
        (message.endsWith("…") ? (
          <Busy label={message} />
        ) : (
          <Text color={palette.flame}>{message}</Text>
        ))}
      <Box marginTop={compact ? 0 : 1}>
        <Text color={palette.gold}>
          {demo
            ? "↑↓ select    q quit"
            : "↑↓ select   e edit   s start   r restart   x stop   q quit"}
        </Text>
      </Box>
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
  initialIndex = 0,
}: {
  profiles: Profile[];
  demo: boolean;
  initialIndex?: number;
}) {
  const names = demo ? ["EVA-A", "EVA-B"] : profiles.map((p) => p.name);
  const [frames, setFrames] = useState<Frame[]>(() =>
    names.map((_, i) => (demo ? demoFrame(i) : initial())),
  );
  const [index, select] = useState(initialIndex);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const { exit } = useApp();
  const compact = useCompact();
  useEffect(() => {
    if (demo) return undefined;
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
    if (key === "e" && !demo) {
      exit(profiles[index].name);
      return;
    }
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
      setMessage(`${action}…`);
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
      compact={compact}
      message={message}
      demo={demo}
    />
  );
}
