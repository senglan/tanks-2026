import {
  ANGLE_STEP,
  FIXED_STEP_SECONDS,
  ITEMS,
  POWER_STEP,
  WEAPONS
} from "../content/definitions";
import { planAiTurn } from "../ai/planAiTurn";
import { buildMatchConfig, canStartAnotherRound, createDefaultSetupState, createSession, mergeRoundIntoSession, purchaseItem, purchaseUpgrade, purchaseWeapon, startNextRound } from "./session";
import {
  applyCommand,
  getActiveTank,
  stepMatch
} from "./simulation";
import type {
  AppState,
  MatchCommand,
  RoundSummary,
  TankProfile
} from "./types";
import { ArenaRenderer } from "../render/ArenaRenderer";
import { DomAppShell, type ShellAction } from "../render/domAppShell";
import { SoundManager } from "../render/SoundManager";
import {
  buildProfileFromRosterTank,
  deleteProfile,
  loadSaveFile,
  saveSaveFile,
  upsertProfile
} from "../storage/profileStorage";

interface HeldInputs {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  powerUp: boolean;
  powerDown: boolean;
}

interface AiQueue {
  commands: MatchCommand[];
  delay: number;
}

export class AppController {
  private readonly renderer: ArenaRenderer;
  private readonly shell: DomAppShell;
  private readonly sound = new SoundManager();
  private state: AppState;
  private roundSummary: RoundSummary | null = null;
  private heldInputs: HeldInputs = {
    left: false,
    right: false,
    up: false,
    down: false,
    powerUp: false,
    powerDown: false
  };
  private targetPreviewX: number | null = null;
  private aiQueue: AiQueue | null = null;
  private aiThinkTimer = 0.45;
  private commandRepeatAccumulator = 0;
  private lastFrameTime = performance.now();
  private simulationAccumulator = 0;
  private roundTransitionTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement
  ) {
    this.state = {
      screen: "mainMenu",
      setup: createDefaultSetupState(),
      saveFile: loadSaveFile(),
      session: null,
      inputMode: { kind: "normal" },
      message: "Ready"
    };
    this.renderer = new ArenaRenderer(canvas);
    this.shell = new DomAppShell(uiRoot, (action) => this.handleShellAction(action));
    this.renderer.setPointerHandlers(
      (worldX) => this.handlePointerClick(worldX),
      (worldX) => this.handlePointerHover(worldX)
    );
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("resize", () => this.renderer.resize());
  }

  start(): void {
    this.renderer.engine.runRenderLoop(() => this.frame());
  }

  private frame(): void {
    const now = performance.now();
    const deltaSeconds = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.commandRepeatAccumulator += deltaSeconds;
    this.simulationAccumulator += deltaSeconds;

    this.processMatchFlow(deltaSeconds);
    this.shell.render({
      screen: this.state.screen,
      message: this.state.message,
      setup: this.state.setup,
      saveFile: this.state.saveFile,
      session: this.state.session,
      roundSummary: this.roundSummary,
      targetingLabel: this.getTargetingLabel()
    });
    this.renderer.render({
      match: this.state.session?.currentRound ?? null,
      targetPreviewX: this.targetPreviewX,
      targeting: this.state.inputMode.kind === "targeting"
    });
  }

  private processMatchFlow(deltaSeconds: number): void {
    const match = this.state.session?.currentRound;

    if (!match || this.state.screen !== "match") {
      return;
    }

    if (match.phase === "command") {
      const activeTank = getActiveTank(match);

      if (!activeTank) {
        return;
      }

      if (activeTank.controller === "ai") {
        this.processAiTurn(deltaSeconds);
      } else if (this.state.inputMode.kind === "normal") {
        this.processHeldInputs();
      }
    } else {
      this.aiQueue = null;
      this.aiThinkTimer = 0.45;
    }

    let playedExplosion = false;

    while (this.simulationAccumulator >= FIXED_STEP_SECONDS) {
      const explosionCountBefore = match.explosions.length;
      stepMatch(match, FIXED_STEP_SECONDS);
      if (!playedExplosion && match.explosions.length > explosionCountBefore) {
        this.sound.playExplosion();
        playedExplosion = true;
      }

      this.simulationAccumulator -= FIXED_STEP_SECONDS;
    }

    if (match.phase === "roundOver") {
      this.roundTransitionTimer += deltaSeconds;

      if (this.roundTransitionTimer >= 0.7) {
        this.roundSummary = mergeRoundIntoSession(this.state.session!);
        this.state.screen = "roundSummary";
        this.state.inputMode = { kind: "normal" };
        this.targetPreviewX = null;
        this.aiQueue = null;
        this.roundTransitionTimer = 0;
        this.setMessage(this.roundSummary.outcome.reason);
      }
    } else {
      this.roundTransitionTimer = 0;
    }
  }

  private processAiTurn(deltaSeconds: number): void {
    const match = this.state.session?.currentRound;

    if (!match || match.phase !== "command") {
      return;
    }

    if (!this.aiQueue) {
      this.aiThinkTimer -= deltaSeconds;

      if (this.aiThinkTimer > 0) {
        return;
      }

      this.aiQueue = {
        commands: planAiTurn(match),
        delay: 0.18
      };
    }

    if (!this.aiQueue) {
      return;
    }

    this.aiQueue.delay -= deltaSeconds;

    if (this.aiQueue.delay > 0) {
      return;
    }

    const command = this.aiQueue.commands.shift();

    if (!command) {
      this.aiQueue = null;
      this.aiThinkTimer = 0.45;
      return;
    }

    this.executeMatchCommand(command, true);
    this.aiQueue.delay = command.type === "fire" || command.type === "teleport" ? 0.32 : 0.16;

    if (this.aiQueue.commands.length === 0) {
      this.aiQueue = null;
      this.aiThinkTimer = 0.45;
    }
  }

  private processHeldInputs(): void {
    if (this.commandRepeatAccumulator < 0.065) {
      return;
    }

    this.commandRepeatAccumulator = 0;

    if (this.heldInputs.left !== this.heldInputs.right) {
      this.executeMatchCommand({
        type: "move",
        direction: this.heldInputs.left ? -1 : 1
      });
    }

    if (this.heldInputs.up !== this.heldInputs.down) {
      this.executeMatchCommand({
        type: "adjustAngle",
        delta: this.heldInputs.up ? ANGLE_STEP : -ANGLE_STEP
      });
    }

    if (this.heldInputs.powerUp !== this.heldInputs.powerDown) {
      this.executeMatchCommand({
        type: "adjustPower",
        delta: this.heldInputs.powerUp ? POWER_STEP : -POWER_STEP
      });
    }
  }

  private handleShellAction(action: ShellAction): void {
    this.sound.touch();

    switch (action.type) {
      case "goto":
        this.sound.playUiClick();
        this.state.screen = action.screen;
        this.state.inputMode = { kind: "normal" };
        this.targetPreviewX = null;

        if (action.screen === "mainMenu" || action.screen === "matchSetup" || action.screen === "profiles") {
          if (action.screen !== "profiles") {
            this.state.session = action.screen === "mainMenu" ? null : this.state.session;
          }
        }
        this.setMessage("");
        return;
      case "setTankCount":
        this.state.setup.tankCount = action.value;
        this.state.setup.slots.forEach((slot, index) => {
          slot.enabled = index < action.value;
        });
        return;
      case "setRoundLimit":
        this.state.setup.roundLimit = action.value;
        return;
      case "setWeatherPreset":
        this.state.setup.weatherPreset = action.value;
        return;
      case "setTeamMode":
        this.state.setup.teamMode = action.value;
        return;
      case "updateSetupSlot":
        this.updateSetupSlot(action.slotId, action.field, action.value);
        return;
      case "startMatch":
        this.sound.playUiClick();
        this.startMatchSession();
        return;
      case "matchFire":
        this.handleFireIntent();
        return;
      case "matchDraw":
        this.executeMatchCommand({ type: "declareDraw" });
        return;
      case "cycleWeapon":
        this.executeMatchCommand({ type: "cycleWeapon", direction: action.direction });
        return;
      case "selectWeapon":
        this.executeMatchCommand({ type: "selectWeapon", weaponId: action.weaponId });
        return;
      case "useItem":
        this.handleItemIntent(action.itemId);
        return;
      case "cancelTargeting":
        this.state.inputMode = { kind: "normal" };
        this.targetPreviewX = null;
        this.setMessage("Targeting canceled.");
        return;
      case "continueAfterRound":
        this.sound.playUiClick();
        if (this.state.session && canStartAnotherRound(this.state.session)) {
          this.state.screen = "store";
        } else {
          this.state.screen = "matchSummary";
        }
        return;
      case "purchaseWeapon":
        if (action.weaponId !== "basicShell" && this.state.session) {
          const message = purchaseWeapon(this.state.session, action.tankId, action.weaponId);
          if (!message.startsWith("Not enough")) {
            this.sound.playPurchase();
          }
          this.setMessage(message);
        }
        return;
      case "purchaseItem":
        if (this.state.session) {
          const message = purchaseItem(this.state.session, action.tankId, action.itemId);
          if (!message.startsWith("Not enough")) {
            this.sound.playPurchase();
          }
          this.setMessage(message);
        }
        return;
      case "purchaseUpgrade":
        if (this.state.session) {
          const message = purchaseUpgrade(
            this.state.session,
            action.tankId,
            action.upgradeId
          );
          if (
            !message.startsWith("Not enough") &&
            !message.endsWith("already maxed.")
          ) {
            this.sound.playPurchase();
          }
          this.setMessage(message);
        }
        return;
      case "saveProfile":
        this.sound.playUiClick();
        this.saveRosterTankProfile(action.tankId);
        return;
      case "deleteProfile":
        this.sound.playUiClick();
        this.state.saveFile = deleteProfile(this.state.saveFile, action.profileId);
        this.state.setup.slots.forEach((slot) => {
          if (slot.selectedProfileId === action.profileId) {
            slot.selectedProfileId = null;
          }
        });
        saveSaveFile(this.state.saveFile);
        this.setMessage("Profile deleted.");
        return;
      case "startNextRound":
        if (this.state.session) {
          this.sound.playUiClick();
          startNextRound(this.state.session);
          this.state.screen = "match";
          this.roundSummary = null;
          this.state.inputMode = { kind: "normal" };
          this.targetPreviewX = null;
          this.setMessage(`Round ${this.state.session.roundIndex} started.`);
        }
        return;
      case "finishMatch":
        this.sound.playUiClick();
        this.state.screen = "matchSummary";
        return;
      default:
        return;
    }
  }

  private updateSetupSlot(
    slotId: string,
    field: "displayName" | "color" | "controller" | "aiDifficulty" | "teamId" | "selectedProfileId",
    value: string
  ): void {
    const slot = this.state.setup.slots.find((candidate) => candidate.id === slotId);

    if (!slot) {
      return;
    }

    if (field === "selectedProfileId") {
      slot.selectedProfileId = value || null;

      if (slot.selectedProfileId) {
        const profile = this.state.saveFile.profiles.find(
          (candidate) => candidate.id === slot.selectedProfileId
        );

        if (profile) {
          slot.displayName = profile.displayName;
          slot.color = profile.color;
        }
      }

      return;
    }

    slot[field] = value as never;
  }

  private startMatchSession(): void {
    const config = buildMatchConfig(this.state.setup, this.state.saveFile);
    this.state.session = createSession(config);
    startNextRound(this.state.session);
    this.state.screen = "match";
    this.state.inputMode = { kind: "normal" };
    this.targetPreviewX = null;
    this.roundSummary = null;
    this.aiQueue = null;
    this.aiThinkTimer = 0.45;
    this.setMessage("Match started.");
  }

  private handleItemIntent(itemId: keyof typeof ITEMS): void {
    if (itemId === "teleport") {
      const match = this.state.session?.currentRound;
      const tank = match ? getActiveTank(match) : null;

      if (!tank || tank.itemInventory.teleport <= 0) {
        this.setMessage("No teleports remaining.");
        return;
      }

      this.state.inputMode = {
        kind: "targeting",
        action: "teleport",
        ownerTankId: tank.id
      };
      this.setMessage("Click the terrain to teleport.");
      return;
    }

    this.executeMatchCommand({ type: "useItem", itemId });
  }

  private handleFireIntent(): void {
    const match = this.state.session?.currentRound;
    const tank = match ? getActiveTank(match) : null;

    if (!match || !tank) {
      return;
    }

    const weapon = WEAPONS[tank.selectedWeaponId];

    if (weapon.targeted) {
      this.state.inputMode = {
        kind: "targeting",
        action: "airStrike",
        ownerTankId: tank.id
      };
      this.setMessage("Click a target column for the air strike.");
      return;
    }

    this.executeMatchCommand({ type: "fire" });
  }

  private handlePointerClick(worldX: number): void {
    if (this.state.inputMode.kind !== "targeting") {
      return;
    }

    this.sound.touch();

    if (this.state.inputMode.action === "teleport") {
      this.executeMatchCommand({ type: "teleport", targetX: worldX });
    } else {
      this.executeMatchCommand({ type: "fire", targetX: worldX });
    }

    this.state.inputMode = { kind: "normal" };
    this.targetPreviewX = null;
  }

  private handlePointerHover(worldX: number | null): void {
    this.targetPreviewX = this.state.inputMode.kind === "targeting" ? worldX : null;
  }

  private executeMatchCommand(command: MatchCommand, quiet = false): void {
    const match = this.state.session?.currentRound;

    if (!match) {
      return;
    }

    const actingTank = getActiveTank(match);
    const selectedWeaponId = actingTank?.selectedWeaponId ?? "basicShell";

    const message = applyCommand(match, command);

    if (command.type === "move" || command.type === "adjustAngle" || command.type === "adjustPower") {
      if (message === "Out of fuel." || message === "Terrain is too steep.") {
        this.setMessage(message);
      }
      return;
    }

    if (!quiet) {
      this.setMessage(message);
    }

    if (command.type === "fire") {
      this.sound.playFire(selectedWeaponId);
    } else if (
      command.type === "useItem" ||
      command.type === "teleport" ||
      command.type === "declareDraw" ||
      command.type === "selectWeapon" ||
      command.type === "cycleWeapon"
    ) {
      this.sound.playUiClick();
    }

    if (command.type === "fire" || command.type === "teleport" || command.type === "declareDraw") {
      this.aiQueue = null;
      this.aiThinkTimer = 0.45;
      this.commandRepeatAccumulator = 0;
    }
  }

  private saveRosterTankProfile(tankId: string): void {
    const tank = this.state.session?.roster.find((candidate) => candidate.id === tankId);

    if (!tank) {
      return;
    }

    const existing = tank.profileId
      ? this.state.saveFile.profiles.find((profile) => profile.id === tank.profileId) ?? null
      : this.findProfileByName(tank.displayName);
    const profile = buildProfileFromRosterTank(tank, existing);

    tank.profileId = profile.id;
    this.state.saveFile = upsertProfile(this.state.saveFile, profile);
    saveSaveFile(this.state.saveFile);
    this.setMessage(`${tank.displayName} saved to browser storage.`);
  }

  private findProfileByName(name: string): TankProfile | null {
    return (
      this.state.saveFile.profiles.find((profile) => profile.displayName === name) ?? null
    );
  }

  private getTargetingLabel(): string | null {
    if (this.state.inputMode.kind !== "targeting") {
      return null;
    }

    return this.state.inputMode.action === "teleport"
      ? "Teleport targeting: click terrain, ESC to cancel"
      : "Air Strike targeting: click a column, ESC to cancel";
  }

  private setMessage(message: string): void {
    this.state.message = message;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.state.screen !== "match") {
      return;
    }

    this.sound.touch();

    switch (event.key) {
      case "a":
      case "A":
      case "ArrowLeft":
        this.heldInputs.left = true;
        event.preventDefault();
        break;
      case "d":
      case "D":
      case "ArrowRight":
        this.heldInputs.right = true;
        event.preventDefault();
        break;
      case "w":
      case "W":
      case "ArrowUp":
        this.heldInputs.up = true;
        event.preventDefault();
        break;
      case "s":
      case "S":
      case "ArrowDown":
        this.heldInputs.down = true;
        event.preventDefault();
        break;
      case "e":
      case "E":
      case "PageUp":
        this.heldInputs.powerUp = true;
        event.preventDefault();
        break;
      case "q":
      case "Q":
      case "PageDown":
        this.heldInputs.powerDown = true;
        event.preventDefault();
        break;
      case "z":
      case "Z":
        this.executeMatchCommand({ type: "cycleWeapon", direction: -1 });
        event.preventDefault();
        break;
      case "x":
      case "X":
        this.executeMatchCommand({ type: "cycleWeapon", direction: 1 });
        event.preventDefault();
        break;
      case " ":
        this.handleFireIntent();
        event.preventDefault();
        break;
      case "Escape":
        if (this.state.inputMode.kind === "targeting") {
          this.state.inputMode = { kind: "normal" };
          this.targetPreviewX = null;
          this.setMessage("Targeting canceled.");
        }
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "a":
      case "A":
      case "ArrowLeft":
        this.heldInputs.left = false;
        break;
      case "d":
      case "D":
      case "ArrowRight":
        this.heldInputs.right = false;
        break;
      case "w":
      case "W":
      case "ArrowUp":
        this.heldInputs.up = false;
        break;
      case "s":
      case "S":
      case "ArrowDown":
        this.heldInputs.down = false;
        break;
      case "e":
      case "E":
      case "PageUp":
        this.heldInputs.powerUp = false;
        break;
      case "q":
      case "Q":
      case "PageDown":
        this.heldInputs.powerDown = false;
        break;
      default:
        break;
    }
  };
}
