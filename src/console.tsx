import React, { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import { defaultTheme, extendTheme, Spinner } from "@inkjs/ui";

const rgb = (hex: string) =>
  process.env.NO_COLOR === undefined ? hex : undefined;
export const palette = {
  flame: rgb("#FF6549"),
  gold: rgb("#FFC46B"),
  mint: rgb("#76E3BA"),
  violet: rgb("#BCABFF"),
  line: rgb("#63768D"),
};
const motion =
  process.env.TERM !== "dumb" &&
  process.env.INK_SCREEN_READER !== "true" &&
  process.env.NO_COLOR === undefined;
export const theme = extendTheme(defaultTheme, {
  components: {
    Select: {
      styles: {
        focusIndicator: () => ({ color: palette.gold }),
        selectedIndicator: () => ({ color: palette.mint }),
        label: ({ isFocused }: { isFocused: boolean }) => ({
          color: isFocused ? palette.gold : undefined,
          bold: isFocused,
        }),
      },
    },
    Spinner: { styles: { frame: () => ({ color: palette.mint }) } },
  },
});

export function useCompact() {
  const { stdout } = useStdout();
  const measure = () => (stdout.columns || 80) < 66 || (stdout.rows || 24) < 19;
  const [compact, setCompact] = useState(measure);
  useEffect(() => {
    const resize = () =>
      setCompact((stdout.columns || 80) < 66 || (stdout.rows || 24) < 19);
    stdout.on("resize", resize);
    return () => {
      stdout.off("resize", resize);
    };
  }, [stdout]);
  return compact;
}

const wordmark = [
  "█▄  █  █▀▀▀  █▀▀█  █   █",
  "█ ▀▄█  █▀▀   █▀█▀   █ █ ",
  "█   █  █▄▄▄  █  █    █  ",
].join("\n");

export function Masthead({
  title,
  compact,
}: {
  title: string;
  compact: boolean;
}) {
  return (
    <Box
      marginTop={1}
      alignItems="center"
      justifyContent="space-between"
      gap={2}
    >
      {compact || process.env.INK_SCREEN_READER === "true" ? (
        <Text bold color={palette.flame}>
          ◢ NERV
        </Text>
      ) : (
        <Text bold color={palette.flame}>
          {wordmark}
        </Text>
      )}
      <Text bold color={palette.gold}>
        {title}
      </Text>
    </Box>
  );
}

// A short sweep marks a screen change. Input stays active throughout.
export function Sweep() {
  const [frame, setFrame] = useState(motion ? 0 : 3);
  useEffect(() => {
    if (frame === 3) return undefined;
    const timer = setTimeout(() => setFrame(frame + 1), 55);
    return () => clearTimeout(timer);
  }, [frame]);
  return (
    <Text color={palette.flame}>{["▰▱▱▱", "▰▰▱▱", "▰▰▰▱", "▰▰▰▰"][frame]}</Text>
  );
}

export function Busy({ label }: { label: string }) {
  return motion ? <Spinner label={label} /> : <Text>{label}</Text>;
}
