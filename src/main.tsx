import React from "react";
import ReactDOM from "react-dom/client";
import { AppStoreProvider } from "./store/AppStore";
import { App } from "./App";
import "./styles.css";
import "./gameStyles.css";

// Desktop-wallpaper host hooks. Lively Wallpaper and Wallpaper Engine call
// these to pause the wallpaper when a fullscreen app is in front; registered
// before React mounts so early host events are not missed.
declare global {
  interface Window {
    livelyWallpaperPlaybackChanged?: (data: { IsPaused: boolean }) => void;
    livelyPropertyListener?: (name: string, value: unknown) => void;
    wallpaperPropertyListener?: { setPaused?: (paused: boolean) => void };
    __qrlWallpaperPaused?: boolean;
  }
}

function setWallpaperPaused(paused: boolean): void {
  window.__qrlWallpaperPaused = paused;
  window.dispatchEvent(new CustomEvent("qrl-wallpaper-paused", { detail: paused }));
}

window.livelyWallpaperPlaybackChanged = (data) => setWallpaperPaused(Boolean(data?.IsPaused));
window.livelyPropertyListener = () => undefined;
window.wallpaperPropertyListener = { setPaused: (paused) => setWallpaperPaused(paused) };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);
