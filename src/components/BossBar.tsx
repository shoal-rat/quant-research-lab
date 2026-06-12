import { Crown, Send } from "lucide-react";
import { useState } from "react";
import { t } from "../i18n";
import { useAppStore } from "../store/AppStore";

// The boss speaks; the office reacts and the next hypothesis is steered.
export function BossBar(): JSX.Element {
  const { sendBossDirective, bossEvents, settings } = useAppStore();
  const lang = settings.language;
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
            ? `${t(lang, "bossLastOrder")}${lastDirective.text.slice(0, 60)}`
            : t(lang, "bossPlaceholder")
        }
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        aria-label="Boss directive"
      />
      <button className="primary-button compact" onClick={submit} aria-label={t(lang, "bossSend")}>
        <Send size={15} />
      </button>
    </div>
  );
}
