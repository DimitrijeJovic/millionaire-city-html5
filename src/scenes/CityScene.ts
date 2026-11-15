import { AudioEvents, SOUND_FILES, SoundBackend, SoundId } from "../audio/AudioEvents.js";
import { frameAt } from "../game/animation.js";
import { ZoomController, clampCentre } from "../game/camera.js";
import { SURROUND_EXTENT_PX, addMapSurround } from "./mapSurround.js";
import { CityFile, CityModel, PlacedItem, cityDataFile } from "../game/city.js";
import { FixedStepClock } from "../game/clock.js";
import { ItemDefinition, RulesNode, buildDefinitions, definitionFiles } from "../game/definitions.js";
import { MAP_COLS, MAP_ROWS, TILE } from "../game/geometry.js";
import { ContractView, Mode, Rules, itemIncomeTimeMs, parseContractViews, parseRules } from "../game/economy.js";
import { GameState, importCity } from "../game/gameState.js";
import { ItemVisual, itemDepth, itemVisual } from "../game/itemVisual.js";
import { iconFrameAt, iconTopLeft } from "../game/statusIcons.js";
import { Builder, parseLevels } from "../game/construction.js";
import { SavedItem } from "../game/gameState.js";
import { relativeToTile, worldToTile } from "../game/geometry.js";
import { SpecialTab, isAllowedInShop, shopAvailability, specialTabItems } from "../game/shop.js";
import { companyValueParts } from "../game/companyValue.js";
import { INFO_BOX_DELAY_MS, MapInfoData, mapInfoKind } from "../game/mapInfo.js";
import { LocalProfile, LocalResource, PROFILE_LIST_KEY, addProfile, adjustResource, cleanProfileName, parseLocalProfile, parseProfileList, profileSuffix } from "../game/localProfile.js";
import { NpcCityFile, NpcVisit, composeVisitSave, isNpcCityFile, isUpgradable, mergeVisitorProgress, parseVisitLedger } from "../game/visitMode.js";
import { npcCityFile, npcTarget, parseSocialRules, visitMissionEvents } from "../game/visits.js";
import { ServiceOffer, ServiceSku, ServicesData, buyService, inArea, parseServices, parseServicesData, serviceActive, serviceArea, serviceTimeLeft } from "../game/services.js";
import { ContractorTool, MultifunctionBar, showConfirmMove, showPayMove, showServicePopup } from "../ui/Contractors.js";
import { SaveData } from "../game/gameState.js";
import { FriendsBar, Neighbor, OptionsPanel } from "../ui/BottomBar.js";
import { MapInfoBox } from "../ui/MapInfoBox.js";
import { NoteRainView } from "../ui/NoteRainView.js";
import { ProfilePanel } from "../ui/ProfilePanel.js";
import { PanelLayout, UiAtlas, UiFrames } from "../ui/SwfPanel.js";
import { StorageEntry, StoragePanel } from "../ui/StoragePanel.js";
import { ShopEntry, ShopPanel } from "../ui/ShopPanel.js";
import { Tool, Toolbar, ToolbarAction } from "../ui/Toolbar.js";
import { Missions, parseMissionRules } from "../game/missions.js";
import { bonusParameters, collectEvents, itemEvents } from "../game/missionEvents.js";
import { houseInfluencePercent } from "../game/economy.js";
import { LevelPopup, MissionPanel } from "../ui/MissionPanel.js";
import { Traffic, parseTraffic } from "../game/traffic.js";
import { FlagWave, stripColumns } from "../game/flag.js";
import { PlotType, parseExpansions, parseSolidTiles, plotRect } from "../game/expansions.js";
import { closePopup, showCompanyValuePopup, showConfirmDestroy, showDestroyPopup, showExpansionPopup, showNamePopup, showNoCashPopup, showNoticePopup } from "../ui/CityPopups.js";
import { LocalSaveStore } from "../services/SaveStore.js";
import { ContractBox, ContractOption } from "../ui/ContractBox.js";
import { levelForExp, parseXpTable } from "../game/progression.js";
import { AtlasJson, Hud, HudLayout } from "../ui/Hud.js";
import { InfoPanel } from "../ui/InfoPanel.js";

interface AssetManifest {
  items: Record<string, { status: string; frames: number; fps: number; art_scale: number; atlas?: string; icon?: string }>;
  shop_icon_atlas: { json: string };
  construction: Record<string, { frame: string; w: number; h: number }>;
  construction_atlas: { json: string };
  fx: Record<string, { frames: number; fps: number; art_scale: number }>;
  fx_atlas: { json: string };
  mission_icons: Record<string, string>;
  // Mission feed pictures copied from feed/ (PopupReward).
  feed_images?: string[];
  cars?: Record<string, { status: string; frames: number; atlas?: string; art_scale: number }>;
  status_icons: { rent: string; contract: string; frame: number; commerce: Record<string, string> };
  background: { tiles: Array<{ file: string; x: number; y: number }>; size: [number, number] };
  tileset: { file: string; tile: number };
  ui_atlas: { json: string; layout: string };
  locale: string;
}

// Options saved on this computer: music and sound effects on or off.
const SETTINGS_KEY = "mcity.settings.v1";
const PROFILE_KEY = "mcity.localProfile.v1";
// RulesFacade.npcsIsAdvisor: the first BOSS_COUNT NPCs are the advisors.
const ADVISOR_COUNT = 2;
const MAP_INFO_REFRESH_MS = 250;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error("could not store " + key, e);
  }
}

interface LocalSettings {
  music: boolean;
  sound: boolean;
  // Local option (not original): expired limited-time shop items can be bought.
  expiredOffers: boolean;
}

function readSettings(): LocalSettings {
  try {
    const v = JSON.parse(safeGet(SETTINGS_KEY) ?? "{}") as { music?: unknown; sound?: unknown; expiredOffers?: unknown };
    return { music: v.music !== false, sound: v.sound !== false, expiredOffers: v.expiredOffers === true };
  } catch {
    return { music: true, sound: true, expiredOffers: false };
  }
}

function writeSettings(v: LocalSettings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(v));
}

function toggleFullScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

interface ItemView {
  item: PlacedItem;
  sprite: Phaser.GameObjects.Sprite;
  visual: ItemVisual;
  icon?: { sprite: Phaser.GameObjects.Image; texture: string };
}

interface Placement {
  sku: string;
  fromStorage?: boolean;
  // ToolMove: the item attached to the cursor (its view is hidden until it is placed or the move is cancelled).
  moveSid?: number;
  ghost?: Phaser.GameObjects.Sprite;
  base: Phaser.GameObjects.Graphics;
}

interface Effect {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  started: number;
}

// StateOnRent.setAnimationRent / setAnimationContract: PNG strips drawn by TopLayer above the map.
const FX_HOUSE_INCOME = "houses_info.Event_Income_anim_ok";
const FX_SHOP_CUSTOMER = "common.Event_common";
const FX_TERRAIN = "houses_info.Event_terraint_anim_ok";
const FX_TERRAIN_DESTROY = "houses_info.Event_terraint_destroy_anim_ok";
const FX_BUILD_READY = "houses_info.Event_Contract_anim";
const FX_BUILD_DONE = "houses_info.Event_Contract_anim_ok";
const FX_VISIT_UPGRADE = "upgrades.Event_upgrade";
// ItemObject.setBase: base outline green (BASE_BUILDABLE) or red, 2 px line, 30 % fill.
const BASE_OK = 0x00ff00;
const BASE_NO = 0xff0000;
const ICON_DEPTH = 1e9;
const ECONOMY_TICK_MS = 1000;

const ASSETS = "assets/";
// ItemObject.GLOW_COLOR, shown while the pointer is over an item.
const HOVER_GLOW = 0xffff33;
const DRAG_THRESHOLD_PX = 4;
// Original logic tick: one ItemObject.logicUpdate per 25 fps stage frame.
const LOGIC_STEP_MS = 40;

interface PlaneFlag {
  wave: FlagWave;
  strips: Phaser.GameObjects.Image[];
  y: number;
}

// Plane art is exported at 2x; the flag bitmap is drawn at the same resolution.
const FLAG_SCALE = 2;

class PhaserSound implements SoundBackend {
  constructor(private readonly scene: Phaser.Scene) {}

  play(id: SoundId, loop: boolean): void {
    if (loop) {
      const existing = this.scene.sound.get(id);
      if (existing?.isPlaying) return;
      this.scene.sound.play(id, { loop: true });
    } else {
      this.scene.sound.play(id);
    }
  }

  stop(id: SoundId): void {
    this.scene.sound.stopByKey(id);
  }
}

export class CityScene extends Phaser.Scene {
  private manifest!: AssetManifest;
  private city!: CityModel;
  private views: ItemView[] = [];
  private zoom = new ZoomController();
  private clock = new FixedStepClock(LOGIC_STEP_MS);
  private audio!: AudioEvents;
  private panel!: InfoPanel;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragged = false;
  private selected: ItemView | null = null;
  private hovered: ItemView | null = null;
  private dpr = 1;
  private state!: GameState;
  private store!: LocalSaveStore;
  private rules!: Rules;
  private contractNames = new Map<string, string>();
  // ContractDefinition time sku: the contract's incomeTime attribute as written in contracts.xml.
  private contractTimes = new Map<string, string>();
  private texts: Record<string, string> = {};
  private readonly lookup = (tid: string, fallback: string): string => this.texts[tid] ?? fallback;
  private hud!: Hud;
  private xpTable: number[] = [];
  private contracts!: ContractBox;
  private contractViews = new Map<string, ContractView>();
  private contractFor: ItemView | null = null;
  private economyTimer = 0;
  private effects: Effect[] = [];
  private builder!: Builder;
  private toolbar!: Toolbar;
  private shop!: ShopPanel;
  private storage!: StoragePanel;
  private placement: Placement | null = null;
  private cursor!: Phaser.GameObjects.Graphics;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private painting = false;
  private notices = new Map<number, Phaser.GameObjects.Sprite>();
  private missions!: Missions;
  private missionPanel!: MissionPanel;
  private levelPopup!: LevelPopup;
  private level = 1;
  private traffic: Traffic | null = null;
  private carSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private roadSet = new Set<string>();
  private expansionLayer: Phaser.GameObjects.Container | null = null;
  private plane: { container: Phaser.GameObjects.Container; width: number; flag: PlaneFlag | null } | null = null;
  private uiFrames!: UiFrames;
  private mapSize: [number, number] = [0, 0];
  private layouts!: Record<string, PanelLayout>;
  private mapInfo!: MapInfoBox;
  private mapInfoFor: ItemView | null = null;
  private mapInfoTimer = 0;
  private mapInfoRefresh = 0;
  private rain!: NoteRainView;
  private friends!: FriendsBar;
  private profilePanel: ProfilePanel | null = null;
  // Visitor role in an original offline NPC city (?visit=npc_advisor|npc_boss); null in the player's own city.
  private visitCity: NpcCityFile | null = null;
  private visit: NpcVisit | null = null;
  private ownSave: SaveData | null = null;
  // Contractors (Rent Collector, Contract Renewal): the active area tool, its pulsing area and the bought time.
  private multiBar: MultifunctionBar | null = null;
  private serviceTool: ServiceSku | null = null;
  private moveTool = false;
  private serviceGfx: Phaser.GameObjects.Graphics | null = null;
  private serviceAlpha = { value: 0.1, speed: 0.01 };
  private serviceHighlighted: ItemView[] = [];
  private services!: ServicesData;
  private serviceOffers = new Map<ServiceSku, ServiceOffer[]>();
  // Houses a Contract Renewal click applies to; the ContractBox then signs the chosen contract for all of them.
  private multiSign: ItemView[] | null = null;
  private localProfile!: LocalProfile;
  logicSteps = 0;

  constructor() {
    super("city");
  }

