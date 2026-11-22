import starters from "../../../../integrations/share_space_heating/custom_components/share_space_heating/starters.json";
import type { RuleStrategy } from "./types";

// Test fixture: the integration's seeded shared strategies.
const starter = (id: string) => structuredClone(starters.find((s) => s.id === id)!.rules) as RuleStrategy;
export const officeSaverRules = () => starter("office_saver");
export const lunchRoomRules = () => starter("lunch_room");
