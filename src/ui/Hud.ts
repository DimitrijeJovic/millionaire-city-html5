import { formatNumber } from "../game/progression.js";

interface Layer { frame: string; x: number; y: number; w: number; h: number }
interface Field {
  layer: string; path: string; box_px: [number, number, number, number]; font: string; size_px: number; color: string;
  align: string; filters: Array<{ type: string; color?: number[]; blur_x?: number }>;
}
export interface HudLayout {
  layers: Record<string, Layer>; order: string[]; text_fields: Field[]; bounds: Record<string, [number, number, number, number] | null>;
}
interface AtlasFrame { filename: string; frame: { x: number; y: number; w: number; h: number } }
export interface AtlasJson { textures: Array<{ image: string; size: { w: number; h: number }; frames: AtlasFrame[] }> }

export interface HudValues {
  level: number; exp: number; coins: number; cash: number; cityName: string; companyValue: number; addLabel: string;
}

// HudOwner.load with Facebook credits disabled: the FC counter and its button are hidden and the cash,
// coins and both "Add" buttons move right by the FC counter's width. The buttons of the move, money collector,
// contract signator and video services are hidden because those services are not reconstructed.
const HIDDEN = new Set(["FC", "add_Facebook_Credits", "move", "moneyCollector", "contractSignator", "button_video",
  "name_city/photo", "name_city/arrow_down_red@1"]);
const FILL_BAR = "XP/fill_bar/bar";
// DCFillBar: MIN_WIDTH 1 px, grows by ANIMATION_SPEED 0.1 px per ms towards its target width.
const FILL_MIN_WIDTH = 1;
const FILL_SPEED_PX_PER_MS = 0.1;
// TextManager.setTextScaled (used by DynamicButton labels): shrink until the text fits.
const MIN_FONT_SIZE = 10;
const VERTICAL_MARGIN = 2;
const HORIZONTAL_MARGIN = 4;
const GUTTER = 2;
const SHIFTED_BY_FC = new Set(["Coins", "DCcash", "exchange_cash", "add_gold"]);
const RIGHT_ANCHORED = new Set(["Coins", "DCcash", "exchange_cash", "add_gold"]);
const STAGE_WIDTH = 760;

export class Hud {
  private texts = new Map<string, HTMLElement>();
  private fill: { el: HTMLElement; frameW: number; pageW: number; pageH: number; fx: number; fy: number; maxWidth: number; width: number } | null = null;
  private fieldSize = new Map<string, number>();
  private atlasImage = new Image();

  constructor(root: HTMLElement, layout: HudLayout, atlas: AtlasJson, atlasBase: string) {
    const frames = new Map<string, { img: string; f: AtlasFrame["frame"]; size: { w: number; h: number } }>();
    for (const t of atlas.textures) for (const fr of t.frames) frames.set(fr.filename, { img: atlasBase + t.image, f: fr.frame, size: t.size });
    const shift = layout.layers.FC?.w ?? 0;
    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "hud-group hud-left";
    right.className = "hud-group hud-right";
    root.replaceChildren(left, right);
    const place = (name: string, el: HTMLElement, x: number, y: number) => {
      const dx = SHIFTED_BY_FC.has(name) ? shift : 0;
      if (RIGHT_ANCHORED.has(name)) {
        el.style.left = `${x + dx - STAGE_WIDTH}px`;
        right.append(el);
      } else {
        el.style.left = `${x + dx}px`;
        left.append(el);
      }
      el.style.top = `${y}px`;
    };
    for (const name of layout.order) {
      if (HIDDEN.has(name)) continue;
      const l = layout.layers[name];
      const fr = frames.get(l.frame);
      if (!fr) continue;
      const el = document.createElement("div");
      el.className = "hud-layer";
      el.dataset.layer = name;
      el.style.width = `${l.w}px`;
      el.style.height = `${l.h}px`;
      el.style.backgroundImage = `url("${fr.img}")`;
      el.style.backgroundSize = `${fr.size.w / 2}px ${fr.size.h / 2}px`;
      el.style.backgroundPosition = `${-fr.f.x / 2}px ${-fr.f.y / 2}px`;
      place(name, el, l.x, l.y);
      if (name === FILL_BAR) {
        this.atlasImage.src = fr.img;
        const box = layout.bounds["XP/fill_bar/bar_size"];
        this.fill = { el, frameW: l.w, pageW: fr.size.w / 2, pageH: fr.size.h / 2, fx: fr.f.x / 2, fy: fr.f.y / 2,
          maxWidth: box ? box[2] : l.w, width: FILL_MIN_WIDTH };
        this.applyFillWidth(FILL_MIN_WIDTH);
      }
    }
    for (const f of layout.text_fields) {
      if (HIDDEN.has(f.layer)) continue;
      const el = document.createElement("div");
      el.className = "hud-text";
      const [x, y, w, h] = f.box_px;
      Object.assign(el.style, {
        width: `${w}px`, height: `${h}px`, fontFamily: `"${f.font}"`, fontSize: `${f.size_px}px`, color: f.color,
        textAlign: f.align, lineHeight: `${h}px`,
      });
      const shadow = f.filters.find((x) => x.type === "dropshadow" || x.type === "glow");
      if (shadow?.color) {
        const c = `rgb(${shadow.color.slice(0, 3).join(",")})`;
        const r = Math.max(1, (shadow.blur_x ?? 2) / 2);
        el.style.textShadow = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
          .map(([sx, sy]) => `${sx * r}px ${sy * r}px ${r}px ${c}`).join(",");
      }
      place(f.layer, el, x, y);
      this.texts.set(f.path, el);
      this.fieldSize.set(f.path, f.size_px);
    }
  }

