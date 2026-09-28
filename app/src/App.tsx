import { AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { CommandBar, MeetingBoard, OfflineBanner, Roster, TopBar } from "./hud/Hud";
import { api, connect } from "./lib/api";
import { sfx } from "./lib/sfx";
import { useStore } from "./lib/store";
import { Collection } from "./screens/Collection";
import { Fund } from "./screens/Fund";
import { Log, Profile, Settings, Theory, TitleScreen } from "./screens/Pages";
import { Tearsheet } from "./screens/Tearsheet";
import { Diorama } from "./stage/Diorama";
import { director } from "./story/director";
import { CutIn, DialogueBox, GachaReveal, RevealCard, TitleCard, VNLayer } from "./story/Story";

export default function App() {
  const entered = useStore((s) => s.entered);
  const tab = useStore((s) => s.tab);
  const shake = useStore((s) => s.shake);
  const cinema = useStore((s) => !!(s.vn || s.cutin || s.reveal || s.gacha || s.titleCard));
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = connect((e) => director.push(e), (up) => {
      useStore.getState().set({ conn: up });
      if (up) api.get("/api/status").then((s) => useStore.getState().set({ status: s })).catch(() => {});
    });
    return off;
  }, []);

  useEffect(() => {
    if (!shake || !root.current) return;
    root.current.classList.remove("shake");
    void root.current.offsetWidth;
    root.current.classList.add("shake");
  }, [shake]);

  return (
    <div className={`app ${cinema ? "cinema" : ""}`} ref={root}>
      <Diorama />
      <VNLayer />
      <TitleCard />
      <RevealCard />
      <CutIn />
      <GachaReveal />
      <TopBar />
      <Roster />
      <MeetingBoard />
      <DialogueBox />
      <CommandBar />
      <OfflineBanner />
      <AnimatePresence>
        {tab === "dex" && <Collection key="dex" />}
        {tab === "fund" && <Fund key="fund" />}
        {tab === "log" && <Log key="log" />}
        {tab === "theory" && <Theory key="theory" />}
        {tab === "settings" && <Settings key="settings" />}
      </AnimatePresence>
      <Tearsheet />
      <Profile />
      <AnimatePresence>
        {!entered && <TitleScreen key="title" onEnter={() => { sfx.unlock(); sfx.sparkle(); useStore.getState().set({ entered: true }); }} />}
      </AnimatePresence>
    </div>
  );
}
