// Fails with a clear message when the locally generated files are missing. Game assets (public/assets/) and city data
// (public/data/) are not part of the repository; they are built locally from the user's own original game files
// (see README, "Preparing the Game Assets" and "Preparing the City Data").
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const groups = [
  {
    files: ["assets/manifest.json", "assets/rules/XPTable.json", "assets/rules/settings.json"],
    how: '  python -I tools/build_assets.py --source "<path to the original Datas directory>" --all-items',
    section: "Preparing the Game Assets",
  },
  {
    files: ["data/city.json", "data/npc_advisor.json", "data/npc_boss.json"],
    how:
      '  python -I tools/convert_save.py "<copy of mcity.sqlite>" public/data/city.json\n' +
      '  python -I tools/convert_universe_xml.py "<Datas>/userData/universeAdvisorCity.xml" public/data/npc_advisor.json\n' +
      '  python -I tools/convert_universe_xml.py "<Datas>/userData/universeAdvisorCity1_AbuDabhi.xml" public/data/npc_boss.json',
    section: "Preparing the City Data",
  },
];

const problems = groups
  .map((g) => ({ ...g, missing: g.files.filter((f) => !existsSync(pub + f)) }))
  .filter((g) => g.missing.length);

if (problems.length) {
  console.error(
    "Locally generated files are missing (they are not included in the repository):\n" +
    problems.map((g) => `- public/${g.missing.join(", public/")}\n${g.how}\n  See README.md, section "${g.section}".`).join("\n"),
  );
  process.exit(1);
}
