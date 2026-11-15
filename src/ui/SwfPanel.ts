// DOM view of a UI symbol exported layer by layer (tools/build_assets.py build_ui). Button layers have
// state variants named "<layer>@<frame>" (2 = over, 3 = down, last = selected).
export interface PanelLayer { frame: string; x: number; y: number; w: number; h: number }
export interface PanelField {
  layer: string; path: string; box_px: [number, number, number, number]; font: string; size_px: number; color: string;
  align: string; filters: Array<{ type: string; color?: number[]; blur_x?: number }>; text: string;
  multiline?: boolean; word_wrap?: boolean;
  // Rotated or skewed fields: unrotated bounds and the world matrix [a, b, c, d, tx, ty] (px).
  local_px?: [number, number, number, number]; matrix?: [number, number, number, number, number, number];
}
export interface PanelLayout {
  layers: Record<string, PanelLayer>; order: string[]; text_fields: PanelField[];
  bounds: Record<string, [number, number, number, number] | null>;
  origins?: Record<string, [number, number]>;
}
interface AtlasFrame { filename: string; frame: { x: number; y: number; w: number; h: number } }
export interface UiAtlas { textures: Array<{ image: string; size: { w: number; h: number }; frames: AtlasFrame[] }> }

export class UiFrames {
  private frames = new Map<string, { img: string; f: AtlasFrame["frame"]; size: { w: number; h: number } }>();

  constructor(atlas: UiAtlas, base: string) {
    for (const t of atlas.textures) for (const fr of t.frames) this.frames.set(fr.filename, { img: base + t.image, f: fr.frame, size: t.size });
  }

  // Atlas pages are rendered at 2x; CSS shows them at layout size.
  apply(el: HTMLElement, name: string): boolean {
    const fr = this.frames.get(name);
    if (!fr) return false;
    el.style.backgroundImage = `url("${fr.img}")`;
    el.style.backgroundSize = `${fr.size.w / 2}px ${fr.size.h / 2}px`;
    el.style.backgroundPosition = `${-fr.f.x / 2}px ${-fr.f.y / 2}px`;
    el.style.width = `${fr.f.w / 2}px`;
    el.style.height = `${fr.f.h / 2}px`;
    return true;
  }
}

export function textShadow(filters: PanelField["filters"]): string {
  const f = filters.find((x) => x.type === "dropshadow" || x.type === "glow");
  if (!f?.color) return "";
  const c = `rgb(${f.color.slice(0, 3).join(",")})`;
  const r = Math.max(1, (f.blur_x ?? 2) / 2);
  return [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, y]) => `${x * r}px ${y * r}px ${r}px ${c}`).join(",");
}

const MIN_FONT_SIZE = 10;

export class SwfPanel {
  readonly root: HTMLDivElement;
  private layers = new Map<string, HTMLElement>();
  private texts = new Map<string, HTMLElement>();
  private sizes = new Map<string, number>();
  private selected = new Set<string>();
  private disabled = new Set<string>();
  private resting = new Map<string, number>();
  readonly minX: number;
  readonly minY: number;
  // Bounds of the drawn layers in the symbol's coordinates: [x0, y0, x1, y1].
  readonly extent: [number, number, number, number];

  constructor(readonly layout: PanelLayout, private readonly ui: UiFrames, skip: ReadonlySet<string> = new Set()) {
    this.root = document.createElement("div");
    this.root.className = "swf-panel";
    const base = [...new Set(layout.order)].filter((n) => !n.includes("@") && !skip.has(n) && !n.includes("/"));
    const boxes = base.map((n) => layout.layers[n]);
    this.minX = Math.min(0, ...boxes.map((l) => l.x));
    this.minY = Math.min(0, ...boxes.map((l) => l.y));
    this.extent = [Math.min(...boxes.map((l) => l.x)), Math.min(...boxes.map((l) => l.y)),
      Math.max(...boxes.map((l) => l.x + l.w)), Math.max(...boxes.map((l) => l.y + l.h))];
    for (const name of base) {
      const l = layout.layers[name];
      const el = document.createElement("div");
      el.className = "swf-layer";
      el.dataset.layer = name;
      ui.apply(el, l.frame);
      el.style.left = `${l.x - this.minX}px`;
      el.style.top = `${l.y - this.minY}px`;
      this.root.append(el);
      this.layers.set(name, el);
    }
    const seen = new Set<string>();
    for (const f of layout.text_fields) {
      // Button state variants repeat their label fields; the base layer's copy is the one used.
      if (skip.has(f.layer) || f.layer.includes("@") || seen.has(f.path)) continue;
      seen.add(f.path);
      const el = document.createElement("div");
      el.className = "swf-text";
      const [x, y, w, h] = f.box_px;
      Object.assign(el.style, {
        left: `${x - this.minX}px`, top: `${y - this.minY}px`, width: `${w}px`, height: `${h}px`, fontFamily: `"${f.font}"`,
        fontSize: `${f.size_px}px`, color: f.color, textAlign: f.align, lineHeight: `${h}px`, textShadow: textShadow(f.filters),
      });
      if (f.matrix && f.local_px) {
        // Flash draws the field in its own coordinates through its matrix (e.g. the rotated "Special Offer").
        const [lx, ly, lw, lh] = f.local_px;
        const [a, b, c, d, tx, ty] = f.matrix;
        Object.assign(el.style, { left: `${-this.minX}px`, top: `${-this.minY}px`, width: `${lw}px`, height: `${lh}px`, lineHeight: `${lh}px`,
          transformOrigin: "0 0", transform: `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty}) translate(${lx}px, ${ly}px)` });
      }
      if (f.multiline || f.word_wrap) Object.assign(el.style, { whiteSpace: "normal", lineHeight: "1.15" });
      this.root.append(el);
      this.texts.set(f.path, el);
      this.sizes.set(f.path, f.size_px);
    }
  }

