import { LocalResource, PROFILE_NAME_MAX, ProfileList, parseResourceDelta } from "../game/localProfile.js";
import { formatNumber } from "../game/progression.js";

export interface ProfileHandlers {
  current(): { userName: string; cityName: string; picture: string | null; coins: number; cash: number; exp: number; level: number };
  save(userName: string, cityName: string, picture: string | null): void;
  adjust(resource: LocalResource, delta: number): void;
  // Local shop option (not original availability): expired limited-time items can be bought.
  expiredOffers(): boolean;
  profiles(): ProfileList;
  // Both return an error message, or null after starting the switch (the page reloads).
  switchProfile(id: string): string | null;
  createProfile(name: string): string | null;
  setExpiredOffers(on: boolean): void;
}

// The launcher remembered whether the panel was open under this key.
const VISIBLE_KEY = "mcity.localProfileSettingsVisible";
const PICTURE_MAX_BYTES = 512 * 1024;
const RESOURCES: Array<{ id: LocalResource; label: string; amount: number }> = [
  { id: "money", label: "Money", amount: 100000 },
  { id: "gold", label: "Gold", amount: 100 },
  { id: "xp", label: "XP", amount: 1000 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function readVisible(): boolean {
  try {
    return localStorage.getItem(VISIBLE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeVisible(on: boolean): void {
  try {
    localStorage.setItem(VISIBLE_KEY, on ? "1" : "0");
  } catch {
    // Storage can be unavailable; the panel then simply starts closed next time.
  }
}

// Local Profile Settings: a small round button at the left edge of the screen opens and closes the panel
// (the launcher's <details> panel, moved into the game window). It is a local-only tool of the desktop build.
export class ProfilePanel {
  private panel: HTMLElement;
  private status: HTMLElement;
  private summary: HTMLElement;
  private nameInput: HTMLInputElement;
  private cityInput: HTMLInputElement;
  private preview: HTMLImageElement;
  private picture: string | null = null;

  constructor(host: HTMLElement, private readonly h: ProfileHandlers) {
    const toggle = el("button", { className: "profile-toggle", type: "button", title: "Local Profile Settings", textContent: "Local Profile" });
    toggle.setAttribute("aria-label", "Local Profile Settings");
    toggle.setAttribute("aria-expanded", "false");
    this.preview = el("img", { className: "profile-picture", alt: "" });
    this.nameInput = el("input", { type: "text", maxLength: PROFILE_NAME_MAX, id: "profile-name" });
    this.cityInput = el("input", { type: "text", maxLength: PROFILE_NAME_MAX, id: "profile-city" });
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp", id: "profile-picture" });
    file.addEventListener("change", () => this.loadPicture(file));
    const save = el("button", { type: "button", textContent: "Save Profile" });
    save.addEventListener("click", () => this.saveProfile());
    const clear = el("button", { type: "button", textContent: "Remove Picture" });
    clear.addEventListener("click", () => {
      this.picture = null;
      file.value = "";
      this.showPicture();
    });
    this.summary = el("div", { className: "profile-summary" });
    this.status = el("div", { className: "profile-status" });
    this.status.setAttribute("role", "status");
    const field = (label: string, input: HTMLInputElement) => el("label", { className: "profile-field" }, label, input);
    const groups = RESOURCES.map((r) => {
      const amount = el("input", { type: "number", min: "1", step: "1", value: String(r.amount), className: "profile-amount" });
      amount.setAttribute("aria-label", `${r.label} amount`);
      const add = el("button", { type: "button", textContent: `Add ${r.label}` });
      const remove = el("button", { type: "button", textContent: `Remove ${r.label}` });
      add.addEventListener("click", () => this.adjust(r.id, amount.value, 1));
      remove.addEventListener("click", () => this.adjust(r.id, amount.value, -1));
      return el("div", { className: "profile-resource" }, field(r.label, amount), add, remove);
    });
    this.offers = el("input", { type: "checkbox", id: "profile-expired-offers" });
    this.offers.addEventListener("change", () => {
      this.h.setExpiredOffers(this.offers.checked);
      this.setStatus(this.offers.checked ? "Expired limited-time items can now be bought." : "Expired limited-time items are locked again.", false);
    });
    const offersRow = el("label", { className: "profile-option" }, this.offers,
      "Shop: offer expired limited-time items (local option, not the original availability)");
    this.profileSelect = el("select", { id: "profile-select" });
    this.profileSelect.addEventListener("change", () => {
      const err = this.h.switchProfile(this.profileSelect.value);
      if (err) this.setStatus(err, true);
    });
    const newName = el("input", { type: "text", maxLength: 24, id: "profile-new", placeholder: "New profile name" });
    const create = el("button", { type: "button", textContent: "New Profile" });
    create.addEventListener("click", () => {
      const err = this.h.createProfile(newName.value);
      if (err) this.setStatus(err, true);
    });
    const profilesRow = el("div", { className: "profile-buttons" }, el("label", { className: "profile-field" }, "Local profile", this.profileSelect), newName, create);
    this.panel = el("section", { className: "profile-panel", hidden: true },
      el("h2", { textContent: "Local Profile Settings" }),
      profilesRow,
      el("div", { className: "profile-row" }, this.preview, el("div", {}, field("Player Name", this.nameInput), field("City Name", this.cityInput))),
      field("Profile Picture", file),
      el("div", { className: "profile-buttons" }, save, clear),
      this.summary, ...groups, offersRow, this.status);
    this.panel.setAttribute("aria-label", "Local Profile Settings");
    toggle.addEventListener("click", () => this.setOpen(this.panel.hidden));
    // Keys typed into the panel must not reach the game (ESC closes only the panel).
    this.panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.setOpen(false);
    });
    for (const e of [toggle, this.panel]) for (const t of ["pointerdown", "pointerup", "wheel"]) e.addEventListener(t, (ev) => ev.stopPropagation());
    host.append(toggle, this.panel);
    this.toggle = toggle;
    this.setOpen(readVisible());
  }

  private toggle: HTMLButtonElement;
  private offers: HTMLInputElement;
  private profileSelect: HTMLSelectElement;

  get open(): boolean {
    return !this.panel.hidden;
  }

  setOpen(on: boolean): void {
    this.panel.hidden = !on;
    this.toggle.setAttribute("aria-expanded", String(on));
    this.toggle.classList.toggle("active", on);
    writeVisible(on);
    if (on) this.refresh(true);
  }

  // Called after any change of the totals so the summary stays current.
  refresh(withInputs = false): void {
    if (this.panel.hidden) return;
    const c = this.h.current();
    if (withInputs) {
      this.offers.checked = this.h.expiredOffers();
      const list = this.h.profiles();
      this.profileSelect.replaceChildren(...["", ...list.ids].map((id) => el("option", { value: id, textContent: id || "Default", selected: id === list.active })));
      this.nameInput.value = c.userName;
      this.cityInput.value = c.cityName;
      this.picture = c.picture;
      this.showPicture();
    }
    this.summary.textContent = `Money $${formatNumber(c.coins)} · Gold ${formatNumber(c.cash)} · XP ${formatNumber(c.exp)} (level ${c.level})`;
  }

  private showPicture(): void {
    if (this.picture) this.preview.src = this.picture;
    else this.preview.removeAttribute("src");
    this.preview.classList.toggle("empty", !this.picture);
  }

  private setStatus(text: string, error: boolean): void {
    this.status.textContent = text;
    this.status.classList.toggle("error", error);
  }

  private loadPicture(input: HTMLInputElement): void {
    const f = input.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type) || f.size > PICTURE_MAX_BYTES) {
      this.setStatus("Choose a PNG, JPEG, GIF or WebP picture of at most 512 KB.", true);
      input.value = "";
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      this.picture = String(r.result);
      this.showPicture();
      this.setStatus("Picture ready. Press Save Profile.", false);
    };
    r.readAsDataURL(f);
  }

  private saveProfile(): void {
    this.h.save(this.nameInput.value, this.cityInput.value, this.picture);
    this.refresh(true);
    this.setStatus("Profile saved.", false);
  }

  private adjust(resource: LocalResource, value: string, sign: 1 | -1): void {
    const n = parseResourceDelta(value);
    if (n === null || n < 0) {
      this.setStatus("Enter a positive whole number.", true);
      return;
    }
    this.h.adjust(resource, n * sign);
    this.refresh();
    this.setStatus("Saved. Game totals updated.", false);
  }
}
