import { useEffect, useRef, useState } from "react";
import "ha-share-space-space-panel";
import "ha-share-space-planning-cards";
import "ha-share-space-heating-card";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { LiveGate, useHassContext } from "../hass-context";
import { Toolbar, VIEWPORTS } from "./panel/Toolbar";
import type { Viewport } from "./panel/Toolbar";
import "./panel/panel.css";

type PanelEl = HTMLElement & { hass?: HomeAssistant; narrow?: boolean; route?: unknown; panel?: unknown };

function PanelMount({ hass, narrow }: { hass: HomeAssistant; narrow: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const el = useRef<PanelEl | null>(null);

  useEffect(() => {
    const panel = document.createElement("share-space-space") as PanelEl;
    panel.route = { prefix: "/share-space", path: "" };
    panel.panel = { config: {} };
    panel.narrow = narrow;
    panel.hass = hass;
    el.current = panel;
    box.current?.appendChild(panel);
    return () => panel.remove();
  }, []);

  useEffect(() => {
    if (el.current) el.current.hass = hass;
  }, [hass]);
  useEffect(() => {
    if (el.current) el.current.narrow = narrow;
  }, [narrow]);

  return <div ref={box} style={{ display: "contents" }} />;
}

const hasEditParam = () => new URLSearchParams(location.search).get("edit") === "1";

function setEditParam(on: boolean) {
  const url = new URL(location.href);
  if (on) url.searchParams.set("edit", "1");
  else url.searchParams.delete("edit");
  history.replaceState(null, "", url);
}

function PanelView() {
  const { hass, controller } = useHassContext();
  const [edit, setEditState] = useState(hasEditParam);
  const [narrow, setNarrow] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("full");
  const [mountKey, setMountKey] = useState(0);

  const setEdit = (v: boolean) => {
    setEditParam(v);
    setEditState(v);
    setMountKey((k) => k + 1);
  };

  useEffect(() => {
    const onLocation = () => {
      if (location.pathname === "/") {
        setEditParam(false);
        location.hash = "#/logic";
      }
    };
    window.addEventListener("location-changed", onLocation);
    return () => {
      window.removeEventListener("location-changed", onLocation);
      setEditParam(false);
    };
  }, []);

  useEffect(() => {
    setMountKey((k) => k + 1);
  }, [controller?.state.currentUserId]);

  useEffect(() => {
    const size = VIEWPORTS[viewport].size;
    setNarrow(!!size && size[0] < 700);
  }, [viewport]);

  if (!hass) return null;
  const size = VIEWPORTS[viewport].size;
  const mount = <PanelMount key={mountKey} hass={hass} narrow={narrow} />;
  return (
    <>
      <Toolbar controller={controller} edit={edit} setEdit={setEdit} narrow={narrow} setNarrow={setNarrow} viewport={viewport} setViewport={setViewport} />
      {size ? (
        <div className="panel-backdrop">
          <div className="panel-frame" style={{ width: size[0], height: Math.min(size[1], window.innerHeight - 80) }}>
            {mount}
          </div>
        </div>
      ) : (
        <div className="panel-full">{mount}</div>
      )}
    </>
  );
}

export function PanelPage() {
  return <LiveGate>{() => <PanelView />}</LiveGate>;
}
