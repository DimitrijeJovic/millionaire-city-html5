import { convertNumberToString } from "../game/textFormat.js";
import { SwfPanel } from "./SwfPanel.js";
// Bottom of the original stage: OptionsPanel and FriendsBar are centred like the tool bar
// (x = (stageWidth - width) / 2, y = stageHeight; OptionsPanel.resize, FriendsBar.resize).
function centreAtBottom(p, width) {
    p.root.style.left = `calc(50% - ${width / 2 - p.minX}px)`;
    p.root.style.top = `calc(100% + ${p.minY}px)`;
}
// OptionsPanel: zoom in / out, full screen, music, sound effects and the options (gear) button that shows or hides
// the others. Music and sound show frame 2 of their button while off (onMusicClick / onSoundClick: changeFrame(2)).
// The quality button switches the Flash stage quality, which has no counterpart in the WebGL renderer, so it is not shown.
export class OptionsPanel {
    constructor(host, layout, ui, state, h) {
        this.state = state;
        this.open = true;
        this.panel = new SwfPanel(layout, ui, new Set(["quality"]));
        const p = this.panel;
        p.makeButton("zoomin", () => h.zoomIn());
        p.makeButton("zoomout", () => h.zoomOut());
        p.makeButton("fullscreen", () => h.fullScreen());
        p.makeButton("music", () => {
            this.state.music = !this.state.music;
            h.setMusic(this.state.music);
            this.refresh();
        });
        p.makeButton("volume", () => {
            this.state.sound = !this.state.sound;
            h.setSound(this.state.sound);
            this.refresh();
        });
        p.makeButton("options", () => {
            this.open = !this.open;
            for (const n of OptionsPanel.ROW)
                p.setVisible(n, this.open);
        });
        p.root.classList.add("options-panel");
        centreAtBottom(p, Math.max(...Object.values(layout.layers).map((l) => l.x + l.w)));
        host.append(p.root);
        this.refresh();
    }
    refresh() {
        this.panel.setSelectedFrame("music", this.state.music ? null : 2);
        this.panel.setSelectedFrame("volume", this.state.sound ? null : 2);
    }
}
OptionsPanel.ROW = ["zoomin", "zoomout", "fullscreen", "music", "volume"];
// FriendsBar: FRIENDS_PER_PAGE = 8 boxes in friends_container, sorted by company value. The rank (1 = highest)
// is shown with position_1..3 ribbons; free places are hud_friend_box_add_friend. Neighbours other than the
// player come from the server (FriendsManager), so offline only the original NPC neighbours are listed.
export const FRIENDS_PER_PAGE = 8;
export function neighborPage(neighbors, page) {
    const ranked = [...neighbors].sort((a, b) => b.companyValue - a.companyValue).map((n, i) => ({ ...n, rank: i + 1 }));
    // Highest rank on the right, empty "Add Neighbors" places on the left (as on the original bar).
    const ordered = ranked.reverse();
    const pages = Math.max(1, Math.ceil(ordered.length / FRIENDS_PER_PAGE));
    const p = Math.min(Math.max(0, page), pages - 1);
    // The last page holds the eight highest ranks; earlier pages hold the rest, with any gap on the left.
    const start = ordered.length - (pages - p) * FRIENDS_PER_PAGE;
    const slice = ordered.slice(Math.max(0, start), start + FRIENDS_PER_PAGE);
    while (slice.length < FRIENDS_PER_PAGE)
        slice.unshift(null);
    return slice;
}
export class FriendsBar {
    constructor(host, layouts, ui, text, neighbors, onUnavailable, onSelect = () => undefined) {
        this.layouts = layouts;
        this.ui = ui;
        this.text = text;
        this.neighbors = neighbors;
        this.onSelect = onSelect;
        this.boxes = [];
        this.page = 0;
        const L = layouts.friends_bar;
        this.bar = new SwfPanel(L, ui, new Set(["loading"]));
        const b = this.bar;
        b.setText("InviteRandom/Invite", text("TID_BUTTON_TEXT_ADDNEIGHBORS", "Add Neighbors"), true);
        b.makeButton("InviteRandom", () => onUnavailable("neighbors"));
        b.makeButton("mArrowLeft01", () => this.turn(-1));
        b.makeButton("mArrowRight01", () => this.turn(1));
        b.makeButton("mArrowLeft03", () => this.turn(-99));
        b.makeButton("mArrowRight03", () => this.turn(99));
        b.root.classList.add("friends-bar");
        centreAtBottom(b, Math.max(...Object.values(L.layers).map((l) => l.x + l.w)));
        host.append(b.root);
        this.onUnavailable = onUnavailable;
        this.render();
    }
    turn(step) {
        this.page += step;
        this.render();
    }
    render() {
        for (const e of this.boxes)
            e.remove();
        this.boxes = [];
        const list = this.neighbors();
        const pages = Math.max(1, Math.ceil(list.length / FRIENDS_PER_PAGE));
        this.page = Math.min(Math.max(0, this.page), pages - 1);
        const slots = neighborPage(list, this.page);
        const at = this.layouts.friends_bar.origins?.friends_container ?? [0, 0];
        const width = (this.layouts.friends_bar.bounds.friends_container?.[2] ?? 619) / FRIENDS_PER_PAGE;
        slots.forEach((n, i) => {
            const layout = !n ? this.layouts.hud_friend_box_add_friend : n.myself ? this.layouts.hud_friend_box_yourself : this.layouts.hud_friend_box;
            const box = new SwfPanel(layout, this.ui, new Set(["position_1", "position_2", "position_3"].filter((x) => !n || x !== `position_${n.rank}`)));
            this.bar.placeChild(box, [at[0] + width * i, at[1]]);
            box.root.classList.add("friend-box");
            if (!n) {
                box.setText("Name", this.text("TID_BUTTON_TEXT_ADDNEIGHBORS", "Add Neighbors"), true);
                box.root.addEventListener("pointerup", () => this.onUnavailable("neighbors"));
            }
            else {
                box.setText("Name", n.name, true);
                box.setText("position", String(n.rank), true);
                box.setText("ExLevel", String(n.level), true);
                box.setText("Dollars", this.text("TID_COIN_SYMBOL", "$") + convertNumberToString(n.companyValue, "millions", 7), true);
                const photo = box.layer("photo");
                if (photo && n.photo) {
                    const img = document.createElement("div");
                    img.className = "friend-photo";
                    img.style.backgroundImage = `url("${n.photo}")`;
                    photo.append(img);
                }
                box.root.addEventListener("pointerup", () => this.onSelect(n));
            }
            this.bar.root.append(box.root);
            this.boxes.push(box.root);
        });
        this.bar.setDisabled("mArrowLeft01", this.page === 0);
        this.bar.setDisabled("mArrowLeft03", this.page === 0);
        this.bar.setDisabled("mArrowRight01", this.page >= pages - 1);
        this.bar.setDisabled("mArrowRight03", this.page >= pages - 1);
    }
}
//# sourceMappingURL=BottomBar.js.map