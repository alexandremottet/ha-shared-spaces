import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { WEEK_DAYS } from "ha-share-space-types";
import type { Calendar } from "ha-share-space-types";
import type { WeekSchedule } from "../src/week-schedule";
import "../src/index";

function emptyCalendar(): Calendar {
  const calendar = {} as Calendar;
  for (const day of WEEK_DAYS) {
    calendar[day] = [];
  }
  return calendar;
}

function App() {
  const ref = useRef<WeekSchedule>(null);
  const [calendar, setCalendar] = useState<Calendar>(emptyCalendar);

  // Push the calendar into the custom element as a property (not a stringified attribute).
  useEffect(() => {
    if (ref.current) {
      ref.current.calendar = calendar;
    }
  }, [calendar]);

  // Custom events aren't part of React's synthetic event system: subscribe imperatively.
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const onCalendarChanged = (event: Event) => {
      setCalendar((event as CustomEvent<{ calendar: Calendar }>).detail.calendar);
    };
    element.addEventListener("calendar-changed", onCalendarChanged);
    return () => element.removeEventListener("calendar-changed", onCalendarChanged);
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 900 }}>
      <h3>week-schedule inside a React host</h3>
      <week-schedule ref={ref}></week-schedule>
      <pre>{JSON.stringify(calendar, null, 2)}</pre>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}
createRoot(container).render(<App />);
