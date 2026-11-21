import { useEffect, useRef, useState } from "react";
import type { MockHassController } from "../../mock/mock-hass";
import { parseDatetimeLocal, toDatetimeLocal } from "../../mock/planning";
import { fmtTime } from "./hooks";

const SPEEDS = [1, 60, 600];

export function ClockBar({ controller }: { controller: MockHassController }) {
  const { clock } = controller;
  const [, setTick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => clock.subscribe(() => setTick((t) => t + 1)), [clock]);
  const now = clock.now();
  const next = controller.nextEventTime();
  if (input.current && document.activeElement !== input.current) {
    input.current.value = toDatetimeLocal(now, clock.timeZone);
  }
  return (
    <div className="panel clockbar">
      <strong>Clock</strong>
      <span className="now">{fmtTime(now, clock.timeZone)}</span>
      <input
        ref={input}
        type="datetime-local"
        defaultValue={toDatetimeLocal(now, clock.timeZone)}
        onChange={(e) => {
          const t = parseDatetimeLocal(e.target.value, clock.timeZone);
          if (t !== null) clock.set(t);
        }}
      />
      <button onClick={() => (clock.playing ? clock.pause() : clock.play())}>{clock.playing ? "Pause" : "Play"}</button>
      {SPEEDS.map((s) => (
        <button key={s} className={clock.speed === s ? "on" : ""} onClick={() => clock.setSpeed(s)}>
          {s}x
        </button>
      ))}
      <button onClick={() => clock.advance(30 * 60000)}>+30m</button>
      <button onClick={() => clock.advance(3 * 3600000)}>+3h</button>
      <button onClick={() => controller.jumpToNextEvent()} disabled={next === null}>
        Jump to next change
      </button>
      <span className="muted">{next ? `next: ${fmtTime(next, clock.timeZone)}` : "no upcoming change"}</span>
    </div>
  );
}

export function MockBar({ controller }: { controller: MockHassController }) {
  const { state, installed } = controller;
  return (
    <div className="panel row">
      <strong>Mock</strong>
      <label className="row">
        User
        <select value={state.currentUserId} onChange={(e) => controller.setUser(e.target.value)}>
          {state.persons.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name}
              {p.isAdmin ? " (admin)" : ""}
            </option>
          ))}
        </select>
      </label>
      {(["planning", "heating", "space"] as const).map((b) => (
        <label key={b} className="row">
          <input type="checkbox" checked={installed[b]} onChange={(e) => controller.setInstalled({ [b]: e.target.checked })} />
          {b} installed
        </label>
      ))}
      <button onClick={() => controller.reset()}>Reset data</button>
    </div>
  );
}
