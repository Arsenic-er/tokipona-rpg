# World Scale Prototype Design

**Status:** Approved for implementation on 2026-08-21

## Goal

Create an isolated, playable world-scale experiment that renders the existing N00/N01 world at three candidate portrait scales and places one temporary animated character inside it. The experiment must reuse the real scene manifests, collision grid, fixed-step movement, player body, and camera inputs without changing any existing gameplay, content, save, WAL, learning, or acceptance contract.

## Decisions

- Keep the authored and runtime collision macro tile at `16x16` pixels.
- Keep the production player collision body at `12x14` pixels.
- Add three display-only viewport profiles: `current` (`180x320`), `medium` (`270x480`), and `wide_world` (`360x640`).
- Profiles change how much world is visible. They never scale or rewrite world coordinates, physics constants, collision rows, or player state.
- Render solid macro tiles using deterministic `2x2` material cells, with optional `1x1` dust accents. Micro cells are visual only.
- Render a temporary silhouette character derived from the real runtime position, velocity, grounded state, and body dimensions. It is a scale reference, not final character art.
- Derive animation states `idle`, `run`, `rise`, `fall`, and `land` from runtime state and recent display history. Animation state cannot feed back into the runtime.
- Build a separate `world-scale.html` entry. Keep `rpg.html` and `src/rpg-main.ts` unchanged until a scale is selected.
- Use the real N00 arrival scene and the real N01 stream scene. The prototype starts in N00 and reaches N01 through the existing scene transition.
- Do not import, copy, or replace private glyph assets. The existing Sitelen pona surface decisions remain reserved for later production art work.

## Architecture

### Pure visual projection

`src/visual/world-scale-prototype.ts` owns a pure projection from a verified scale profile, a generated runtime scene manifest, and an immutable runtime snapshot into a display frame:

- viewport and camera;
- visible solid macro cells;
- deterministic material micro cells;
- a temporary character pose and animation frame;
- scene and scale diagnostics.

The projector validates scene identity, finite runtime geometry, the fixed `16px` macro tile, and the unchanged `12x14px` player body. It returns deeply immutable display data and never accepts a `GameSession`, runtime mutator, or callback.

### Playable browser experiment

`src/world-scale-main.ts` creates one real `PrologueFlowSession`, advances it with the existing `advanceTicks` API, reads `flow.snapshot()`, and gives the runtime snapshot plus generated scene manifest to the pure projector. Keyboard input uses the same movement and jump semantics as the existing RPG.

The profile selector recreates only the canvas backing dimensions. It does not recreate or mutate the flow. A compact diagnostics strip shows the selected viewport, macro tile size, micro cell size, player body, scene ID, and runtime tick.

### Rendering

The world renderer keeps nearest-neighbor output. Solid macro cells receive deterministic strata, edges, pores, and sparse dust derived from scene ID and tile coordinates. The temporary character is drawn procedurally at its true collision-body scale with a readable head, torso, legs, facing direction, and two-frame gait.

## Logic preservation contract

- `WORLD_TILE_SIZE_PX`, `DEFAULT_PLAYER_BODY`, physics constants, content YAML, generated runtime artifact, GameSession schema, WAL schema, and production browser persistence are unchanged.
- Switching display profiles preserves byte-equivalent `flow.toSave()` output and equal runtime snapshots.
- Projecting frames never mutates the scene manifest or runtime snapshot.
- The same input sequence produces the same runtime snapshot regardless of which display profile was rendered between ticks.
- No prototype module is imported by production RPG modules.

## Verification

- Unit tests lock exact profile dimensions and fixed macro/micro cell sizes.
- Projection tests use generated N00/N01 manifests and real runtime snapshots.
- Mutation tests compare snapshots and manifests before and after projection.
- Profile-parity tests replay the same movement sequence while projecting every profile and assert identical runtime state/save output.
- Character-pose tests cover idle, run, rise, fall, and landing derivation.
- Build tests include `world-scale.html` without altering existing entries.
- Browser verification checks all three profiles, movement, N00-to-N01 transition, canvas sharpness, and readable character scale.

## Non-goals

- Final player, NPC, wildlife, terrain, particle, lighting, animation, or UI art.
- Changing the collision tile size or physics constants.
- Reworking N02 and later scenes.
- Replacing the production RPG renderer.
- Importing private asset candidates or declaring any draft asset release-ready.
