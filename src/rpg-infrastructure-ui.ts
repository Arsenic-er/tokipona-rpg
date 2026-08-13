import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
  type ServiceSolutionEvidence,
  type WaterwheelSolutionEvidence,
} from "./game/prologue-waterwheel";

export type WaterwheelSolutionId =
  | "waterwheel.clear_natural_inflow"
  | "waterwheel.repair_axle"
  | "waterwheel.move_flume"
  | "waterwheel.dig_bypass"
  | "waterwheel.manifest_then_lock";

export type ServiceSolutionId =
  | "service.open_bypass_valve"
  | "service.place_wood_platform";

export type InfrastructureUiCommand =
  | Readonly<{ kind: "enter_waterwheel" }>
  | Readonly<{ kind: "observe_wheel" }>
  | Readonly<{ kind: "waterwheel_solution"; solutionId: WaterwheelSolutionId; evidence: WaterwheelSolutionEvidence }>
  | Readonly<{ kind: "enter_service" }>
  | Readonly<{ kind: "return_waterwheel" }>
  | Readonly<{ kind: "return_settlement" }>
  | Readonly<{ kind: "discover_tawa" }>
  | Readonly<{ kind: "attune_tawa" }>
  | Readonly<{ kind: "ground_tawa"; inService: boolean }>
  | Readonly<{ kind: "service_solution"; solutionId: ServiceSolutionId; evidence: ServiceSolutionEvidence }>
  | Readonly<{ kind: "read_o" }>
  | Readonly<{ kind: "accept_o" }>
  | Readonly<{ kind: "recover_softlock" }>;

export interface RpgInfrastructureUi {
  render(snapshot: PrologueFlowSnapshot): void;
}

const wheelEvidence: Readonly<Record<WaterwheelSolutionId, WaterwheelSolutionEvidence>> = Object.freeze({
  "waterwheel.clear_natural_inflow": {
    completedActionIds: ["inspect_intake", "remove_loose_debris", "open_existing_sluice"],
    world: { naturalInflowReachesWheel: true, axleAlignmentSafe: true, downstreamFlowBandSafe: true },
  },
  "waterwheel.repair_axle": {
    completedActionIds: ["recover_hand_tools", "fit_wooden_bushing", "tighten_axle_wedge"],
    world: { axleSupported: true, wheelRotatesFreely: true, downstreamFlowBandSafe: true },
  },
  "waterwheel.move_flume": {
    completedActionIds: ["release_flume_pins", "align_existing_flume", "mechanically_lock_flume"],
    world: { flumeAlignmentInBand: true, flumeLockEngaged: true, downstreamFlowBandSafe: true },
  },
  "waterwheel.dig_bypass": {
    completedActionIds: ["mark_safe_bank", "dig_soft_soil_bypass", "place_downstream_stones"],
    world: { bypassFlowReachesWheel: true, bankErosionBelowLimit: true, downstreamFlowBandSafe: true },
  },
  "waterwheel.manifest_then_lock": {
    completedActionIds: ["manifest_temporary_water", "move_flume_under_flow", "engage_mechanical_lock"],
    world: { temporaryFlowReachesWheel: true, mechanicalLockEngaged: true, downstreamFlowBandSafe: true },
  },
});

const serviceEvidence: Readonly<Record<ServiceSolutionId, ServiceSolutionEvidence>> = Object.freeze({
  "service.open_bypass_valve": {
    completedActionIds: ["find_maintenance_crank", "clear_valve_silt", "turn_bypass_valve"],
    world: { bypassValveOpen: true, bypassRouteClear: true },
  },
  "service.place_wood_platform": {
    completedActionIds: ["recover_planks", "place_support_stones", "lash_wood_platform"],
    world: { platformSupported: true, platformClearanceSafe: true },
  },
});

