import { TILE } from "./geometry.js";

// rules/trafficAgents/*.xml
export interface AgentDef {
  sku: string;
  speed: number;
  spawnCondition: string[];
}

export interface ManagerDef {
  probabilityMin: number;
  probabilityMax: number;
  agentsMin: number;
  agentsMax: number;
  agentsLimit: number;
  askIntervalMs: number;
  minTilesBetween: number;
  expireMs: number;
}

export function parseTraffic(agents: { _children?: Array<Record<string, unknown>> }, manager: Record<string, unknown>) {
  const defs: AgentDef[] = (agents._children ?? []).map((n) => ({
    sku: String(n.sku), speed: Number(n.speed), spawnCondition: String(n.spawnCondition ?? "").split(",").filter(Boolean),
  }));
  const m: ManagerDef = {
    probabilityMin: Number(manager.spawnProbabilityMin), probabilityMax: Number(manager.spawnProbabilityMax),
    agentsMin: Number(manager.spawnAgentsMin), agentsMax: Number(manager.spawnAgentsMax), agentsLimit: Number(manager.spawnAgentsLimit),
    // spawnAskForANewAgentTime is in seconds and agentExpireTime in minutes.
    askIntervalMs: Number(manager.spawnAskForANewAgentTime) * 1000, minTilesBetween: Number(manager.spawnMinTilesBetweenAgents),
    expireMs: Number(manager.agentExpireTime) * 60_000,
  };
  return { defs, manager: m };
}

// TrafficAgent: acceleration modifier 0.0001 px/ms², max speed = speed / 1000 px/ms, fades of
// MOVEMENT_ALPHA_TIME_MS, COLLISION_DISTANCE 60 and STOP_TIMER 4000.
export const ACCELERATION = 0.0001;
export const ALPHA_TIME_MS = 1000;
export const COLLISION_DISTANCE = 60;
export const STOP_TIMER_MS = 4000;
// Right-hand lanes; turns are arcs of radius 16 - LANE (right) and 16 + LANE (left), close to the
// original MOVEMENT_CIRCLE_INNER_RADIUS 12 and MOVEMENT_CIRCLE_OUTER_RADIUS 22.
export const LANE_OFFSET = 5;

// TrafficAgent directions: right, up, left, down.
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, -1], [-1, 0], [0, 1]];
const reverse = (d: number) => (d + 2) % 4;

export interface Agent {
  id: number;
  sku: string;
  maxSpeed: number;
  speed: number;
  tx: number;
  ty: number;
  dir: number;
  exit: number;
  s: number;
  x: number;
  y: number;
  angle: number;
  age: number;
  life: number;
  fading: number;
  blockedMs: number;
  done: boolean;
}

type Point = [number, number];

function lanePoint(cx: number, cy: number, d: number, sign: number): Point {
  const [vx, vy] = DIRS[d];
  return [cx + sign * vx * (TILE / 2) - vy * LANE_OFFSET, cy + sign * vy * (TILE / 2) + vx * LANE_OFFSET];
}

// Path through one tile: entering in direction `dir`, leaving towards `exit`, as a quadratic curve.
function tilePath(a: Agent): [Point, Point, Point] {
  const cx = a.tx * TILE + TILE / 2, cy = a.ty * TILE + TILE / 2;
  const p0 = lanePoint(cx, cy, a.dir, -1);
  const p2 = lanePoint(cx, cy, a.exit, 1);
  let c: Point;
  if (a.exit === a.dir) c = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  else if (a.exit === reverse(a.dir)) c = [cx + DIRS[a.dir][0] * TILE * 0.6, cy + DIRS[a.dir][1] * TILE * 0.6];
  // A turn bends around the intersection of the entry lane and the exit lane.
  else c = DIRS[a.dir][0] !== 0 ? [p2[0], p0[1]] : [p0[0], p2[1]];
  return [p0, c, p2];
}

function bezier([p0, c, p2]: [Point, Point, Point], t: number): Point {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
}

