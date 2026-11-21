import { useEffect, useRef, useState } from "react";
import type { Calendar } from "ha-share-space-ui";
import { WEEK_DAYS } from "ha-share-space-ui";
import type { WeekSchedule } from "ha-share-space-ui";
import { assignPersonArea, findMyPerson, getCalendar, getPersonArea, isBackendMissing, setCalendar } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { describeError, usePlanningTick } from "./hooks";

const fullCalendar = (c: Partial<Calendar>): Calendar => {
  const out = {} as Calendar;
  for (const d of WEEK_DAYS) out[d] = c[d] ?? [];
  return out;
};

export function PeopleEditor({ hass }: { hass: HomeAssistant }) {
  const persons = Object.values(hass.states).filter((e) => e.entity_id.startsWith("person."));
  const me = findMyPerson(hass)?.entity_id;
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected && persons.some((p) => p.entity_id === selected) ? selected : (me ?? persons[0]?.entity_id ?? null);
  const tick = usePlanningTick();
  const [areas, setAreas] = useState<Record<string, string | null>>({});
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [calendar, setLocalCalendar] = useState<Calendar | null>(null);
  const el = useRef<WeekSchedule>(null);
  const hassRef = useRef(hass);
  hassRef.current = hass;
  const personKey = persons.map((p) => p.entity_id).join(",");

  useEffect(() => {
    let live = true;
    Promise.all(persons.map(async (p) => [p.entity_id, await getPersonArea(hassRef.current, p.entity_id)] as const)).then(
      (rows) => {
        if (live) {
          setAreas(Object.fromEntries(rows));
          setMissing(false);
        }
      },
      (err) => live && setMissing(isBackendMissing(err)),
    );
    return () => {
      live = false;
    };
  }, [personKey, tick]);

  useEffect(() => {
    if (!current) return;
    let live = true;
    setLocalCalendar(null);
    getCalendar(hassRef.current, current).then(
      (c) => live && setLocalCalendar(fullCalendar(c)),
      () => live && setLocalCalendar(fullCalendar({})),
    );
    return () => {
      live = false;
    };
  }, [current]);

  useEffect(() => {
    if (el.current && calendar) el.current.calendar = calendar;
  }, [calendar]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ calendar: Calendar }>).detail.calendar;
      setLocalCalendar(next);
      setError("");
      if (current) setCalendar(hassRef.current, current, next).catch((err) => setError(describeError(err)));
    };
    node.addEventListener("calendar-changed", onChange);
    return () => node.removeEventListener("calendar-changed", onChange);
  }, [current, calendar === null]);

  if (missing) {
    return <div className="panel notice">Share Space (planning) is not installed: WS commands unavailable.</div>;
  }
  const areaIds = Object.keys(hass.areas ?? {});
  return (
    <div className="panel stack">
      <h3>People</h3>
      <div>
        {persons.map((p) => (
          <div key={p.entity_id} className={`person ${p.entity_id === current ? "sel" : ""}`}>
            <span className="name" onClick={() => setSelected(p.entity_id)}>
              {String(p.attributes.friendly_name ?? p.entity_id)}
              {p.entity_id === me ? " (me)" : ""}
            </span>
            <select
              value={areas[p.entity_id] ?? ""}
              onChange={(e) => {
                if (e.target.value) assignPersonArea(hass, p.entity_id, e.target.value).catch((err) => setError(describeError(err)));
              }}
            >
              <option value="">unassigned</option>
              {areaIds.map((id) => (
                <option key={id} value={id}>
                  {hass.areas?.[id]?.name ?? id}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <h4>Week of {current ? String(hass.states[current]?.attributes.friendly_name ?? current) : "-"}</h4>
      {error && <div className="notice error">{error}</div>}
      <week-schedule ref={el}></week-schedule>
    </div>
  );
}
