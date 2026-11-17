// Fails with a clear message when public/assets/ has not been generated. The game assets are not part of the
// repository; they are built locally from the user's own original game files (see README, "Preparing the Game Assets").
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const assets = fileURLToPath(new URL("../public/assets/", import.meta.url));
const required = ["manifest.json", "rules/XPTable.json", "rules/settings.json"];
const missing = required.filter((f) => !existsSync(assets + f));

if (missing.length) {
  console.error(
    "Game assets not found in public/assets/ (missing: " + missing.join(", ") + ").\n" +
    "They are not included in the repository. Generate them from your own original game files:\n" +
    '  python -I tools/build_assets.py --source "<path to the original Datas directory>" --all-items\n' +
    "See README.md, section \"Preparing the Game Assets\".",
  );
  process.exit(1);
}
