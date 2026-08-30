# Forest Continuous Map and Ecology Design

**Status:** Approved in conversation on 2026-08-30

**Scope:** First-chapter forest region only

**Supersedes for runtime layout:** the framed waterwheel visual benchmark compositions v001–v003

**Preserves:** existing first-chapter domain logic, learning, survival, economy, reputation, persistence, and cross-save WAL

## Implementation Status — Continuous Graybox Audit Candidate

- Accepted deterministic seed: `forest.chapter-one.audit`.
- Topology digest: `sha256:e7f9c2044552ff24e3a6a41535d3e84128de055a4bc0fd370975f05dd87f2432`.
- Initial accessible topology: exactly `38 / 100` generated traversable cells (`0.38`, or `38%`), within the approved `35%–40%` band.
- Browser audit URLs: development `http://127.0.0.1:5174/world-scale.html`; production-preview acceptance `http://127.0.0.1:4173/world-scale.html`.
- Automated graybox gates cover desktop `1440×900` keyboard and mobile `390×844` touch traversal from arrival through stream, meadow settlement, hermit branch, and the waterwheel approach; fixed `640×360` camera/backing surface; stable runtime region with changing district; partial-only waterwheel reveal; sealed later gates; grounded safe-checkpoint reset; unchanged RPG local-storage bytes; zero page errors; and steady-state reuse of the full-frame RGBA upload allocation.
- Known graybox Minor for visual audit: overlapping authored settlement/hermit corridor volumes can briefly alternate the read-only district label while descending. Every observed transition remains on an authored adjacent graph edge, world progress does not reverse, and no scene load occurs.
- The graybox is ready for the separate user visual-audit gate. Ecology simulation, visible species, final environment art, final character modeling/animation, weather/special-state variants, and RPG `GameSession` spatial writes remain explicitly unimplemented.

## 1. Decision Summary

The first-chapter forest becomes one continuous side-view region map. Existing N00–N07 scene identifiers remain authoritative logic districts, task boundaries, and save/recovery references, but are no longer presented as isolated stage screens.

The player starts on the forest surface, reaches a settlement in a natural meadow clearing, follows the stream downward, and progressively discovers a waterwheel embedded in a ravine. The camera reveals only a local crop of the larger map. Terrain, roots, structures, water, and darkness continue beyond the frame.

The region also gains a small persistent wet-forest ecosystem inspired by Rain World's systemic principles: creatures act for their own survival needs, can migrate and interact off-screen, and are influenced by habitat rather than fixed spawn or patrol points. The implementation will be original and will not copy Rain World or Noita assets, layouts, palettes, creatures, or code.

## 2. Goals

- Replace the current framed, postcard-like world presentation with a continuous orthographic map.
- Preserve the small-player/large-world relationship at a fixed `640×360` logical view.
- Make the waterwheel a partially revealed world structure, not a centered background illustration.
- Retain all existing first-chapter story and domain behavior through spatial adapters.
- Support a `16×8`-view forest region with an authored Chapter 1 accessible-space target between `35%` and `40%`.
- Provide a readable main route plus local alternate paths and later-return gates.
- Establish a seven-species visible wet-forest ecosystem with abstract basal biomass.
- Keep ecology persistent enough to react to the player while recovering through migration and reproduction.
- Keep the first-chapter critical path near the previously agreed roughly three-hour target; the full forest supports longer revisits.
- Remain deterministic across save/load, frame rate, checkpoint recovery, and fixed seeds.

## 3. Non-Goals

- A seamless global open world spanning forest, plains, mountains, and underground regions.
- Full Noita-style simulation of every world pixel in the first implementation.
- Full Rain World creature complexity or a hundred-species bestiary.
- Magic-mutated forest species in Chapter 1.
- Copying identifiable maps, rooms, creatures, sprites, palettes, or visual compositions from reference games.
- Replacing GameSession, chapter authority, WAL, learning, trade, reputation, or survival systems.
- Completing the plains region or its ecology in this project.

## 4. Reference Analysis

The Noita screenshots reviewed from the official Nolla Games press kit demonstrate a strict side-on cutaway, local camera framing, terrain that continues outside the viewport, sparse background depth, large unlit cavities, and landmarks revealed in pieces rather than framed in full.

Sources:

- <https://noitagame.com/>
- <https://noitagame.com/press/index.html>

