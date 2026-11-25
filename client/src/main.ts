import { connect } from "@gamehearth/sdk/client";
import type { KritzelAction, KritzelState, Options } from "../../src/game";
import { mountTable } from "./table";
import { texts } from "./texts";

async function start(): Promise<void> {
  const root = document.getElementById("app");
  if (root === null) {
    return;
  }
  try {
    const game = await connect<KritzelState, KritzelAction, Options>({ screen: true });
    const t = texts(game.language);
    document.documentElement.lang = game.language;
    document.title = t.name;
    mountTable(root, game, t);
  } catch (error) {
    const fallback = document.getElementById("fallback");
    if (fallback !== null) {
      fallback.textContent = `${texts(navigator.language).fallback} ${error instanceof Error ? error.message : ""}`;
      fallback.hidden = false;
    }
  }
}

void start();
