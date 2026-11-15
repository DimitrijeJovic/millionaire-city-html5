import { migrateSave } from "../game/gameState.js";
// Browser storage: one JSON document per write, so a save is replaced as a whole or not at all. The
// previous document is kept under a second key and used if the current one fails validation. Only a valid
// current document replaces the backup, so a corrupt entry never overwrites the last good copy.
function isValidJsonSave(raw) {
    try {
        return migrateSave(JSON.parse(raw)) !== null;
    }
    catch {
        return false;
    }
}
export class LocalSaveStore {
    constructor(key = "mcity.save.v1", storage = window.localStorage) {
        this.key = key;
        this.storage = storage;
    }
    load() {
        for (const k of [this.key, this.key + ".prev"]) {
            try {
                const raw = this.storage.getItem(k);
                if (!raw)
                    continue;
                const data = migrateSave(JSON.parse(raw));
                if (data)
                    return data;
            }
            catch {
                // Corrupt or unavailable entry: fall through to the backup.
            }
        }
        return null;
    }
    save(data) {
        const current = this.storage.getItem(this.key);
        if (current && isValidJsonSave(current))
            this.storage.setItem(this.key + ".prev", current);
        this.storage.setItem(this.key, JSON.stringify(data));
    }
}
//# sourceMappingURL=SaveStore.js.map