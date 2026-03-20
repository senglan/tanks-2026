import { AppController } from "./AppController";

export function startGame(root: HTMLElement): void {
  root.innerHTML = `
    <div class="game-app">
      <canvas id="game-canvas" aria-label="Tanks battlefield"></canvas>
      <div id="game-ui" class="game-ui"></div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas");
  const uiRoot = root.querySelector<HTMLElement>("#game-ui");

  if (!canvas || !uiRoot) {
    throw new Error("Expected canvas and UI root to exist.");
  }

  const controller = new AppController(canvas, uiRoot);
  controller.start();
}