  preload(): void {
    this.load.json("manifest", ASSETS + "manifest.json");
    const query = new URLSearchParams(location.search);
    const visit = query.get("visit");
    this.load.once("filecomplete-json-city", () => this.queueCityArt());
    this.load.json("city", cityDataFile(isNpcCityFile(visit) ? visit : query.get("city")));
    for (const f of definitionFiles()) this.load.json("rules:" + f, ASSETS + "rules/" + f);
    for (const f of ["XPTable", "contracts", "contractsTypes", "contractsNames", "settings", "missionDefinitions",
      "trafficAgents__trafficAgentDefinitions", "trafficAgents__trafficAgentManagerDefinition", "expansions", "expansionsPrices",
      "universe__map", "NPCDefinitions", "social", "servicesDefinitions"]) this.load.json(`rules:${f}.json`, `${ASSETS}rules/${f}.json`);
    this.load.once("filecomplete-json-manifest", () => {
      const m = this.cache.json.get("manifest") as AssetManifest;
      this.load.multiatlas("fx", ASSETS + m.fx_atlas.json, ASSETS + "atlas/");
      this.load.multiatlas("construction", ASSETS + m.construction_atlas.json, ASSETS + "atlas/");
      this.load.json("shop_icons", ASSETS + m.shop_icon_atlas.json);
      this.load.multiatlas("ui", ASSETS + m.ui_atlas.json, ASSETS + "atlas/");
      for (const [sku, car] of Object.entries(m.cars ?? {})) if (car.atlas) this.load.multiatlas("car:" + sku, ASSETS + car.atlas, ASSETS + "cars/");
      this.queueCityArt();
      const icons = m.status_icons;
      const strip = { frameWidth: icons.frame, frameHeight: icons.frame };
      this.load.spritesheet("icon:rent", ASSETS + icons.rent, strip);
      this.load.spritesheet("icon:contract", ASSETS + icons.contract, strip);
      for (const [sku, file] of Object.entries(icons.commerce)) this.load.spritesheet("icon:" + sku, ASSETS + file, strip);
      for (const t of m.background.tiles) this.load.image("bg:" + t.file, ASSETS + "background/" + t.file);
      this.load.image("tileset", ASSETS + m.tileset.file);
      this.load.json("ui_atlas", ASSETS + m.ui_atlas.json);
      this.load.json("ui_layout", ASSETS + m.ui_atlas.layout);
      this.load.json("locale", ASSETS + m.locale);
    });
    for (const [id, file] of Object.entries(SOUND_FILES)) this.load.audio(id, ASSETS + "sounds/" + file);
  }

  create(): void {
    this.dpr = (this.registry.get("dpr") as number) ?? 1;
    this.manifest = this.cache.json.get("manifest") as AssetManifest;
    const rules: Record<string, RulesNode> = {};
    for (const f of definitionFiles()) {
      const data = this.cache.json.get("rules:" + f) as RulesNode | undefined;
      if (data) rules[f] = data;
    }
    const defs = buildDefinitions(rules);
    const file = this.cache.json.get("city") as CityFile;
    const params = new URLSearchParams(location.search);
    const contractsXml = this.cache.json.get("rules:contracts.json") as RulesNode;
    this.rules = parseRules(contractsXml, this.cache.json.get("rules:contractsTypes.json"), this.cache.json.get("rules:settings.json"));
    this.contractViews = parseContractViews(contractsXml, this.cache.json.get("rules:contractsNames.json") as RulesNode);
    for (const n of contractsXml._children ?? []) {
      this.contractNames.set(String(n.sku), String(n.name ?? n.sku));
      this.contractTimes.set(String(n.sku), String(n.incomeTime ?? ""));
    }
    this.store = new LocalSaveStore(this.saveKey());
    const visit = params.get("visit");
    this.visitCity = isNpcCityFile(visit) ? visit : null;
    let data: SaveData | null;
    if (this.visitCity) {
      this.ownSave = this.store.load();
      if (!this.ownSave) {
        this.leaveCity("replace", this.homeUrl());
        return;
      }
      data = composeVisitSave(this.ownSave, importCity(file, Date.now()));
    } else {
      data = params.get("fresh") === "1" ? null : this.store.load();
      if (!data) {
        data = importCity(file, Date.now());
        this.store.save(data);
      }
    }
    this.state = new GameState(data, defs, this.rules);
    this.state.advance(Date.now());
    this.city = new CityModel({
      ...file, roads: data.roads, terrain: data.terrain,
      items: data.items.map((i) => ({ sid: i.sid, sku: i.sku, x: i.x, y: i.y, state: { mode: String(i.state?.mode ?? "") } })),
    }, defs);
    this.audio = new AudioEvents(new PhaserSound(this), () => this.time.now);
    this.texts = this.cache.json.get("locale") as Record<string, string>;
    this.panel = new InfoPanel(document.getElementById("info-panel")!, this.texts, () => this.select(null));
    this.setupHud();

    const settingsXml = (this.cache.json.get("rules:settings.json") as RulesNode)._children?.[0] ?? ({} as RulesNode);
    this.builder = new Builder(this.state, parseLevels(this.cache.json.get("rules:XPTable.json")), {
      itemProfitPercentage: Number(settingsXml.destroyItemProfitPercentage ?? 35),
      terrainProfitPercentage: Number(settingsXml.destroyTerrainProfitPercentage ?? 100),
    }, parseSolidTiles(this.cache.json.get("rules:universe__map.json")),
    parseExpansions(this.cache.json.get("rules:expansions.json"), this.cache.json.get("rules:expansionsPrices.json")));
    this.uiFrames = new UiFrames(this.cache.json.get("ui_atlas") as UiAtlas, ASSETS + "atlas/");
    this.layouts = this.cache.json.get("ui_layout") as Record<string, PanelLayout>;
    this.contracts = new ContractBox(document.getElementById("contract-panel")!, this.layouts, this.uiFrames, this.lookup,
      (sku) => this.signContract(sku), () => this.closeContracts());
    this.builder.advance(Date.now());
    this.missions = new Missions(parseMissionRules(this.cache.json.get("rules:missionDefinitions.json")), this.state.data.missions);
    this.level = this.builder.level();
    this.setupTools();
    this.setupContractors();
    this.setupBottomBar();
    this.setupMissions();
    this.setupTraffic();
    if (!this.visitCity) this.drawExpansions();
    this.buildBackground();
    this.buildGround();
    this.buildItems();
    this.refreshIcons();
    this.setupCamera();
    this.setupInput();

    this.sound.pauseOnBlur = false;
    const startMusic = () => this.audio.music(SoundId.MainMusic);
    if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, startMusic);
    else startMusic();