function pathLength(p: [Point, Point, Point]): number {
  let len = 0;
  let prev = p[0];
  for (let i = 1; i <= 12; i++) {
    const q = bezier(p, i / 12);
    len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  return len;
}

export class Traffic {
  readonly agents: Agent[] = [];
  private spawnTimer: number;
  private nextId = 1;

  constructor(
    private readonly defs: AgentDef[],
    private readonly m: ManagerDef,
    private readonly isRoad: (tx: number, ty: number) => boolean,
    private readonly roadTiles: () => Array<[number, number]>,
    private readonly rng: () => number = Math.random,
  ) {
    this.spawnTimer = m.askIntervalMs;
  }

  private exits(tx: number, ty: number, from: number): number[] {
    return [0, 1, 2, 3].filter((d) => d !== reverse(from) && this.isRoad(tx + DIRS[d][0], ty + DIRS[d][1]));
  }

  private chooseExit(a: Agent): number {
    const options = this.exits(a.tx, a.ty, a.dir);
    return options.length ? options[Math.floor(this.rng() * options.length)] : reverse(a.dir);
  }

  // TrafficAgentManager.spawnLogicUpdate.
  private trySpawn(plots: number, buildings: ReadonlySet<string>): void {
    const active = this.agents.filter((a) => !a.done).length;
    const limit = Math.max(Math.min(plots, this.m.agentsLimit), this.m.agentsMin);
    if (active >= limit) return;
    let probability = 100;
    if (active > this.m.agentsMin) {
      const step = (this.m.probabilityMax - this.m.agentsMin) / (this.m.agentsMax - this.m.agentsMin);
      probability = Math.trunc(this.m.probabilityMax - active * step);
    }
    if (Math.trunc(this.rng() * 100) > probability) return;
    const tiles = this.roadTiles();
    if (!tiles.length) return;
    const [tx, ty] = tiles[Math.floor(this.rng() * tiles.length)];
    const minSq = (this.m.minTilesBetween * TILE) ** 2;
    const wx = tx * TILE, wy = ty * TILE;
    if (this.agents.some((a) => (a.x - wx) ** 2 + (a.y - wy) ** 2 < minSq)) return;
    const eligible = this.defs.filter((d) => d.spawnCondition.length === 0 || d.spawnCondition.some((c) => buildings.has(c)));
    if (!eligible.length) return;
    const def = eligible[Math.floor(this.rng() * eligible.length)];
    const dirs = [0, 1, 2, 3].filter((d) => this.isRoad(tx + DIRS[d][0], ty + DIRS[d][1]));
    if (!dirs.length) return;
    const dir = dirs[Math.floor(this.rng() * dirs.length)];
    const a: Agent = {
      id: this.nextId++, sku: def.sku, maxSpeed: def.speed / 1000, speed: 0, tx, ty, dir, exit: dir, s: 0, x: wx, y: wy, angle: 0,
      age: 0, life: this.m.expireMs, fading: 0, blockedMs: 0, done: false,
    };
    a.exit = this.chooseExit(a);
    this.place(a);
    this.agents.push(a);
  }

  private place(a: Agent): void {
    const p = tilePath(a);
    const len = pathLength(p);
    const t = Math.min(1, a.s / len);
    const [x, y] = bezier(p, t);
    const [nx, ny] = bezier(p, Math.min(1, t + 0.02));
    const [bx, by] = t >= 0.98 ? bezier(p, 0.96) : [x, y];
    a.angle = t >= 0.98 ? (Math.atan2(y - by, x - bx) * 180) / Math.PI : (Math.atan2(ny - y, nx - x) * 180) / Math.PI;
    a.x = x;
    a.y = y;
  }

  private blocked(a: Agent): boolean {
    const [vx, vy] = DIRS[a.dir];
    return this.agents.some((o) => {
      if (o === a || o.done) return false;
      const dx = o.x - a.x, dy = o.y - a.y;
      const ahead = dx * vx + dy * vy;
      const side = Math.abs(dx * -vy + dy * vx);
      return ahead > 0 && ahead < COLLISION_DISTANCE && side < LANE_OFFSET * 2;
    });
  }

  // One fixed simulation step.
  step(dt: number, plots: number, buildings: ReadonlySet<string>): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.m.askIntervalMs;
      this.trySpawn(plots, buildings);
    }
    for (const a of this.agents) {
      if (a.done) continue;
      a.age += dt;
      if (a.fading > 0) {
        a.fading -= dt;
        if (a.fading <= 0) a.done = true;
        continue;
      }
      a.life -= dt;
      if (a.life <= 0) {
        a.fading = ALPHA_TIME_MS;
        continue;
      }
      if (this.blocked(a) && a.blockedMs < STOP_TIMER_MS) {
        a.blockedMs += dt;
        a.speed = 0;
        continue;
      }
      a.blockedMs = 0;
      a.speed = Math.min(a.maxSpeed, a.speed + ACCELERATION * dt);
      a.s += a.speed * dt;
      let len = pathLength(tilePath(a));
      while (a.s >= len) {
        a.s -= len;
        a.tx += DIRS[a.exit][0];
        a.ty += DIRS[a.exit][1];
        a.dir = a.exit;
        if (!this.isRoad(a.tx, a.ty)) {
          a.fading = ALPHA_TIME_MS;
          break;
        }
        a.exit = this.chooseExit(a);
        len = pathLength(tilePath(a));
      }
      if (a.fading <= 0) this.place(a);
    }
    for (let i = this.agents.length - 1; i >= 0; i--) if (this.agents[i].done) this.agents.splice(i, 1);
  }

  alpha(a: Agent): number {
    if (a.fading > 0) return a.fading / ALPHA_TIME_MS;
    return Math.min(1, a.age / ALPHA_TIME_MS);
  }
}
