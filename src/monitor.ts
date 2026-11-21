import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  job,
  counters,
  probe,
  rates,
  type Counter,
  type Check,
  type Job,
} from "./service.js";
import type { Profile } from "./config.js";

const exec = promisify(execFile);
export interface Frame {
  phase: string;
  process: Job;
  uptime?: string;
  count?: Counter;
  speed?: ReturnType<typeof rates>;
  rx: number[];
  tx: number[];
  check?: Check;
  events: string[];
}
export function initial(): Frame {
  return {
    phase: "Checking",
    process: { state: "unknown" },
    rx: [],
    tx: [],
    events: [],
  };
}
export function watch(p: Profile, update: (frame: Frame) => void) {
  const controller = new AbortController();
  let state = initial();
  let lastPid: number | undefined;
  let nextCheck = 0;
  let generation = 0;
  let alive = true;
  let busy = false;
  let pending: number | undefined;
  function emit(changes: Partial<Frame>) {
    if (!alive) return;
    const prior = state.phase;
    state = { ...state, ...changes };
    if (state.phase !== prior) {
      state.events = [
        `${new Date().toLocaleTimeString()}   ${state.phase}`,
        ...state.events,
      ].slice(0, 3);
    }
    update(state);
  }
  async function sample() {
    if (busy || !alive) return;
    busy = true;
    try {
      const service = await job(p.tunnel);
      if (service.pid !== lastPid) {
        generation += 1;
        lastPid = service.pid;
        nextCheck = 0;
        emit({
          phase: "Checking",
          check: undefined,
          count: undefined,
          speed: undefined,
          uptime: undefined,
          rx: [],
          tx: [],
        });
      }
      if (!service.pid) {
        emit({
          phase: service.state === "off" ? "Stopped" : "Reconnecting",
          process: service,
        });
        return;
      }
      const id = generation;
      if (Date.now() >= nextCheck && pending !== id) {
        pending = id;
        nextCheck = Date.now() + 15000;
        void probe(p, controller.signal)
          .then((check) => {
            if (id === generation)
              emit({
                check,
                phase: check.ok ? "Connected" : "Route unavailable",
              });
          })
          .finally(() => {
            if (pending === id) pending = undefined;
          });
      }
      const [count, age] = await Promise.all([
        counters(service.pid),
        exec("/bin/ps", ["-p", String(service.pid), "-o", "etime="], {
          timeout: 2000,
        }).catch(() => ({ stdout: "" })),
      ]);
      const speed = rates(state.count, count);
      emit({
        process: service,
        count,
        speed,
        uptime: age.stdout.trim(),
        rx: speed ? [...state.rx, speed.rx].slice(-20) : [],
        tx: speed ? [...state.tx, speed.tx].slice(-20) : [],
      });
    } catch {
      generation += 1;
      lastPid = undefined;
      emit({
        ...initial(),
        phase: "Service unavailable",
        events: state.events,
      });
    } finally {
      busy = false;
    }
  }
  void sample();
  const timer = setInterval(sample, 1000);
  return () => {
    alive = false;
    controller.abort();
    clearInterval(timer);
  };
}