  // The bar is a narrow gradient stretched horizontally (DCFillBar sets mBar.width); stretching its
  // opaque centre column avoids smearing the anti-aliased edges of the tiny source image.
  private applyFillWidth(width: number): void {
    const f = this.fill!;
    const canvas = f.el.firstElementChild as HTMLCanvasElement | null ?? f.el.appendChild(document.createElement("canvas"));
    f.el.style.backgroundImage = "none";
    f.el.style.width = `${width}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = "100%";
    canvas.style.display = "block";
    const img = this.atlasImage;
    const draw = () => {
      const scale = 2;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.round(parseFloat(f.el.style.height) * scale);
      const ctx = canvas.getContext("2d")!;
      const sx = (f.fx + f.frameW / 2) * scale;
      ctx.drawImage(img, Math.floor(sx), f.fy * scale, 1, canvas.height, 0, 0, canvas.width, canvas.height);
    };
    if (img.complete && img.naturalWidth) draw();
    else img.addEventListener("load", draw, { once: true });
  }

  // Bar target from DCFillBar.setValue for the experience range of the current level.
  setExperienceProgress(progress: number, animateFromMs?: number): void {
    if (!this.fill) return;
    const target = FILL_MIN_WIDTH + Math.min(1, Math.max(0, progress)) * (this.fill.maxWidth - FILL_MIN_WIDTH);
    if (animateFromMs === undefined || target <= this.fill.width) {
      this.fill.width = target;
      this.applyFillWidth(target);
      return;
    }
    const start = this.fill.width;
    const t0 = animateFromMs;
    const step = (now: number) => {
      const w = Math.min(target, start + (now - t0) * FILL_SPEED_PX_PER_MS);
      this.fill!.width = w;
      this.applyFillWidth(w);
      if (w < target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private fitText(path: string, el: HTMLElement): void {
    let size = this.fieldSize.get(path) ?? 12;
    const ctx = document.createElement("canvas").getContext("2d")!;
    const family = el.style.fontFamily;
    const w = el.clientWidth || parseFloat(el.style.width);
    const h = el.clientHeight || parseFloat(el.style.height);
    for (; size > MIN_FONT_SIZE; size--) {
      ctx.font = `${size}px ${family}`;
      const m = ctx.measureText(el.textContent ?? "");
      const textHeight = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
      if (m.width + HORIZONTAL_MARGIN <= w - 2 * GUTTER && textHeight + VERTICAL_MARGIN <= h) break;
    }
    el.style.fontSize = `${size}px`;
  }

  // HudOwner: clicking the city name opens PopupName.
  onCityNameClick(handler: () => void): void {
    const el = this.texts.get("name_city/name_city");
    if (!el) return;
    el.style.pointerEvents = "auto";
    el.style.cursor = "pointer";
    el.addEventListener("click", handler);
  }

  set(values: HudValues): void {
    const put = (path: string, text: string) => {
      const el = this.texts.get(path);
      if (!el) return;
      el.textContent = text;
      if (path.endsWith("/ButtonText/Caption")) this.fitText(path, el);
    };
    put("XP/ExLevel", String(values.level));
    put("XP/ExPoints", formatNumber(values.exp));
    put("Coins/DCCoins", "$" + formatNumber(values.coins));
    put("DCcash/DCCash", formatNumber(values.cash));
    put("name_city/name_city", values.cityName);
    put("name_city/total", "$" + formatNumber(values.companyValue));
    put("add_gold/ButtonText/Caption", values.addLabel);
    put("exchange_cash/ButtonText/Caption", values.addLabel);
  }
}
