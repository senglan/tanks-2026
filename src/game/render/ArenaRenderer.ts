import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import type { MatchState } from "../core/types";

interface TankVisual {
  root: TransformNode;
  body: Mesh;
  turretPivot: TransformNode;
  cannon: Mesh;
  shield: Mesh;
}

export interface ArenaRenderState {
  match: MatchState | null;
  targetPreviewX: number | null;
  targeting: boolean;
}

export class ArenaRenderer {
  readonly engine: Engine;

  private readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly materialCache = new Map<string, StandardMaterial>();
  private readonly tankVisuals = new Map<string, TankVisual>();
  private readonly projectileMeshes = new Map<string, Mesh>();
  private readonly explosionMeshes = new Map<string, Mesh>();
  private readonly clouds: Mesh[] = [];
  private activeTankMarker: Mesh | null = null;
  private activeTankBeam: LinesMesh | null = null;
  private terrainMesh: Mesh | null = null;
  private terrainLine: LinesMesh | null = null;
  private targetMarker: LinesMesh | null = null;
  private terrainRevision = -1;
  private activeWidth = 140;
  private activeHeight = 54;
  private activeFloor = 3;
  private activeTerrainMin = 10;
  private activeTerrainMax = 24;
  private targetClickHandler: ((worldX: number) => void) | null = null;
  private targetHoverHandler: ((worldX: number | null) => void) | null = null;
  private animationTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.07, 0.11, 0.18, 1);

    this.camera = new FreeCamera("arena-camera", new Vector3(70, 27, -60), this.scene);
    this.camera.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
    this.camera.setTarget(new Vector3(70, 20, 0));

    new HemisphericLight("arena-light", new Vector3(0.3, 0.9, -0.3), this.scene);

    this.createClouds();
    this.attachPointerEvents();
  }

  setPointerHandlers(
    onClick: ((worldX: number) => void) | null,
    onHover: ((worldX: number | null) => void) | null
  ): void {
    this.targetClickHandler = onClick;
    this.targetHoverHandler = onHover;
  }

  render(state: ArenaRenderState): void {
    this.animationTime += 1 / 60;

    if (state.match) {
      this.activeWidth = state.match.arenaWidth;
      this.activeHeight = state.match.arenaHeight;
      this.activeFloor = state.match.terrain.floor;
      this.activeTerrainMin = Math.min(...state.match.terrain.samples);
      this.activeTerrainMax = Math.max(...state.match.terrain.samples);
      this.updateCameraBounds(state.match.arenaWidth, state.match.arenaHeight);
      this.updateTerrain(state.match);
      this.updateTanks(state.match);
      this.updateProjectiles(state.match);
      this.updateExplosions(state.match);
      this.updateClouds(state.match.wind.force);
      this.updateTargetMarker(state.targeting ? state.targetPreviewX : null);
    } else {
      this.hideAllDynamics();
      this.updateCameraBounds(this.activeWidth, this.activeHeight);
      this.updateClouds(0);
      this.updateTargetMarker(null);
    }

    this.scene.render();
  }

  resize(): void {
    this.engine.resize();
    this.updateCameraBounds(this.activeWidth, this.activeHeight);
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }

  private updateTerrain(match: MatchState): void {
    if (match.terrain.revision === this.terrainRevision && this.terrainMesh && this.terrainLine) {
      return;
    }

    this.terrainMesh?.dispose();
    this.terrainLine?.dispose();

    const topPath: Vector3[] = [];
    const bottomPath: Vector3[] = [];
    const skirtDepth = 40;
    const edgePadding = 24;
    const leftEdgeY = match.terrain.samples[0] ?? match.terrain.floor;
    const rightEdgeY =
      match.terrain.samples[match.terrain.samples.length - 1] ?? match.terrain.floor;

    topPath.push(new Vector3(-edgePadding, leftEdgeY, 0));
    bottomPath.push(new Vector3(-edgePadding, match.terrain.floor - skirtDepth, 0));

    for (let index = 0; index < match.terrain.samples.length; index += 1) {
      const x = index * match.terrain.sampleSpacing;
      const y = match.terrain.samples[index];
      topPath.push(new Vector3(x, y, 0));
      bottomPath.push(new Vector3(x, match.terrain.floor - skirtDepth, 0));
    }

    topPath.push(new Vector3(match.terrain.width + edgePadding, rightEdgeY, 0));
    bottomPath.push(
      new Vector3(match.terrain.width + edgePadding, match.terrain.floor - skirtDepth, 0)
    );

    this.terrainMesh = CreateRibbon(
      "terrain",
      {
        pathArray: [topPath, bottomPath],
        closeArray: false,
        closePath: false,
        sideOrientation: 2
      },
      this.scene
    );
    this.terrainMesh.material = this.getMaterial("terrain", "#3c7a4a");

    this.terrainLine = CreateLines("terrain-line", { points: topPath }, this.scene);
    this.terrainLine.color = Color3.FromHexString("#d6e7a3");

    this.terrainRevision = match.terrain.revision;
  }

  private updateTanks(match: MatchState): void {
    const seen = new Set<string>();
    const activeTank = match.tanks[match.activeTankIndex] ?? null;

    for (const tank of match.tanks) {
      seen.add(tank.id);
      let visual = this.tankVisuals.get(tank.id);

      if (!visual) {
        visual = this.createTankVisual(tank.id, tank.color);
        this.tankVisuals.set(tank.id, visual);
      }

      visual.root.setEnabled(tank.alive);

      if (!tank.alive) {
        continue;
      }

      visual.root.position.set(tank.x, tank.y, -0.6);
      visual.root.rotation.z = degreesToRadians(tank.tiltDeg);
      visual.turretPivot.rotation.z = degreesToRadians(tank.angleDeg - tank.tiltDeg);
      visual.body.material = this.getMaterial(tank.color, tank.color);
      visual.cannon.material = this.getMaterial(
        `cannon-${tank.color}`,
        tank.color,
        1,
        "#111827"
      );
      visual.shield.setEnabled(tank.shieldHp > 0);
      visual.shield.material = this.getMaterial("shield", "#7dd3fc", 0.18, "#38bdf8");
    }

    if (activeTank && activeTank.alive) {
      this.ensureActiveMarker();
      const bob = Math.sin(this.animationTime * 4) * 0.16;
      this.activeTankMarker!.position.set(activeTank.x, activeTank.y + 4.2 + bob, -0.85);
      this.activeTankMarker!.scaling.setAll(0.85 + Math.sin(this.animationTime * 6) * 0.08);

      this.activeTankBeam?.dispose();
      this.activeTankBeam = CreateLines(
        "active-tank-beam",
        {
          points: [
            new Vector3(activeTank.x, activeTank.y + 1.9, -0.85),
            new Vector3(activeTank.x, activeTank.y + 3.75 + bob, -0.85)
          ]
        },
        this.scene
      );
      this.activeTankBeam.color = Color3.FromHexString("#67e8f9");
    } else {
      this.activeTankMarker?.setEnabled(false);
      this.activeTankBeam?.dispose();
      this.activeTankBeam = null;
    }

    for (const [tankId, visual] of this.tankVisuals) {
      if (seen.has(tankId)) {
        continue;
      }

      visual.root.dispose();
      this.tankVisuals.delete(tankId);
    }
  }

  private updateProjectiles(match: MatchState): void {
    const seen = new Set<string>();

    for (const projectile of match.projectiles) {
      seen.add(projectile.id);
      let mesh = this.projectileMeshes.get(projectile.id);

      if (!mesh) {
        mesh = CreateSphere(`projectile-${projectile.id}`, { diameter: 0.55 }, this.scene);
        this.projectileMeshes.set(projectile.id, mesh);
      }

      mesh.position.set(projectile.x, projectile.y, -0.75);
      mesh.material = this.getMaterial(
        `projectile-${projectile.weaponId}`,
        projectile.weaponId === "airStrike" ? "#ef4444" : "#ffd166",
        1,
        "#fff4c2"
      );
    }

    for (const [projectileId, mesh] of this.projectileMeshes) {
      if (seen.has(projectileId)) {
        continue;
      }

      mesh.dispose();
      this.projectileMeshes.delete(projectileId);
    }
  }

  private updateExplosions(match: MatchState): void {
    const seen = new Set<string>();

    for (const explosion of match.explosions) {
      seen.add(explosion.id);
      let mesh = this.explosionMeshes.get(explosion.id);

      if (!mesh) {
        mesh = CreateSphere(`explosion-${explosion.id}`, { diameter: 1 }, this.scene);
        this.explosionMeshes.set(explosion.id, mesh);
      }

      const scale = 0.45 + (1 - explosion.ttl / 0.45) * explosion.radius * 0.5;
      mesh.position.set(explosion.x, explosion.y, -0.7);
      mesh.scaling.set(scale, scale, scale * 0.55);
      mesh.material = this.getMaterial("explosion", "#f97316", 0.22, "#fde68a");
    }

    for (const [explosionId, mesh] of this.explosionMeshes) {
      if (seen.has(explosionId)) {
        continue;
      }

      mesh.dispose();
      this.explosionMeshes.delete(explosionId);
    }
  }

  private updateClouds(windForce: number): void {
    const width = this.activeWidth;

    for (let index = 0; index < this.clouds.length; index += 1) {
      const cloud = this.clouds[index];
      const speed = windForce * 0.06 + 0.03 * (index % 2 === 0 ? 1 : -1);
      let x = ((index * 26 + this.animationTime * speed * 60) % (width + 24)) - 12;

      if (x < -12) {
        x += width + 24;
      }

      cloud.position.x = x;
    }
  }

  private updateTargetMarker(targetX: number | null): void {
    this.targetMarker?.dispose();
    this.targetMarker = null;

    if (targetX === null) {
      return;
    }

    this.targetMarker = CreateLines(
      "target-marker",
      {
        points: [
          new Vector3(targetX, this.activeHeight - 2, -0.85),
          new Vector3(targetX, 0, -0.85)
        ]
      },
      this.scene
    );
    this.targetMarker.color = Color3.FromHexString("#fb7185");
  }

  private createTankVisual(id: string, color: string): TankVisual {
    const root = new TransformNode(`tank-root-${id}`, this.scene);
    const body = CreateBox(`tank-body-${id}`, { width: 3, height: 1.3, depth: 1.2 }, this.scene);
    body.parent = root;
    body.material = this.getMaterial(color, color);

    const turretPivot = new TransformNode(`tank-turret-${id}`, this.scene);
    turretPivot.parent = root;
    turretPivot.position.set(0, 0.45, 0);

    const cannon = CreateBox(
      `tank-cannon-${id}`,
      { width: 2.4, height: 0.28, depth: 0.45 },
      this.scene
    );
    cannon.parent = turretPivot;
    cannon.position.set(1.1, 0.05, 0);
    cannon.material = this.getMaterial(`cannon-${color}`, color, 1, "#111827");

    const shield = CreateSphere(`tank-shield-${id}`, { diameter: 4 }, this.scene);
    shield.parent = root;
    shield.position.set(0, 0.15, 0);
    shield.setEnabled(false);

    return {
      root,
      body,
      turretPivot,
      cannon,
      shield
    };
  }

  private createClouds(): void {
    for (let index = 0; index < 5; index += 1) {
      const cloud = CreateBox(
        `cloud-${index}`,
        { width: 9 - index, height: 1.6 + (index % 2) * 0.5, depth: 0.4 },
        this.scene
      );
      cloud.position.set(index * 20, 42 + (index % 3) * 3, 1.5);
      cloud.material = this.getMaterial("cloud", "#f8fafc", 0.2, "#ffffff");
      this.clouds.push(cloud);
    }
  }

  private hideAllDynamics(): void {
    for (const visual of this.tankVisuals.values()) {
      visual.root.setEnabled(false);
    }

    for (const mesh of this.projectileMeshes.values()) {
      mesh.dispose();
    }

    for (const mesh of this.explosionMeshes.values()) {
      mesh.dispose();
    }

    this.projectileMeshes.clear();
    this.explosionMeshes.clear();
    this.activeTankMarker?.setEnabled(false);
    this.activeTankBeam?.dispose();
    this.activeTankBeam = null;
  }

  private updateCameraBounds(arenaWidth: number, arenaHeight: number): void {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const paddedWidth = arenaWidth + 12;
    const paddedHeight = arenaHeight + 8;
    const arenaAspect = paddedWidth / paddedHeight;
    let viewWidth = paddedWidth;
    let viewHeight = paddedHeight;

    if (aspect > arenaAspect) {
      viewWidth = paddedHeight * aspect;
    } else {
      viewHeight = paddedWidth / aspect;
    }

    const centerX = arenaWidth / 2;
    const terrainMid = (this.activeTerrainMin + this.activeTerrainMax) / 2;
    const desiredTerrainBand = 0.38;
    const unclampedBottom = terrainMid - viewHeight * desiredTerrainBand;
    const bottom = clamp(unclampedBottom, this.activeFloor - 22, this.activeFloor - 7);
    const centerY = bottom + viewHeight / 2;

    this.camera.position.set(centerX, centerY, -60);
    this.camera.setTarget(new Vector3(centerX, centerY, 0));
    this.camera.orthoLeft = -viewWidth / 2;
    this.camera.orthoRight = viewWidth / 2;
    this.camera.orthoBottom = -viewHeight / 2;
    this.camera.orthoTop = viewHeight / 2;
  }

  private attachPointerEvents(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.targetClickHandler) {
        return;
      }

      this.targetClickHandler(this.clientXToWorldX(event.clientX));
    });

    this.canvas.addEventListener("pointermove", (event) => {
      this.targetHoverHandler?.(this.clientXToWorldX(event.clientX));
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.targetHoverHandler?.(null);
    });
  }

  private clientXToWorldX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const alpha = (clientX - rect.left) / Math.max(1, rect.width);
    const visibleLeft = this.camera.position.x + (this.camera.orthoLeft ?? 0);
    const visibleRight = this.camera.position.x + (this.camera.orthoRight ?? 0);

    return clamp(
      visibleLeft + alpha * (visibleRight - visibleLeft),
      0,
      this.activeWidth
    );
  }

  private getMaterial(
    key: string,
    colorHex: string,
    alpha = 1,
    emissiveHex?: string
  ): StandardMaterial {
    const cacheKey = `${key}-${colorHex}-${alpha}-${emissiveHex ?? "none"}`;
    const cached = this.materialCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const material = new StandardMaterial(cacheKey, this.scene);
    material.diffuseColor = Color3.FromHexString(colorHex);
    material.emissiveColor = emissiveHex
      ? Color3.FromHexString(emissiveHex)
      : Color3.FromHexString(colorHex).scale(0.25);
    material.alpha = alpha;
    this.materialCache.set(cacheKey, material);

    return material;
  }

  private ensureActiveMarker(): void {
    if (this.activeTankMarker) {
      this.activeTankMarker.setEnabled(true);
      return;
    }

    this.activeTankMarker = CreateSphere(
      "active-tank-marker",
      { diameter: 0.9 },
      this.scene
    );
    this.activeTankMarker.material = this.getMaterial(
      "active-marker",
      "#22d3ee",
      1,
      "#ecfeff"
    );
  }
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
