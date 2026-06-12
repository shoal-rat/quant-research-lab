import { useAppStore } from "../store/AppStore";
import { HoldingPeriod, Settings } from "../types";

export function SettingsPage(): JSX.Element {
  const { settings, updateSettings } = useAppStore();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => updateSettings({ [key]: value } as Partial<Settings>);

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <small>Research configuration</small>
          <h1>Settings</h1>
          <p>Configure the local autonomous research simulation and UI behavior.</p>
        </div>
      </div>

      <section className="page-card settings-card">
        <div className="form-grid">
          <label className="field">
            <span>Data source / 数据源</span>
            <select value={settings.dataSource} onChange={(event) => set("dataSource", event.target.value as Settings["dataSource"])}>
              <option value="real">Real market data (20y dailies, bundled)</option>
              <option value="mock">Deterministic mock simulator</option>
            </select>
          </label>
          <label className="field">
            <span>Research brain</span>
            <select value={settings.researchBrain} onChange={(event) => set("researchBrain", event.target.value as Settings["researchBrain"])}>
              <option value="local">Local engine (bandit + knowledge base)</option>
              <option value="claude-code">Claude Code CLI (via bridge)</option>
              <option value="codex">Codex CLI (via bridge)</option>
            </select>
          </label>
          <label className="field">
            <span>Language / 语言</span>
            <select value={settings.language} onChange={(event) => set("language", event.target.value as Settings["language"])}>
              <option value="en">English</option>
              <option value="zh">中文（界面 + 角色对话）</option>
            </select>
          </label>
          <label className="field full">
            <span>Research task name</span>
            <input value={settings.researchTaskName} onChange={(event) => set("researchTaskName", event.target.value)} />
          </label>
          <label className="field full">
            <span>Stock universe</span>
            <input value={settings.stockUniverse} onChange={(event) => set("stockUniverse", event.target.value)} />
          </label>
          <label className="field">
            <span>Start date</span>
            <input type="date" value={settings.startDate} onChange={(event) => set("startDate", event.target.value)} />
          </label>
          <label className="field">
            <span>End date</span>
            <input type="date" value={settings.endDate} onChange={(event) => set("endDate", event.target.value)} />
          </label>
          <label className="field">
            <span>Holding period</span>
            <select
              value={settings.holdingPeriod}
              onChange={(event) => set("holdingPeriod", Number(event.target.value) as HoldingPeriod)}
            >
              <option value={1}>One day</option>
              <option value={3}>Three days</option>
              <option value={5}>Five days</option>
              <option value={20}>Twenty days</option>
            </select>
          </label>
          <label className="field">
            <span>Transaction cost, bps</span>
            <input
              type="number"
              min={0}
              max={150}
              value={settings.transactionCostBps}
              onChange={(event) => set("transactionCostBps", Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Maximum loop count</span>
            <input
              type="number"
              min={1}
              max={99}
              value={settings.maximumLoopCount}
              onChange={(event) => set("maximumLoopCount", Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Experiments per loop</span>
            <input
              type="number"
              min={1}
              max={5}
              value={settings.experimentsPerLoop}
              onChange={(event) => set("experimentsPerLoop", Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Theme mode</span>
            <select value={settings.themeMode} onChange={(event) => set("themeMode", event.target.value as Settings["themeMode"])}>
              <option value="warm">Warm office</option>
              <option value="light">Light lab</option>
              <option value="dark">Night lab</option>
            </select>
          </label>
          <label className="field">
            <span>Office view mode</span>
            <select
              value={settings.officeViewMode}
              onChange={(event) => set("officeViewMode", event.target.value as Settings["officeViewMode"])}
            >
              <option value="2d">2D Office</option>
              <option value="legacy3d">Legacy 3D Office</option>
            </select>
          </label>
        </div>

        <div className="toggle-grid settings-toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.newsEnabled}
              onChange={(event) => set("newsEnabled", event.target.checked)}
            />
            <span>News data enabled</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.technicalIndicatorsEnabled}
              onChange={(event) => set("technicalIndicatorsEnabled", event.target.checked)}
            />
            <span>Technical indicators enabled</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.mockLLMEnabled}
              onChange={(event) => set("mockLLMEnabled", event.target.checked)}
            />
            <span>Mock LLM enabled</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.catchphrasesShown}
              onChange={(event) => set("catchphrasesShown", event.target.checked)}
            />
            <span>Catchphrases shown</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.casualOfficeChatter}
              onChange={(event) => set("casualOfficeChatter", event.target.checked)}
            />
            <span>Casual office chatter</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.reducedAnimation}
              onChange={(event) => set("reducedAnimation", event.target.checked)}
            />
            <span>Reduced animation mode</span>
          </label>
        </div>
      </section>

      <section className="page-card settings-card">
        <h2>Character dialogue brain</h2>
        <p>
          Conversations are always grounded in the real loop data. Optionally a small, cheap model rewrites them into
          livelier banter, called directly from your browser with your own key (stored locally, sent only to the provider).
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Dialogue backend</span>
            <select
              value={settings.dialogueBackend}
              onChange={(event) => set("dialogueBackend", event.target.value as Settings["dialogueBackend"])}
            >
              <option value="local">Local templates (free, offline)</option>
              <option value="anthropic">Claude Haiku 4.5 — API key (~$0.002 per chat)</option>
              <option value="openai">GPT-5.4 nano — API key (~$0.0004 per chat)</option>
              <option value="claude-code">Claude Code CLI — your subscription, no key</option>
              <option value="codex">Codex CLI — your subscription, no key</option>
            </select>
          </label>
          {(settings.dialogueBackend === "claude-code" || settings.dialogueBackend === "codex") && (
            <label className="field full">
              <span>Dialogue bridge URL — run “npm run dialogue-bridge” in the project folder first</span>
              <input
                value={settings.bridgeUrl}
                placeholder="http://127.0.0.1:8787"
                onChange={(event) => set("bridgeUrl", event.target.value)}
              />
            </label>
          )}
          {settings.dialogueBackend === "anthropic" && (
            <label className="field full">
              <span>Anthropic API key</span>
              <input
                type="password"
                placeholder="sk-ant-…"
                value={settings.anthropicApiKey}
                onChange={(event) => set("anthropicApiKey", event.target.value)}
              />
            </label>
          )}
          {settings.dialogueBackend === "openai" && (
            <label className="field full">
              <span>OpenAI API key</span>
              <input
                type="password"
                placeholder="sk-…"
                value={settings.openaiApiKey}
                onChange={(event) => set("openaiApiKey", event.target.value)}
              />
            </label>
          )}
        </div>
      </section>

      <section className="page-card settings-card">
        <h2>Desktop wallpaper mode</h2>
        <p>
          Open <code>{`${window.location.origin}${window.location.pathname}?wallpaper=1`}</code> for a chrome-free,
          auto-running office. To put it on the actual desktop, run <code>npm run build:wallpaper</code> and load the
          generated folder into Lively Wallpaper or Wallpaper Engine — instructions are written next to the build output.
        </p>
      </section>
    </div>
  );
}
