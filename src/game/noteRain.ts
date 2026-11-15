// NoteRain (Dollars.swf): banknotes falling over the screen while a reward popup is open
// (MissionObjectManager.openReward / closeReward, PopupLevel). Purely visual; it never touches the game state.
export const RAIN_FPS = 25;
export const RAIN_STEP_MS = 1000 / RAIN_FPS;
export const BACKGROUND_NOTES = 50;
export const FOREGROUND_NOTES = 10;
// Note clips by layer (createNewPartilce): the background uses Note2 and Note3, the foreground Note and Note1.
// AssetManager_Note is the Dollars.swf symbol "note", Note1..Note3 are note_01..note_03.
export const NOTE_TYPES = { background: [2, 3], foreground: [0, 1] } as const;
export const NOTE_SYMBOLS = ["note", "note_01", "note_02", "note_03"];

export interface Note {
  type: number;
  x: number;
  y: number;
  speed: number;
  // Flash 10 path: the note turns around the screen axis (rotationZ) and flips around its x axis (rotationX).
  rotation: number;
  flip: number;
  height: number;
}

export type Random = () => number;

export function spawnNote(types: readonly number[], heightOf: (type: number) => number, stageW: number, stageH: number, rnd: Random): Note {
  const type = types[Math.min(types.length - 1, Math.floor(rnd() * types.length))];
  const height = heightOf(type);
  return {
    type, height, rotation: rnd() * 360, flip: rnd() * 360,
    x: rnd() * (stageW + 200) - 100,
    y: -(height + 10) - rnd() * (stageH / 2),
    speed: 5 + rnd() * 10,
  };
}

// One 25 fps frame: every note falls by its speed, turns 5 degrees and flips 10; notes below H + H/4 are removed and,
// while it is raining, replaced by new ones. Returns true while any note is left (EVENT_RAIN_END otherwise).
export function stepRain(notes: Note[], raining: boolean, respawn: () => Note, stageH: number): boolean {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    n.y += n.speed;
    n.rotation = (n.rotation + 5) % 360;
    n.flip = (n.flip + 10) % 360;
    if (n.y > stageH + stageH / 4) {
      if (raining) notes[i] = respawn();
      else notes.splice(i, 1);
    }
  }
  return notes.length > 0;
}
