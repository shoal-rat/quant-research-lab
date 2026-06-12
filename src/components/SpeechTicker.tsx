import { t } from "../i18n";
import { useAppStore } from "../store/AppStore";

export function SpeechTicker(): JSX.Element {
  const { bubbles, settings } = useAppStore();
  return (
    <section className="speech-ticker">
      <div className="ticker-track">
        {bubbles.length === 0 ? (
          <span className="quiet-line">{t(settings.language, "quietOffice")}</span>
        ) : (
          bubbles.slice(-7).map((bubble) => (
            <article key={bubble.id} className={`ticker-bubble tone-${bubble.tone}`}>
              <strong>{bubble.speaker}</strong>
              <span>{bubble.message}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