export function createRpgInfrastructureUi(
  onCommand: (command: InfrastructureUiCommand) => void,
): RpgInfrastructureUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("RPG infrastructure UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "infrastructure-root";
  root.innerHTML = `
    <section class="infrastructure-panel" data-infra-gateway hidden>
      <p class="eyebrow">N03 / INFRASTRUCTURE</p>
      <h2>Waterwheel route</h2>
      <p class="boundary-copy">Continue from the settlement to the authored N03 waterwheel scene.</p>
      <button type="button" data-infra-command="enter_waterwheel">Enter N03</button>
    </section>
    <section class="infrastructure-panel" data-infra-wheel hidden>
      <p class="eyebrow">N03 / WATERWHEEL</p><h2>Stable motion and safe downstream flow</h2>
      <div class="infra-state">
        <span>mode<strong data-infra-mode>stopped</strong></span>
        <span>rpm<strong data-infra-rpm>0</strong></span>
        <span>stable<strong data-infra-ticks>0 / 600</strong></span>
        <span>downstream<strong data-infra-safe>unsafe</strong></span>
      </div>
      <div class="physics-track"><b data-infra-progress></b></div>
      <div class="infra-section"><strong>Physics observation</strong>
        <button type="button" data-infra-command="observe_wheel">Observe 120 stable ticks</button>
      </div>
      <div class="infra-section"><strong>Five authored solution families</strong><div class="solution-grid">
        ${wheelButton("waterwheel.clear_natural_inflow", "Natural inflow", "tool", "structural")}
        ${wheelButton("waterwheel.repair_axle", "Repair axle", "tool", "structural")}
        ${wheelButton("waterwheel.move_flume", "Move flume", "tool", "structural")}
        ${wheelButton("waterwheel.dig_bypass", "Dig bypass", "tool", "temporary")}
        ${wheelButton("waterwheel.manifest_then_lock", "Manifest + lock", "magic", "temporary")}
      </div></div>
      <div class="infra-section"><strong>tawa evidence</strong><div class="language-grid">
        <button type="button" data-infra-command="discover_tawa">Discover tawa</button>
        <button type="button" data-infra-command="attune_tawa">Attune tawa</button>
        <button type="button" data-infra-command="ground_tawa">Predict motion</button>
      </div><small class="physics-copy" data-infra-tawa>unknown / locked / not grounded</small></div>
      <div class="return-grid">
        <button type="button" data-infra-command="enter_service">Enter N04</button>
        <button type="button" data-infra-command="return_settlement">Return N02</button>
        <button type="button" data-infra-command="recover_softlock">Recover route</button>
      </div>
    </section>
    <section class="infrastructure-panel" data-infra-service hidden>
      <p class="eyebrow">N04 / SERVICE CHANNEL</p><h2>Material routes</h2>
      <div class="infra-state">
        <span>route<strong data-service-mode>blocked</strong></span>
        <span>N05 boundary<strong data-cistern-ready>not ready</strong></span>
      </div>
      <div class="material-grid" aria-label="Authored material observations">
        ${material("water", "water")}${material("mud", "wet soil")}${material("stone", "stone")}
        ${material("wood", "wood")}${material("ice", "thin ice")}
      </div>
      <div class="infra-section"><strong>Independent non-magic routes</strong><div class="route-grid">
        <button type="button" data-service-solution="service.open_bypass_valve">Open bypass valve</button>
        <button type="button" data-service-solution="service.place_wood_platform">Place wood platform</button>
      </div></div>
      <div class="infra-section"><strong>Receptive grammar contact</strong><div class="language-grid">
        <button type="button" data-infra-command="ground_tawa_service">Ground tawa here</button>
        <button type="button" data-infra-command="read_o">Read o sign</button>
        <button type="button" data-infra-command="accept_o">Accept o prompt</button>
      </div><small class="physics-copy" data-infra-o>unseen; mastery is never automatic</small></div>
      <p class="boundary-copy">N05 becomes ready here, but step 8 never fabricates the next scene transition.</p>
      <div class="return-grid">
        <button type="button" data-infra-command="return_waterwheel">Return N03</button>
        <button type="button" data-infra-command="recover_softlock">Recover route</button>
        <button type="button" disabled>N05 boundary only</button>
      </div>
    </section>`;
  anchor.parentElement.insertBefore(root, anchor);

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;
    const wheelId = button.dataset.wheelSolution as WaterwheelSolutionId | undefined;
    if (wheelId) {
      onCommand({ kind: "waterwheel_solution", solutionId: wheelId, evidence: wheelEvidence[wheelId] });
      return;
    }
    const serviceId = button.dataset.serviceSolution as ServiceSolutionId | undefined;
    if (serviceId) {
      onCommand({ kind: "service_solution", solutionId: serviceId, evidence: serviceEvidence[serviceId] });
      return;
    }
    const command = button.dataset.infraCommand;
    if (!command) return;
    if (command === "ground_tawa_service") onCommand({ kind: "ground_tawa", inService: true });
    else if (command === "ground_tawa") onCommand({ kind: "ground_tawa", inService: false });
    else onCommand({ kind: command } as InfrastructureUiCommand);
  });

  return Object.freeze({
    render(snapshot: PrologueFlowSnapshot): void {
      const gateway = required<HTMLElement>(root, "[data-infra-gateway]");
      const wheelPanel = required<HTMLElement>(root, "[data-infra-wheel]");
      const servicePanel = required<HTMLElement>(root, "[data-infra-service]");
      gateway.hidden = snapshot.mode !== "settlement";
      wheelPanel.hidden = snapshot.mode !== "infrastructure" || snapshot.runtime.sceneId !== PROLOGUE_WATERWHEEL_SCENE_ID;
      servicePanel.hidden = snapshot.mode !== "infrastructure" || snapshot.runtime.sceneId !== PROLOGUE_SERVICE_CHANNEL_SCENE_ID;
      const infrastructure = snapshot.infrastructure;
      if (!infrastructure) return;
      const wheel = infrastructure.waterwheel;
      text(root, "[data-infra-mode]", wheel.activeMode);
      text(root, "[data-infra-rpm]", `${wheel.lastAngularVelocityRpm} RPM`);
      text(root, "[data-infra-ticks]", `${wheel.stableTicks} / ${wheel.requiredStableTicks}`);
      text(root, "[data-infra-safe]", wheel.downstreamSafe ? "safe" : "unsafe");
      required<HTMLElement>(root, "[data-infra-progress]").style.width =
        `${Math.min(100, (wheel.stableTicks / wheel.requiredStableTicks) * 100)}%`;
      const language = infrastructure.language;
      text(root, "[data-infra-tawa]", `${language.tawaDiscoveryState} / ${language.tawaAttunementState} / ${language.tawaLearningState ?? "not grounded"}`);
      text(root, "[data-infra-o]", language.grammarOReceptiveAccepted
        ? "receptive prompt understood; mastery false"
        : language.grammarOSeen ? "seen; mastery false" : "unseen; mastery is never automatic");
      text(root, "[data-service-mode]", infrastructure.serviceChannel.resultMode ?? "blocked");
      text(root, "[data-cistern-ready]", infrastructure.serviceChannel.cisternReady ? "ready" : "not ready");
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-wheel-solution]")) {
        button.disabled = !wheel.physicsReady || wheel.activeMode !== "stopped";
      }
      required<HTMLButtonElement>(root, "[data-infra-command='enter_service']").disabled =
        !wheel.physicsReady || wheel.activeMode === "stopped";
    },
  });
}

function wheelButton(id: WaterwheelSolutionId, label: string, route: string, mode: string): string {
  return `<button type="button" data-wheel-solution="${id}" data-route-kind="${route}" data-result-mode="${mode}">${label}</button>`;
}

function material(css: string, label: string): string {
  return `<span class="material-chip material-${css}"><i></i><small>${label}</small></span>`;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`Missing infrastructure UI element: ${selector}`);
  return value;
}

function text(root: ParentNode, selector: string, value: string): void {
  required<HTMLElement>(root, selector).textContent = value;
}
