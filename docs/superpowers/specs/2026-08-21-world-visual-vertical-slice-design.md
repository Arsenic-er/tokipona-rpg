# N00–N01 World Visual Vertical Slice Design

**Status:** Approved for implementation on 2026-08-21

## Goal

Complete visual-refactor stages 2 through 5 for the isolated N00→N01 prototype: a materially readable generated environment, an improved temporary player model with animation, water/light/magic effects, and a game-like contextual interaction layer. Preserve the existing scene geometry, fixed-step movement, task logic, learning progression, save format, and production RPG page.

## Chosen direction

Use the `medium` world profile (`270×480`) as the review baseline while retaining all three scale profiles behind an audit control. The slice is an atmospheric river-valley cavern: layered dark geology, warm mineral edges, muted moss, cool water, and restrained cyan toki pona magic. It borrows only the density and material readability principles associated with simulation-heavy pixel games; it does not reproduce another game's art, layouts, or assets.

The world remains procedurally drawn from verified scene identity, collision rows, tile coordinates, runtime tick, and existing N01 water/learning state. No image, sprite, audio, or private-asset candidate is added to the public repository.

## Stage 2 — Environment and terrain

### Layers

1. Far geology silhouettes move at `0.12×` camera parallax.
2. Mid geology shelves, roots, and vertical seams move at `0.35×`.
3. Authoritative collision terrain remains at `1×` and uses the unchanged `16×16` macro grid.
4. Foreground silhouettes use sparse edges and never obscure the character or contextual prompt.

### Terrain material language

- Solid collision tiles are rendered as irregular strata, not isolated square bricks.
- Exposed top faces receive moss/mineral caps and sparse grass.
- Adjacent solid tiles share seams so horizontal shelves read continuously.
- Internal faces use deterministic `2×2` pores, cracks, pebbles, and mineral flecks.
- Every decoration is derived from a stable hash of `sceneId + tile coordinates + feature kind`.
- Decorations have no collision and cannot modify scene manifests or runtime snapshots.

### N00 and N01 identity

- N00 is a dry arrival shelf with warm mineral caps, sparse roots, and a distant valley opening.
- N01 is cooler and wetter, with moss, a shallow water ribbon, damp rock, mist, droplets, and the existing telo glyph location.

## Stage 3 — Temporary player model and animation

The visible player becomes a `14×19` pixel procedural sprite anchored around the unchanged `12×14` collision body. The overhang is visual only.

- Silhouette: large readable head/hair shape, teal travel coat, pale face, dark boots, one-pixel eye highlight.
- Facing is derived from runtime horizontal velocity.
- Animation states remain `idle`, `run`, `rise`, `fall`, and `land`.
- Idle uses a two-frame breathing offset.
- Run uses four gait phases derived from runtime tick and velocity.
- Rise and fall separate arm/coat/leg silhouettes.
- Landing uses a two-tick squash and a small dust response.
- No animation state or visual bounds can feed back into movement or collision.

## Stage 4 — Water, particles, light, and magic

- N01 shallow water uses the existing `arrival.shallowWater` world bounds.
- Water draws a dark body, two deterministic surface wave bands, shoreline foam, and occasional droplets.
- Ambient motes are stable display particles derived from tick plus feature seed; reduced-motion mode freezes their phase.
- Landing dust appears only from the derived `land` animation.
- Lighting uses Canvas compositing: dim ambient shade, a restrained radial player light, warm mineral glints, and a cyan glyph halo.
- The telo glyph has three visible phases (`undiscovered`, `discovered`, `activated`) derived from the existing learning state.
- Magic effects are display-only reflections of committed learning/action state. They never create evidence or spend MP by themselves.

## Stage 5 — In-world interaction and UI reduction

- Replace the persistent title, footer diagnostics, and always-visible scale buttons with a full-screen game frame.
- Show the scene title briefly after a scene transition.
- Show one contextual prompt near the player: `E · 观察 telo`, `E · 调谐 telo`, or `E · 显化 telo` when the existing runtime is within the existing glyph radius.
- Pressing `E` calls the corresponding existing Flow method through the prototype controller. Every operation uses stable prototype IDs and returns a narrow display message.
- Show the message as a short-lived in-world toast; do not expose GameSession state, receipts, raw flags, physics overrides, or learning payloads.
- Keep scale selection in a collapsed audit drawer toggled by `V` or an accessible “视觉审计” button.
- Desktop controls are keyboard-first. Touch controls expose only left, right, jump, and contextual interact, and appear only on coarse pointers/small screens.
- An accessibility live region mirrors the contextual result. Reduced motion freezes background particles and removes camera/overlay transitions.

## Architecture

### `src/visual/world-environment.ts`

Consumes `RuntimeSceneManifest` and `WorldScaleFrame`; produces immutable parallax silhouettes, terrain decorations, material palette, and scene ambience. It has no DOM or Canvas dependency.

### `src/visual/character-pixel-rig.ts`

Consumes `ProjectedPrototypeCharacter`; produces immutable pixel rectangles for the `14×19` visible sprite and optional landing dust anchors. It has no runtime mutator.

### `src/visual/world-vfx.ts`

Consumes the visual frame, N01 water bounds, glyph phase, and reduced-motion preference; produces immutable waves, particles, lights, fog bands, and glyph presentation.

### `src/visual/world-interaction.ts`

Consumes the public Flow snapshot; produces a narrow prompt view. It does not execute actions. `WorldScalePrototypeController.interact()` is the only new command boundary and delegates to existing Flow methods.

### Browser composition

`src/world-scale-main.ts` becomes a renderer/compositor only: advance real ticks, request the four pure projections, draw them in order, and bind narrow keyboard/touch commands. It never reads or writes storage.

## Logic preservation contract

- `WORLD_TILE_SIZE_PX=16` and `DEFAULT_PLAYER_BODY=12×14` remain unchanged.
- N00/N01 YAML, generated content, collision rows, exits, movement constants, GameSession/WAL schemas, production `rpg.html`, and `src/rpg-main.ts` remain unchanged.
- Visible player size is not collision size.
- Rendering and profile changes preserve equal runtime snapshots and `flow.toSave()` values.
- `interact()` can only invoke existing `discoverTelo`, `attuneTelo`, and `manifestTelo` methods after the existing scene/range/state checks.
- Visual modules never accept caller-provided world flags, MP values, evidence objects, damage, collision overrides, or save data.

## Audit acceptance

The slice is ready for user audit when:

1. N00 and N01 have visibly distinct, layered environments without obvious repeated square blocks.
2. The temporary player is readable at the medium scale and visibly animates through idle/run/rise/fall/land.
3. N01 water, ambient particles, landing dust, lighting, and telo phase feedback are visible and bounded.
4. The default page reads as a game view, not a laboratory panel; audit controls stay collapsed.
5. Real movement crosses N00→N01, and real contextual interaction progresses telo without alternate logic.
6. Focused, full, content, type, build, and browser smoke tests pass; production RPG files remain untouched.

## Non-goals

- Final production character art, final frame timing, NPC/wildlife animation, music, sound effects, or private asset approval.
- Rebuilding N02 and later scenes.
- Replacing the production RPG renderer before user audit.
- Changing the authored collision world to match decorative silhouettes.
