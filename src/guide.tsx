import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import chalk from "chalk";
import wrapAnsi from "wrap-ansi";
import {
  copied,
  copySetupGuide,
  evaCopied,
  copyEvaInstructions,
  evaInstructions,
  setupGuide,
} from "./agent.js";
import { KeyHint, palette, useTerminalSize } from "./console.js";

const guides = {
  setup: {
    title: "Tunnel setup guide",
    read: setupGuide,
    copy: copySetupGuide,
    success: copied,
  },
  eva: {
    title: "EVA agent instructions",
    read: evaInstructions,
    copy: copyEvaInstructions,
    success: evaCopied,
  },
};

export type GuideKind = keyof typeof guides;

function documentLines(markdown: string, width: number) {
  const heading = palette.gold ? chalk.hex(palette.gold).bold : String;
  const code = palette.mint ? chalk.hex(palette.mint) : String;
  let fenced = false;
  return markdown
    .trimEnd()
    .split("\n")
    .flatMap((line) => {
      if (line.trimStart().startsWith("```")) {
        fenced = !fenced;
        return [];
      }
      let styled = line;
      if (fenced) styled = code(line);
      else if (line.startsWith("#")) styled = heading(line.replace(/^#+ /, ""));
      else
        styled = line.replace(
          /`([^`]+)`|\*\*(.+?)\*\*/g,
          (_match, inline: string | undefined, bold: string) =>
            inline === undefined ? chalk.bold(bold) : code(inline),
        );
      return wrapAnsi(styled, width, { hard: true, trim: !fenced }).split("\n");
    });
}

export default function GuideViewer({
  kind,
  copy = guides[kind].copy,
  onClose = undefined,
}: {
  kind: GuideKind;
  copy?: () => void;
  onClose?: () => void;
}) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const guide = guides[kind];
  const width = Math.max(1, columns - 4);
  const markdown = useMemo(() => guide.read(), [guide]);
  const lines = useMemo(
    () => documentLines(markdown, width),
    [markdown, width],
  );
  const [status, setStatus] = useState({ ok: false, text: "" });
  const [offset, setOffset] = useState(0);
  const copyText = useCallback(() => {
    try {
      copy();
      setStatus({ ok: true, text: guide.success });
    } catch (error) {
      setStatus({ ok: false, text: (error as Error).message });
    }
  }, [copy, guide]);
  useEffect(copyText, [copyText]);
  const hints = [
    ["↑↓", "scroll"],
    ["PgUp/PgDn", "page"],
    ["c", "copy"],
    ["Esc", onClose ? "back" : "close"],
  ];
  const footer = hints.map(([key, label]) => `[${key}] ${label}`).join("  ");
  const heightOf = (line: string) =>
    wrapAnsi(line, width, { hard: true }).split("\n").length;
  const page = Math.max(
    1,
    rows - 3 - heightOf(guide.title) - heightOf(status.text) - heightOf(footer),
  );
  const last = Math.max(0, lines.length - page);
  const first = Math.min(offset, last);
  useInput((input, key) => {
    if (key.escape) {
      if (onClose) onClose();
      else exit();
    } else if (input === "c") copyText();
    else if (key.upArrow || key.pageUp)
      setOffset(Math.max(0, first - (key.pageUp ? page : 1)));
    else if (key.downArrow || key.pageDown)
      setOffset(Math.min(last, first + (key.pageDown ? page : 1)));
  });
  return (
    <Box
      flexDirection="column"
      width={columns}
      borderStyle="round"
      borderColor={palette.violet}
      paddingX={1}
    >
      <Text bold color={palette.gold}>
        {guide.title}
      </Text>
      <Text>{lines.slice(first, first + page).join("\n")}</Text>
      <Text dimColor>
        {first + 1}–{Math.min(lines.length, first + page)} / {lines.length}
      </Text>
      <Text color={status.ok ? palette.mint : palette.flame}>
        {status.text}
      </Text>
      <Text>
        {hints.map(([shortcut, label], i) => (
          <Text key={shortcut}>
            {i > 0 && "  "}
            <KeyHint shortcut={shortcut} label={label} />
          </Text>
        ))}
      </Text>
    </Box>
  );
}
