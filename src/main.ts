import "./styles.css";
import { startGame } from "./game/core/startGame";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Expected #app root to exist.");
}

startGame(root);
