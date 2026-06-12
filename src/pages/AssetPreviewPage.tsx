import { useEffect, useMemo, useState } from "react";
import { generatedAgent2DManifest, directionalSpriteNames } from "../lib/assets/agent2dAssetManifest";
import { generatedAgentManifest } from "../lib/assets/agentAssetManifest";
import {
  office2DAssets,
  office2DCollision,
  office2DDisplays,
  office2DZones,
  office2DWaypoints,
  pointToPercentStyle,
  rectToPercentStyle
} from "../lib/office2d/mapLayout";
import { regionStyle, sceneHotspots, sceneLayout } from "../lib/office/sceneLayout";

interface ImageMeta {
  ok: boolean;
  width?: number;
  height?: number;
}

const bubbleFrames = {
  normal: "/assets/generated/ui/bubbles-2d/bubble-normal.png",
  thought: "/assets/generated/ui/bubbles-2d/bubble-thought.png",
  whisper: "/assets/generated/ui/bubbles-2d/bubble-whisper.png",
  shout: "/assets/generated/ui/bubbles-2d/bubble-shout.png",
  explosion: "/assets/generated/ui/bubbles-2d/bubble-explosion.png",
  sweat: "/assets/generated/ui/bubbles-2d/bubble-sweat.png",
  debate: "/assets/generated/ui/bubbles-2d/bubble-debate.png",
  system: "/assets/generated/ui/bubbles-2d/bubble-system.png"
};

function useImageMeta(paths: string[]): Record<string, ImageMeta> {
  const [meta, setMeta] = useState<Record<string, ImageMeta>>({});

  useEffect(() => {
    paths.forEach((path) => {
      const image = new Image();
      image.onload = () => {
        setMeta((prev) => ({ ...prev, [path]: { ok: true, width: image.naturalWidth, height: image.naturalHeight } }));
      };
      image.onerror = () => {
        setMeta((prev) => ({ ...prev, [path]: { ok: false } }));
      };
      image.src = path;
    });
  }, [paths]);

  return meta;
}

function MetaLine({ path, meta }: { path: string; meta?: ImageMeta }): JSX.Element {
  if (!meta) return <small>{path} - checking</small>;
  if (!meta.ok) return <small className="asset-warning">{path} - missing</small>;
  return (
    <small>
      {path.split("/").pop()} - {meta.width}x{meta.height}
    </small>
  );
}

function SpriteCard({
  label,
  path,
  meta,
  className = ""
}: {
  label: string;
  path: string;
  meta?: ImageMeta;
  className?: string;
}): JSX.Element {
  return (
    <article className={`sprite-preview-card ${className}`}>
      <div className="sprite-frame checkerboard">
        <img src={path} alt={label} />
      </div>
      <strong>{label}</strong>
      <MetaLine path={path} meta={meta} />
    </article>
  );
}

