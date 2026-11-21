import { act } from "react";
import { setImmediate as nextTurn } from "node:timers/promises";

export default async function interact<T>(action: () => T) {
  const env = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previous = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    let result!: T;
    await act(async () => {
      result = action();
      // Ink flushes a standalone Escape on the next turn of the event loop.
      await nextTurn();
    });
    return result;
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}
