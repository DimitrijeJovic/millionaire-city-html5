import { CityScene } from "./scenes/CityScene.js";
const dpr = Math.min(window.devicePixelRatio || 1, 3);
const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "game",
    backgroundColor: "#ffffff",
    scale: {
        mode: Phaser.Scale.NONE,
        width: Math.round(window.innerWidth * dpr),
        height: Math.round(window.innerHeight * dpr),
        zoom: 1 / dpr,
    },
    render: { antialias: true, mipmapFilter: "LINEAR_MIPMAP_LINEAR", powerPreference: "high-performance" },
    fps: { smoothStep: true },
    audio: { disableWebAudio: false },
    scene: [],
});
game.registry.set("dpr", dpr);
// Canvas text (the expansion signs, reward labels) is drawn once in create(); a font that is still loading would be
// replaced by the browser's serif default for good, so the original fonts of assets/fonts/fonts.css load first.
const FONT_WAIT_MS = 3000;
const faces = [];
document.fonts.forEach((f) => faces.push(f));
const fontsLoaded = Promise.all(faces.map((f) => f.load().catch(() => null)));
Promise.race([fontsLoaded, new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))])
    .finally(() => game.scene.add("city", CityScene, true));
window.addEventListener("resize", () => {
    game.scale.setGameSize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
});
//# sourceMappingURL=main.js.map