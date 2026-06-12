import { Crown, Send } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/AppStore";

// The boss speaks; the office reacts and the next hypothesis is steered.
export function BossBar(): JSX.Element {
  const { sendBossDirective, bossEvents } = useAppStore();
  const [text, setText] = useState("");
  const lastDirective = [...bossEvents].reverse().find((event) => event.kind === "directive");

  const submit = () => {
    if (!text.trim()) return;
    sendBossDirective(text);
    setText("");
  };

  return (
    <div className="boss-bar">
      <span className="boss-bar-badge">
        <Crown size={15} />
        BOSS
      </span>
      <input
        value={text}
        placeholder={
          lastDirective?.text
            ? `Last order: ${lastDirective.text.slice(0, 60)}`
            : "Give the desk a directive… e.g. \"try momentum with 5-day holds\" / \"被新闻情绪坑过了，换条路\""
        }
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        aria-label="Boss directive"
      />
      <button className="primary-button compact" onClick={submit} aria-label="Send directive">
        <Send size={15} />
      </button>
    </div>
  );
}