  // Scales the panel about its registration point (the popup host's centre), e.g. a popup enlarged for a large window.
  setScale(scale: number): void {
    this.root.style.transformOrigin = `${-this.minX}px ${-this.minY}px`;
    this.root.style.transform = scale === 1 ? "" : `scale(${scale})`;
  }

  // Puts another exported symbol's root so that its registration point lands on `at` in this panel's coordinates.
  placeChild(child: SwfPanel, at: [number, number]): void {
    child.root.style.left = `${at[0] - this.minX + child.minX}px`;
    child.root.style.top = `${at[1] - this.minY + child.minY}px`;
  }

  textElement(path: string): HTMLElement | undefined {
    return this.texts.get(path);
  }

  layer(name: string): HTMLElement | undefined {
    return this.layers.get(name);
  }

  setVisible(name: string, visible: boolean): void {
    const el = this.layers.get(name);
    if (el) el.style.display = visible ? "" : "none";
    for (const f of this.layout.text_fields) if (f.layer === name) this.texts.get(f.path)!.style.display = visible ? "" : "none";
  }

  // TextManager.setTextScaled-style fitting for labels that must stay inside their field.
  setText(path: string, text: string, fit = false): void {
    const el = this.texts.get(path);
    if (!el) return;
    el.textContent = text;
    if (!fit) return;
    const ctx = document.createElement("canvas").getContext("2d")!;
    const w = parseFloat(el.style.width) - 8;
    const h = parseFloat(el.style.height);
    let size = this.sizes.get(path) ?? 12;
    for (; size > MIN_FONT_SIZE; size--) {
      ctx.font = `${size}px ${el.style.fontFamily}`;
      const m = ctx.measureText(text);
      if (m.width <= w && m.fontBoundingBoxAscent + m.fontBoundingBoxDescent + 2 <= h) break;
    }
    el.style.fontSize = `${size}px`;
  }

  private stateFrame(name: string, frame: number): string | undefined {
    return this.layout.layers[`${name}@${frame}`]?.frame;
  }

  private selectFrame(name: string): number | undefined {
    const frames = Object.keys(this.layout.layers).filter((k) => k.startsWith(name + "@")).map((k) => Number(k.split("@")[1]));
    const last = Math.max(...frames);
    return frames.length && last > 3 ? last : undefined;
  }

  // Button behaviour of the original DCButton: Up / Over / Down frames, plus a Select frame; a disabled
  // DynamicButton shows frame 4 and ignores the mouse.
  makeButton(name: string, onClick: () => void): void {
    const el = this.layers.get(name);
    if (!el) return;
    el.classList.add("swf-button");
    const show = (frame: number | null) => {
      if (this.disabled.has(name)) frame = 4;
      else if (frame === null && this.resting.has(name)) frame = this.resting.get(name)!;
      const f = frame === null ? undefined : this.stateFrame(name, frame);
      const sel = this.selected.has(name) ? this.selectFrame(name) : undefined;
      const target = f ?? (sel !== undefined ? this.stateFrame(name, sel) : undefined) ?? this.layout.layers[name].frame;
      const l = this.layout.layers[f ? `${name}@${frame}` : sel !== undefined ? `${name}@${sel}` : name];
      this.ui.apply(el, target);
      el.style.left = `${l.x - this.minX}px`;
      el.style.top = `${l.y - this.minY}px`;
    };
    el.addEventListener("pointerenter", () => show(2));
    el.addEventListener("pointerleave", () => show(null));
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      show(3);
    });
    el.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      show(2);
      if (!this.disabled.has(name)) onClick();
    });
    el.dataset.refresh = "1";
    (el as HTMLElement & { refresh?: () => void }).refresh = () => show(null);
  }

  // Shows another exported frame (<name>@<frame>) of a clip that is not a button, e.g. the gold bar of a price.
  showFrame(name: string, frame: number): void {
    const el = this.layers.get(name);
    const l = this.layout.layers[`${name}@${frame}`];
    if (!el || !l) return;
    this.ui.apply(el, l.frame);
    el.style.left = `${l.x - this.minX}px`;
    el.style.top = `${l.y - this.minY}px`;
  }

  // A state the button keeps while the mouse is away, such as the "off" frame of the music button.
  setSelectedFrame(name: string, frame: number | null): void {
    if (frame === null) this.resting.delete(name);
    else this.resting.set(name, frame);
    (this.layers.get(name) as (HTMLElement & { refresh?: () => void }) | undefined)?.refresh?.();
  }

  setDisabled(name: string, on: boolean): void {
    if (on) this.disabled.add(name);
    else this.disabled.delete(name);
    this.layers.get(name)?.classList.toggle("swf-disabled", on);
    (this.layers.get(name) as (HTMLElement & { refresh?: () => void }) | undefined)?.refresh?.();
  }

  setSelected(name: string, on: boolean): void {
    if (on) this.selected.add(name);
    else this.selected.delete(name);
    (this.layers.get(name) as (HTMLElement & { refresh?: () => void }) | undefined)?.refresh?.();
  }
}
