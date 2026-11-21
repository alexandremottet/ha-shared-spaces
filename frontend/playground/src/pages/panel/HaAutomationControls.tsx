import { useState } from "react";
import type { MockHassController } from "../../mock/mock-hass";

// Dev-only: simulate changes made to a Share Space automation in HA's own editor.
export function HaAutomationControls({ controller }: { controller: MockHassController }) {
  const autos = controller.automations().filter((a) => /_rules(_\d+)?$/.test(a.id));
  const [picked, setPicked] = useState("");
  if (autos.length === 0) return null;
  const id = autos.some((a) => a.id === picked) ? picked : autos[autos.length - 1].id;
  const cur = autos.find((a) => a.id === id);
  return (
    <label title={cur ? `${cur.description || "(no description)"} · ${cur.blueprint ?? "no blueprint"}` : ""}>
      HA
      <select value={id} onChange={(e) => setPicked(e.target.value)}>
        {autos.map((a) => (
          <option key={a.id} value={a.id}>
            {a.id}
            {a.enabled ? "" : " (off)"}
          </option>
        ))}
      </select>
      <button onClick={() => controller.simulateAutomationEdit(id)}>Edit automation in HA</button>
      <button disabled={!cur?.blueprint} onClick={() => controller.simulateTakeControl(id)}>
        Take control in HA
      </button>
    </label>
  );
}
