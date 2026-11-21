import React, { useEffect, useState, useContext, createContext } from "react";
import { Box, Text as InkText, useStdout, type TextProps } from "ink";
import { defaultTheme, extendTheme, Spinner } from "@inkjs/ui";

export const Muted = createContext(false);
export function ScreenText({ dimColor, ...props }: TextProps) {
  const muted = useContext(Muted);
  // Keep Ink's inline text styles while dimming the screen behind a dialog.
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <InkText {...props} dimColor={muted || dimColor} />;
}
const Text = ScreenText;

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

export function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  }));
  useEffect(() => {
    const resize = () =>
      setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", resize);
    return () => {
      stdout.off("resize", resize);
    };
  }, [stdout]);
  return size;
}

export function useCompact() {
  const { columns, rows } = useTerminalSize();
  return columns < 66 || rows < 19;
}

export function KeyHint({
  shortcut,
  label,
}: {
  shortcut: string;
  label: string;
}) {
  return (
    <Text>
      <Text bold color={palette.gold}>
        [{shortcut}]
      </Text>{" "}
      {label}
    </Text>
  );
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
