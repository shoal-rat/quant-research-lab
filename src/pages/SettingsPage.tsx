import { useState } from "react";
import { useAppStore } from "../store/AppStore";
import { getUploadedDatasetName, setUploadedDataset } from "../engines/dataset/datasetProvider";
import { t } from "../i18n";
import { BridgeSourceKind, DatasetConfig, DatasetKind, HoldingPeriod, Settings } from "../types";

export function SettingsPage(): JSX.Element {
  const { settings, updateSettings, cliStatus, datasetStatus } = useAppStore();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => updateSettings({ [key]: value } as Partial<Settings>);
  const lang = settings.language;
  const dataset = settings.dataset;
  const setDataset = (patch: Partial<DatasetConfig>) => updateSettings({ dataset: { ...dataset, ...patch } });
  const [uploadName, setUploadName] = useState<string | null>(getUploadedDatasetName());

  const DATASET_LABELS: Record<DatasetKind, { en: string; zh: string }> = {
    bundled: { en: "Bundled US equities (20y dailies)", zh: "内置美股（20 年日线）" },
    mock: { en: "Deterministic mock simulator", zh: "确定性模拟器" },
    upload: { en: "Upload your own CSV / JSON", zh: "上传你自己的 CSV / JSON" },
    remote: { en: "Remote URL (CSV / JSON)", zh: "远程链接（CSV / JSON）" },
    bridge: { en: "Large local file / database (via CLI)", zh: "大型本地文件 / 数据库（经 CLI）" }
  };

  const onKind = (kind: DatasetKind) => setDataset({ kind, label: DATASET_LABELS[kind][lang] });

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setUploadedDataset(file.name, text);
    setUploadName(file.name);
    setDataset({ kind: "upload", label: file.name, uploadName: file.name });
  };

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <small>Research configuration</small>
          <h1>Settings</h1>
          <p>Configure the dataset, the LLM-native research brain, and UI behavior.</p>
        </div>
      </div>

      <section className="page-card settings-card">
        <h2>{lang === "zh" ? "数据集与研究大脑" : "Dataset & research brain"}</h2>
        <p>
          {lang === "zh"
            ? "选择数据源——内置行情、你自己的文件、远程链接，或让已连接的 CLI 在原地读取一个超大本地文件 / 数据库（不下载到浏览器）。研究大脑只支持 Claude Code 或 Codex。"
            : "Pick a data source — bundled prices, your own file, a remote URL, or let the connected CLI read a very large local file / database where it lives (never downloaded into the browser). The research brain is Claude Code or Codex only."}
        </p>
        <div className="form-grid">
          <label className="field">
            <span>{lang === "zh" ? "数据源" : "Data source"}</span>
            <select value={dataset.kind} onChange={(event) => onKind(event.target.value as DatasetKind)}>
              {(Object.keys(DATASET_LABELS) as DatasetKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {DATASET_LABELS[kind][lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{lang === "zh" ? "研究大脑（LLM 原生）" : "Research brain (LLM-native)"}</span>
            <select value={settings.researchBrain} onChange={(event) => set("researchBrain", event.target.value as Settings["researchBrain"])}>
              <option value="claude-code">Claude Code CLI</option>
              <option value="codex">Codex CLI</option>
            </select>
          </label>

          {dataset.kind === "upload" && (
            <label className="field full">
              <span>{lang === "zh" ? "选择 CSV（date,ticker,close 长表 或 date + 每列一只股票宽表）或 JSON" : "Choose a CSV (long: date,ticker,close — or wide: date + one column per ticker) or JSON"}</span>
              <input type="file" accept=".csv,.json,.txt" onChange={(event) => void onUpload(event.target.files?.[0])} />
              {uploadName && <small className="field-hint">{lang === "zh" ? "已加载：" : "Loaded: "}{uploadName}</small>}
            </label>
          )}

          {dataset.kind === "remote" && (
            <label className="field full">
              <span>{lang === "zh" ? "远程数据 URL（CSV 或同结构 JSON，需允许跨域）" : "Remote data URL (CSV, or JSON in the bundle shape; must allow CORS)"}</span>
              <input
                value={dataset.remoteUrl ?? ""}
                placeholder="https://example.com/prices.csv"
                onChange={(event) => setDataset({ remoteUrl: event.target.value, label: event.target.value })}
              />
            </label>
          )}

          {dataset.kind === "bridge" && (
            <>
              <label className="field">
                <span>{lang === "zh" ? "来源类型" : "Source type"}</span>
                <select
                  value={dataset.bridgeSourceKind ?? "file"}
                  onChange={(event) => setDataset({ bridgeSourceKind: event.target.value as BridgeSourceKind })}
                >
                  <option value="file">CSV file (any size)</option>
                  <option value="parquet">Parquet file</option>
                  <option value="duckdb">DuckDB</option>
                  <option value="sqlite">SQLite</option>
                  <option value="postgres">Postgres (DSN)</option>
                  <option value="url">Remote URL</option>
                </select>
              </label>
              <label className="field full">
                <span>{lang === "zh" ? "路径 / 连接串（CLI 在本机解析）" : "Path / connection string (resolved by the CLI on your machine)"}</span>
                <input
                  value={dataset.bridgeRef ?? ""}
                  placeholder="C:\\data\\prices.parquet  ·  postgres://user@host/db  ·  https://…"
                  onChange={(event) => setDataset({ bridgeRef: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>{lang === "zh" ? "可选：表名 / SQL（数据库来源）" : "Optional: table name / SQL (for database sources)"}</span>
                <input
                  value={dataset.bridgeQuery ?? ""}
                  placeholder="SELECT date, ticker, adj_close FROM prices"
                  onChange={(event) => setDataset({ bridgeQuery: event.target.value })}
                />
              </label>
              <p className="field full settings-note">
                {lang === "zh"
                  ? "大数据模式：用 QRL_ALLOW_DATA_TOOLS=1 启动桥接器，CLI 才能在原地读取本地文件 / 数据库。"
                  : "Big-data mode: start the bridge with QRL_ALLOW_DATA_TOOLS=1 so the CLI may read local files / databases in place."}
              </p>
            </>
          )}

          <div className="field full status-row">
            <span className={`status-chip ${cliStatus.connected ? "ok" : "warn"}`}>
              {cliStatus.connected ? "● " : "○ "}
              {cliStatus.connected ? t(lang, "cliConnected") : t(lang, "cliOffline")}
              {cliStatus.detail ? ` — ${cliStatus.detail}` : ""}
            </span>
            <span className={`status-chip ${datasetStatus.ready ? "ok" : datasetStatus.building ? "" : "warn"}`}>
              {datasetStatus.building ? "◌ " : datasetStatus.ready ? "● " : "○ "}
              {datasetStatus.building
                ? t(lang, "datasetBuilding")
                : datasetStatus.ready
                ? `${t(lang, "datasetReady")} — ${datasetStatus.label}`
                : `${t(lang, "datasetFailed")}${datasetStatus.error ? ` — ${datasetStatus.error}` : ""}`}
            </span>
          </div>

          <label className="field full">
            <span>{lang === "zh" ? "桥接器地址（先运行 npm run dialogue-bridge）" : "Bridge URL (run npm run dialogue-bridge first)"}</span>
            <input value={settings.bridgeUrl} placeholder="http://127.0.0.1:8787" onChange={(event) => set("bridgeUrl", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="page-card settings-card">
        <div className="form-grid">
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
