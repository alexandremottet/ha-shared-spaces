import "ha-share-space-planning-cards";
import "ha-share-space-heating-card";
import "ha-share-space-dashboard";
import { LiveGate, useHassContext } from "../hass-context";
import { MockBar } from "./logic/ClockBar";
import { DashboardSection } from "./dashboard/DashboardSection";

export function DashboardPage() {
  const { controller } = useHassContext();
  const refreshKey = controller ? `${controller.state.currentUserId}|${JSON.stringify(controller.installed)}|${controller.state.persons.length}` : "live";
  return (
    <div className="logic">
      {controller && <MockBar controller={controller} />}
      <LiveGate>{(hass) => <DashboardSection hass={hass} refreshKey={refreshKey} />}</LiveGate>
    </div>
  );
}
