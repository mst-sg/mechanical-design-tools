import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
const path = window.location.pathname.replace(/\/+$/, "");
hydrateRoot(document.getElementById("root")!, <App path={path} />);