Rain World development interviews describe creatures with independent survival needs, continued off-screen existence, relationship tables, modular behavior priorities, habitat or room attractiveness, and maps designed with multiple avoidance routes.

Sources:

- <https://unity.com/blog/exploring-procedural-design-rain-world>
- <https://www.gamedeveloper.com/design/crafting-the-complex-chaotic-ecosystem-of-i-rain-world-i->

These sources define structural lessons only. Production content must remain original.

## 5. Region Topology

### 5.1 Nominal scale

- Logical viewport: `640×360`.
- Region envelope: exactly `16` view widths by `8` view heights.
- Logical region bounds: `10,240×2,880` pixels; non-traversable mass and sealed areas remain inside this envelope.
- The region is not a filled rectangle. Bedrock, roots, sealed future areas, and voids occupy substantial space.
- Chapter 1 exposes approximately `35%–40%` of traversable forest space.
- Later language, medium, traversal, reputation, and story capabilities reopen visible but inaccessible branches.

### 5.2 Macro route

```text
forest surface arrival
  -> shallow stream and gathering zone
  -> meadow settlement clearing
  -> stream descent / hermit branch
  -> waterwheel ravine upper edge
  -> waterwheel middle and destructible alternatives
  -> cistern and return channel
  -> lower forest return shortcut
  -> meadow settlement
```

Deferred connections:

- Waterwheel/root-depth branches lead to deeper root caves after later capabilities.
- Cistern or return-channel infrastructure leads toward the old mine/underground region after its runtime exists.
- The meadow settlement connects to the plains as a region transition, not a seamless continuation.

### 5.3 District mapping

Existing N00–N07 identifiers remain stable and map onto spatial districts. They continue to own authored task, event, evidence, checkpoint, and persistence contracts. A district boundary is not necessarily a visible doorway or load screen.

The spatial coordinator resolves current district from authoritative world coordinates and verified map topology, then calls existing semantic/domain APIs. Domain events must never fabricate player position or teleport the player to an interaction target.

## 6. Meadow Settlement

The settlement occupies a naturally open, mostly level meadow inside the forest.

- Safety comes from cleared sight lines, resident activity, fires, fences, noise, and patrols—not elevation or a magic exclusion volume.
- The stream passes along one edge and links settlement life to the waterwheel and return-flow problem.
- Forest animals can approach the outer meadow, especially at night, but habitat avoidance reduces routine incursions into the center.
- The four principal directions connect toward forest arrival, the hermit branch, the waterwheel descent, and the future plains transition.
- Flooding, drought, and return-flow imbalance can affect the outskirts without randomly destroying critical structures.
- Reputation changes guard alertness, trade prices, gifts, shelter access, and willingness to help.

## 7. Local Layout Rules

- Every critical traversal segment has one readable primary route.
- Most districts offer one or two local alternatives: upper roots/tree structures, lower water passages, destructible barriers, or return shortcuts.
- Randomized pockets can contain resources, nests, hazards, or minor encounters, but never critical story authority.
- Critical entrances, checkpoints, learning sources, settlement services, and return-flow machinery remain authored and seed-stable.
- Mainline routes cannot depend on killing a specific creature.
- Ordinary encounter spaces must expose at least two valid escape directions so ecological AI cannot routinely produce unavoidable traps.
- Large structures are composed into the world and are normally cropped by the viewport.
- Terrain must touch or continue beyond viewport edges; a local camera frame must not read as a complete diorama.

## 8. Generation Model

The forest uses a fixed authored macro skeleton with deterministic local variation.

Authored and fixed:

- district graph and region exits;
- settlement, hermit, waterwheel, cistern, return-flow, checkpoint, and story anchors;
- minimum clearances and critical-route collision envelopes;
- ecology-safe corridors around critical transitions;
- later-capability gates;
- seed-independent task distances and ordering.

Seeded variation:

- small caves and root pockets;
- loose materials and harvestable resources;
- nest candidates within valid habitat zones;
- water accumulation and minor blockage shapes;
- non-critical destructible shortcuts;
- initial ordinary creature placement and local biomass.

The generator must validate connectivity after variation. Invalid seeds fail generation and are never silently repaired by teleporting the player or removing domain prerequisites.

## 9. World Material and Streaming Model

