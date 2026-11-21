import { createRoot } from "react-dom/client";
import "ha-share-space-ui";
import "ha-share-space-ui/ha";
import { applyTheme, initialTheme, installStubs } from "./stubs";
import { App } from "./App";
import "./playground.css";

installStubs();
applyTheme(initialTheme());

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
