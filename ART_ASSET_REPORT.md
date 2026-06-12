# Quant Research Lab Art Asset Report

## Product Direction

The primary office experience moved from the legacy angled 3D/isometric room to a 2D top-down research office. The 2D map keeps the important product behavior easier to maintain: readable dynamic screens, agents that stand on a clear floor plane, simple y-position layering, and click targets that align to front-facing office zones.

Legacy 3D assets are still available through Settings -> Office view mode -> Legacy 3D Office, but the default is now 2D Office.

## Generated 2D Office Assets

- `public/assets/generated/office-2d/office-map-base.png`
- `public/assets/generated/office-2d/office-map-foreground.png`
- `public/assets/generated/office-2d/office-map-preview.png`
- `public/assets/generated/office-2d/office-map-collision.json`
- `public/assets/generated/office-2d/office-map-zones.json`

The 2D base map has no agents, no speech bubbles, no baked strategy names, no leaderboard rows, and no whiteboard writing. Dynamic text is rendered by React on top of the blank display surfaces.

## Generated 2D Agent Sprites

Each agent has directional idle and walk sprites, work-state sprites, a 256x256 avatar, a per-agent manifest, and dramatic expression sprites.

- `public/assets/generated/agents-2d/strategy-researcher/`
- `public/assets/generated/agents-2d/code-engineer/`
- `public/assets/generated/agents-2d/risk-reviewer/`
- `public/assets/generated/agents-2d/skeptic-researcher/`
- `public/assets/generated/agents-2d/experiment-manager/`
- `public/assets/generated/agents-2d/data-manager/`
- `public/assets/generated/agents-2d/agents-2d.manifest.json`

Expression sprites are in `public/assets/generated/agents-2d/{agentId}/expressions/` and include `delighted`, `shocked`, `angry`, `smug`, `worried`, `crying`, `embarrassed`, and `determined`.

## Generated Bubble Frames

- `public/assets/generated/ui/bubbles-2d/bubble-normal.png`
- `public/assets/generated/ui/bubbles-2d/bubble-thought.png`
- `public/assets/generated/ui/bubbles-2d/bubble-whisper.png`
- `public/assets/generated/ui/bubbles-2d/bubble-shout.png`
- `public/assets/generated/ui/bubbles-2d/bubble-explosion.png`
- `public/assets/generated/ui/bubbles-2d/bubble-sweat.png`
- `public/assets/generated/ui/bubbles-2d/bubble-debate.png`
- `public/assets/generated/ui/bubbles-2d/bubble-system.png`
- `public/assets/generated/ui/bubbles-2d/manifest.json`

Bubble images are empty transparent manga-style frames. Text is live React text in `SpeechBubble2D`.

## Copied References

- `public/assets/reference/office/empty-office.png`
- `public/assets/reference/office/ui-concept.png`
- `public/assets/reference/agents/*.png`

Original source art was not overwritten.

## Frontend Integration

- `src/pages/OfficePage.tsx` now defaults to `OfficeMap2D` unless Settings selects legacy mode.
- `src/lib/office2d/mapLayout.ts` defines the 1600x900 map, dynamic display rectangles, collision rectangles, waypoints, zones, entry points, idle positions, and interaction bounds.
- `src/lib/office2d/agentMovement.ts` maps research phases to agent zones, activities, sprites, expressions, speech bubble styles, and y-position z-index.
- `src/components/office2d/OfficeMap2D.tsx` renders the base map, dynamic displays, hotspots, agent layer, foreground layer, current experiment card, and debug overlay.
- `src/components/office2d/Agent2DSprite.tsx` resolves generated sprite images from `src/lib/assets/agent2dAssetManifest.ts`.

Uploaded user avatars remain identity badges. The main in-office body sprites use generated transparent 2D assets with idle fallback behavior.

## Dynamic Displays

- `InWorldLeaderboard2D.tsx` ranks live experiment history and highlights the current experiment.
- `InWorldWhiteboard2D.tsx` changes by phase: hypothesis, data check, coding notes, backtest flow, risk marks, debate notes, and final decision.
- `InWorldWorkstation2D.tsx` shows pseudo-code, run status, bug state, risk checks, or final metrics.
- `InWorldBacktestRig2D.tsx` renders live equity, benchmark, drawdown, Sharpe, and return-after-cost summaries.
- `InWorldDataDisplay2D.tsx` shows readiness, timestamp audit state, warnings, and universe coverage.

## Movement

Movement uses simple phase-driven zone targeting rather than random floating sprites. Agents are assigned to named map zones, rendered at that zone's idle positions, animated smoothly with Framer Motion, and sorted by `y` so lower agents render above higher agents. `src/lib/office2d/pathfinding.ts` defines waypoint paths for future path previews or step-based interpolation.

## Tuning

Tune map alignment in `src/lib/office2d/mapLayout.ts`.

- `office2DDisplays`: leaderboard, whiteboard, workstation, backtest rig, and data display overlay coordinates.
- `office2DZones`: zone labels, bounds, interaction rectangles, entries, and idle positions.
- `office2DCollision`: blocked furniture rectangles.
- `office2DWaypoints`: movement route anchors.

Use `http://127.0.0.1:5173/?debug2d=1#/office` to show live bounds, blocked regions, waypoints, agent coordinates, target zones, and z-index sorting.

## Preview

- Start the app with `npm.cmd run dev -- --port 5173`.
- Open `http://127.0.0.1:5173/#/asset-preview`.
- The preview page shows the 2D map base, foreground layer, collision overlay, zone markers, dynamic display bounds, all 2D agent sprites, all expression sprites, bubble frames, filenames, image dimensions, missing warnings, and checkerboard transparency backgrounds.
- The same page keeps a legacy 3D asset section for comparison.

## Verification

- `scripts/verify-assets.mjs` checks legacy assets and the new 2D asset family.
- It verifies folders, required files, manifest path resolution, PNG dimensions, PNG alpha/corner transparency, likely non-sheet sprite dimensions, exact duplicate hashes, bubble frames, 2D map JSON zones, 2D collision data, layout constants, and sprite mapping fallbacks.

Latest verification:

- `npm.cmd run verify:assets`: passed.
- `npm.cmd run build`: passed. Vite reports only the existing large chunk warning.

## Temporary Placeholders

- None for the primary 2D office experience.
- No cropped design-sheet image is used as a final 2D in-office sprite.
- No CSS-drawn character is used as a final office character.
- `office-map-foreground.png` is currently an intentionally transparent optional layer; it exists so future furniture occlusion can be added without changing the rendering pipeline.

## Known Limitations

- Sprites were generated in production sheets and then split into transparent PNGs. They pass transparency and duplicate checks, but a future art pass could improve individual pose polish.
- The 2D movement system uses phase-driven zone targeting today. `pathfinding.ts` is ready for route previews or per-waypoint stepping if more granular walking is needed.
- The foreground layer is blank for now, so agents do not yet pass behind furniture edges.

## Next Improvements

- Generate a painted foreground occlusion layer for table edges, monitor frames, and plants.
- Add step-by-step waypoint interpolation so agents visibly follow corridors between zones.
- Add side/back pose refinements for work actions where agents face wall screens.
