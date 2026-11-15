import { SaveData, migrateSave } from "../game/gameState.js";

export interface SaveStore {
  load(): SaveData | null;
  save(data: SaveData): void;
}

// Browser storage: one JSON document per write, so a save is replaced as a whole or not at all. The
// previous document is kept under a second key and used if the current one fails validation. Only a valid
// current document replaces the backup, so a corrupt entry never overwrites the last good copy.
function isValidJsonSave(raw: string): boolean {
  try {
    return migrateSave(JSON.parse(raw)) !== null;
  } catch {
    return false;
  }
}

export class LocalSaveStore implements SaveStore {
  constructor(private readonly key = "mcity.save.v1", private readonly storage: Storage = window.localStorage) {}

  load(): SaveData | null {
    for (const k of [this.key, this.key + ".prev"]) {
      try {
        const raw = this.storage.getItem(k);
        if (!raw) continue;
        const data = migrateSave(JSON.parse(raw));
        if (data) return data;
      } catch {
        // Corrupt or unavailable entry: fall through to the backup.
      }
    }
    return null;
  }

  save(data: SaveData): void {
    const current = this.storage.getItem(this.key);
    if (current && isValidJsonSave(current)) this.storage.setItem(this.key + ".prev", current);
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}
