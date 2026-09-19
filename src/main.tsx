import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
const path = window.location.pathname.replace(/\/+$/, "");
const root = document.getElementById("root")!;
// Only the production build contains matching prerendered application HTML.
if (import.meta.env.DEV) createRoot(root).render(<App path={path} />);
else hydrateRoot(root, <App path={path} />);
