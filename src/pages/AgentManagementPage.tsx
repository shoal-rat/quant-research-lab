import { Download, RotateCcw, Upload } from "lucide-react";
import { CSSProperties, ChangeEvent, useMemo, useRef, useState } from "react";
import { defaultAgents } from "../data/defaultAgents";
import { useAppStore } from "../store/AppStore";
import { downloadJson } from "../store/persistence";
import { AgentProfile } from "../types";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AgentManagementPage(): JSX.Element {
  const { agents, updateAgent, restoreAgent, replaceAgents } = useAppStore();
  const [selectedId, setSelectedId] = useState(agents[0]?.id ?? "");
  const [draftImage, setDraftImage] = useState<string | undefined>();
  const importRef = useRef<HTMLInputElement | null>(null);
  const selected = useMemo(
    () => agents.find((agent) => agent.id === selectedId) ?? agents[0],
    [agents, selectedId]
  );

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selected) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraftImage(dataUrl);
    updateAgent(selected.id, {
      avatarDataUrl: dataUrl,
      characterImageDataUrl: dataUrl,
      crop: { scale: 1, x: 0, y: 0 }
    });
  };

  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text) as AgentProfile[];
    if (Array.isArray(parsed) && parsed.every((agent) => agent.id && agent.role)) {
      replaceAgents(parsed);
      setSelectedId(parsed[0]?.id ?? "");
    }
    event.target.value = "";
  };

  if (!selected) {
    return (
      <div className="page-card">
        <h1>No agents</h1>
      </div>
    );
  }

  const catchphrases = selected.catchphrases.join("\n");
  const previewImage = draftImage ?? selected.characterImageDataUrl ?? selected.defaultAssetPath;

  return (
    <div className="agents-page">
      <div className="page-heading">
        <div>
          <small>Character configuration</small>
          <h1>Agent Management</h1>
          <p>Customize the research team without breaking the unified office style.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => downloadJson("quant-research-lab-agents.json", agents)}>
            <Download size={15} /> Export JSON
          </button>
          <button className="secondary-button" onClick={() => importRef.current?.click()}>
            <Upload size={15} /> Import JSON
          </button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={importConfig} />
        </div>
      </div>

      <div className="agent-management-grid">
        <aside className="agent-roster">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={agent.id === selected.id ? "agent-roster-row active" : "agent-roster-row"}
              onClick={() => setSelectedId(agent.id)}
            >
              <span className="avatar-token avatar-image-token" style={{ background: agent.appearance.themeColor }}>
                {agent.avatarDataUrl ? (
                  <img src={agent.avatarDataUrl} alt="" />
                ) : agent.defaultAssetPath ? (
                  <img src={agent.defaultAssetPath} alt="" />
                ) : (
                  agent.name.slice(0, 1)
                )}
              </span>
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.role.replaceAll("_", " ")}</small>
              </span>
            </button>
          ))}
        </aside>

        <section className="page-card agent-editor">
          <div className="editor-header">
            <div className="character-preview" style={{ "--agent-color": selected.appearance.themeColor } as CSSProperties}>
              <div className="preview-avatar">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt={`${selected.name} preview`}
                    style={{
                      transform: `translate(${selected.crop.x}px, ${selected.crop.y}px) scale(${selected.crop.scale})`
                    }}
                  />
                ) : (
                  <span style={{ background: selected.appearance.hairColor }}>{selected.name.slice(0, 1)}</span>
                )}
              </div>
              <strong>{selected.name}</strong>
              <small>{selected.appearance.clothingStyle}</small>
            </div>
            <div className="upload-panel">
              <label className="file-drop">
                <Upload size={18} />
                <span>Upload character image</span>
                <input type="file" accept="image/*" onChange={handleUpload} />
              </label>
              <div className="slider-grid">
                <label>
                  <span>Scale</span>
                  <input
                    type="range"
                    min="0.7"
                    max="2"
                    step="0.05"
                    value={selected.crop.scale}
                    onChange={(event) =>
                      updateAgent(selected.id, { crop: { ...selected.crop, scale: Number(event.target.value) } })
                    }
                  />
                </label>
                <label>
                  <span>X</span>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={selected.crop.x}
                    onChange={(event) =>
                      updateAgent(selected.id, { crop: { ...selected.crop, x: Number(event.target.value) } })
                    }
                  />
                </label>
                <label>
                  <span>Y</span>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={selected.crop.y}
                    onChange={(event) =>
                      updateAgent(selected.id, { crop: { ...selected.crop, y: Number(event.target.value) } })
                    }
                  />
                </label>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  restoreAgent(selected.id);
                  const restored = defaultAgents.find((agent) => agent.id === selected.id);
                  if (restored) setDraftImage(undefined);
                }}
              >
                <RotateCcw size={15} /> Restore default
              </button>
            </div>
          </div>

          {selected.designSheetPath && (
            <details className="sheet-reference">
              <summary>Provided design sheet</summary>
              <img src={selected.designSheetPath} alt={`${selected.name} design sheet`} />
            </details>
          )}

          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input value={selected.name} onChange={(event) => updateAgent(selected.id, { name: event.target.value })} />
            </label>
            <label className="field">
              <span>Role</span>
              <input value={selected.role.replaceAll("_", " ")} disabled />
            </label>
            <label className="field">
              <span>Theme color</span>
              <input
                type="color"
                value={selected.appearance.themeColor}
                onChange={(event) =>
                  updateAgent(selected.id, {
                    appearance: { ...selected.appearance, themeColor: event.target.value, bubbleColor: `${event.target.value}18` }
                  })
                }
              />
            </label>
            <label className="field">
              <span>Hair color</span>
              <input
                type="color"
                value={selected.appearance.hairColor}
                onChange={(event) =>
                  updateAgent(selected.id, { appearance: { ...selected.appearance, hairColor: event.target.value } })
                }
              />
            </label>
            <label className="field">
              <span>Body style</span>
              <input
                value={selected.appearance.bodyStyle}
                onChange={(event) =>
                  updateAgent(selected.id, { appearance: { ...selected.appearance, bodyStyle: event.target.value } })
                }
              />
            </label>
            <label className="field">
              <span>Clothing style</span>
              <input
                value={selected.appearance.clothingStyle}
                onChange={(event) =>
                  updateAgent(selected.id, { appearance: { ...selected.appearance, clothingStyle: event.target.value } })
                }
              />
            </label>
            <label className="field full">
              <span>Personality</span>
              <textarea
                value={selected.personality}
                onChange={(event) => updateAgent(selected.id, { personality: event.target.value })}
              />
            </label>
            <label className="field full">
              <span>Catchphrases</span>
              <textarea
                value={catchphrases}
                onChange={(event) =>
                  updateAgent(selected.id, {
                    catchphrases: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean)
                  })
                }
              />
            </label>
          </div>

          <div className="toggle-grid">
            <label className="toggle">
              <input
                type="checkbox"
                checked={selected.visible}
                onChange={(event) => updateAgent(selected.id, { visible: event.target.checked })}
              />
              <span>Visible in office</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={selected.casualChatter}
                onChange={(event) => updateAgent(selected.id, { casualChatter: event.target.checked })}
              />
              <span>Casual chatter</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={selected.exaggeratedEmotions}
                onChange={(event) => updateAgent(selected.id, { exaggeratedEmotions: event.target.checked })}
              />
              <span>Exaggerated emotions</span>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