    if (this.visitCity) this.startVisit();
    (window as unknown as { mcity: unknown }).mcity = this.debugApi();
    const loading = document.getElementById("loading-screen");
    if (loading) loading.hidden = true;
  }

  private setupHud(): void {
    this.hud = new Hud(document.getElementById("hud")!, this.cache.json.get("ui_layout").hud_new as HudLayout,
      this.cache.json.get("ui_atlas") as AtlasJson, ASSETS + "atlas/");
    this.xpTable = parseXpTable(this.cache.json.get("rules:XPTable.json"));
    this.refreshHud(false);
  }

  private refreshHud(animate: boolean): void {
    const p = this.state.data.profile;
    // Profile.calculateCompanyValue (Company.getCompanyValue) runs when a city loads; afterwards every change of
    // coins, gold, items, contracts and terrain moves the value by the same amount (Profile.set DCCoins / DCCash,
    // initItemAfterBuying, demolish, StateOnRent.setMode, Map.setTileTerrain), which equals recomputing it.
    // HudOwner.onUpdate shows the owner's value while visiting an NPC.
    // The first refresh in create() comes before the builder and the local profile exist; later ones recompute.
    const ready = !!this.builder && !!this.localProfile;
    if (!this.visitCity && ready) p.companyValue = this.companyValue().total;
    const shownValue = this.visitCity && ready ? this.visitedCompanyValue() : p.companyValue;
    const lvl = levelForExp(this.xpTable, p.exp);
    this.hud.setExperienceProgress(lvl.progress, animate ? performance.now() : undefined);
    this.hud.set({
      level: lvl.level, exp: p.exp, coins: p.coins, cash: p.cash, cityName: this.visitCity ? this.visitedCityName() : p.cityName,
      companyValue: shownValue, addLabel: this.texts.TID_BUTTON_TEXT_ADD ?? "Add",
    });
    this.profilePanel?.refresh();
  }

  private iconTexture(view: ItemView): string | null {
    if (this.visitCity) return null;
    const mode = this.state.item(view.item.sid)?.state?.mode;
    const kind = view.item.def.kind;
    if (mode === Mode.GetRent && kind === "house") return "icon:rent";
    if (mode === Mode.GetRent && kind === "commerce" && this.textures.exists("icon:" + view.item.sku)) return "icon:" + view.item.sku;
    if (kind === "house" && (mode === Mode.WaitingForContract || mode === Mode.Abandoned)) return "icon:contract";
    return null;
  }

  private baseCentre(view: ItemView): [number, number] {
    return [view.item.tileX * TILE + (view.item.def.baseCols * TILE) / 2, view.item.tileY * TILE + (view.item.def.baseRows * TILE) / 2];
  }

  private refreshIcons(): void {
    for (const v of this.views) {
      const texture = this.iconTexture(v);
      if (v.icon?.texture === texture) continue;
      v.icon?.sprite.destroy();
      v.icon = undefined;
      if (!texture) continue;
      const [x, y] = iconTopLeft(v.item.tileX * TILE, v.item.tileY * TILE, v.item.def.baseCols * TILE, v.item.def.baseRows * TILE);
      v.icon = { sprite: this.add.image(x, y, texture, 0).setOrigin(0, 0).setDepth(ICON_DEPTH), texture };
    }
  }

  private playEffect(key: string, x: number, y: number): void {
    const fx = this.manifest.fx[key];
    if (!fx) return;
    const sprite = this.add.sprite(x, y, "fx", `${key}/0`).setScale(1 / fx.art_scale).setDepth(ICON_DEPTH + 1);
    this.effects.push({ sprite, key, started: this.clock.simulatedMs });
  }

  private persist(): void {
    try {
      if (this.visitCity) {
        const own = this.store.load() ?? this.ownSave;
        if (own) this.store.save(mergeVisitorProgress(own, this.state.snapshot()));
        return;
      }
      this.store.save(this.state.snapshot());
    } catch (e) {
      console.error("save failed", e);
    }
  }

  private collect(view: ItemView): boolean {
    const now = Date.now();
    const customers = view.item.def.kind === "commerce" ? this.state.customerSids(view.item.sid) : [];
    const contractSku = this.state.item(view.item.sid)?.state?.contractSku;
    const contractTime = contractSku ? this.contractTimes.get(contractSku) ?? null : null;
    const reward = this.state.collect(view.item.sid, now);
    if (!reward) return false;
    this.missionEvents(collectEvents(view.item.def, contractTime));
    this.persist();
    this.audio.sfx(SoundId.Income);
    this.refreshIcons();
    const [x, y] = this.baseCentre(view);
    if (view.item.def.kind === "commerce") {
      for (const sid of customers) {
        const house = this.views.find((v) => v.item.sid === sid);
        if (house) this.playEffect(FX_SHOP_CUSTOMER, ...this.baseCentre(house));
      }
    } else {
      this.playEffect(FX_HOUSE_INCOME, x, y);
    }
    const text = this.add.text(x, y - 20, `+$${reward.coins.toLocaleString("en-US")}`, {
      fontFamily: '"Challenge Bold LET"', fontSize: "20px", color: "#ffffff", stroke: "#0e2600", strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(ICON_DEPTH + 2);
    this.tweens.add({ targets: text, y: text.y - 40, alpha: 0, duration: 1200, onComplete: () => text.destroy() });
    this.refreshHud(true);
    return true;
  }

  private openContracts(view: ItemView): void {
    const options: ContractOption[] = this.state.contractsFor(view.item.sid).flatMap((sku) => {
      const c = this.rules.contracts.get(sku);
      const v = this.contractViews.get(sku);
      if (!c || !v) return [];
      return [{ sku, name: this.texts[v.tid] ?? this.contractNames.get(sku) ?? sku, level: v.level, icon: v.icon,
        costCoins: c.costCoins, incomeCoins: c.incomeCoins, incomeXp: c.incomeXp, incomeTimeMs: c.incomeTimeMs }];
    });
    this.contractFor = view;
    this.contracts.show(options, this.level, Number(view.item.def.attributes.tenants ?? 0));
  }

  private closeContracts(): void {
    this.multiSign = null;
    this.contractFor = null;
    this.contracts.hide();
  }

  private signContract(sku: string): void {
    if (this.multiSign) {
      this.signContractForAll(sku);
      return;
    }
    const view = this.contractFor;
    if (!view || (this.contractViews.get(sku)?.level ?? 1) > this.level) return;
    const cost = this.rules.contracts.get(sku)?.costCoins ?? 0;
    // ContractBox.onContract: DCCoins below the cost opens PopupConfirm instead of signing.
    if (this.state.data.profile.coins < cost) {
      if (this.layouts.popup_confirm) {
        showNoCashPopup(document.getElementById("popup-host")!, this.layouts.popup_confirm, this.uiFrames, this.lookup);
      }
      return;
    }
    if (!this.state.signContract(view.item.sid, sku, Date.now())) return;
    this.persist();
    this.audio.sfx(SoundId.Contract);
    this.closeContracts();
    this.refreshIcons();
    this.refreshHud(false);
  }

  private buildBackground(): void {
    for (const t of this.manifest.background.tiles) this.add.image(t.x, t.y, "bg:" + t.file).setOrigin(0, 0).setDepth(-2);
    addMapSurround(this, this.manifest.background.tiles.map((t) => ({ key: "bg:" + t.file, x: t.x, y: t.y })),
      this.manifest.background.size as [number, number]);
  }

  private queueCityArt(): void {
    const m = this.cache.json.get("manifest") as AssetManifest | undefined;
    const city = this.cache.json.get("city") as CityFile | undefined;
    if (!m || !city) return;
    let skus = new Set(city.items.map((i) => i.sku));
    try {
      const saved = JSON.parse(localStorage.getItem(this.saveKey()) ?? "null") as { items?: Array<{ sku: string }> } | null;
      for (const i of saved?.items ?? []) skus.add(i.sku);
    } catch {
      skus = new Set(skus);
    }
    for (const sku of skus) this.queueItemArt(sku);
  }

  private saveKey(): string {
    const cityName = new URLSearchParams(location.search).get("city");
    return "mcity.save.v1" + profileSuffix(parseProfileList(safeGet(PROFILE_LIST_KEY)).active) + (cityName ? "." + cityName : "");
  }

  private profileKey(): string {
    return PROFILE_KEY + profileSuffix(parseProfileList(safeGet(PROFILE_LIST_KEY)).active);
  }

  // Switching or creating a local profile saves the current one and reloads the page with the other profile's data.
  private switchProfile(id: string | null, name?: string): string | null {
    let list = parseProfileList(safeGet(PROFILE_LIST_KEY));
    if (name !== undefined) {
      const next = addProfile(list, name);
      if (!next) return "Use letters or digits in the profile name.";
      list = next;
    } else {
      if (id !== "" && !list.ids.includes(id ?? "")) return "Unknown profile.";
      list = { ...list, active: id ?? "" };
    }
    this.persist();
    safeSet(PROFILE_LIST_KEY, JSON.stringify(list));
    this.leaveCity("assign", this.homeUrl());
    return null;
  }

  private queueItemArt(sku: string): boolean {
    const art = (this.cache.json.get("manifest") as AssetManifest).items[sku];
    if (!art?.atlas || this.textures.exists("item:" + sku)) return false;
    this.load.multiatlas("item:" + sku, ASSETS + art.atlas, ASSETS + "items/");
    return true;
  }

  // Loads an item's art outside preload (shop purchases); resolves false if the item has no art.
  private ensureItemArt(sku: string): Promise<boolean> {
    if (this.textures.exists("item:" + sku)) return Promise.resolve(true);
    if (!this.queueItemArt(sku)) return Promise.resolve(false);
    return new Promise((resolve) => {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve(this.textures.exists("item:" + sku)));
      this.load.start();
    });
  }

  private groundRows(): number[][] {
    this.city = new CityModel({
      format: "mcity-html5-city/1", profile: {}, hqLevel: 0, items: [], roads: this.state.data.roads, terrain: this.state.data.terrain,
    }, this.state.defs);
    const idx = this.city.tileIndices();
    const rows: number[][] = [];
    for (let y = 0; y < MAP_ROWS; y++) rows.push(Array.from(idx.subarray(y * MAP_COLS, (y + 1) * MAP_COLS)));
    return rows;
  }

  private buildGround(): void {
    const map = this.make.tilemap({ data: this.groundRows(), tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage("tileset", "tileset", TILE, TILE, 0, 0, 0)!;
    this.groundLayer = map.createLayer(0, tiles, 0, 0)!.setDepth(-1);
  }

  private refreshGround(): void {
    this.groundLayer.putTilesAt(this.groundRows(), 0, 0);
    this.refreshRoadSet();
  }

  private refreshRoadSet(): void {
    this.roadSet = new Set(this.state.data.roads.map(([rx, ry]) => {
      const t = relativeToTile(rx, ry);
      return `${t.x},${t.y}`;
    }));
  }

  // Background.createExpansions: plots not owned are darkened (black, 30 %); each one shows the
  // popup_for_sale_expansion sign at its centre, with the padlock while its unlock order is still closed.
  private drawExpansions(): void {
    this.expansionLayer?.destroy();
    const layer = this.add.container(0, 0).setDepth(ICON_DEPTH - 3);
    this.expansionLayer = layer;
    const plots = this.builder.plots();
    const sign = this.layouts.popup_for_sale_expansion;
    const g = this.add.graphics();
    layer.add(g);
    const rects = this.builder.expansionRules.map((rule) => plotRect(rule));
    const minX = Math.min(...rects.map((r) => r.x)), minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const E = SURROUND_EXTENT_PX;
    for (const rule of this.builder.expansionRules) {
      if (plots[rule.index] === PlotType.Full) continue;
      const r = plotRect(rule);
      g.fillStyle(0x000000, 0.3).fillRect(r.x, r.y, r.w, r.h);
      // A plot on the edge of the expansion grid also darkens the map surround beside it (mapSurround.ts).
      const left = r.x === minX, right = r.x + r.w === maxX, top = r.y === minY;
      if (left) g.fillRect(-E, r.y, E + r.x, r.h);
      if (right) g.fillRect(r.x + r.w, r.y, E, r.h);
      if (top) g.fillRect(r.x, -E, r.w, E + r.y);
      if (top && left) g.fillRect(-E, -E, E + r.x, E + r.y);
      if (top && right) g.fillRect(r.x + r.w, -E, E, E + r.y);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      for (const name of sign.order) {
        if (name === "locked" && plots[rule.index] !== PlotType.Locked) continue;
        const l = sign.layers[name];
        const img = this.add.image(cx + l.x, cy + l.y, "ui", l.frame).setOrigin(0, 0).setScale(0.5);
        layer.add(img);
        if (name !== "locked" && plots[rule.index] === PlotType.Normal) {
          img.setInteractive({ useHandCursor: true }).on("pointerup", (p: Phaser.Input.Pointer) => {
            if (this.fromCanvas(p)) this.openExpansion(rule.index);
          });
        }
      }
      for (const f of sign.text_fields) {
        const label = f.path === "prize" ? this.texts.TID_CLICK_TO_BUY ?? "Click to buy" : this.texts.TID_PANEL_EXPANSION_FOR_SALE ?? "";
        const t = this.add.text(cx + f.box_px[0] + f.box_px[2] / 2, cy + f.box_px[1] + f.box_px[3] / 2, label, {
          fontFamily: `"${f.font}"`, fontSize: `${f.size_px}px`, color: f.color, align: "center", wordWrap: { width: f.box_px[2] },
        }).setOrigin(0.5);
        layer.add(t);
      }
    }
  }

  private openExpansion(index: number): void {
    if (this.toolbar.tool !== "select") return;
    const price = this.builder.expansionPrice();
    if (!price) return;
    showExpansionPopup(document.getElementById("popup-host")!, this.layouts, this.uiFrames, this.lookup, {
      coins: price.coins, cash: price.cash, friendsNeeded: price.friendsNeeded,
      canCoins: this.builder.canBuyExpansion(index, "coins"), canCash: this.builder.canBuyExpansion(index, "cash"),
    }, (currency) => {
      if (!this.builder.buyExpansion(index, currency)) return;
      closePopup(document.getElementById("popup-host")!);
      // Map.buyExpansion registers MISSION_EVENT_BUY_EXPANSION.
      this.missionEvents([["buyExpansion", ""]]);
      this.drawExpansions();
      this.persist();
      this.refreshHud(false);
    }, () => this.serverOnly("invest"));
  }

  private openNamePopup(): void {
    if (this.visitCity) return;
    const p = this.state.data.profile;
    const rule = this.missions.rules.find((r) => r.type === "nameCity" && this.missions.save.up.includes(r.sku));
    const reward = rule ? `${this.texts.TID_GEN_REWARD ?? "Reward"}${this.texts.TID_ESPACIO2PUNTOS ?? ":"} $${Number(rule.rewardAmount).toLocaleString("en-US")}` : "";
    showNamePopup(document.getElementById("popup-host")!, this.layouts.popup_mission_Name_01, this.uiFrames,
      this.lookup, p.cityName, reward, (name) => {
        // PopupName.saveName: new name, nameCity mission reached, HUD updated, plane flies with the name.
        p.cityName = name;
        if (rule) this.missions.markReached(rule.sku);
        this.afterProgress(false);
        this.startPlane(name);
      });
  }

  // Plane.start: the banner plane enters at the right edge of the view, at half the map's bottom Y
  // (Map.getBottomY / 2), and moves left PLANE_SPEED = 5 px per 25 fps frame until it has left the view.
  private startPlane(text: string): void {
    this.plane?.container.destroy();
    const layout = this.layouts.plain;
    if (!layout) return;
    const cam = this.cameras.main;
    const container = this.add.container(cam.worldView.right, ((MAP_ROWS - 3) * TILE) / 2).setDepth(ICON_DEPTH + 5);
    for (const name of layout.order) {
      if (name === "Tail") continue;
      const l = layout.layers[name];
      container.add(this.add.image(l.x, l.y, "ui", l.frame).setOrigin(0, 0).setScale(0.5));
    }
    const flag = this.planeFlag(container, layout, text);
    const width = Math.max(...Object.values(layout.layers).map((l) => l.x + l.w), ...(flag?.strips.map((i) => i.x + i.displayWidth) ?? []));
    this.plane = { container, width, flag };
  }

  // Plane.start: the Tail clip, with the name in its Caption, is drawn into a bitmap of the clip's size and replaced
  // by a Flag at (tail.x - 20, tail.y); the clip itself is hidden.
  private planeFlag(container: Phaser.GameObjects.Container, layout: PanelLayout, text: string): PlaneFlag | null {
    const tail = layout.layers.Tail;
    const at = layout.origins?.Tail;
    if (!tail || !at) return null;
    const S = FLAG_SCALE;
    const w = Math.ceil(tail.w);
    const h = Math.ceil(tail.h);
    const rt = this.make.renderTexture({ width: w * S, height: h * S }, false);
    const art = this.make.image({ key: "ui", frame: tail.frame }, false).setOrigin(0, 0);
    rt.draw(art, (tail.x - at[0]) * S, (tail.y - at[1]) * S);
    art.destroy();
    for (const f of layout.text_fields) {
      if (f.layer !== "Tail") continue;
      const label = this.make.text({ text, style: { fontFamily: `"${f.font}"`, fontSize: `${f.size_px * S}px`, color: f.color } }, false).setOrigin(0.5);
      rt.draw(label, (f.box_px[0] + f.box_px[2] / 2 - at[0]) * S, (f.box_px[1] + f.box_px[3] / 2 - at[1]) * S);
      label.destroy();
    }
    if (this.textures.exists("plane_flag")) this.textures.remove("plane_flag");
    rt.saveTexture("plane_flag");
    // A saved RenderTexture keeps its texture when the game object is destroyed.
    rt.destroy();
    const wave = new FlagWave();
    const x = at[0] - 20;
    const strips: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < wave.strips; i++) {
      const [c0, c1] = stripColumns(i, wave.strips, w);
      if (c1 <= c0) continue;
      const img = this.add.image(x + w / 8, at[1], "plane_flag").setOrigin(0, 0).setScale(1 / S).setCrop(c0 * S, 0, (c1 - c0) * S, h * S);
      img.setData("strip", i);
      container.add(img);
      strips.push(img);
    }
    return { wave, strips, y: at[1] };
  }

  private stepPlane(): void {
    if (!this.plane) return;
    this.plane.container.x -= 5;
    const flag = this.plane.flag;
    if (flag) {
      flag.wave.update(LOGIC_STEP_MS);
      for (const img of flag.strips) img.y = flag.y + flag.wave.ys[img.getData("strip") as number];
    }
    if (this.plane.container.x < this.cameras.main.worldView.left - this.plane.width) {
      this.plane.container.destroy();
      this.plane = null;
      if (this.textures.exists("plane_flag")) this.textures.remove("plane_flag");
    }
  }

  private setupTraffic(): void {
    this.refreshRoadSet();
    const agents = this.cache.json.get("rules:trafficAgents__trafficAgentDefinitions.json");
    const manager = this.cache.json.get("rules:trafficAgents__trafficAgentManagerDefinition.json");
    if (!agents || !manager) return;
    const { defs, manager: m } = parseTraffic(agents, manager);
    // Only vehicles whose art was exported can be spawned.
    const usable = defs.filter((d) => this.textures.exists("car:" + d.sku));
    this.traffic = new Traffic(usable, m, (x, y) => this.roadSet.has(`${x},${y}`),
      () => [...this.roadSet].map((k) => k.split(",").map(Number) as [number, number]));
  }

  private stepTraffic(dt: number): void {
    if (!this.traffic) return;
    const items = this.state.data.items;
    const plots = items.filter((i) => {
      const k = this.state.defs.get(i.sku)?.kind;
      return k === "house" || k === "commerce";
    }).length;
    this.traffic.step(dt, plots, new Set(items.map((i) => i.sku)));
  }

  private drawTraffic(): void {
    if (!this.traffic) return;
    const live = new Set<number>();
    for (const a of this.traffic.agents) {
      live.add(a.id);
      let sprite = this.carSprites.get(a.id);
      const car = this.manifest.cars?.[a.sku];
      if (!car) continue;
      if (!sprite) {
        sprite = this.add.sprite(a.x, a.y, "car:" + a.sku, `${a.sku}/0`).setScale(1 / car.art_scale);
        this.carSprites.set(a.id, sprite);
      }
      // TrafficAgent.movementSetRotation: one frame per degree of heading.
      const frame = ((Math.round(a.angle) % car.frames) + car.frames) % car.frames;
      sprite.setFrame(`${a.sku}/${frame}`).setPosition(a.x, a.y).setAlpha(this.traffic.alpha(a));
      sprite.setDepth(Math.floor(a.y / TILE) * 1000 + a.x / TILE);
    }
    for (const [id, sprite] of this.carSprites) {
      if (live.has(id)) continue;
      sprite.destroy();
      this.carSprites.delete(id);
    }
  }

  private buildItems(): void {
    for (const saved of this.state.data.items) this.addItemView(saved);
  }

  private placedItem(saved: SavedItem): PlacedItem | null {
    const def = this.state.defs.get(saved.sku);
    if (!def) return null;
    const t = relativeToTile(saved.x, saved.y);
    return { sid: saved.sid, sku: saved.sku, tileX: t.x, tileY: t.y, def, state: { mode: String(saved.state?.mode ?? "") } };
  }

  private addItemView(saved: SavedItem): ItemView | null {
    const item = this.placedItem(saved);
    const art = this.manifest.items[saved.sku];
    if (!item) return null;
    const bottom = (item.tileY + item.def.baseRows) * TILE;
    let sprite: Phaser.GameObjects.Sprite;
    let visual: ItemVisual = { kind: "static", frame: 0 };
    const site = this.manifest.construction[`T${item.def.baseRows}x${item.def.baseCols}`];
    if (saved.construction && site) {
      sprite = this.add.sprite(item.tileX * TILE, bottom - site.h, "construction", site.frame).setOrigin(0, 0);
    } else if (art?.status === "ok" && this.textures.exists("item:" + saved.sku)) {
      visual = itemVisual(item, art);
      const frame = visual.kind === "static" ? visual.frame : 0;
      sprite = this.add.sprite(item.tileX * TILE, bottom, "item:" + saved.sku, `${saved.sku}/${frame}`).setScale(1 / art.art_scale);
    } else {
      return null;
    }
    sprite.setDepth(itemDepth(item));
    sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: false });
    const view: ItemView = { item, sprite, visual };
    sprite.setData("view", view);
    this.views.push(view);
    this.refreshNotice(view);
    return view;
  }

  private removeItemView(sid: number): void {
    const i = this.views.findIndex((v) => v.item.sid === sid);
    if (i < 0) return;
    const v = this.views[i];
    if (this.hovered === v) this.hovered = null;
    v.icon?.sprite.destroy();
    v.sprite.destroy();
    this.notices.get(sid)?.destroy();
    this.notices.delete(sid);
    this.views.splice(i, 1);
  }

  // NotificationConstructionEnd: once the build time is over the site shows a button to finish it.
  private refreshNotice(view: ItemView): void {
    const left = this.builder.constructionLeftMs(view.item.sid);
    const has = this.notices.get(view.item.sid);
    if (left === 0 && !has) {
      const fx = this.manifest.fx[FX_BUILD_READY];
      if (!fx) return;
      const sprite = this.add.sprite(...this.baseCentre(view), "fx", `${FX_BUILD_READY}/0`).setScale(1 / fx.art_scale).setDepth(ICON_DEPTH);
      this.notices.set(view.item.sid, sprite);
    } else if (left !== 0 && has) {
      has.destroy();
      this.notices.delete(view.item.sid);
    }
  }

  private setupTools(): void {
    const ui = new UiFrames(this.cache.json.get("ui_atlas") as UiAtlas, ASSETS + "atlas/");
    const layouts = this.cache.json.get("ui_layout") as Record<string, PanelLayout>;
    this.toolbar = new Toolbar(document.getElementById("toolbar")!, layouts.tool_panel, ui, this.texts.TID_GEN_FREE ?? "Free", (t) => this.setTool(t),
      (a) => this.toolbarAction(a), !!this.visitCity);
    const icons = this.cache.json.get("shop_icons") as UiAtlas | undefined;
    const iconFrames = icons ? new UiFrames(icons, ASSETS + "atlas/") : null;
    const iconStyle = (sku: string): Partial<CSSStyleDeclaration> | null => {
      const name = this.manifest.items[sku]?.icon;
      if (!iconFrames || !name) return null;
      const el = document.createElement("div");
      if (!iconFrames.apply(el, name)) return null;
      const { backgroundImage, backgroundSize, backgroundPosition, width, height } = el.style;
      return { backgroundImage, backgroundSize, backgroundPosition, width, height };
    };
    this.shop = new ShopPanel(document.getElementById("shop-panel")!, layouts, ui, {
      entries: (kind) => this.shopEntries(kind),
      specials: (tab) => this.specialEntries(tab),
      imageUrl: (name) => ASSETS + "icons/" + name,
      iconStyle,
      text: (tid, fallback) => this.texts[tid] ?? fallback,
    }, (sku) => this.startPlacement(sku), () => this.setTool("select"));
    this.storage = new StoragePanel(document.getElementById("storage-panel")!, layouts, ui, {
      entries: () => this.storageEntries(),
      iconStyle,
      text: (tid, fallback) => this.texts[tid] ?? fallback,
    }, (sku) => this.startPlacement(sku, true), () => this.setTool("select"));
    this.cursor = this.add.graphics().setDepth(ICON_DEPTH - 1);
  }

  // OptionsPanel, FriendsBar, the reward note rain, the map info boxes and the local profile panel.
  private setupBottomBar(): void {
    const ui = this.uiFrames;
    const layouts = this.layouts;
    const host = document.getElementById("bottom-bar")!;
    const settings = readSettings();
    this.audio.musicEnabled = settings.music;
    this.audio.sfxEnabled = settings.sound;
    new OptionsPanel(host, layouts.options_panel, ui, { ...settings }, {
      zoomIn: () => this.zoom.zoomIn(),
      zoomOut: () => this.zoom.zoomOut(),
      fullScreen: () => toggleFullScreen(),
      setMusic: (on) => {
        this.audio.setMusicEnabled(on);
        writeSettings({ ...readSettings(), music: on });
      },
      setSound: (on) => {
        this.audio.sfxEnabled = on;
        writeSettings({ ...readSettings(), sound: on });
      },
    });
    const stored = safeGet(this.profileKey());
    this.localProfile = parseLocalProfile(stored);
    if (!stored) {
      const fromCity = (this.cache.json.get("city") as { profile?: { userName?: string } }).profile?.userName;
      this.localProfile.userName = cleanProfileName(fromCity ?? "", this.localProfile.userName);
    }
    this.friends = new FriendsBar(host, layouts, ui, this.lookup, () => this.neighbors(), (what) => this.serverOnly(what),
      (n) => this.selectNeighbor(n));
    this.rain = new NoteRainView(document.getElementById("rain-back")!, document.getElementById("rain-front")!, layouts, ui);
    this.mapInfo = new MapInfoBox(document.getElementById("map-info")!, layouts, ui, this.lookup);
    if (this.visitCity) return;
    this.profilePanel = new ProfilePanel(document.getElementById("profile-host")!, {
      current: () => {
        const p = this.state.data.profile;
        return { userName: this.localProfile.userName, cityName: p.cityName, picture: this.localProfile.picture, coins: p.coins, cash: p.cash,
          exp: p.exp, level: this.builder.level() };
      },
      save: (userName, cityName, picture) => {
        this.localProfile = { userName: cleanProfileName(userName, this.localProfile.userName), picture };
        safeSet(this.profileKey(), JSON.stringify(this.localProfile));
        this.state.data.profile.cityName = cleanProfileName(cityName, this.state.data.profile.cityName);
        this.persist();
        this.refreshHud(false);
        this.friends.render();
      },
      profiles: () => parseProfileList(safeGet(PROFILE_LIST_KEY)),
      switchProfile: (id) => this.switchProfile(id),
      createProfile: (name) => this.switchProfile(null, name),
      expiredOffers: () => readSettings().expiredOffers,
      setExpiredOffers: (on) => writeSettings({ ...readSettings(), expiredOffers: on }),
      adjust: (resource: LocalResource, delta: number) => {
        adjustResource(this.state.data.profile, resource, delta, this.cashToCoins());
        this.afterProgress(false);
        this.friends.render();
      },
    });
  }

  private cashToCoins(): number {
    const s = (this.cache.json.get("rules:settings.json") as RulesNode)._children?.[0] ?? ({} as RulesNode);
    return Number(s.cashToCoins ?? 0) || 0;
  }

  // FriendsManager.npcsLoad: every NPC that is not an advisor plus the player's own advisor (profile bossGenre picks
  // one of the BOSS_COUNT = 2 advisors), then the player. Friends come from the server and are not listed.
  private neighbors(): Neighbor[] {
    const npcs = ((this.cache.json.get("rules:NPCDefinitions.json") as RulesNode | undefined)?._children ?? []) as RulesNode[];
    const genre = Number((this.cache.json.get("city") as { profile?: { bossGenre?: string } }).profile?.bossGenre ?? 0) || 0;
    const list: Neighbor[] = npcs.filter((_, i) => i >= ADVISOR_COUNT || i === genre).map((n) => ({
      name: String(n.name), companyValue: Number(n.companyValue) || 0, level: levelForExp(this.xpTable, Number(n.xp) || 0).level,
      photo: n.url ? ASSETS + "icons/npcs/" + String(n.url) : null, myself: false,
      city: npcCityFile(npcs.map((x) => ({ name: String(x.name) })), String(n.name)),
    }));
    const own = this.visitCity && this.ownSave ? this.ownSave : this.state.data;
    list.push({ name: this.localProfile.userName, companyValue: this.companyValue(own).total, level: this.builder.level(),
      photo: this.localProfile.picture, myself: true, city: null });
    return list;
  }

  private companyValue(d: SaveData = this.state.data) {
    return companyValueParts({
      coins: d.profile.coins, cash: d.profile.cash, cashToCoins: this.cashToCoins(),
      items: d.items.map((it) => {
        const def = this.state.defs.get(it.sku);
        const contract = it.state?.contractSku ? this.rules.contracts.get(it.state.contractSku) : undefined;
        return { companyValue: Math.trunc(Number(def?.attributes.companyValue ?? 0)) || 0, contractCost: contract?.costCoins ?? 0,
          underConstruction: !!it.construction };
      }),
      terrainTiles: d.terrain.length, terrainPrice: this.builder.terrainPrice(),
      expansionCash: this.builder.expansionPriceList.map((x) => x.cash), expansionsBought: this.builder.expansionsBought(d.areas),
    });
  }

  private visitedCompanyValue(): number {
    return this.neighbors().find((n) => n.city === this.visitCity)?.companyValue ?? 0;
  }

  private openCompanyValue(): void {
    showCompanyValuePopup(document.getElementById("popup-host")!, this.layouts.popup_value, this.uiFrames, this.lookup, this.companyValue());
  }

  private toolbarAction(a: ToolbarAction): void {
    if (a === "home") this.goHome();
    else if (a === "multifunction" && this.multiBar) this.multiBar.setOpen(!this.multiBar.open);
    else this.serverOnly(a);
  }

  private setupContractors(): void {
    this.serviceOffers = parseServices(this.cache.json.get("rules:servicesDefinitions.json") as { _children?: Array<Record<string, unknown>> });
    this.services = parseServicesData(safeGet(this.servicesKey()));
    const layout = this.layouts.button_multifuncion;
    if (!layout || this.visitCity) return;
    this.multiBar = new MultifunctionBar(layout, this.uiFrames, this.lookup, (t) => this.startServiceTool(t), true);
    this.toolbar.attach(this.multiBar.panel);
    this.serviceGfx = this.add.graphics().setDepth(ICON_DEPTH - 1);
  }

  private servicesKey(): string {
    return "mcity.services.v1" + this.saveKey().slice("mcity.save.v1".length);
  }

  private startServiceTool(t: ContractorTool): void {
    if (t === "move") {
      this.startMoveTool();
      return;
    }
    this.setTool("select");
    this.serviceTool = t;
    this.multiBar?.setSelected(t);
    this.multiBar?.setOpen(false);
    const left = serviceTimeLeft(this.services, t, Date.now());
    this.multiBar?.panel.layer(t === "moneyCollector" ? "collector" : "contract")?.setAttribute("title",
      left > 0 ? `${Math.ceil(left / 3_600_000)} h left` : "not hired");
  }

  // ToolMove.start: STATE_WAITING_FOR_ITEM until an own movable item is clicked.
  private startMoveTool(): void {
    this.setTool("select");
    this.moveTool = true;
    this.multiBar?.setSelected("move");
    this.multiBar?.setOpen(false);
  }

  private stopServiceTool(): void {
    this.moveTool = false;
    this.serviceTool = null;
    this.multiBar?.setSelected(null);
    this.serviceGfx?.clear();
    for (const v of this.serviceHighlighted) v.sprite.preFX?.clear();
    this.serviceHighlighted = [];
  }

  private serviceSettings(t: ServiceSku): [number, number] {
    const s = (this.cache.json.get("rules:settings.json") as RulesNode)._children?.[0] ?? ({} as RulesNode);
    return t === "moneyCollector" ? [Number(s.moneyCollectorAreaX ?? 11), Number(s.moneyCollectorAreaY ?? 11)]
      : [Number(s.contractSignatorAreaX ?? 11), Number(s.contractSignatorAreaY ?? 11)];
  }

  // Tool.areaMove: the area follows the tile under the cursor; ToolMoneyCollector affects own items with income ready,
  // ToolContractSignator houses waiting for a contract (isIncomeReady / isContractSignReady).
  private serviceAffected(t: ServiceSku, tile: { x: number; y: number }): ItemView[] {
    const [w, h] = this.serviceSettings(t);
    const area = serviceArea(tile.x, tile.y, w, h);
    return this.views.filter((v) => {
      const mode = this.state.item(v.item.sid)?.state?.mode;
      const ready = t === "moneyCollector" ? mode === Mode.GetRent : v.item.def.kind === "house" && mode === Mode.WaitingForContract;
      return ready && inArea(area, { x: v.item.tileX, y: v.item.tileY, w: v.item.def.baseCols, h: v.item.def.baseRows });
    });
  }

  private drawServiceArea(p: Phaser.Input.Pointer): void {
    const t = this.serviceTool;
    if (!t || !this.serviceGfx) return;
    const tile = this.pointerTile(p);
    const [w, h] = this.serviceSettings(t);
    const a = serviceArea(tile.x, tile.y, w, h);
    const g = this.serviceGfx;
    g.clear();
    // Tool.areaDraw: AREA_COLOR 0x00ff00, alpha pulsing between AREA_MIN_ALPHA 0.1 and AREA_MAX_ALPHA 0.4.
    g.fillStyle(0x00ff00, this.serviceAlpha.value).fillRect(a.x0 * TILE, a.y0 * TILE, (a.x1 - a.x0 + 1) * TILE, (a.y1 - a.y0 + 1) * TILE);
    g.lineStyle(2, 0x00ff00, Math.min(1, this.serviceAlpha.value + 0.4)).strokeRect(a.x0 * TILE, a.y0 * TILE, (a.x1 - a.x0 + 1) * TILE, (a.y1 - a.y0 + 1) * TILE);
    const affected = this.serviceAffected(t, tile);
    for (const v of this.serviceHighlighted) if (!affected.includes(v)) v.sprite.preFX?.clear();
    for (const v of affected) if (!this.serviceHighlighted.includes(v)) v.sprite.preFX?.addGlow(HOVER_GLOW, 3, 0, false, 0.1, 10);
    this.serviceHighlighted = affected;
  }

  private stepServiceAlpha(): void {
    const a = this.serviceAlpha;
    a.value += a.speed;
    if (a.value >= 0.4) { a.value = 0.4; a.speed = -Math.abs(a.speed); }
    if (a.value <= 0.1) { a.value = 0.1; a.speed = Math.abs(a.speed); }
  }

  // Tool.areaClick: without hired time the contractor's popup offers the service; after hiring (or with time left)
  // the service applies to the area.
  private serviceClick(p: Phaser.Input.Pointer): void {
    const t = this.serviceTool;
    if (!t) return;
    const tile = this.pointerTile(p);
    if (serviceActive(this.services, t, Date.now())) {
      this.applyService(t, tile);
      return;
    }
    showServicePopup(document.getElementById("popup-host")!, this.layouts, this.uiFrames, this.lookup, t, this.serviceOffers.get(t) ?? [],
      this.services, () => ({ cash: this.state.data.profile.cash, coins: this.state.data.profile.coins }), Date.now(), (offer) => {
        const wallet = { cash: this.state.data.profile.cash, coins: this.state.data.profile.coins };
        if (!buyService(this.services, offer, Date.now(), wallet)) return;
        const prof = this.state.data.profile;
        prof.cash = wallet.cash;
        prof.coins = wallet.coins;
        safeSet(this.servicesKey(), JSON.stringify(this.services));
        this.persist();
        this.refreshHud(false);
        this.startServiceTool(t);
        this.applyService(t, tile);
      }, () => showNoticePopup(document.getElementById("popup-host")!, this.layouts.popup_confirm, this.uiFrames,
        this.lookup("TID_NO_GOLD_TITLE", "Not Enough Gold"), this.lookup("TID_NO_GOLD_BODY", "You don't have enough gold.")));
  }

  private applyService(t: ServiceSku, tile: { x: number; y: number }): void {
    const affected = this.serviceAffected(t, tile);
    if (affected.length === 0) return;
    if (t === "moneyCollector") {
      // ToolMoneyCollector.areaDoClick: each item is collected as if clicked.
      for (const v of affected) this.collect(v);
      return;
    }
    // ToolContractSignator.areaApplyService: ContractBoxMultiple for the houses in the area.
    this.multiSign = affected;
    this.openContracts(affected[0]);
  }

  // ToolContractSignator.areaDoClick: every house gets the contract with the chosen name for its own type, if the
  // player's level allows it (cacheContractDefinitionGetByName, level check); each signature costs its contract.
  private signContractForAll(sku: string): void {
    const name = this.contractNames.get(sku);
    const houses = this.multiSign ?? [];
    this.multiSign = null;
    let signed = 0;
    for (const v of houses) {
      const own = this.state.contractsFor(v.item.sid).find((c) => this.contractNames.get(c) === name);
      if (!own || (this.contractViews.get(own)?.level ?? 1) > this.level) continue;
      if (this.state.data.profile.coins < (this.rules.contracts.get(own)?.costCoins ?? 0)) break;
      if (this.state.signContract(v.item.sid, own, Date.now())) signed++;
    }
    this.closeContracts();
    if (!signed) return;
    this.persist();
    this.audio.sfx(SoundId.Contract);
    this.refreshIcons();
    this.refreshHud(false);
  }

  private selectNeighbor(n: Neighbor): void {
    if (n.myself) {
      if (this.visitCity) this.goHome();
      return;
    }
    if (!isNpcCityFile(n.city) || n.city === this.visitCity) return;
    const q = new URLSearchParams(location.search);
    q.delete("fresh");
    q.delete("view");
    q.set("visit", n.city);
    this.persist();
    this.leaveCity("assign", "?" + q.toString());
  }

  private homeUrl(): string {
    const q = new URLSearchParams(location.search);
    q.delete("visit");
    q.delete("fresh");
    q.delete("view");
    const s = q.toString();
    return s ? "?" + s : location.pathname;
  }

  private goHome(): void {
    this.persist();
    this.leaveCity("assign", this.homeUrl());
  }

  private visitedCityName(): string {
    return String((this.cache.json.get("city") as { profile?: { cityname?: string } }).profile?.cityname ?? "");
  }

  // DollarsGame.changeState (visitor role): the visit events, then the banner plane with the visited city's name.
  private startVisit(): void {
    const npcs = ((this.cache.json.get("rules:NPCDefinitions.json") as RulesNode | undefined)?._children ?? [])
      .map((n) => ({ name: String(n.name) }));
    const owner = npcs.find((n) => npcCityFile(npcs, n.name) === this.visitCity)?.name ?? "";
    const target = npcTarget(npcs, owner, this.visitedCityName());
    const rules = parseSocialRules(this.cache.json.get("rules:social.json") as { _children?: Array<Record<string, unknown>> });
    this.visit = new NpcVisit(this.visitCity!, target, rules, parseVisitLedger(safeGet(this.visitLedgerKey()), Date.now()));
    this.toolbar.setUpgradesLeft(this.visit.remaining);
    const banner = document.getElementById("visit-banner")!;
    banner.textContent = `${owner}: ${this.visitedCityName()} (offline NPC city)`;
    banner.hidden = false;
    this.missionEvents(visitMissionEvents(target));
    this.startPlane(this.visitedCityName());
  }

  private visitLedgerKey(): string {
    return "mcity.visits.v1" + this.saveKey().slice("mcity.save.v1".length);
  }

  // StateOnRentVisitor.doDoClick: upgradeApply (Event_upgrade), MISSION_EVENT_UPGRADE, then the visitor gets
  // DCCoins and experience for the upgrade.
  private visitClick(view: ItemView): void {
    const v = this.visit;
    if (!v) return;
    const mode = this.state.item(view.item.sid)?.state?.mode;
    const now = Date.now();
    const reward = v.upgrade(view.item.sid, view.item.def, mode, now);
    if (!reward) return;
    safeSet(this.visitLedgerKey(), JSON.stringify(v.ledger));
    const p = this.state.data.profile;
    p.coins += reward.coins;
    p.exp += reward.exp;
    this.missionEvents(itemEvents("upgrade", view.item.def));
    this.toolbar.setUpgradesLeft(v.remaining);
    const [x, y] = this.baseCentre(view);
    this.playEffect(FX_VISIT_UPGRADE, x, y);
    const text = this.add.text(x, y - 20, `+$${reward.coins} +${reward.exp} XP`, {
      fontFamily: '"Challenge Bold LET"', fontSize: "20px", color: "#ffffff", stroke: "#0e2600", strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(ICON_DEPTH + 2);
    this.tweens.add({ targets: text, y: text.y - 40, alpha: 0, duration: 1200, onComplete: () => text.destroy() });
    this.afterProgress(true);
  }

  // Functions that needed the original online server only explain that they are not available. NPC visits are
  // possible offline in the original but are not reconstructed yet (roadmap), which the message says plainly.
  private serverOnly(what: string): void {
    const titles: Record<string, string> = {
      multifunction: this.lookup("TID_HINT_BUTTION_MULTIFUNCTION", "Contractors"),
      invest: this.lookup("TID_INVESTMENTS_TOOLTIP", "Investments"),
      neighbors: this.lookup("TID_BUTTON_TEXT_ADDNEIGHBORS", "Add Neighbors"),
      visit: this.lookup("TID_BUTTON_TEXT_ADDNEIGHBORS", "Add Neighbors"),
    };
    const body = what === "visit"
      ? "Visiting neighbour cities is not available in this version yet."
      : "This feature needs the original online server, which the desktop version does not have.";
    showNoticePopup(document.getElementById("popup-host")!, this.layouts.popup_confirm, this.uiFrames, titles[what] ?? what, body);
  }

  private mapInfoData(view: ItemView): MapInfoData | null {
    const it = this.state.item(view.item.sid);
    const kind = mapInfoKind(view.item.def.kind, it?.state?.mode);
    if (!it?.state || !kind) return null;
    const s = it.state;
    const elapsed = Math.max(0, Date.now() - s.savedAt);
    const title = (this.texts[view.item.def.tid] ?? view.item.def.name).trim();
    const tenantsOf = (sku: string | undefined) => Math.trunc(Number(this.state.defs.get(sku ?? "")?.attributes.tenants ?? 0)) || 0;
    if (kind === "house") {
      const contract = s.contractSku ? this.rules.contracts.get(s.contractSku) : undefined;
      const period = contract?.incomeTimeMs ?? 0;
      const left = s.mode === Mode.Renting ? Math.max(0, s.timeMs - elapsed) : s.mode === Mode.SigningContract ? period : 0;
      const income = this.state.incomeFor(it.sid);
      return { kind, title, periodMs: period, leftMs: left, income: income?.coins ?? 0, xp: income?.xp ?? 0,
        attendance: contract ? tenantsOf(it.sku) : 0 };
    }
    const period = itemIncomeTimeMs(view.item.def);
    const left = s.mode === Mode.Renting ? Math.max(0, s.timeMs - elapsed) : 0;
    const income = this.state.shopIncomeFor(it.sid);
    const customers = this.state.customerSids(it.sid).reduce((n, sid) => n + tenantsOf(this.state.item(sid)?.sku), 0);
    return { kind, title, periodMs: period, leftMs: left, income: income?.coins ?? 0, xp: income?.xp ?? 0, attendance: customers };
  }

  private itemScreenRect(view: ItemView) {
    const b = view.sprite.getBounds();
    const cam = this.cameras.main;
    const sx = (x: number) => ((x - cam.worldView.x) * cam.zoom) / this.dpr;
    const sy = (y: number) => ((y - cam.worldView.y) * cam.zoom) / this.dpr;
    return { left: sx(b.left), right: sx(b.right), top: sy(b.top), bottom: sy(b.bottom) };
  }

  // StateItemObject: the info box opens INFO_BOX_DELAY_MS after the pointer rests on an item and closes when it leaves.
  private scheduleMapInfo(view: ItemView | null): void {
    window.clearTimeout(this.mapInfoTimer);
    if (this.mapInfoFor !== view) {
      this.mapInfo.hide();
      this.mapInfoFor = null;
    }
    if (!view || this.placement || !mapInfoKind(view.item.def.kind, this.state.item(view.item.sid)?.state?.mode)) return;
    this.mapInfoTimer = window.setTimeout(() => {
      const data = this.hovered === view ? this.mapInfoData(view) : null;
      if (!data) return;
      this.mapInfoFor = view;
      this.mapInfo.show(data, this.itemScreenRect(view));
    }, INFO_BOX_DELAY_MS);
  }

  private refreshMapInfo(delta: number): void {
    if (!this.mapInfoFor) return;
    this.mapInfoRefresh += delta;
    if (this.mapInfoRefresh < MAP_INFO_REFRESH_MS) return;
    this.mapInfoRefresh = 0;
    const data = this.mapInfoData(this.mapInfoFor);
    if (data) this.mapInfo.update(data);
    else this.scheduleMapInfo(null);
  }

  private setupMissions(): void {
    const ui = new UiFrames(this.cache.json.get("ui_atlas") as UiAtlas, ASSETS + "atlas/");
    const layouts = this.cache.json.get("ui_layout") as Record<string, PanelLayout>;
    const texts = {
      text: (tid: string, fallback: string) => this.texts[tid] ?? fallback,
      icon: (type: string) => (this.manifest.mission_icons[type] ? ASSETS + this.manifest.mission_icons[type] : null),
      feed: (img: string) => (this.manifest.feed_images?.includes(img) ? ASSETS + "feed/" + img : null),
    };
    this.missionPanel = new MissionPanel(document.getElementById("missions")!, document.getElementById("popup-host")!, layouts, ui,
      this.missions, texts, (sku) => this.claimMission(sku), () => this.openNamePopup(), this.rain);
    this.hud.onCityNameClick(() => this.openNamePopup());
    this.levelPopup = new LevelPopup(document.getElementById("level-popup")!, layouts.popup_next_level, ui, texts, this.rain);
    this.checkMissionConditions();
    this.missions.evaluate(this.level);
    this.missionPanel.refresh();
  }

  private claimMission(sku: number) {
    const reward = this.state.claimMission(this.missions, sku);
    if (!reward) return null;
    this.persist();
    // MissionItem.applyReward plays SOUND_INCOME.
    this.audio.sfx(SoundId.Income);
    this.afterProgress(true);
    return reward;
  }

  private missionEvents(events: Array<[string, string]>): void {
    let any = false;
    for (const [type, param] of events) any = this.missions.register(type, param) || any;
    if (any) this.afterProgress(false);
  }

  // Profile.eventCheck (earn), StateOnRent.doDoLogicUpdate (checkInfluence) and
  // ItemObject.checkInfluenceEvent (bonus) report values that satisfy thresholds once.
  private checkMissionConditions(): boolean {
    const p = this.state.data.profile;
    let changed = this.missions.check("earn", "DCCoins", p.coins);
    changed = this.missions.check("earn", "companyValue", p.companyValue) || changed;
    if (this.visitCity) return changed;
    const all = this.state.footprints();
    const bySid = new Map(all.map((f) => [f.sid, f]));
    const customers = this.state.allCustomerSids();
    for (const f of all) {
      if (f.def.kind === "commerce") {
        const population = (customers.get(f.sid) ?? []).reduce((n, sid) => n + Number(bySid.get(sid)?.def.attributes.tenants ?? 0), 0);
        changed = this.missions.check("checkInfluence", f.def.sku, population) || changed;
      } else if (f.def.kind === "house") {
        const pct = houseInfluencePercent(f, all);
        for (const param of bonusParameters(f.def.sku)) changed = this.missions.check("bonus", param, pct) || changed;
      }
    }
    return changed;
  }

  // Re-evaluates missions and the level after anything that changes counts, coins or experience.
  private afterProgress(animateHud: boolean): void {
    this.checkMissionConditions();
    const level = this.builder.level();
    if (level > this.level) {
      const unlocked = [...this.state.defs.values()].filter((d) => Number(d.attributes.level) === level && d.attributes.unlockCondition === "level").length;
      this.level = level;
      // PopupLevel.showPopup plays SOUND_LEVEL.
      this.audio.sfx(SoundId.Level);
      this.levelPopup.show(level, unlocked);
    }
    this.missions.evaluate(this.level);
    this.missionPanel.refresh();
    this.persist();
    this.refreshHud(animateHud);
  }

  // StorageManager: one entry per stored sku with the number of units, in the order they were received.
  private storageEntries(): StorageEntry[] {
    const counts = new Map<string, number>();
    for (const sku of this.state.data.storage) counts.set(sku, (counts.get(sku) ?? 0) + 1);
    return [...counts].filter(([sku]) => this.state.defs.has(sku) && this.manifest.items[sku]?.status === "ok")
      .map(([sku, count]) => {
        const def = this.state.defs.get(sku)!;
        return { sku, name: (this.texts[def.tid] ?? def.name).trim(), count };
      });
  }

  // Items the original still sells first, then the limited-time items whose offer has ended. Those stay locked
  // unless the local option to offer expired items is on (Local Profile Settings); that option is not original.
  private shopEntries(kind: ItemDefinition["kind"]): ShopEntry[] {
    const now = Date.now();
    const art = [...this.state.defs.values()].filter((d) => d.kind === kind && this.manifest.items[d.sku]?.status === "ok");
    const available = art.filter((d) => shopAvailability(d, now) === "available").map((def) => this.shopEntry(def));
    const expired = art.filter((d) => shopAvailability(d, now) === "expired").map((def) => this.shopEntry(def, !readSettings().expiredOffers));
    return [...available, ...expired];
  }

  private shopEntry(def: ItemDefinition, expired = false): ShopEntry {
    const p = this.state.data.profile;
    const locked = expired || this.builder.isLocked(def);
    const cond = def.attributes.unlockCondition ?? "level";
    return {
      def, locked, lockReason: !locked ? null : expired ? "expired" : cond === "level" ? "level" : cond === "fan" ? "fan" : "other",
      affordable: p.coins >= Number(def.attributes.constructionCoins ?? 0) && p.cash >= Number(def.attributes.constructionCash ?? 0),
    };
  }

  // Specials (featured="1") follow the normal shop rules. Skyscraper Week (shopTab="new_items") items carry an end
  // date; once it has passed they stay listed but cannot be bought.
  private specialEntries(tab: SpecialTab): ShopEntry[] {
    const now = Date.now();
    const art = specialTabItems(this.state.defs, tab).filter((d) => this.manifest.items[d.sku]?.status === "ok");
    if (tab === "featured") return art.filter((d) => isAllowedInShop(d, now)).map((d) => this.shopEntry(d));
    const offerExpired = readSettings().expiredOffers;
    return art.map((d) => this.shopEntry(d, !offerExpired && !isAllowedInShop(d, now)));
  }

  private setTool(tool: Tool): void {
    this.stopServiceTool();
    this.cancelPlacement();
    this.cursor.clear();
    this.select(null);
    if (tool === "build" || tool === "storage") {
      this.toolbar.select(tool);
      this.storage.hide();
      this.shop.hide();
      (tool === "build" ? this.shop : this.storage).show();
      return;
    }
    this.shop.hide();
    this.storage.hide();
    this.toolbar.select(tool);
  }

  private async startPlacement(sku: string, fromStorage = false): Promise<void> {
    this.scheduleMapInfo(null);
    this.shop.hide();
    this.storage.hide();
    const def = this.state.defs.get(sku);
    if (!def) return;
    const base = this.add.graphics().setDepth(ICON_DEPTH - 2);
    this.placement = { sku, base, fromStorage };
    if (await this.ensureItemArt(sku) && this.placement?.sku === sku) {
      const art = this.manifest.items[sku];
      this.placement.ghost = this.add.sprite(0, 0, "item:" + sku, `${sku}/0`).setScale(1 / art.art_scale).setAlpha(0.75).setDepth(ICON_DEPTH - 2);
    }
    this.updatePlacement(this.input.activePointer);
  }

  private cancelPlacement(): void {
    const moving = this.placement?.moveSid;
    if (moving !== undefined) {
      const v = this.views.find((x) => x.item.sid === moving);
      v?.sprite.setVisible(true);
      v?.icon?.sprite.setVisible(true);
    }
    this.placement?.ghost?.destroy();
    this.placement?.base.destroy();
    this.placement = null;
  }

  private pointerTile(p: Phaser.Input.Pointer): { x: number; y: number } {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return worldToTile(w.x, w.y);
  }

  private updatePlacement(p: Phaser.Input.Pointer): void {
    const pl = this.placement;
    if (!pl) return;
    const def = this.state.defs.get(pl.sku)!;
    const t = this.pointerTile(p);
    const tx = t.x - Math.floor((def.baseCols - 1) / 2);
    const ty = t.y - Math.floor((def.baseRows - 1) / 2);
    const moveErr = pl.moveSid !== undefined ? this.builder.canMove(pl.moveSid, tx, ty) : undefined;
    const ok = moveErr !== undefined ? moveErr === null || moveErr === "same"
      : (pl.fromStorage ? this.builder.canPlaceFromStorage(pl.sku, tx, ty) : this.builder.canPlace(pl.sku, tx, ty)) === null;
    const color = ok ? BASE_OK : BASE_NO;
    pl.base.clear().lineStyle(2, color, 1).fillStyle(color, 0.3);
    pl.base.fillRect(tx * TILE, ty * TILE, def.baseCols * TILE, def.baseRows * TILE).strokeRect(tx * TILE, ty * TILE, def.baseCols * TILE, def.baseRows * TILE);
    pl.ghost?.setPosition(tx * TILE, (ty + def.baseRows) * TILE);
    pl.base.setData("tile", [tx, ty]);
  }

  private confirmPlacement(): void {
    const pl = this.placement;
    if (!pl) return;
    const [tx, ty] = pl.base.getData("tile") as [number, number];
    if (pl.moveSid !== undefined) {
      this.placeMovedItem(pl.moveSid, tx, ty);
      return;
    }
    const sid = pl.fromStorage ? this.builder.placeFromStorage(pl.sku, tx, ty, Date.now()) : this.builder.place(pl.sku, tx, ty, Date.now());
    if (sid === null) return;
    this.persist();
    // ToolBuild.startBuildingItem plays SOUND_BUILD when an item is placed.
    this.audio.sfx(SoundId.Build);
    this.addItemView(this.state.item(sid) as SavedItem);
    this.missionEvents(itemEvents("build", this.state.defs.get(pl.sku)!));
    this.refreshHud(false);
    this.cancelPlacement();
    this.setTool("select");
  }

  // ToolMove.doReportMouseUp in STATE_WAITING_FOR_ITEM: an own movable item is attached to the cursor.
  private async pickMoveItem(view: ItemView | null): Promise<void> {
    if (!view || !this.builder.isMovable(view.item.sid)) return;
    const sid = view.item.sid, sku = view.item.sku;
    this.scheduleMapInfo(null);
    const base = this.add.graphics().setDepth(ICON_DEPTH - 2);
    this.placement = { sku, base, moveSid: sid };
    view.sprite.setVisible(false);
    view.icon?.sprite.setVisible(false);
    if (await this.ensureItemArt(sku) && this.placement?.moveSid === sid) {
      const art = this.manifest.items[sku];
      this.placement.ghost = this.add.sprite(0, 0, "item:" + sku, `${sku}/0`).setScale(1 / art.art_scale).setAlpha(0.75).setDepth(ICON_DEPTH - 2);
    }
    this.updatePlacement(this.input.activePointer);
  }

  // STATE_MOVING_WITH_ITEM: the same position puts the item back; a place where it cannot stand does nothing;
  // otherwise itemAttachedCheckPrize asks PopupConfirmMove (free moves running) or PopupPayMove. Closing either
  // popup cancels the move (onCancelMove) and the item stays where it was.
  private placeMovedItem(sid: number, tx: number, ty: number): void {
    const err = this.builder.canMove(sid, tx, ty);
    if (err === "same") {
      this.cancelPlacement();
      return;
    }
    if (err) return;
    const host = document.getElementById("popup-host")!;
    const finish = (free: boolean) => {
      if (this.builder.move(sid, tx, ty, free)) {
        this.cancelPlacement();
        showNoCashPopup(host, this.layouts.popup_confirm, this.uiFrames, this.lookup);
        return;
      }
      this.placement?.ghost?.destroy();
      this.placement?.base.destroy();
      this.placement = null;
      this.removeItemView(sid);
      this.addItemView(this.state.item(sid) as SavedItem);
      this.refreshIcons();
      this.audio.sfx(SoundId.Build);
      this.persist();
      this.refreshHud(false);
    };
    const now = Date.now();
    if (serviceActive(this.services, "move", now)) {
      showConfirmMove(host, this.layouts.popup_confirm_buy_crane_operator, this.uiFrames, this.lookup, () => finish(true), () => this.cancelPlacement());
      return;
    }
    const price = this.builder.movePrice(sid)!;
    const offer = this.serviceOffers.get("move")?.[0];
    const label = price.cash > 0 ? String(price.cash) : this.lookup("TID_COIN_SYMBOL", "$") + price.coins.toLocaleString("en-US");
    showPayMove(host, this.layouts.popup_confirm_buy_rent_crane_operator, this.uiFrames, this.lookup, label, offer?.priceCash ?? 0,
      () => finish(false),
      () => {
        const wallet = { cash: this.state.data.profile.cash, coins: this.state.data.profile.coins };
        if (!offer || !buyService(this.services, offer, Date.now(), wallet)) {
          this.cancelPlacement();
          showNoticePopup(host, this.layouts.popup_confirm, this.uiFrames, this.lookup("TID_NO_GOLD_TITLE", "Not Enough Gold"),
            this.lookup("TID_NO_GOLD_BODY", "You don't have enough Gold Bars."));
          return;
        }
        this.state.data.profile.cash = wallet.cash;
        this.state.data.profile.coins = wallet.coins;
        safeSet(this.servicesKey(), JSON.stringify(this.services));
        finish(true);
      },
      () => this.cancelPlacement());
  }

  private updateCursor(p: Phaser.Input.Pointer): void {
    const tool = this.toolbar.tool;
    this.cursor.clear();
    if (tool !== "terrain" && tool !== "road" && tool !== "demolish") return;
    const t = this.pointerTile(p);
    const ok = tool === "terrain" ? this.builder.canBuyTerrain(t.x, t.y) === null
      : tool === "road" ? this.builder.canBuildRoad(t.x, t.y) : true;
    const color = ok ? BASE_OK : BASE_NO;
    this.cursor.lineStyle(2, color, 1).fillStyle(color, 0.3).fillRect(t.x * TILE, t.y * TILE, TILE, TILE).strokeRect(t.x * TILE, t.y * TILE, TILE, TILE);
  }

  private paintTile(p: Phaser.Input.Pointer): void {
    const t = this.pointerTile(p);
    const centre: [number, number] = [t.x * TILE + TILE / 2, t.y * TILE + TILE / 2];
    // Map.buyTerrain and Map.roadTileBuild show the terrain particle; neither plays a sound.
    if (this.toolbar.tool === "terrain" && this.builder.buyTerrain(t.x, t.y)) this.playEffect(FX_TERRAIN, ...centre);
    else if (this.toolbar.tool === "road" && this.builder.buildRoad(t.x, t.y)) this.playEffect(FX_TERRAIN, ...centre);
    else return;
    this.refreshGround();
    this.persist();
    this.refreshHud(false);
  }

  private demolishAt(p: Phaser.Input.Pointer, view: ItemView | null): void {
    if (view) {
      const refund = this.builder.demolishRefund(view.item.sid);
      if (refund === null) return;
      showDestroyPopup(document.getElementById("popup-host")!, this.layouts.popup_destroy, this.uiFrames, this.lookup,
        refund, () => {
          if (this.builder.demolish(view.item.sid) === null) return;
          this.removeItemView(view.item.sid);
          // ItemObject.onAccept plays SOUND_DESTROY except for decorations.
          if (view.item.def.kind !== "decoration") this.audio.sfx(SoundId.Destroy);
          this.persist();
          this.refreshHud(false);
        });
      return;
    } else {
      const t = this.pointerTile(p);
      const centre: [number, number] = [t.x * TILE + TILE / 2, t.y * TILE + TILE / 2];
      // Map.roadTileBuild's counterpart removes roads silently; plots show TerrainDestroyParticle.
      if (this.builder.removeRoad(t.x, t.y)) this.refreshGround();
      else if (this.builder.removeTerrain(t.x, t.y) !== null) {
        this.playEffect(FX_TERRAIN_DESTROY, ...centre);
        this.refreshGround();
      } else return;
    }
    this.persist();
    this.refreshHud(false);
  }

  private finishConstruction(view: ItemView): boolean {
    if (this.builder.constructionLeftMs(view.item.sid) === null) return false;
    if (!this.builder.finishConstruction(view.item.sid, Date.now())) return true;
    this.persist();
    this.playEffect(FX_BUILD_DONE, ...this.baseCentre(view));
    const saved = this.state.item(view.item.sid) as SavedItem;
    this.missionEvents([["buy", saved.sku]]);
    this.removeItemView(view.item.sid);
    void this.ensureItemArt(saved.sku).then(() => {
      this.addItemView(saved);
      this.refreshIcons();
    });
    this.refreshHud(true);
    return true;
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    const [bw, bh] = this.manifest.background.size;
    // The scene clamps the camera itself (clampCamera): Phaser's bounds pin a map smaller than the view to the
    // top-left corner, which at the lowest zoom levels left the map in a corner of a wide window.
    this.mapSize = [bw, bh];
    cam.setRoundPixels(false);
    this.applyZoom();
    const view = new URLSearchParams(location.search).get("view")?.split(",").map(Number);
    const hq = this.views.find((v) => v.item.def.kind === "headquarters");
    if (view && view.length === 2 && view.every(Number.isFinite)) cam.setScroll(view[0], view[1]);
    else if (hq) cam.centerOn(hq.sprite.x + (hq.item.def.baseCols * TILE) / 2, hq.sprite.y - (hq.item.def.baseRows * TILE) / 2);
    else cam.centerOn((MAP_COLS * TILE) / 2, (MAP_ROWS * TILE) / 2);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());
  }

  // Keeps the view inside the background; on an axis where the whole map fits in the view, the map stays
  // entirely visible and can still be dragged (centreRange).
  private clampCamera(): void {
    const cam = this.cameras.main;
    const [bw, bh] = this.mapSize;
    // The view's centre follows from the scroll directly (Camera.midPoint is only refreshed when rendering).
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const mx = clampCentre(cx, cam.width / cam.zoom, bw);
    const my = clampCentre(cy, cam.height / cam.zoom, bh);
    if (Math.abs(mx - cx) > 0.01 || Math.abs(my - cy) > 0.01) cam.centerOn(mx, my);
  }

  private applyZoom(): void {
    const cam = this.cameras.main;
    const midX = cam.midPoint.x;
    const midY = cam.midPoint.y;
    cam.setZoom(this.zoom.current * this.dpr);
    // Map.onZoom centres the map on an axis where it fits in the stage; dragging may move it afterwards.
    const [bw, bh] = this.mapSize;
    cam.centerOn(cam.width / cam.zoom >= bw ? bw / 2 : midX, cam.height / cam.zoom >= bh ? bh / 2 : midY);
  }

  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.fromCanvas(p)) return;
      this.dragStart = { x: p.x, y: p.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY };
      this.dragged = false;
      const tool = this.toolbar.tool;
      if ((tool === "terrain" || tool === "road") && !this.placement) {
        this.painting = true;
        this.paintTile(p);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.drawServiceArea(p);
      this.updatePlacement(p);
      this.updateCursor(p);
      if (this.painting && p.isDown) {
        this.paintTile(p);
        return;
      }
      if (!this.dragStart || !p.isDown) return;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX * this.dpr) return;
      if (!this.dragged) this.scheduleMapInfo(null);
      this.dragged = true;
      const cam = this.cameras.main;
      cam.setScroll(this.dragStart.scrollX - dx / cam.zoom, this.dragStart.scrollY - dy / cam.zoom);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const wasPainting = this.painting;
      this.painting = false;
      if (this.dragStart && !this.dragged && !wasPainting) {
        const top = over.find((o) => o.getData("view"));
        const view = top ? (top.getData("view") as ItemView) : null;
        if (this.placement) this.confirmPlacement();
        else if (this.moveTool) this.pickMoveItem(view);
        else if (this.serviceTool) this.serviceClick(p);
        else if (this.toolbar.tool === "demolish") this.demolishAt(p, view);
        else if (this.toolbar.tool === "select") this.select(view);
      }
      this.dragStart = null;
    });
    this.input.on(Phaser.Input.Events.GAMEOBJECT_OVER, (_p: Phaser.Input.Pointer, o: Phaser.GameObjects.GameObject) => {
      if (this.toolbar.tool === "select" || this.toolbar.tool === "demolish") this.setHover((o.getData("view") as ItemView) ?? null);
    });
    this.input.on(Phaser.Input.Events.GAMEOBJECT_OUT, (_p: Phaser.Input.Pointer, o: Phaser.GameObjects.GameObject) => {
      if (this.hovered && this.hovered.sprite === o) this.setHover(null);
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (dy < 0) this.zoom.zoomIn();
      else if (dy > 0) this.zoom.zoomOut();
    });
    this.input.keyboard?.on("keydown-ESC", () => this.setTool("select"));
  }

  // Phaser also reports mouse buttons released over the page's HTML panels (window listeners); a press or release on a
  // popup, the shop or the bottom bar must not reach the map below it.
  private fromCanvas(p: Phaser.Input.Pointer): boolean {
    const target = p.event?.target;
    return !target || target === this.game.canvas;
  }

  private setHover(view: ItemView | null): void {
    if (this.hovered === view) return;
    this.hovered?.sprite.preFX?.clear();
    this.hovered = view;
    view?.sprite.preFX?.addGlow(HOVER_GLOW, 3, 0, false, 0.1, 10);
    this.scheduleMapInfo(view);
  }

  select(view: ItemView | null): void {
    if (this.visitCity) {
      // Visitor role: houses can only be upgraded; nothing else in the owner's city reacts to clicks.
      if (view) this.visitClick(view);
      return;
    }
    if (view && this.finishConstruction(view)) return;
    if (view && this.collect(view)) return;
    const mode = view ? this.state.item(view.item.sid)?.state?.mode : undefined;
    if (view && view.item.def.kind === "house" && (mode === Mode.WaitingForContract || mode === Mode.Abandoned)) {
      this.panel.hide();
      this.openContracts(view);
      return;
    }
    if (view && this.state.canCancelContract(view.item.sid)) {
      this.panel.hide();
      this.askCancelContract(view);
      return;
    }
    this.selected = view;
    if (view && view.item.def.kind === "headquarters") {
      // StateOnHeadQuarter.doClick opens PopupValue.
      this.panel.hide();
      this.openCompanyValue();
      return;
    }
    // Houses and shops show their state in the map info box; the side panel keeps the item data for other items.
    if (view && mapInfoKind(view.item.def.kind, mode) === null) this.panel.show(view.item);
    else this.panel.hide();
  }

  // StateOnRent.doDoClick on a renting house: PopupConfirmDestroy with TID_CANCEL_CONTRACT; accepting starts
  // MODE_CANCELING_CONTRACT (3 s), after which the house waits for a new contract. The running contract is lost.
  private askCancelContract(view: ItemView): void {
    const sid = view.item.sid;
    showConfirmDestroy(document.getElementById("popup-host")!, this.layouts.popup_destroy, this.uiFrames, this.lookup,
      this.lookup("TID_CANCEL_CONTRACT", "Are you sure you want to cancel the contract?"), () => {
        if (!this.state.cancelContract(sid, Date.now())) return;
        this.scheduleMapInfo(null);
        this.refreshIcons();
        this.persist();
        this.refreshHud(false);
      });
  }

  // Every switch of city reloads the page: the original loading page covers the old city until the new one is drawn.
  private leaveCity(how: "assign" | "replace", url: string): void {
    const loading = document.getElementById("loading-screen");
    if (loading) loading.hidden = false;
    if (how === "assign") location.assign(url);
    else location.replace(url);
  }

  update(_time: number, delta: number): void {
    const steps = this.clock.advance(delta);
    this.logicSteps += steps;
    for (let i = 0; i < steps; i++) {
      this.stepTraffic(LOGIC_STEP_MS);
      this.stepPlane();
    }
    this.drawTraffic();
    for (let i = 0; i < steps; i++) this.stepServiceAlpha();
    if (this.serviceTool) this.drawServiceArea(this.input.activePointer);
    if (this.zoom.update(delta)) this.applyZoom();
    this.clampCamera();
    this.refreshMapInfo(delta);
    const t = this.clock.simulatedMs;
    this.economyTimer += delta;
    if (this.economyTimer >= ECONOMY_TICK_MS) {
      this.economyTimer = 0;
      const now = Date.now();
      const changed = [...this.state.advance(now), ...this.builder.advance(now)];
      if (changed.length) {
        this.persist();
        this.refreshIcons();
        for (const v of this.views) this.refreshNotice(v);
      }
      if (this.checkMissionConditions()) this.afterProgress(false);
    }
    const iconFrame = iconFrameAt(t);
    this.effects = this.effects.filter((e) => {
      const fx = this.manifest.fx[e.key];
      const age = t - e.started;
      if (age >= (fx.frames * 1000) / fx.fps) {
        e.sprite.destroy();
        return false;
      }
      e.sprite.setFrame(`${e.key}/${frameAt({ frames: fx.frames, fps: fx.fps, loop: false }, age)}`);
      return true;
    });
    const notice = this.manifest.fx[FX_BUILD_READY];
    if (notice) {
      const f = `${FX_BUILD_READY}/${frameAt({ frames: notice.frames, fps: notice.fps, loop: true }, t)}`;
      for (const n of this.notices.values()) n.setFrame(f);
    }
    for (const v of this.views) {
      if (v.icon && v.icon.sprite.frame.name !== String(iconFrame)) v.icon.sprite.setFrame(iconFrame);
      if (v.visual.kind !== "loop") continue;
      const f = frameAt(v.visual.clip, t);
      const name = `${v.item.sku}/${f}`;
      if (v.sprite.frame.name !== name) v.sprite.setFrame(name);
    }
  }

  private debugApi() {
    return {
      scene: this,
      itemAt: (sx: number, sy: number) => {
        const hits = this.input.hitTestPointer({ x: sx * this.dpr, y: sy * this.dpr, camera: this.cameras.main } as unknown as Phaser.Input.Pointer);
        return hits.map((h) => (h.getData("view") as ItemView | undefined)?.item.sku);
      },
      state: () => ({
        services: { tool: this.serviceTool, data: this.services },
        visit: this.visitCity,
        visitUpgradesLeft: this.visit?.remaining ?? null,
        upgradable: this.visitCity ? this.state.data.items.filter((i) => isUpgradable(this.state.defs.get(i.sku)!, i.state?.mode)).map((i) => i.sid) : [],
        views: this.views.length,
        missing: this.city.missingDefinitions,
        zoom: this.zoom.current,
        logicSteps: this.logicSteps,
        simulatedMs: this.clock.simulatedMs,
        selected: this.selected?.item.sku ?? null,
        profile: this.state.data.profile,
        modes: this.state.data.items.filter((i) => i.state).map((i) => [i.sid, i.sku, i.state!.mode, i.state!.timeMs]),
        icons: this.views.filter((v) => v.icon).map((v) => [v.item.sid, v.icon!.texture]),
        tool: this.toolbar.tool,
        shopOpen: this.shop.open,
        storage: [...this.state.data.storage],
        placing: this.placement?.sku ?? null,
        construction: this.state.data.items.filter((i) => i.construction).map((i) => [i.sid, i.sku, i.construction!.timeMs]),
        roads: this.state.data.roads.length,
        plane: this.plane ? [Math.round(this.plane.container.x), Math.round(this.plane.container.y)] : null,
        planeFlag: this.plane?.flag ? this.plane.flag.wave.ys.map((y) => Math.round(y * 100) / 100) : null,
        plots: this.builder.plots(),
        areas: [...this.state.data.areas],
        cars: this.traffic?.agents.map((a) => [a.sku, Math.round(a.x), Math.round(a.y), Math.round(a.angle)]) ?? [],
        level: this.level,
        missions: { up: [...this.state.data.missions.up], reached: [...this.state.data.missions.reached], given: [...this.state.data.missions.given] },
        counts: { ...this.state.data.missions.counts },
        terrain: this.state.data.terrain.length,
        items: this.state.data.items.length,
        effects: this.effects.map((e) => e.key),
        camera: { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y, zoom: this.cameras.main.zoom },
        fps: this.game.loop.actualFps,
      }),
      worldToScreen: (wx: number, wy: number) => {
        const cam = this.cameras.main;
        return { x: ((wx - cam.worldView.x) * cam.zoom) / this.dpr, y: ((wy - cam.worldView.y) * cam.zoom) / this.dpr };
      },
      // Test hook: shifts every stored timestamp back, as if `ms` of real time had passed.
      fastForward: (ms: number) => {
        for (const it of this.state.data.items) {
          if (it.state) it.state.savedAt -= ms;
          if (it.construction) it.construction.savedAt -= ms;
        }
        this.economyTimer = ECONOMY_TICK_MS;
      },
      selectTool: (t: Tool) => this.setTool(t),
      why: (rx: number, ry: number, sku?: string) => {
        const t = relativeToTile(rx, ry);
        return { terrain: this.builder.canBuyTerrain(t.x, t.y), road: this.builder.canBuildRoad(t.x, t.y), place: sku ? this.builder.canPlace(sku, t.x, t.y) : null };
      },
      buy: (sku: string) => this.startPlacement(sku),
      tileScreen: (rx: number, ry: number) => {
        const t = relativeToTile(rx, ry);
        const cam = this.cameras.main;
        return { x: ((t.x * TILE + TILE / 2 - cam.worldView.x) * cam.zoom) / this.dpr, y: ((t.y * TILE + TILE / 2 - cam.worldView.y) * cam.zoom) / this.dpr };
      },
      screenOf: (sid: number) => {
        const v = this.views.find((x) => x.item.sid === sid);
        if (!v) return null;
        const cam = this.cameras.main;
        const [ix, iy] = [v.sprite.x + (v.item.def.baseCols * TILE) / 2, v.sprite.y - (v.item.def.baseRows * TILE) / 2];
        return { x: ((ix - cam.worldView.x) * cam.zoom) / this.dpr, y: ((iy - cam.worldView.y) * cam.zoom) / this.dpr };
      },
      views: () => this.views.map((v) => ({ sku: v.item.sku, x: v.sprite.x, y: v.sprite.y, frame: v.sprite.frame.name })),
    };
  }
}
