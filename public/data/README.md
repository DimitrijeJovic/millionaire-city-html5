# City data (not in the repository)

The JSON files in this folder are converted from the original *Millionaire City* game files and save data, which this project does not distribute. Create them locally from your own copies:

| File | Created with | Used by |
|---|---|---|
| `city.json` | `python -I tools/convert_save.py "<copy of mcity.sqlite>" public/data/city.json` | The player's city (default page), tests |
| `npc_advisor.json` | `python -I tools/convert_universe_xml.py "<Datas>/userData/universeAdvisorCity.xml" public/data/npc_advisor.json` | Visits to the NPC cities, tests |
| `npc_boss.json` | `python -I tools/convert_universe_xml.py "<Datas>/userData/universeAdvisorCity1_AbuDabhi.xml" public/data/npc_boss.json` | Visit to the boss NPC city, tests |
| `city_<name>.json` (optional) | Any converted city saved under that name | `?city=<name>`, for example `?city=test` |

`convert_save.py` reads a **copy** of the server database (`mcity.sqlite`) read-only and refuses a live installation database.

Everything in this folder except this file is excluded by `.gitignore`. Do not commit city data. See the main README and `CLAUDE_ASSET_POLICY.md`.
