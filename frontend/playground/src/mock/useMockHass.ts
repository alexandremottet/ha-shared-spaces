import { useEffect, useMemo, useState } from "react";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import type { MockOptions } from "./types";

export function useMockHass(options?: MockOptions): [HomeAssistant, MockHassController] {
  const controller = useMemo(() => createMockHass(options), []);
  const [hass, setHass] = useState<HomeAssistant>(controller.hass);
  useEffect(() => {
    setHass(controller.hass);
    const unsub = controller.subscribe(setHass);
    return () => {
      unsub();
    };
  }, [controller]);
  return [hass, controller];
}