- Visible material granularity: `1` logical pixel.
- Hidden storage/update chunk: `16×16` logical pixels.
- The runtime streams collision/material chunks around the camera and keeps a larger low-cost topology ring for nearby ecology.
- Chapter 1 material reactions remain the approved limited set: wet soil/mud, wood/fire/smoke/char/ash, heat/water/steam, cold/water/thin ice, and strong-water displacement of loose soil or sand.
- Protected critical structures can react visually and locally but cannot lose required traversal authority.
- Committed quest/environment outcomes persist. Incidental water, mud, fire, and debris reset only when the existing checkpoint or soft-lock persistence contract explicitly permits it.

## 10. Camera and Composition

- Projection is strict side-on orthographic.
- Logical resolution remains `640×360`; browser scaling uses nearest-neighbor presentation.
- Camera uses a dead zone and `18%` movement-direction look-ahead.
- Downward movement biases the camera down; upward pursuit lags slightly to preserve uncertainty.
- The camera never zooms out to reveal a landmark.
- Waterwheel discovery is staged: water sound/channel, supports, broken rim, then additional machinery as the player moves.
- Sky appears at the surface and limited ravine openings only.
- Backgrounds are sparse, dark silhouettes, fog gaps, and regional color fields. They do not form a scenic horizon illustration.
- Player glow remains forbidden. Readability comes from silhouette, controlled clothing value, and local background contrast.

## 11. Rendering Layers

Back to front:

1. regional darkness, time-of-day, and weather color;
2. sparse distant roots, tree trunks, rock silhouettes, and fog;
3. structural/non-destructible region mass;
4. interactive soil, wet soil, rock, wood, metal, water, and vegetation;
5. creatures, player, carried items, and world drops;
6. liquid, fire, smoke, particles, and local lights;
7. narrow semantic HUD.

The v001–v003 waterwheel compositions remain private concept/error-history assets. They are not approved runtime backgrounds and must not enter the public asset export.

## 12. First-Chapter Wet-Forest Ecology

### 12.1 Basal ecology

Sub-player-scale organisms are not persistent visible actors. Each habitat chunk stores abstract densities:

- plant biomass;
- detritus/rot;
- insect activity;
- aquatic biomass;
- edible roots/fruit;
- carrion.

They appear through restrained ambient particles, ripples, grass motion, feeding behavior, and audio—not thousands of collidable agents.

### 12.2 Visible species

| Runtime role | Relative size | Core diet / behavior |
| --- | ---: | --- |
| large forest frog | `0.5–0.7×` player | insect/aquatic biomass; wet-zone prey |
| rabbit | `0.7–0.9×` | grass and shoots; primary meadow prey |
| wetland/scavenger bird | `0.8–1.2×` | frogs, aquatic biomass, small carrion |
| water snake | length `1.2–1.8×` | wetland ambush predator |
| fox | `1.1–1.4×` | rabbits, frogs, carrion |
| wild boar | `1.5–2×` | roots, fruit, insects, carrion; territorial |
| forest lynx | `1.4–1.8×` | high-tier nocturnal predator |

Magic-mutated variants are excluded from Chapter 1. Data contracts reserve an explicit anomaly/mutation extension for later mainline progression.

### 12.3 Relationship model

Each visible species owns an authored relation table keyed by other species and relevant objects. Relations include prey, threat, competitor, neutral, shelter, food source, and social memory where applicable.

Medium/large individuals track:

- hunger and thirst;
- injury;
- fear and confidence;
- current goal;
- territory or home den;
- last perceived threats/food;
- migration target;
- player-specific memory only where behavior requires it.

Creatures never read hidden exact player coordinates. Perception comes from sight, sound, nearby disturbance, and simplified scent traces.

## 13. Ecological Simulation Tiers

### Active ring

Near the camera, creatures use full movement, perception, animation, collision, combat, hunting, fleeing, and physical interaction.

### Adjacent ring

Adjacent streamed districts update at a lower frequency. They resolve route movement, feeding opportunities, den return, and migration without rendering or detailed physics.

### Distant region

Far districts update population pressure, biomass, migration, reproduction, and major authored ecological events only.

Entering an area materializes creatures from their authoritative abstract state at valid dens, exits, or last-known positions. The system does not create arbitrary screen-edge spawns to challenge the player.

## 14. Persistence and Recovery

