import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./screens/screens.css";

const style = document.createElement("style");
style.textContent = ".app { position: fixed; inset: 0; overflow: hidden; }";
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
