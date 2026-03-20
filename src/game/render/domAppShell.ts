import { ITEMS, UPGRADES, WEAPONS, WEATHER_PRESETS } from "../content/definitions";
import type {
  AppScreen,
  ItemId,
  MatchSession,
  MatchSetupState,
  RoundSummary,
  SaveFileV1,
  UpgradeId,
  WeatherPreset,
  WeaponId
} from "../core/types";

export type ShellAction =
  | { type: "goto"; screen: Exclude<AppScreen, "match"> }
  | { type: "startMatch" }
  | { type: "setTankCount"; value: 2 | 3 | 4 }
  | { type: "setRoundLimit"; value: number }
  | { type: "setWeatherPreset"; value: WeatherPreset }
  | { type: "setTeamMode"; value: boolean }
  | {
      type: "updateSetupSlot";
      slotId: string;
      field:
        | "displayName"
        | "color"
        | "controller"
        | "aiDifficulty"
        | "teamId"
        | "selectedProfileId";
      value: string;
    }
  | { type: "matchFire" }
  | { type: "matchDraw" }
  | { type: "cycleWeapon"; direction: -1 | 1 }
  | { type: "selectWeapon"; weaponId: WeaponId }
  | { type: "useItem"; itemId: ItemId }
  | { type: "cancelTargeting" }
  | { type: "continueAfterRound" }
  | { type: "purchaseWeapon"; tankId: string; weaponId: WeaponId }
  | { type: "purchaseItem"; tankId: string; itemId: ItemId }
  | { type: "purchaseUpgrade"; tankId: string; upgradeId: UpgradeId }
  | { type: "saveProfile"; tankId: string }
  | { type: "deleteProfile"; profileId: string }
  | { type: "startNextRound" }
  | { type: "finishMatch" };

export interface ShellViewState {
  screen: AppScreen;
  message: string;
  setup: MatchSetupState;
  saveFile: SaveFileV1;
  session: MatchSession | null;
  roundSummary: RoundSummary | null;
  targetingLabel: string | null;
}

export class DomAppShell {
  private lastMarkup = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly onAction: (action: ShellAction) => void
  ) {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("change", this.handleChange);
  }

  render(view: ShellViewState): void {
    const statusText =
      view.targetingLabel ??
      (view.screen === "match"
        ? view.session?.currentRound?.announcement ?? view.message
        : view.message || screenLabel(view.screen));
    const markup = `
      <div class="shell ${view.screen === "match" ? "shell--match" : ""}">
        <header class="shell__topbar">
          <div>
            <h1 class="brand">Tanks 2026</h1>
            <p class="brand__sub">Browser-first artillery skirmish</p>
          </div>
          ${
            view.screen === "match"
              ? `<button class="button" data-action="match-draw">Declare Draw</button>`
              : `<div class="status-pill">${escapeHtml(statusText)}</div>`
          }
        </header>
        ${renderScreen(view)}
      </div>
    `;

    if (markup === this.lastMarkup) {
      return;
    }

    this.lastMarkup = markup;
    this.root.innerHTML = markup;
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const actionElement = target?.closest<HTMLElement>("[data-action]");

    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.action;

    switch (action) {
      case "goto":
        this.onAction({
          type: "goto",
          screen: actionElement.dataset.screen as Exclude<AppScreen, "match">
        });
        return;
      case "start-match":
        this.onAction({ type: "startMatch" });
        return;
      case "match-fire":
        this.onAction({ type: "matchFire" });
        return;
      case "match-draw":
        this.onAction({ type: "matchDraw" });
        return;
      case "cycle-weapon":
        this.onAction({
          type: "cycleWeapon",
          direction: actionElement.dataset.direction === "prev" ? -1 : 1
        });
        return;
      case "select-weapon":
        this.onAction({
          type: "selectWeapon",
          weaponId: actionElement.dataset.weaponId as WeaponId
        });
        return;
      case "use-item":
        this.onAction({
          type: "useItem",
          itemId: actionElement.dataset.itemId as ItemId
        });
        return;
      case "cancel-targeting":
        this.onAction({ type: "cancelTargeting" });
        return;
      case "continue-round":
        this.onAction({ type: "continueAfterRound" });
        return;
      case "buy-weapon":
        this.onAction({
          type: "purchaseWeapon",
          tankId: actionElement.dataset.tankId as string,
          weaponId: actionElement.dataset.weaponId as WeaponId
        });
        return;
      case "buy-item":
        this.onAction({
          type: "purchaseItem",
          tankId: actionElement.dataset.tankId as string,
          itemId: actionElement.dataset.itemId as ItemId
        });
        return;
      case "buy-upgrade":
        this.onAction({
          type: "purchaseUpgrade",
          tankId: actionElement.dataset.tankId as string,
          upgradeId: actionElement.dataset.upgradeId as UpgradeId
        });
        return;
      case "save-profile":
        this.onAction({
          type: "saveProfile",
          tankId: actionElement.dataset.tankId as string
        });
        return;
      case "delete-profile":
        this.onAction({
          type: "deleteProfile",
          profileId: actionElement.dataset.profileId as string
        });
        return;
      case "start-next-round":
        this.onAction({ type: "startNextRound" });
        return;
      case "finish-match":
        this.onAction({ type: "finishMatch" });
        return;
      default:
        return;
    }
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;

    if (!target) {
      return;
    }

    switch (target.name) {
      case "tank-count":
        this.onAction({
          type: "setTankCount",
          value: Number(target.value) as 2 | 3 | 4
        });
        return;
      case "round-limit":
        this.onAction({
          type: "setRoundLimit",
          value: Number(target.value)
        });
        return;
      case "weather-preset":
        this.onAction({
          type: "setWeatherPreset",
          value: target.value as WeatherPreset
        });
        return;
      case "team-mode":
        this.onAction({
          type: "setTeamMode",
          value: (target as HTMLInputElement).checked
        });
        return;
      default:
        break;
    }

    const slotId = target.dataset.slotId;
    const field = target.dataset.field as
      | "displayName"
      | "color"
      | "controller"
      | "aiDifficulty"
      | "teamId"
      | "selectedProfileId"
      | undefined;

    if (!slotId || !field) {
      return;
    }

    this.onAction({
      type: "updateSetupSlot",
      slotId,
      field,
      value: target.value
    });
  };
}