- Killing or driving away creatures causes real short-term local reduction.
- Prey loss can cause predators to migrate; predator loss can increase smaller prey pressure.
- Fire, water changes, carrion, food drops, and noise alter local habitat attractiveness.
- Neighbor migration and reproduction recover populations over several day/night cycles.
- The save stores nest state, local population pressure, significant individuals, injuries, migration, biomass, and important player-caused events.
- Group biomass does not persist every microscopic organism.
- Soft-lock recovery is allowed only to change non-critical migration targets or relocate a non-critical creature to a valid neighboring habitat; it never resurrects the same dead individual.
- Key task evidence must not depend on one randomly simulated animal remaining alive.

## 15. Player Position in the Food Web

The player is neither the ecosystem center nor an early apex predator.

- Hunting supplies useful meat, hides, and materials.
- Foraging, fishing abstraction, trade, gifts, and purchased food remain viable alternatives.
- Mainline completion never requires killing a specific wild animal.
- Overhunting affects prey pressure, predator movement, settlement reputation, and later availability.
- Restraint, clean harvest, and full use of a carcass can receive different authored reactions.
- Large predators are often better avoided, observed, redirected, or handled through terrain than killed.

## 16. Day/Night Behavior

The existing `48`-minute cycle remains authoritative:

- dawn: `6` minutes;
- day: `20` minutes;
- dusk: `6` minutes;
- night: `16` minutes.

Species modify activity and route preferences by time rather than swapping through spawn tables. Rabbits trend toward dawn, frogs toward wet dusk conditions, foxes toward dusk/night, and lynx toward deep night. Weather and special states remain extension points for later work.

## 17. Domain Integration

```text
continuous forest map + ecology runtime
              -> trusted spatial interaction coordinator
              -> existing GameSession proposals/events
              -> task, learning, economy, survival, reputation, WAL
```

The coordinator provides verified scene/district, position, world revision, nearby interaction identity, and runtime receipts. Existing reducers remain the authority for domain outcomes.

The spatial runtime must not:

- directly mutate quest flags;
- mint learning evidence;
- bypass economy/WAL transactions;
- fabricate interaction positions;
- teleport the player to satisfy a semantic command.

## 18. Failure Handling

- Invalid map schema, stale generated content, missing approved assets, or failed connectivity validation blocks forest activation.
- Missing ecology definitions block the affected region rather than silently replacing creatures with placeholders.
- Invalid or non-finite positions, revisions, and habitat parameters fail closed.
- A generated local variation that breaks the authored critical path is rejected before play.
- Recovery actions are explicit and auditable; they do not rewrite committed domain history.

## 19. Verification

Required automated coverage:

- fixed seed produces byte-stable macro topology and critical anchors;
- randomized pockets never disconnect the Chapter 1 route;
- surface arrival → meadow settlement → hermit branch → waterwheel ravine → cistern/return channel → settlement is traversable;
- later areas remain visible but inaccessible without their authored capabilities;
- camera never reveals a complete large landmark through automatic zoom;
- material/collision results match at 30 and 60 rendering fps under the same fixed-step inputs;
- visible creature relation tables are exact and complete;
- active/adjacent/distant ecology transitions conserve authoritative individuals/population pressure;
- hunting, carrion, fire, water, and time change habitat pressure deterministically;
- population recovery occurs through migration/reproduction rather than reset;
- save/load and checkpoint recovery do not duplicate or resurrect creatures;
- critical tasks remain completable under every supported ecology state;
- public visual assets remain blocked until separately approved through the asset gate.

Required manual/browser coverage:

- full-screen camera at desktop and mobile aspect ratios;
- player readability at actual `1×` logical scale without glow;
- terrain continuation beyond all frame edges;
- partial waterwheel reveal while moving through the ravine;
- day/night local-light readability;
- ecological encounters offer readable avoidance routes;
- meadow settlement reads as a maintained clearing inside a living forest.

## 20. Delivery Boundary

This design replaces the current waterwheel visual-pack-first execution order.

The next implementation plan must begin with:

1. graybox continuous forest topology and camera;
2. streamed material/collision chunks;
3. settlement clearing, stream descent, and partial waterwheel structure;
4. spatial adapters to existing Chapter 1 logic;
5. basal habitat model and first visible species;
6. ecology persistence/off-screen tiers;
7. original runtime art authored against the proven graybox rather than generated as a complete scene illustration;
8. browser acceptance and user visual audit.

No waterwheel environment pack is approved or exported before the graybox composition and camera are accepted.
