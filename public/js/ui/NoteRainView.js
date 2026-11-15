import { BACKGROUND_NOTES, FOREGROUND_NOTES, NOTE_SYMBOLS, NOTE_TYPES, RAIN_STEP_MS, spawnNote, stepRain } from "../game/noteRain.js";
// Two NoteRain layers: the background behind the reward popup, the foreground in front of it. start() is
// called when a reward popup opens; stop() stops new notes and lets the falling ones leave the screen.
export class NoteRainView {
    constructor(back, front, layouts, ui, rnd = Math.random) {
        this.layouts = layouts;
        this.ui = ui;
        this.rnd = rnd;
        this.raining = false;
        this.frame = 0;
        this.last = 0;
        this.carry = 0;
        this.layers = [
            { host: back, types: NOTE_TYPES.background, count: BACKGROUND_NOTES, notes: [], els: [] },
            { host: front, types: NOTE_TYPES.foreground, count: FOREGROUND_NOTES, notes: [], els: [] },
        ];
    }
    get active() {
        return this.frame !== 0;
    }
    start() {
        this.raining = true;
        for (const l of this.layers) {
            while (l.notes.length < l.count)
                l.notes.push(this.spawn(l));
        }
        if (!this.frame) {
            this.last = performance.now();
            this.carry = 0;
            this.frame = requestAnimationFrame((t) => this.tick(t));
        }
    }
    stop() {
        this.raining = false;
    }
    size(type) {
        const layout = this.layouts[NOTE_SYMBOLS[type]];
        const layer = layout && Object.values(layout.layers)[0];
        return layer ? { w: layer.w, h: layer.h, frame: layer.frame } : null;
    }
    spawn(l) {
        return spawnNote(l.types, (t) => this.size(t)?.h ?? 40, window.innerWidth, window.innerHeight, this.rnd);
    }
    // The original advances once per stage frame (25 fps); the steps follow elapsed time, so the speed does not
    // depend on the display refresh rate. A long pause (hidden tab) advances at most one second.
    tick(now) {
        this.carry += Math.min(1000, now - this.last);
        this.last = now;
        let alive = false;
        const h = window.innerHeight;
        while (this.carry >= RAIN_STEP_MS) {
            this.carry -= RAIN_STEP_MS;
            for (const l of this.layers)
                stepRain(l.notes, this.raining, () => this.spawn(l), h);
        }
        for (const l of this.layers) {
            this.draw(l);
            alive = alive || l.notes.length > 0;
        }
        if (alive)
            this.frame = requestAnimationFrame((t) => this.tick(t));
        else
            this.frame = 0;
    }
    draw(l) {
        while (l.els.length > l.notes.length)
            l.els.pop().remove();
        l.notes.forEach((n, i) => {
            let el = l.els[i];
            const s = this.size(n.type);
            if (!el) {
                el = document.createElement("div");
                el.className = "rain-note";
                l.host.append(el);
                l.els[i] = el;
            }
            if (s && el.dataset.type !== String(n.type)) {
                this.ui.apply(el, s.frame);
                el.dataset.type = String(n.type);
            }
            el.style.transform = `translate(${n.x}px, ${n.y}px) rotateX(${n.flip}deg) rotate(${n.rotation}deg)`;
        });
    }
}
//# sourceMappingURL=NoteRainView.js.map