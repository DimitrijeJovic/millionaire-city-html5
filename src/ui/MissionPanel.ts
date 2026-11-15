import { MissionReward, MissionRule, Missions, missionImageSku, missionReward } from "../game/missions.js";
import { formatNumber } from "../game/progression.js";
import { PanelLayout, SwfPanel, UiFrames } from "./SwfPanel.js";

export interface MissionTexts {
  text(tid: string, fallback: string): string;
  icon(type: string): string | null;
  // URL of a feed/ picture (MissionDefinition feedImg), or null when the original files do not have it.
  feed?(img: string): string | null;
}

// NoteRain: MissionObjectManager.openReward starts it, closeReward stops it; PopupLevel does the same.
export interface Rain {
  start(): void;
  stop(): void;
}

// MissionsIconLayerManager.ICON_LIST_SIZE and MissionIcon.ICON_SIZE.
const ICON_LIST_SIZE = 4;
const ICON_SIZE = 64;
const ICON_TOP = 70;
const ICON_GAP = 2;

function rewardText(r: MissionReward, t: MissionTexts): string {
  const parts: string[] = [];
  if (r.coins) parts.push("$" + formatNumber(r.coins));
  if (r.exp) parts.push(formatNumber(r.exp) + " XP");
  if (r.items.length) parts.push(t.text("TID_MISSION_REWARD_ITEM", "Item"));
  return parts.join("  ");
}

export class MissionPanel {
  private column: HTMLDivElement;
  private popupHost: HTMLElement;

  constructor(
    host: HTMLElement,
    popupHost: HTMLElement,
    private readonly layouts: Record<string, PanelLayout>,
    private readonly ui: UiFrames,
    private readonly missions: Missions,
    private readonly texts: MissionTexts,
    private readonly onClaim: (sku: number) => MissionReward | null,
    // MissionObjectManager.openDescription opens PopupName for nameCity missions.
    private readonly onNameCity: (rule: MissionRule) => void = () => undefined,
    private readonly rain: Rain | null = null,
  ) {
    this.column = document.createElement("div");
    this.column.className = "mission-column";
    host.append(this.column);
    this.popupHost = popupHost;
  }

  // Reached missions first, then open ones, as MissionObject's heuristic orders the icon list.
  refresh(): void {
    const s = this.missions.save;
    const list = [...s.reached.map((sku) => [sku, true] as const), ...[...s.up].sort((a, b) => a - b).map((sku) => [sku, false] as const)]
      .slice(0, ICON_LIST_SIZE);
    this.column.replaceChildren();
    list.forEach(([sku, reached], i) => {
      const rule = this.missions.rule(sku);
      if (!rule) return;
      const b = document.createElement("button");
      b.className = "mission-icon" + (reached ? " reached" : "");
      b.style.top = `${ICON_TOP + i * (ICON_SIZE + ICON_GAP)}px`;
      const src = this.texts.icon(rule.type);
      if (src) b.style.backgroundImage = `url("${src}")`;
      b.title = rule.name;
      b.dataset.sku = String(sku);
      b.addEventListener("click", () => (reached ? this.showReward(rule) : rule.type === "nameCity" ? this.onNameCity(rule) : this.showDescription(rule)));
      this.column.append(b);
    });
  }

  // "image" and "container" are placeholders the original fills with mission artwork and a share feed. Missions
  // without their own image (imageIsRequired) show the mission type icon in the image area.
  private popup(layout: string, rule: MissionRule, ownImage = false, shown: string[] = []): SwfPanel {
    const hidden = ["ShareSuccess", "new_feed", "boss", "share_button", "feed_image", "right_arrow", "left_arrow", "image", "container"];
    const p = new SwfPanel(this.layouts[layout], this.ui, new Set(hidden.filter((n) => !shown.includes(n))));
    p.root.style.left = `${p.minX}px`;
    p.root.style.top = `${p.minY}px`;
    const area = this.layouts[layout].bounds.image ?? this.layouts[layout].bounds.container;
    const src = ownImage ? null : this.texts.icon(rule.type);
    if (area && src) {
      const icon = document.createElement("div");
      icon.className = "mission-popup-icon";
      const size = Math.min(area[2], area[3], 96);
      Object.assign(icon.style, { left: `${area[0] - p.minX + (area[2] - size) / 2}px`, top: `${area[1] - p.minY + (area[3] - size) / 2}px`,
        width: `${size}px`, height: `${size}px`, backgroundImage: `url("${src}")` });
      p.root.append(icon);
    }
    this.popupHost.replaceChildren(p.root);
    this.popupHost.hidden = false;
    return p;
  }

  close(): void {
    this.rain?.stop();
    this.popupHost.hidden = true;
    this.popupHost.replaceChildren();
  }

