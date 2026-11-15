import { AnimationClip } from "./animation.js";
import { PlacedItem } from "./city.js";

export interface ItemArt {
  frames: number;
  fps: number;
}

// Animated decorations (isAnimated="1") loop their captured frames. Other items stay on their first
// frame: the reference capture of a rented house (mode 4) shows frame 1, not the lit-window frame 4
// that StateOnRent.setMode selects in some other mode.
export type ItemVisual = { kind: "static"; frame: number } | { kind: "loop"; clip: AnimationClip };

export function itemVisual(item: PlacedItem, art: ItemArt): ItemVisual {
  if (item.def.isAnimated && art.frames > 1) return { kind: "loop", clip: { frames: art.frames, fps: art.fps, loop: true } };
  return { kind: "static", frame: 0 };
}

// Draw order: items whose footprint ends lower on the map are drawn later.
export function itemDepth(item: PlacedItem): number {
  return (item.tileY + item.def.baseRows) * 1000 + item.tileX;
}