function renderScreen(view: ShellViewState): string {
  switch (view.screen) {
    case "mainMenu":
      return renderMainMenu();
    case "matchSetup":
      return renderSetup(view.setup, view.saveFile);
    case "profiles":
      return renderProfiles(view.saveFile);
    case "match":
      return renderMatch(view);
    case "roundSummary":
      return renderRoundSummary(view.roundSummary);
    case "store":
      return renderStore(view.session);
    case "matchSummary":
      return renderMatchSummary(view.session);
    default:
      return "";
  }
}

function renderMainMenu(): string {
  return `
    <section class="panel hero">
      <div class="hero__copy">
        <h2>Turn-based browser artillery</h2>
        <p>Local 2 to 4 tank matches, hot-seat play, AI, store upgrades, and browser saves.</p>
      </div>
      <div class="hero__actions">
        <button class="button button--primary" data-action="goto" data-screen="matchSetup">New Match</button>
        <button class="button" data-action="goto" data-screen="profiles">Saved Profiles</button>
      </div>
    </section>
  `;
}

function renderSetup(setup: MatchSetupState, saveFile: SaveFileV1): string {
  const slots = setup.slots
    .map((slot, index) => {
      const enabled = index < setup.tankCount;
      const profileOptions = [
        `<option value="">Fresh Tank</option>`,
        ...saveFile.profiles.map(
          (profile) =>
            `<option value="${profile.id}" ${
              slot.selectedProfileId === profile.id ? "selected" : ""
            }>${escapeHtml(profile.displayName)}</option>`
        )
      ].join("");

      return `
        <article class="card setup-card ${enabled ? "" : "card--dim"}" style="--tank-color:${slot.color}">
          <div class="card__header">
            <h3>${escapeHtml(slot.displayName)}</h3>
            <div class="setup-card__meta">
              <span class="color-chip" style="background:${slot.color}"></span>
              <span class="team-badge">${escapeHtml(slot.teamId)}</span>
            </div>
          </div>
          <label class="field">
            <span>Name</span>
            <input data-slot-id="${slot.id}" data-field="displayName" value="${escapeHtml(
              slot.displayName
            )}" ${enabled ? "" : "disabled"} />
          </label>
          <label class="field">
            <span>Color</span>
            <div class="color-field">
              <input type="color" data-slot-id="${slot.id}" data-field="color" value="${slot.color}" ${
        enabled ? "" : "disabled"
      } />
              <span class="color-preview">
                <span class="color-chip" style="background:${slot.color}"></span>
                ${slot.color.toUpperCase()}
              </span>
            </div>
          </label>
          <label class="field">
            <span>Controller</span>
            <select data-slot-id="${slot.id}" data-field="controller" ${enabled ? "" : "disabled"}>
              <option value="human" ${slot.controller === "human" ? "selected" : ""}>Human</option>
              <option value="ai" ${slot.controller === "ai" ? "selected" : ""}>AI</option>
            </select>
          </label>
          <label class="field">
            <span>AI Difficulty</span>
            <select data-slot-id="${slot.id}" data-field="aiDifficulty" ${
        enabled ? "" : "disabled"
      }>
              <option value="easy" ${slot.aiDifficulty === "easy" ? "selected" : ""}>Easy</option>
              <option value="medium" ${slot.aiDifficulty === "medium" ? "selected" : ""}>Medium</option>
              <option value="hard" ${slot.aiDifficulty === "hard" ? "selected" : ""}>Hard</option>
            </select>
          </label>
          <label class="field">
            <span>Team</span>
            <select data-slot-id="${slot.id}" data-field="teamId" ${enabled ? "" : "disabled"}>
              <option value="red" ${slot.teamId === "red" ? "selected" : ""}>Red</option>
              <option value="blue" ${slot.teamId === "blue" ? "selected" : ""}>Blue</option>
              <option value="gold" ${slot.teamId === "gold" ? "selected" : ""}>Gold</option>
              <option value="teal" ${slot.teamId === "teal" ? "selected" : ""}>Teal</option>
            </select>
          </label>
          <label class="field">
            <span>Profile</span>
            <select data-slot-id="${slot.id}" data-field="selectedProfileId" ${
        enabled ? "" : "disabled"
      }>
              ${profileOptions}
            </select>
          </label>
        </article>
      `;
    })
    .join("");

  return `
    <section class="panel">
      <div class="panel__header">
        <h2>Match Setup</h2>
        <button class="button" data-action="goto" data-screen="mainMenu">Back</button>
      </div>
      <div class="setup-toolbar">
        <label class="field field--compact">
          <span>Tanks</span>
          <select name="tank-count">
            <option value="2" ${setup.tankCount === 2 ? "selected" : ""}>2</option>
            <option value="3" ${setup.tankCount === 3 ? "selected" : ""}>3</option>
            <option value="4" ${setup.tankCount === 4 ? "selected" : ""}>4</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>Rounds</span>
          <select name="round-limit">
            <option value="1" ${setup.roundLimit === 1 ? "selected" : ""}>1</option>
            <option value="3" ${setup.roundLimit === 3 ? "selected" : ""}>3</option>
            <option value="5" ${setup.roundLimit === 5 ? "selected" : ""}>5</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>Weather</span>
          <select name="weather-preset">
            ${Object.values(WEATHER_PRESETS)
              .map(
                (preset) =>
                  `<option value="${preset.id}" ${
                    setup.weatherPreset === preset.id ? "selected" : ""
                  }>${preset.label}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="checkbox">
          <input type="checkbox" name="team-mode" ${setup.teamMode ? "checked" : ""} />
          <span>Team Mode</span>
        </label>
      </div>
      <div class="grid">${slots}</div>
      <div class="setup-footer">
        <button class="button button--primary" data-action="start-match">Start Match</button>
      </div>
    </section>
  `;
}

function renderProfiles(saveFile: SaveFileV1): string {
  const profiles = saveFile.profiles
    .map(
      (profile) => `
        <article class="card">
          <div class="card__header">
            <h3>${escapeHtml(profile.displayName)}</h3>
            <span class="color-chip" style="background:${profile.color}"></span>
          </div>
          <p>Money: ${profile.money} | Score: ${profile.score}</p>
          <p>Shield: ${profile.shieldHp}</p>
          <p class="muted">Updated ${new Date(profile.updatedAt).toLocaleString()}</p>
          <button class="button" data-action="delete-profile" data-profile-id="${profile.id}">Delete</button>
        </article>
      `
    )
    .join("");

  return `
    <section class="panel">
      <div class="panel__header">
        <h2>Saved Profiles</h2>
        <button class="button" data-action="goto" data-screen="mainMenu">Back</button>
      </div>
      <div class="grid">
        ${
          profiles ||
          `<p class="muted">No saved tank profiles yet. Save a tank from the store to populate this screen.</p>`
        }
      </div>
    </section>
  `;
}

function renderMatch(view: ShellViewState): string {
  const match = view.session?.currentRound;

  if (!match) {
    return "";
  }

  const activeTank = match.tanks[match.activeTankIndex];
  const weaponButtons = Object.values(WEAPONS)
    .map((weapon) => {
      const ammo = activeTank.weaponInventory[weapon.id];
      const available = ammo === -1 || ammo > 0;

      return `
        <button
          class="button ${activeTank.selectedWeaponId === weapon.id ? "button--primary" : ""}"
          data-action="select-weapon"
          data-weapon-id="${weapon.id}"
          ${available ? "" : "disabled"}
        >
          ${weapon.name} ${ammo === -1 ? "&infin;" : `x${ammo}`}
        </button>
      `;
    })
    .join("");
  const itemButtons = Object.values(ITEMS)
    .map(
      (item) => `
        <button
          class="button"
          data-action="use-item"
          data-item-id="${item.id}"
          ${activeTank.itemInventory[item.id] > 0 ? "" : "disabled"}
        >
          ${item.name} x${activeTank.itemInventory[item.id]}
        </button>
      `
    )
    .join("");

  return `
    <section class="match-shell match-shell--overlay">
      <div class="hud panel">
        <div class="panel__header">
          <h2>Actions</h2>
        </div>
        ${view.targetingLabel ? `<p class="targeting">${escapeHtml(view.targetingLabel)}</p>` : ""}
        ${
          view.targetingLabel
            ? `<div class="button-row"><button class="button" data-action="cancel-targeting">Cancel</button></div>`
            : ""
        }
        <details class="stack accordion" open>
          <summary>Weapons</summary>
          <div class="button-grid">${weaponButtons}</div>
        </details>
        <details class="stack accordion">
          <summary>Items</summary>
          <div class="button-grid">${itemButtons}</div>
        </details>
      </div>
      <aside class="match-readout panel">
        <p><strong>Active:</strong> ${escapeHtml(activeTank.displayName)}</p>
        <p><strong>HP:</strong> ${activeTank.currentHp}/${activeTank.maxHp}</p>
        <p><strong>Shield:</strong> ${activeTank.shieldHp}</p>
        <p><strong>Fuel:</strong> ${activeTank.currentFuel.toFixed(0)}</p>
        <p><strong>Angle:</strong> ${activeTank.angleDeg.toFixed(0)}&deg;</p>
        <p><strong>Power:</strong> ${activeTank.power.toFixed(0)}</p>
        <p><strong>Wind:</strong> ${match.wind.force.toFixed(1)}</p>
      </aside>
    </section>
  `;
}

function renderRoundSummary(roundSummary: RoundSummary | null): string {
  if (!roundSummary) {
    return "";
  }

  const tankLines = roundSummary.tanks
    .map(
      (tank) => `
        <div class="tank-row">
          <span>${escapeHtml(tank.displayName)}</span>
          <span>${tank.wasAliveAtEnd ? "Alive" : "Out"}</span>
          <span>$${tank.money}</span>
          <span>${tank.score} score</span>
          <span>${tank.damageDealt} dmg</span>
        </div>
      `
    )
    .join("");

  return `
    <section class="panel">
      <div class="panel__header">
        <h2>Round ${roundSummary.roundNumber} Summary</h2>
      </div>
      <p>${escapeHtml(roundSummary.outcome.reason)}</p>
      <div class="tank-list">${tankLines}</div>
      <div class="button-row">
        <button class="button button--primary" data-action="continue-round">Continue</button>
      </div>
    </section>
  `;
}

function renderStore(session: MatchSession | null): string {
  if (!session) {
    return "";
  }

  const tankCards = session.roster
    .map((tank) => {
      const weaponButtons = (Object.keys(WEAPONS) as WeaponId[])
        .filter((weaponId) => weaponId !== "basicShell")
        .map(
          (weaponId) => `
            <button
              class="button"
              data-action="buy-weapon"
              data-tank-id="${tank.id}"
              data-weapon-id="${weaponId}"
            >
              ${WEAPONS[weaponId].name} ($${WEAPONS[weaponId].cost})
            </button>
          `
        )
        .join("");
      const itemButtons = (Object.keys(ITEMS) as ItemId[])
        .map(
          (itemId) => `
            <button
              class="button"
              data-action="buy-item"
              data-tank-id="${tank.id}"
              data-item-id="${itemId}"
            >
              ${ITEMS[itemId].name} ($${ITEMS[itemId].cost})
            </button>
          `
        )
        .join("");
      const upgradeButtons = (Object.keys(UPGRADES) as UpgradeId[])
        .map((upgradeId) => {
          const baseCost = UPGRADES[upgradeId].cost + tank.upgrades[upgradeId] * 4;
          return `
            <button
              class="button"
              data-action="buy-upgrade"
              data-tank-id="${tank.id}"
              data-upgrade-id="${upgradeId}"
            >
              ${UPGRADES[upgradeId].name} Lv.${tank.upgrades[upgradeId]} ($${baseCost})
            </button>
          `;
        })
        .join("");

      return `
        <article class="card">
          <div class="card__header">
            <h3>${escapeHtml(tank.displayName)}</h3>
            <span class="color-chip" style="background:${tank.color}"></span>
          </div>
          <p>Money: $${tank.money}</p>
          <p>Score: ${tank.score}</p>
          <p>Shield: ${tank.shieldHp}</p>
          <p>Wins: ${tank.roundsWon}</p>
          <div class="stack">
            <strong>Weapons</strong>
            <div class="button-grid">${weaponButtons}</div>
          </div>
          <div class="stack">
            <strong>Items</strong>
            <div class="button-grid">${itemButtons}</div>
          </div>
          <div class="stack">
            <strong>Upgrades</strong>
            <div class="button-grid">${upgradeButtons}</div>
          </div>
          <div class="button-row">
            <button class="button" data-action="save-profile" data-tank-id="${tank.id}">Save Profile</button>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="panel">
      <div class="panel__header">
        <h2>Store</h2>
        <span class="muted">Round ${session.roundIndex}/${session.config.roundLimit}</span>
      </div>
      <div class="grid">${tankCards}</div>
      <div class="button-row">
        <button class="button button--primary" data-action="start-next-round">Next Round</button>
        <button class="button" data-action="finish-match">Finish Match</button>
      </div>
    </section>
  `;
}

function renderMatchSummary(session: MatchSession | null): string {
  if (!session) {
    return "";
  }

  const history = session.roundHistory
    .map(
      (summary) => `
        <div class="tank-row">
          <span>Round ${summary.roundNumber}</span>
          <span>${escapeHtml(summary.outcome.reason)}</span>
        </div>
      `
    )
    .join("");

  const roster = session.roster
    .map(
      (tank) => `
        <div class="tank-row">
          <span>${escapeHtml(tank.displayName)}</span>
          <span>$${tank.money}</span>
          <span>${tank.score} score</span>
          <span>${tank.roundsWon} wins</span>
          <span>${tank.totalDamageDealt} dmg</span>
        </div>
      `
    )
    .join("");

  return `
    <section class="panel">
      <div class="panel__header">
        <h2>Match Summary</h2>
        <button class="button" data-action="goto" data-screen="mainMenu">Main Menu</button>
      </div>
      <div class="stack">
        <h3>Roster</h3>
        <div class="tank-list">${roster}</div>
      </div>
      <div class="stack">
        <h3>Round History</h3>
        <div class="tank-list">${history}</div>
      </div>
    </section>
  `;
}

function screenLabel(screen: AppScreen): string {
  switch (screen) {
    case "mainMenu":
      return "Ready";
    case "matchSetup":
      return "Configure your match";
    case "profiles":
      return "Saved tank profiles";
    case "match":
      return "Battle in progress";
    case "roundSummary":
      return "Round complete";
    case "store":
      return "Between-round store";
    case "matchSummary":
      return "Match complete";
    default:
      return "";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
