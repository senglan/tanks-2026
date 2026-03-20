import { ITEMS, UPGRADES, WEAPONS } from "../content/definitions";
import type {
  ItemId,
  MatchSession,
  SessionRosterTank,
  UpgradeId,
  WeaponId
} from "../core/types";

export type AiStoreAction =
  | {
      type: "purchaseItem";
      tankId: string;
      itemId: ItemId;
    }
  | {
      type: "purchaseWeapon";
      tankId: string;
      weaponId: Exclude<WeaponId, "basicShell">;
    }
  | {
      type: "purchaseUpgrade";
      tankId: string;
      upgradeId: UpgradeId;
    };

interface PlannedTankState {
  id: string;
  money: number;
  shieldHp: number;
  itemInventory: SessionRosterTank["itemInventory"];
  weaponInventory: SessionRosterTank["weaponInventory"];
  upgrades: SessionRosterTank["upgrades"];
}

export function planAiStoreActions(
  session: MatchSession,
  tankId: string
): AiStoreAction[] {
  const tank = session.roster.find((candidate) => candidate.id === tankId);

  if (!tank || tank.controller !== "ai") {
    return [];
  }

  const actions: AiStoreAction[] = [];
  const planned = clonePlannedTankState(tank);
  const earlyRoundLimit = 1;

  while (true) {
    const nextAction =
      maybePlanItemPurchase(planned, "shield", 1, 0) ??
      maybePlanUpgradePurchase(planned, "armor", earlyRoundLimit) ??
      maybePlanUpgradePurchase(planned, "engineEfficiency", earlyRoundLimit) ??
      maybePlanUpgradePurchase(planned, "startingFuel", earlyRoundLimit) ??
      maybePlanWeaponPurchase(planned, "heavyShell", 1) ??
      maybePlanItemPurchase(planned, "repairKit", 1) ??
      (session.roundIndex >= 2
        ? maybePlanWeaponPurchase(planned, "multiShot", 1)
        : null) ??
      (session.roundIndex >= 2
        ? maybePlanItemPurchase(planned, "teleport", 1)
        : null) ??
      (session.roundIndex >= 3
        ? maybePlanWeaponPurchase(planned, "airStrike", 1, 4)
        : null);

    if (!nextAction) {
      break;
    }

    applyPlannedAction(planned, nextAction);
    actions.push(nextAction);
  }

  while (true) {
    const nextAction =
      maybePlanUpgradePurchase(planned, "armor") ??
      maybePlanUpgradePurchase(planned, "engineEfficiency") ??
      maybePlanUpgradePurchase(planned, "startingFuel");

    if (!nextAction) {
      break;
    }

    applyPlannedAction(planned, nextAction);
    actions.push(nextAction);
  }

  return actions;
}

function clonePlannedTankState(tank: SessionRosterTank): PlannedTankState {
  return {
    id: tank.id,
    money: tank.money,
    shieldHp: tank.shieldHp,
    itemInventory: { ...tank.itemInventory },
    weaponInventory: { ...tank.weaponInventory },
    upgrades: { ...tank.upgrades }
  };
}

function maybePlanItemPurchase(
  tank: PlannedTankState,
  itemId: ItemId,
  targetInventory = 1,
  minimumMoneyAfterPurchase = 0
): AiStoreAction | null {
  if (itemId === "shield" && (tank.shieldHp > 0 || tank.itemInventory.shield >= targetInventory)) {
    return null;
  }

  if (tank.itemInventory[itemId] >= targetInventory) {
    return null;
  }

  const cost = ITEMS[itemId].cost;

  if (tank.money - cost < minimumMoneyAfterPurchase) {
    return null;
  }

  return {
    type: "purchaseItem",
    tankId: tank.id,
    itemId
  };
}

function maybePlanWeaponPurchase(
  tank: PlannedTankState,
  weaponId: Exclude<WeaponId, "basicShell">,
  targetInventory = 1,
  minimumMoneyAfterPurchase = 0
): AiStoreAction | null {
  if (tank.weaponInventory[weaponId] >= targetInventory) {
    return null;
  }

  const cost = WEAPONS[weaponId].cost;

  if (tank.money - cost < minimumMoneyAfterPurchase) {
    return null;
  }

  return {
    type: "purchaseWeapon",
    tankId: tank.id,
    weaponId
  };
}

function maybePlanUpgradePurchase(
  tank: PlannedTankState,
  upgradeId: UpgradeId,
  targetLevel = UPGRADES[upgradeId].maxLevel
): AiStoreAction | null {
  const currentLevel = tank.upgrades[upgradeId];

  if (currentLevel >= targetLevel || currentLevel >= UPGRADES[upgradeId].maxLevel) {
    return null;
  }

  const cost = getUpgradeCost(tank, upgradeId);

  if (tank.money < cost) {
    return null;
  }

  return {
    type: "purchaseUpgrade",
    tankId: tank.id,
    upgradeId
  };
}

function applyPlannedAction(
  tank: PlannedTankState,
  action: AiStoreAction
): void {
  switch (action.type) {
    case "purchaseItem":
      tank.money -= ITEMS[action.itemId].cost;
      tank.itemInventory[action.itemId] += 1;
      return;
    case "purchaseWeapon":
      tank.money -= WEAPONS[action.weaponId].cost;
      tank.weaponInventory[action.weaponId] += 1;
      return;
    case "purchaseUpgrade":
      tank.money -= getUpgradeCost(tank, action.upgradeId);
      tank.upgrades[action.upgradeId] += 1;
      return;
    default:
      return;
  }
}

function getUpgradeCost(
  tank: PlannedTankState,
  upgradeId: UpgradeId
): number {
  return UPGRADES[upgradeId].cost + tank.upgrades[upgradeId] * 4;
}
