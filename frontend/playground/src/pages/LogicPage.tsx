import { LiveGate, useHassContext } from "../hass-context";
import { AreaPanels } from "./logic/AreaPanel";
import { ClockBar, MockBar } from "./logic/ClockBar";
import { HeatingSection } from "./logic/HeatingSection";
import { PeopleEditor } from "./logic/PeopleEditor";

export function LogicPage() {
  const { controller } = useHassContext();
  return (
    <div className="logic">
      {controller && (
        <>
          <ClockBar controller={controller} />
          <MockBar controller={controller} />
        </>
      )}
      <LiveGate>
        {(hass) => (
          <>
            <div className="cols">
              <PeopleEditor hass={hass} />
              <AreaPanels hass={hass} controller={controller} />
            </div>
            <HeatingSection hass={hass} controller={controller} />
          </>
        )}
      </LiveGate>
    </div>
  );
}