export function AssetPreviewPage(): JSX.Element {
  const paths = useMemo(
    () => [
      office2DAssets.base,
      office2DAssets.foreground,
      office2DAssets.preview,
      ...Object.values(bubbleFrames),
      ...generatedAgent2DManifest.flatMap((agent) => [agent.avatar, ...Object.values(agent.sprites), ...Object.values(agent.expressions)]),
      sceneLayout.background.asset,
      "/assets/generated/office/office-bg-thumb.webp",
      ...generatedAgentManifest.flatMap((agent) => [agent.avatar, ...Object.values(agent.sprites)])
    ],
    []
  );
  const meta = useImageMeta(paths);

  return (
    <div className="asset-preview-page">
      <div className="page-heading">
        <div>
          <small>Generated art QA</small>
          <h1>Asset Preview</h1>
          <p>2D map bounds, collision overlays, sprite transparency previews, bubble frames, dimensions, and missing warnings.</p>
        </div>
      </div>

      <section className="page-card">
        <h2>2D Office Map</h2>
        <div className="asset-preview-office-shell office-2d-preview-shell">
          <img src={office2DAssets.base} alt="2D office map base" />
          {Object.entries(office2DDisplays).map(([key, region]) => (
            <span key={key} className="preview-bound preview-surface-bound" style={rectToPercentStyle(region)}>
              {key}
            </span>
          ))}
          {office2DCollision.blocked.map((region) => (
            <span key={region.id} className="preview-bound preview-collision-bound" style={rectToPercentStyle(region)}>
              {region.id}
            </span>
          ))}
          {Object.entries(office2DZones).map(([key, zone]) => (
            <span key={key} className="preview-bound preview-zone-bound" style={rectToPercentStyle(zone.bounds)}>
              {zone.label}
            </span>
          ))}
          {Object.entries(office2DWaypoints).map(([key, point]) => (
            <span key={key} className="preview-map-point" style={pointToPercentStyle(point)}>
              {key}
            </span>
          ))}
        </div>
        <div className="scene-coordinate-grid">
          {Object.entries(office2DDisplays).map(([key, region]) => (
            <code key={key}>
              {key}: x {region.x}, y {region.y}, w {region.width}, h {region.height}
            </code>
          ))}
          {Object.entries(office2DZones).map(([key, zone]) => (
            <code key={key}>
              {key}: entry {zone.entry.x},{zone.entry.y} bounds {zone.bounds.x},{zone.bounds.y},{zone.bounds.width},{zone.bounds.height}
            </code>
          ))}
        </div>
      </section>

      <section className="page-card">
        <h2>2D Office Files</h2>
        <div className="asset-map-layer-grid">
          {[office2DAssets.base, office2DAssets.foreground, office2DAssets.preview].map((path) => (
            <div key={path} className="asset-map-layer checkerboard">
              <img src={path} alt="" />
              <MetaLine path={path} meta={meta[path]} />
            </div>
          ))}
        </div>
      </section>

      <section className="page-card">
        <h2>Manga Bubble Frames</h2>
        <div className="bubble-preview-grid">
          {Object.entries(bubbleFrames).map(([type, path]) => (
            <SpriteCard key={type} label={type} path={path} meta={meta[path]} className="bubble-frame-card" />
          ))}
        </div>
      </section>

      {generatedAgent2DManifest.map((agent) => {
        const directional = Object.entries(agent.sprites).filter(([state]) =>
          directionalSpriteNames.includes(state as (typeof directionalSpriteNames)[number])
        );
        const work = Object.entries(agent.sprites).filter(
          ([state]) => !directionalSpriteNames.includes(state as (typeof directionalSpriteNames)[number])
        );

        return (
          <section className="page-card agent-asset-group" key={agent.id}>
            <div className="agent-asset-heading">
              <div>
                <small>2D agent - {agent.id}</small>
                <h2>{agent.displayName}</h2>
              </div>
              <div className="asset-avatar-preview checkerboard">
                <img src={agent.avatar} alt={`${agent.displayName} avatar`} />
              </div>
            </div>
            <MetaLine path={agent.avatar} meta={meta[agent.avatar]} />
            <h3>Directional Sprites</h3>
            <div className="sprite-preview-grid">
              {directional.map(([state, path]) => (
                <SpriteCard key={state} label={state} path={path} meta={meta[path]} />
              ))}
            </div>
            <h3>Work Sprites</h3>
            <div className="sprite-preview-grid">
              {work.map(([state, path]) => (
                <SpriteCard key={state} label={state} path={path} meta={meta[path]} />
              ))}
            </div>
            <h3>Dramatic Expressions</h3>
            <div className="sprite-preview-grid">
              {Object.entries(agent.expressions).map(([expression, path]) => (
                <SpriteCard key={expression} label={expression} path={path} meta={meta[path]} className="expression-card" />
              ))}
            </div>
          </section>
        );
      })}

      <section className="page-card">
        <h2>Legacy 3D Office Bounds</h2>
        <div className="asset-preview-office-shell">
          <img src={sceneLayout.background.asset} alt="Generated legacy office background" />
          {Object.entries(sceneLayout.dynamicSurfaces).map(([key, region]) => (
            <span key={key} className="preview-bound preview-surface-bound" style={regionStyle(region)}>
              {key}
            </span>
          ))}
          {Object.entries(sceneHotspots).map(([key, region]) => (
            <span key={key} className="preview-bound preview-hotspot-bound" style={regionStyle(region)}>
              {region.label}
            </span>
          ))}
        </div>
      </section>

      {generatedAgentManifest.map((agent) => (
        <section className="page-card agent-asset-group" key={`legacy-${agent.id}`}>
          <div className="agent-asset-heading">
            <div>
              <small>Legacy 3D agent - {agent.id}</small>
              <h2>{agent.displayName}</h2>
            </div>
            <div className="asset-avatar-preview checkerboard">
              <img src={agent.avatar} alt={`${agent.displayName} avatar`} />
            </div>
          </div>
          <MetaLine path={agent.avatar} meta={meta[agent.avatar]} />
          <div className="sprite-preview-grid">
            {Object.entries(agent.sprites).map(([state, path]) => (
              <SpriteCard key={state} label={state} path={path} meta={meta[path]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
