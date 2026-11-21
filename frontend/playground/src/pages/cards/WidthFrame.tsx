import { useState, type ReactNode } from "react";
import "./cards.css";

const WIDTHS = [
  { label: "Narrow 300px", value: "300px" },
  { label: "Medium 500px", value: "500px" },
  { label: "Full", value: "100%" },
];

// Panel with width buttons; children render inside a frame of the chosen width.
export function WidthFrame({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const [width, setWidth] = useState("500px");
  return (
    <div className="panel card-stage">
      {header}
      <div className="row">
        {WIDTHS.map((w) => (
          <button key={w.value} className={w.value === width ? "on" : ""} onClick={() => setWidth(w.value)}>
            {w.label}
          </button>
        ))}
      </div>
      <div className="card-frame" data-full={width === "100%" || undefined} style={{ width }}>
        {children}
      </div>
      {footer}
    </div>
  );
}