  // PopupMission: title, description, reward and a Done button. Missions with imageIsRequired use the _image_01
  // background and show their own image clip; its TextInfo is the condition (a percentage for bonus missions).
  showDescription(rule: MissionRule): void {
    const imageSku = missionImageSku(rule);
    const image = imageSku ? this.layouts[`mission_${imageSku}`] : undefined;
    const layout = image ? "popup_mission_background_01_image_01" : "popup_mission_background_01";
    const p = this.popup(layout, rule, !!image);
    if (image) {
      const clip = new SwfPanel(image, this.ui);
      const at = this.layouts[layout].origins?.image_01 ?? [0, 0];
      p.placeChild(clip, at);
      clip.root.classList.add("mission-image");
      if (rule.condition !== null) {
        const pct = this.texts.text("TID_GEN_PERCENTAGE", "%U%").replace("%U", String(Math.abs(rule.condition)));
        clip.setText("TextInfo", rule.type === "bonus" ? pct : String(rule.condition));
      }
      p.root.append(clip.root);
    }
    const t = this.texts;
    p.setText("Title", rule.name, true);
    const progress = this.missions.progress(rule.sku);
    const desc = t.text(`TID_MISSION_${String(rule.sku).padStart(3, "0")}_DESC`, rule.name);
    p.setText("TextInfo", rule.condition === null && progress.amount > 1 ? `${desc} (${progress.count}/${progress.amount})` : desc);
    const reward = t.text("TID_GEN_REWARD", "Reward") + t.text("TID_ESPACIO2PUNTOS", ":") + " " + rewardText(missionReward(rule), t);
    p.setText("Reward", reward, true);
    p.makeButton("Done", () => this.close());
    for (const f of this.layouts[layout].text_fields) if (f.layer === "Done") p.setText(f.path, t.text("TID_BUTTON_DONE", "Done"), true);
  }

  // PopupReward ("Mission Completed"): closing it applies the reward once. "Share success" (PopupReward.onShare)
  // closes the popup the same way and then asks the server to post a Facebook feed story; there is no feed in
  // the desktop game, so it only closes. The picture is the mission's feed image (PopupReward.loadImage).
  showReward(rule: MissionRule): void {
    const t = this.texts;
    const feed = rule.feedImg && t.feed ? t.feed(rule.feedImg) : null;
    const p = this.popup("popup_well_done", rule, !!feed, ["ShareSuccess"]);
    const area = this.layouts.popup_well_done.bounds.image;
    if (feed && area) {
      const img = document.createElement("div");
      img.className = "mission-popup-icon mission-feed-image";
      Object.assign(img.style, { left: `${area[0] - p.minX}px`, top: `${area[1] - p.minY}px`, width: `${area[2]}px`, height: `${area[3]}px`,
        backgroundImage: `url("${feed}")` });
      p.root.append(img);
    }
    p.setText("ShareSuccess/ButtonText/Caption", t.text("TID_BUTTON_SHARE", "Share success"), true);
    p.setText("Caption", t.text("TID_MISSION_COMPLETED", "Mission Completed"), true);
    p.setText("TextInfo", rule.name, true);
    p.setText("TextInfo2", rewardText(missionReward(rule), t), true);
    for (const f of this.layouts.popup_well_done.text_fields) if (f.layer === "Done") p.setText(f.path, t.text("TID_BUTTON_DONE", "Done"), true);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      this.onClaim(rule.sku);
      this.close();
      this.refresh();
    };
    p.makeButton("Done", finish);
    p.makeButton("ShareSuccess", finish);
    this.rain?.start();
  }
}

export class LevelPopup {
  constructor(private readonly host: HTMLElement, private readonly layout: PanelLayout, private readonly ui: UiFrames,
    private readonly texts: MissionTexts, private readonly rain: Rain | null = null) {}

  // PopupLevel: "Congratulations!" and "Level %U".
  show(level: number, unlocked: number): void {
    const p = new SwfPanel(this.layout, this.ui, new Set(["share_button", "feed_image", "right_arrow", "left_arrow"]));
    p.root.style.left = `${p.minX}px`;
    p.root.style.top = `${p.minY}px`;
    p.setText("title_text", this.texts.text("TID_POPUP_LEVEL_TITLE", "Congratulations!"), true);
    p.setText("level/level_text", this.texts.text("TID_POPUP_LEVEL_TEXT", "Level %U").replace("%U", String(level)), true);
    p.setText("unlock_text", this.texts.text("TID_LEVELUP_NEW_BUILDINGS", "%U items unlocked").replace("%U", String(unlocked)), true);
    p.makeButton("close_button", () => {
      this.rain?.stop();
      this.host.hidden = true;
      this.host.replaceChildren();
    });
    this.host.replaceChildren(p.root);
    this.host.hidden = false;
    this.rain?.start();
  }
}
