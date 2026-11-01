import type { AudioFrame } from '../audio/types';
import { DISPLAY_FONT, clamp01 } from '../scenes/palette';
import { drawTurtleHead } from '../scenes/shapes';

/**
 * Comedic fight interludes and the sensei bow.
 *
 * Every fighter, the rat sensei, the dojo and the gore are drawn here from
 * plain shapes. No external artwork. Ninjas are hooded silhouettes with an
 * eye slit (no emblem). The sensei is a cartoon rat: round ears, a short
 * snout, long whiskers, a staff and a dark red kimono over a brown hakama.
 * On-screen words are SPLAT, THWACK, POW, WHAM, BONK and SENSEI only.
 */

type Kind = 'turtle' | 'ninja' | 'skeleton';
type Act = 'idle' | 'strike' | 'hit' | 'tumble' | 'bow';
type Mode = 'off' | 'fight' | 'splinter';

interface Actor {
  kind: Kind;
  mask: string;
  x: number;
  y: number;
  facing: number;
  state: Act;
  stateT: number;
  phase: number;
  slow: boolean;
  vx: number;
  vy: number;
  spin: number;
  spinV: number;
  scale: number;
  homeX: number;
  slotX: number;
  slotY: number;
}

interface Drop {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  r: number;
  color: string;
  trail: number;
}

interface LimbBit {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  len: number;
  thick: number;
}

interface Comic {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
  rot: number;
}

const MASKS = ['#2f7cff', '#9b4dff', '#ff3b3b', '#ff8c1a'];
const BLOOD = '#d0121c';
const BLOOD_HOT = '#ff3a3a';
const OOZE = '#2fbf45';
const OOZE_HOT = '#c6ff5a';
const RED_WORDS = ['THWACK', 'POW', 'WHAM'];
const GREEN_WORDS = ['SPLAT', 'SPLAT', 'THWACK'];
const FIGHT_LEN = 10;
const SPLINTER_LEN = 10;
const MIN_GAP = 18;
const SPLINTER_EVERY = 150;

const GRAVITY = 1700;

export class Brawl {
  mode: Mode = 'off';
  fightsEnabled = true;
  fightEvery = 60;

  private actors: Actor[] = [];
  private drops: Drop[] = [];
  private limbs: LimbBit[] = [];
  private comics: Comic[] = [];
  private splat: HTMLCanvasElement = document.createElement('canvas');
  private sctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private ground = 0;
  private modeT = 0;
  private fightTimer = 60;
  private splinterTimer = SPLINTER_EVERY;
  private sinceFight = 999;
  private energyHold = 0;
  private turtlesStrike = true;
  private bonked = false;
  private staffSwing = 0;
  private gong = 0;
  private fadeAcc = 0;

  constructor() {
    this.drops = Array.from({ length: 48 }, () => ({
      active: false, x: 0, y: 0, vy: 0, r: 4, color: BLOOD, trail: 0,
    }));
    this.limbs = Array.from({ length: 10 }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, color: OOZE, life: 0, len: 40, thick: 10,
    }));
    this.comics = Array.from({ length: 6 }, () => ({
      active: false, x: 0, y: 0, vy: 0, life: 0, text: '', color: '#fff', rot: 0,
    }));
    for (let i = 0; i < 4; i++) this.actors.push(this.make('turtle', MASKS[i], false, i));
    for (let i = 0; i < 6; i++) {
      const kind: Kind = i % 3 === 2 ? 'skeleton' : 'ninja';
      this.actors.push(this.make(kind, '#888888', i === 4, i + 4));
    }
  }

  resize(w: number, h: number): void {
    const sx = this.w > 1 ? w / this.w : 1;
    const sy = this.h > 1 ? h / this.h : 1;
    this.w = w;
    this.h = h;
    this.ground = h * 0.82;
    if (sx !== 1 || sy !== 1) {
      for (const a of this.actors) {
        a.x *= sx;
        a.y *= sy;
        a.slotX *= sx;
        a.slotY *= sy;
        a.homeX *= sx;
      }
    }
    const next = document.createElement('canvas');
    next.width = Math.max(2, Math.floor(w));
    next.height = Math.max(2, Math.floor(h));
    const ctx = next.getContext('2d');
    if (!ctx) return;
    if (this.splat.width > 2) ctx.drawImage(this.splat, 0, 0, next.width, next.height);
    this.splat = next;
    this.sctx = ctx;
  }

  setFightEvery(seconds: number): void {
    this.fightEvery = Math.max(45, Math.min(90, seconds));
    if (this.fightTimer > this.fightEvery) this.fightTimer = this.fightEvery;
  }

  toggleFights(): boolean {
    this.fightsEnabled = !this.fightsEnabled;
    return this.fightsEnabled;
  }

  triggerFight(): void {
    if (this.mode === 'splinter') return;
    this.startFight();
  }

  triggerSplinter(): void {
    this.startSplinter();
  }

  update(audio: AudioFrame, w: number, h: number): void {
    const dt = audio.dt;
    if (w !== this.w || h !== this.h) this.resize(w, h);
    this.fightTimer -= dt;
    this.splinterTimer -= dt;
    this.sinceFight += dt;
    if (audio.level > 0.72 && audio.bass > 0.4) this.energyHold += dt;
    else this.energyHold = Math.max(0, this.energyHold - dt * 0.5);

    if (this.mode === 'off') {
      if (this.fightsEnabled && this.sinceFight > MIN_GAP && (this.fightTimer <= 0 || this.energyHold > 5.5)) {
        this.startFight();
      } else if (this.splinterTimer <= 0) {
        this.startSplinter();
      }
    } else if (this.mode === 'fight') {
      this.modeT += dt;
      this.simFight(audio, dt);
      if (this.modeT >= FIGHT_LEN) this.endShow();
    } else {
      this.modeT += dt;
      this.simSplinter(audio, dt);
      if (this.modeT >= SPLINTER_LEN) this.endShow();
    }
    this.simGore(dt);
    this.fadeSplat(dt);
  }

  /** True once the interlude has faded in and fully covers the scene. */
  get opaque(): boolean {
    if (this.mode === 'off') return false;
    const len = this.mode === 'fight' ? FIGHT_LEN : SPLINTER_LEN;
    return this.modeT >= 0.28 && this.modeT <= len - 0.55;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, audio: AudioFrame, t: number): void {
    if (this.mode === 'off') return;
    const len = this.mode === 'fight' ? FIGHT_LEN : SPLINTER_LEN;
    const fadeIn = clamp01(this.modeT / 0.28);
    const fadeOut = clamp01((len - this.modeT) / 0.55);
    const fade = Math.min(fadeIn, fadeOut);
    ctx.save();
    ctx.globalAlpha = fade;
    if (this.mode === 'fight') this.drawFight(ctx, w, h, audio, t);
    else this.drawDojoShow(ctx, w, h, audio, t);
    ctx.restore();
  }

  private startFight(): void {
    this.mode = 'fight';
    this.modeT = 0;
    this.energyHold = 0;
    this.fightTimer = this.fightEvery;
    this.sinceFight = 0;
    this.layoutFight();
  }

  private startSplinter(): void {
    const fromFight = this.mode === 'fight';
    this.mode = 'splinter';
    this.modeT = 0;
    this.bonked = false;
    this.staffSwing = 0;
    this.gong = 1;
    this.splinterTimer = SPLINTER_EVERY;
    this.sctx?.clearRect(0, 0, this.splat.width, this.splat.height);
    for (const d of this.drops) d.active = false;
    for (const limb of this.limbs) limb.active = false;
    for (const comic of this.comics) comic.active = false;
    this.layoutBow(fromFight);
  }

  private endShow(): void {
    this.mode = 'off';
    this.modeT = 0;
    for (const a of this.actors) {
      if (a.state === 'tumble' || a.state === 'bow') a.state = 'idle';
      a.spin = 0;
      a.vx = 0;
      a.vy = 0;
    }
  }

  private make(kind: Kind, mask: string, slow: boolean, i: number): Actor {
    return {
      kind,
      mask,
      x: 0,
      y: 0,
      facing: 1,
      state: 'idle',
      stateT: 0,
      phase: i * 1.3,
      slow,
      vx: 0,
      vy: 0,
      spin: 0,
      spinV: 0,
      scale: 100,
      homeX: 0,
      slotX: 0,
      slotY: 0,
    };
  }

  private layoutFight(): void {
    const w = this.w;
    const h = this.h;
    const ground = h * 0.84;
    const scale = h * 0.26;
    this.ground = ground;
    this.actors.forEach((a, i) => {
      const turtle = a.kind === 'turtle';
      const slot = turtle ? i : i - 4;
      a.scale = scale * (a.slow ? 0.92 : 1);
      a.x = turtle ? w * (0.22 + slot * 0.07) : w * (0.5 + slot * 0.07);
      a.y = ground;
      a.homeX = a.x;
      a.vx = a.vy = a.spin = a.spinV = 0;
      a.state = 'idle';
      a.stateT = 0;
      a.facing = turtle ? 1 : -1;
    });
    this.landHit();
    this.landHit();
    this.landHit();
  }

  private layoutBow(preserve: boolean): void {
    const w = this.w;
    const h = this.h;
    const scale = h * 0.2;
    const front = h * 0.9;
    const back = h * 0.78;
    this.ground = front;
    const turtles = this.actors.filter((a) => a.kind === 'turtle');
    const foes = this.actors.filter((a) => a.kind !== 'turtle');
    const tx = [0.1, 0.22, 0.34, 0.46];
    turtles.forEach((a, i) => this.place(a, w * tx[i], front, scale, 1, preserve));
    const slow = foes.find((a) => a.slow);
    const rest = foes.filter((a) => !a.slow);
    if (slow) this.place(slow, w * 0.64, front, scale, -1, preserve);
    rest.forEach((a, i) => {
      if (i < 2) this.place(a, w * (0.76 + i * 0.11), front, scale, -1, preserve);
      else this.place(a, w * (0.58 + (i - 2) * 0.13), back, scale * 0.72, -1, preserve);
    });
  }

  private place(a: Actor, x: number, y: number, scale: number, facing: number, preserve: boolean): void {
    a.slotX = x;
    a.slotY = y;
    a.scale = scale;
    a.facing = facing;
    a.state = 'bow';
    a.stateT = 0;
    a.spin = 0;
    a.spinV = 0;
    a.vx = 0;
    a.vy = 0;
    if (!preserve) {
      a.x = x;
      a.y = y;
    }
  }

  private simFight(audio: AudioFrame, dt: number): void {
    const w = this.w;
    for (const a of this.actors) {
      a.stateT += dt;
      if (a.state === 'tumble') {
        this.tumble(a, dt, this.ground);
        continue;
      }
      if (a.state === 'strike' && a.stateT > 0.34) a.state = 'idle';
      if (a.state === 'hit' && a.stateT > 0.26) {
        a.state = 'idle';
        a.vx = 0;
      }
      if (a.state === 'hit') {
        a.x += a.vx * dt;
        a.vx *= Math.exp(-dt * 6);
      } else if (a.state === 'idle') {
        const foe = this.nearestFoe(a);
        if (foe) {
          const dir = Math.sign(foe.x - a.x) || a.facing;
          a.facing = dir;
          const dist = Math.abs(foe.x - a.x);
          const reach = a.scale * 1.15;
          if (dist > reach) a.x += dir * (a.slow ? 70 : 220) * dt;
          else if (a.state === 'idle') a.x += dir * 40 * dt;
        }
        a.y = this.ground + Math.sin(audio.time * 6 + a.phase) * 3;
      }
      a.x = Math.max(a.scale * 0.4, Math.min(w - a.scale * 0.4, a.x));
    }
    this.separate();
    if (audio.beat && this.modeT > 0.35) this.landHit();
  }

  private simSplinter(audio: AudioFrame, dt: number): void {
    this.gong = Math.max(0, this.gong - dt * 2.4);
    this.staffSwing = Math.max(0, this.staffSwing - dt * 1.6);
    for (const a of this.actors) {
      a.stateT += dt;
      if (a.state === 'tumble') {
        this.tumble(a, dt, this.ground);
        continue;
      }
      a.state = 'bow';
      a.x += (a.slotX - a.x) * Math.min(1, dt * 5);
      a.y += (a.slotY - a.y) * Math.min(1, dt * 5);
    }
    const timeToBonk = this.modeT > 3.1 && (audio.beat || this.modeT > 5);
    if (!this.bonked && timeToBonk) {
      const slow = this.actors.find((a) => a.slow);
      if (slow) {
        this.bonked = true;
        this.staffSwing = 1;
        slow.state = 'tumble';
        slow.stateT = 0;
        slow.vy = -380;
        slow.vx = 280;
        slow.spinV = 5;
        slow.facing = 1;
        this.stamp(slow.x, slow.y - slow.scale * 0.55, slow.scale * 0.18, BLOOD, true);
        this.spawnComic(slow.x, slow.y - slow.scale, 'BONK', '#f0d8a8');
      }
    }
  }

  private tumble(a: Actor, dt: number, ground: number): void {
    a.vy += GRAVITY * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.spin += a.spinV * dt;
    a.vx *= Math.exp(-dt * 0.6);
    if (a.y > ground) {
      a.y = ground;
      a.vy = -a.vy * 0.32;
      a.spinV *= -0.45;
      if (a.stateT > 1.7 && Math.abs(a.vy) < 90) {
        a.state = this.mode === 'splinter' ? 'bow' : 'idle';
        a.spin = 0;
        a.spinV = 0;
        a.vy = 0;
        a.vx = 0;
        a.stateT = 0;
      }
    }
    a.x = Math.max(40, Math.min(this.w - 40, a.x));
  }

  private separate(): void {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.state === 'tumble' || b.state === 'tumble') continue;
        const min = (a.scale + b.scale) * 0.2;
        const dx = b.x - a.x;
        if (Math.abs(dx) >= min) continue;
        const push = (min - Math.abs(dx)) * 0.5;
        const dir = dx === 0 ? 1 : Math.sign(dx);
        a.x -= dir * push;
        b.x += dir * push;
      }
    }
  }

  private nearestFoe(a: Actor): Actor | null {
    let best: Actor | null = null;
    let dist = Infinity;
    for (const o of this.actors) {
      if (o === a) continue;
      const same = (o.kind === 'turtle') === (a.kind === 'turtle');
      if (same || o.state === 'tumble') continue;
      const d = Math.abs(o.x - a.x);
      if (d < dist) {
        dist = d;
        best = o;
      }
    }
    return best;
  }

  private landHit(): void {
    const turtles = this.actors.filter((a) => a.kind === 'turtle' && a.state !== 'tumble');
    const foes = this.actors.filter((a) => a.kind !== 'turtle' && a.state !== 'tumble');
    if (!turtles.length || !foes.length) return;
    const attackTurtles = this.turtlesStrike;
    this.turtlesStrike = !this.turtlesStrike;
    const attackers = attackTurtles ? turtles : foes;
    const targets = attackTurtles ? foes : turtles;
    const atk = attackers[Math.floor(Math.random() * attackers.length)];
    let tgt = targets[Math.floor(Math.random() * targets.length)];
    if (Math.random() < 0.65) {
      let best = Infinity;
      for (const f of targets) {
        const d = Math.abs(f.x - atk.x);
        if (d < best) {
          best = d;
          tgt = f;
        }
      }
    }
    atk.state = 'strike';
    atk.stateT = 0;
    atk.facing = tgt.x >= atk.x ? 1 : -1;
    const tumble = Math.random() < 0.55;
    tgt.state = tumble ? 'tumble' : 'hit';
    tgt.stateT = 0;
    tgt.facing = atk.x >= tgt.x ? 1 : -1;
    if (tumble) {
      tgt.vy = -460 - Math.random() * 160;
      tgt.vx = atk.facing * (240 + Math.random() * 180);
      tgt.spinV = atk.facing * (4 + Math.random() * 4);
      if (Math.random() < 0.65) this.spawnLimb(tgt);
    } else {
      tgt.vx = atk.facing * 160;
    }
    const turtleHit = tgt.kind === 'turtle';
    const color = turtleHit ? OOZE : BLOOD;
    const hot = turtleHit ? OOZE_HOT : BLOOD_HOT;
    this.stamp(tgt.x, tgt.y - tgt.scale * 0.5, tgt.scale * (0.16 + Math.random() * 0.1), color, true);
    const words = turtleHit ? GREEN_WORDS : RED_WORDS;
    this.spawnComic(tgt.x, tgt.y - tgt.scale * 0.95, words[Math.floor(Math.random() * words.length)], hot);
  }

  private stamp(x: number, y: number, r: number, color: string, drip: boolean): void {
    const c = this.sctx;
    if (!c) return;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.58, Math.random() * 0.8 - 0.4, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = r * (0.55 + Math.random() * 0.9);
      c.beginPath();
      c.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.55, r * (0.12 + Math.random() * 0.22), 0, Math.PI * 2);
      c.fill();
    }
    if (drip) {
      this.spawnDrop(x, y, r * 0.28, color);
      this.spawnDrop(x + r * 0.25, y + 4, r * 0.18, color);
    }
  }

  private spawnDrop(x: number, y: number, r: number, color: string): void {
    const d = this.drops.find((p) => !p.active) ?? this.drops[0];
    d.active = true;
    d.x = x;
    d.y = y;
    d.vy = 90 + Math.random() * 160;
    d.r = Math.max(3, r);
    d.color = color;
    d.trail = 0;
  }

  private spawnLimb(a: Actor): void {
    const limb = this.limbs.find((p) => !p.active) ?? this.limbs[0];
    limb.active = true;
    limb.x = a.x;
    limb.y = a.y - a.scale * 0.45;
    limb.vx = (Math.random() - 0.4) * 420;
    limb.vy = -320 - Math.random() * 220;
    limb.rot = Math.random() * 6;
    limb.vr = (Math.random() - 0.5) * 10;
    limb.color = a.kind === 'turtle' ? '#2f9a3c' : a.kind === 'skeleton' ? '#efe6d4' : '#3a3344';
    limb.len = a.scale * 0.36;
    limb.thick = Math.max(8, a.scale * 0.1);
    limb.life = 1.6;
  }

  private spawnComic(x: number, y: number, text: string, color: string): void {
    const c = this.comics.find((p) => !p.active) ?? this.comics[0];
    c.active = true;
    c.x = x + (Math.random() - 0.5) * 30;
    c.y = y;
    c.vy = -40;
    c.life = 1;
    c.text = text;
    c.color = color;
    c.rot = (Math.random() - 0.5) * 0.4;
  }

  private simGore(dt: number): void {
    const c = this.sctx;
    for (const d of this.drops) {
      if (!d.active) continue;
      const prev = d.y;
      d.y += d.vy * dt;
      d.vy += 420 * dt;
      d.trail += d.y - prev;
      if (c && d.trail > 8) {
        c.fillStyle = d.color;
        c.beginPath();
        c.ellipse(d.x, d.y, d.r * 0.7, d.r * 1.1, 0, 0, Math.PI * 2);
        c.fill();
        d.trail = 0;
      }
      if (d.y > this.h + 10 || d.vy > 900) d.active = false;
    }
    for (const limb of this.limbs) {
      if (!limb.active) continue;
      limb.vy += GRAVITY * dt;
      limb.x += limb.vx * dt;
      limb.y += limb.vy * dt;
      limb.rot += limb.vr * dt;
      limb.life -= dt;
      if (limb.y > this.ground && limb.vy > 0) {
        limb.y = this.ground;
        limb.vy *= -0.35;
        limb.vr *= 0.5;
      }
      if (limb.life <= 0) limb.active = false;
    }
    for (const comic of this.comics) {
      if (!comic.active) continue;
      comic.y += comic.vy * dt;
      comic.life -= dt * 1.35;
      if (comic.life <= 0) comic.active = false;
    }
  }

  private fadeSplat(dt: number): void {
    this.fadeAcc += dt;
    if (this.fadeAcc < 0.45 || !this.sctx) return;
    this.fadeAcc = 0;
    const c = this.sctx;
    c.save();
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = this.mode === 'fight' ? 'rgba(0,0,0,0.97)' : 'rgba(0,0,0,0.9)';
    c.fillRect(0, 0, this.splat.width, this.splat.height);
    c.restore();
  }

  private drawFight(ctx: CanvasRenderingContext2D, w: number, h: number, audio: AudioFrame, t: number): void {
    ctx.fillStyle = 'rgba(6,2,4,0.92)';
    ctx.fillRect(0, 0, w, h);
    const ground = this.ground;
    ctx.fillStyle = '#1a0c10';
    ctx.fillRect(0, ground, w, h - ground);
    ctx.fillStyle = `rgba(180,16,24,${0.35 + audio.bass * 0.5})`;
    ctx.fillRect(0, ground - 3, w, 6 + audio.pulse * 8);
    ctx.drawImage(this.splat, 0, 0, w, h);
    const order = [...this.actors].sort((a, b) => a.y - b.y);
    for (const a of order) this.drawActor(ctx, a, t);
    this.drawLimbs(ctx);
    this.drawDrops(ctx);
    this.drawComics(ctx, h);
    if (audio.pulse > 0.55) {
      ctx.fillStyle = `rgba(0,0,0,${(audio.pulse - 0.55) * 0.45})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawDojoShow(ctx: CanvasRenderingContext2D, w: number, h: number, audio: AudioFrame, t: number): void {
    this.paintDojo(ctx, w, h, audio, t);
    const back = this.actors.filter((a) => a.slotY < h * 0.84);
    const front = this.actors.filter((a) => a.slotY >= h * 0.84);
    for (const a of back) this.drawActor(ctx, a, t);
    this.drawSensei(ctx, w * 0.54, h * 0.76, h * 0.27, t);
    for (const a of front) this.drawActor(ctx, a, t);
    ctx.drawImage(this.splat, 0, 0, w, h);
    this.drawLimbs(ctx);
    this.drawDrops(ctx);
    this.drawComics(ctx, h);
    if (this.gong > 0.02) {
      ctx.fillStyle = `rgba(255,236,200,${this.gong * 0.55})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawSenseiTitle(ctx, w, h);
  }

  private paintDojo(ctx: CanvasRenderingContext2D, w: number, h: number, audio: AudioFrame, t: number): void {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#140c0a');
    bg.addColorStop(0.55, '#1c100e');
    bg.addColorStop(1, '#0c0706');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    this.drawTorii(ctx, w * 0.5, h * 0.5, h * 0.42, 0.45);
    const fogY = h * 0.46 + Math.sin(t * 0.2) * 6;
    const fog = ctx.createLinearGradient(0, fogY - h * 0.08, 0, fogY + h * 0.1);
    fog.addColorStop(0, 'rgba(80,70,64,0)');
    fog.addColorStop(0.5, 'rgba(90,78,70,0.28)');
    fog.addColorStop(1, 'rgba(40,32,28,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, fogY - h * 0.08, w, h * 0.2);

    this.drawShoji(ctx, w * 0.04, h * 0.16, w * 0.2, h * 0.5);
    this.drawShoji(ctx, w * 0.76, h * 0.16, w * 0.2, h * 0.5);

    const lanterns = [0.16, 0.5, 0.84];
    for (const lx of lanterns) {
      const glow = 0.45 + audio.bass * 0.9 + audio.pulse * 0.35;
      this.drawLantern(ctx, w * lx, h * 0.2, h * 0.075, glow);
    }

    // Wood floor, wider at the camera.
    ctx.fillStyle = '#3a2418';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(w * 0.86, h * 0.62);
    ctx.lineTo(w * 0.14, h * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1a0e0a';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,10,6,0.65)';
    ctx.lineWidth = 3;
    for (let i = 1; i <= 6; i++) {
      const y = h * 0.62 + (h * 0.38 * i) / 6;
      const inset = (1 - i / 6) * w * 0.14;
      ctx.beginPath();
      ctx.moveTo(inset, y);
      ctx.lineTo(w - inset, y);
      ctx.stroke();
    }

    // Gong on the left screen wall. The opening flash is drawn by the caller.
    const gx = w * 0.12;
    const gy = h * 0.4;
    const gr = h * 0.055;
    ctx.fillStyle = '#8a6a32';
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3a2a12';
    ctx.stroke();
    ctx.fillStyle = '#c4a35a';
    ctx.beginPath();
    ctx.arc(gx, gy, gr * 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (this.gong > 0.05) {
      ctx.strokeStyle = `rgba(255,230,180,${this.gong})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(gx, gy, gr * (1.2 + (1 - this.gong) * 1.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawShoji(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#e6d3b0';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3a2414';
    ctx.lineWidth = Math.max(4, w * 0.02);
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = Math.max(2, w * 0.012);
    const cols = 3;
    const rows = 4;
    for (let c = 1; c < cols; c++) {
      const px = x + (w / cols) * c;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + h);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const py = y + (h / rows) * r;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + w, py);
      ctx.stroke();
    }
  }

  private drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, glow: number): void {
    const r = s * (1.3 + glow);
    ctx.fillStyle = `rgba(255,160,50,${0.16 + glow * 0.14})`;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.6, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#f0c36a';
    roundRect(ctx, x - s * 0.55, y, s * 1.1, s * 1.35, s * 0.2);
    ctx.fill();
    ctx.lineWidth = Math.max(3, s * 0.08);
    ctx.strokeStyle = '#4a2c12';
    ctx.stroke();
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(x - s * 0.6, y - s * 0.12, s * 1.2, s * 0.18);
    ctx.fillRect(x - s * 0.6, y + s * 1.25, s * 1.2, s * 0.16);
  }

  private drawTorii(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#7a2430';
    ctx.fillStyle = '#7a2430';
    ctx.lineWidth = Math.max(8, s * 0.07);
    ctx.lineCap = 'butt';
    const half = s * 0.46;
    ctx.beginPath();
    ctx.moveTo(x - half, y - s * 0.55);
    ctx.lineTo(x - half * 0.82, y + s * 0.45);
    ctx.moveTo(x + half, y - s * 0.55);
    ctx.lineTo(x + half * 0.82, y + s * 0.45);
    ctx.stroke();
    // Kasagi (top lintel) and the straight nuki tie. Geometric, not lettering.
    ctx.lineWidth = Math.max(10, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(x - half * 1.2, y - s * 0.62);
    ctx.quadraticCurveTo(x, y - s * 0.74, x + half * 1.2, y - s * 0.62);
    ctx.stroke();
    ctx.lineWidth = Math.max(7, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - half * 1.05, y - s * 0.42);
    ctx.lineTo(x + half * 1.05, y - s * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  private drawSensei(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
    ctx.save();
    ctx.translate(x, y);
    const lw = Math.max(3, s * 0.03);

    // Tail, so the silhouette reads as a rat even at a distance.
    ctx.strokeStyle = '#6a635c';
    ctx.lineWidth = Math.max(4, s * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.02, -s * 0.22);
    ctx.quadraticCurveTo(-s * 0.35, -s * 0.05, -s * 0.5, -s * 0.28 + Math.sin(t * 1.4) * s * 0.04);
    ctx.stroke();

    // Brown hakama.
    ctx.fillStyle = '#3d2918';
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.46);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(s * 0.3, 0);
    ctx.lineTo(s * 0.16, -s * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#140c08';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.46);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Dark red kimono.
    ctx.fillStyle = '#6e1e28';
    ctx.beginPath();
    ctx.moveTo(-s * 0.22, -s * 0.78);
    ctx.lineTo(-s * 0.24, -s * 0.4);
    ctx.lineTo(s * 0.24, -s * 0.4);
    ctx.lineTo(s * 0.2, -s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c4a35a';
    ctx.fillRect(-s * 0.22, -s * 0.5, s * 0.44, Math.max(4, s * 0.055));

    // Arms, one hand on the staff.
    limb(ctx, -s * 0.16, -s * 0.7, -s * 0.28, -s * 0.48, Math.max(6, s * 0.07), '#8f877e');
    limb(ctx, s * 0.16, -s * 0.7, s * 0.22, -s * 0.5, Math.max(6, s * 0.07), '#8f877e');

    // Head, a little forward of the shoulders. Round ears, short snout, calm round eyes.
    ctx.save();
    ctx.translate(s * 0.04, 0);
    ctx.fillStyle = '#9a9086';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.96, s * 0.17, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#2a241e';
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#8a8076';
      ctx.beginPath();
      ctx.ellipse(side * s * 0.12, -s * 1.1, s * 0.065, s * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c9a3a3';
      ctx.beginPath();
      ctx.ellipse(side * s * 0.12, -s * 1.1, s * 0.032, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e4dcd2';
    ctx.beginPath();
    ctx.ellipse(s * 0.05, -s * 0.9, s * 0.09, s * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a241e';
    ctx.stroke();
    ctx.fillStyle = '#4e4640';
    ctx.beginPath();
    ctx.ellipse(s * 0.12, -s * 0.91, s * 0.018, s * 0.014, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      const ex = side * s * 0.055;
      const ey = -s * 0.98;
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(3, s * 0.03), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffcc66';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(2, s * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#5c534c';
    ctx.lineWidth = Math.max(2, s * 0.015);
    ctx.beginPath();
    ctx.arc(s * 0.02, -s * 0.86, s * 0.04, 0.25, Math.PI - 0.25);
    ctx.stroke();
    // Long whiskers, three a side.
    ctx.strokeStyle = '#f7f1e8';
    ctx.lineWidth = Math.max(2, s * 0.012);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(s * 0.1, -s * 0.9 + i * s * 0.02);
        ctx.quadraticCurveTo(
          side * s * 0.25,
          -s * 0.94 + i * s * 0.045,
          side * s * 0.48,
          -s * 0.86 + (i - 1) * s * 0.05,
        );
        ctx.stroke();
      }
    }
    ctx.restore();

    // Walking staff. Swings down toward the student's side on the bonk.
    ctx.save();
    ctx.translate(s * 0.34, -s * 0.5);
    ctx.rotate(0.35 + this.staffSwing * 1.55);
    ctx.strokeStyle = '#2c1c10';
    ctx.lineWidth = Math.max(5, s * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.2);
    ctx.lineTo(0, -s * 0.95);
    ctx.stroke();
    ctx.fillStyle = '#5a3c22';
    ctx.beginPath();
    ctx.arc(0, -s * 0.95, Math.max(4, s * 0.045), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawSenseiTitle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const intro = clamp01(1 - Math.max(0, this.modeT - 3.2) / 0.4);
    const size = Math.round(h * (0.09 + intro * 0.05));
    ctx.save();
    ctx.font = `${size}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(8, size * 0.1);
    ctx.strokeStyle = '#140c08';
    ctx.strokeText('SENSEI', w / 2, h * 0.03);
    ctx.fillStyle = '#f0d8a8';
    ctx.fillText('SENSEI', w / 2, h * 0.03);
    ctx.restore();
  }

  private drawActor(ctx: CanvasRenderingContext2D, a: Actor, t: number): void {
    if (a.kind === 'turtle') drawTurtle(ctx, a, t);
    else if (a.kind === 'skeleton') drawSkeleton(ctx, a, t);
    else drawNinja(ctx, a, t);
  }

  private drawLimbs(ctx: CanvasRenderingContext2D): void {
    for (const limbBit of this.limbs) {
      if (!limbBit.active) continue;
      ctx.save();
      ctx.translate(limbBit.x, limbBit.y);
      ctx.rotate(limbBit.rot);
      const len = limbBit.len;
      const thick = limbBit.thick;
      ctx.fillStyle = '#14080c';
      ctx.fillRect(-thick * 0.7, -len * 0.5, thick * 1.4, len);
      ctx.fillStyle = limbBit.color;
      ctx.fillRect(-thick * 0.45, -len * 0.46, thick * 0.9, len * 0.92);
      ctx.beginPath();
      ctx.arc(0, len * 0.48, thick * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawDrops(ctx: CanvasRenderingContext2D): void {
    for (const d of this.drops) {
      if (!d.active) continue;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawComics(ctx: CanvasRenderingContext2D, h: number): void {
    for (const c of this.comics) {
      if (!c.active) continue;
      const size = Math.round(Math.max(48, h * 0.072) * (0.75 + c.life * 0.4));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = ctx.globalAlpha * clamp01(c.life * 1.4);
      ctx.font = `${size}px 'Bangers', ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(8, size * 0.14);
      ctx.strokeStyle = '#14080c';
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }
  }
}

function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#12080c';
  ctx.lineWidth = width + Math.max(3, width * 0.45);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Angle 0 points down. Positive angles swing toward +x (the facing direction). */
function armPoint(angle: number, length: number): [number, number] {
  return [Math.sin(angle) * length, Math.cos(angle) * length];
}

function poseAngles(a: Actor, t: number): { armL: number; armR: number; legL: number; legR: number } {
  const swing = Math.sin(t * 7 + a.phase) * 0.3;
  if (a.state === 'tumble') {
    const flail = Math.sin(t * 16 + a.phase);
    return { armL: -1.2 + flail, armR: 1.4 - flail, legL: 0.8 + flail, legR: -0.7 - flail };
  }
  if (a.state === 'strike') return { armL: 0.4, armR: 1.45, legL: -0.3, legR: 0.45 };
  if (a.state === 'hit') return { armL: -0.6, armR: -0.2, legL: 0.2, legR: -0.15 };
  if (a.state === 'bow') return { armL: 0.35, armR: 0.4, legL: 0.05, legR: -0.05 };
  return { armL: 0.15 + swing, armR: 0.2 - swing, legL: swing * 0.4, legR: -swing * 0.4 };
}

function withBody(
  ctx: CanvasRenderingContext2D,
  a: Actor,
  t: number,
  hipY: number,
  drawUpper: () => void,
): void {
  ctx.save();
  ctx.translate(a.x, a.y);
  if (a.state === 'tumble') ctx.rotate(a.spin);
  ctx.scale(a.facing, 1);
  const angles = poseAngles(a, t);
  const legLen = a.scale * 0.34;
  const [lx, ly] = armPoint(angles.legL, legLen);
  const [rx, ry] = armPoint(angles.legR, legLen);
  const color = a.kind === 'turtle' ? '#2f9a3c' : a.kind === 'skeleton' ? '#efe6d4' : '#3a3344';
  const thickness = Math.max(6, a.scale * 0.08);
  limb(ctx, -a.scale * 0.08, hipY, -a.scale * 0.08 + lx, hipY + ly, thickness, color);
  limb(ctx, a.scale * 0.08, hipY, a.scale * 0.08 + rx, hipY + ry, thickness, color);
  ctx.save();
  if (a.state === 'bow') {
    ctx.translate(0, hipY);
    ctx.rotate(0.58);
    ctx.translate(0, -hipY);
  } else if (a.state === 'hit') {
    ctx.translate(0, hipY);
    ctx.rotate(-0.4);
    ctx.translate(0, -hipY);
  }
  drawUpper();
  ctx.restore();
  ctx.restore();
}

function drawTurtle(ctx: CanvasRenderingContext2D, a: Actor, t: number): void {
  const s = a.scale;
  const hipY = -s * 0.34;
  const shoulderY = -s * 0.58;
  withBody(ctx, a, t, hipY, () => {
    ctx.fillStyle = '#4a3018';
    ctx.beginPath();
    ctx.ellipse(-s * 0.02, -s * 0.5, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(3, s * 0.035);
    ctx.strokeStyle = '#1a0c06';
    ctx.stroke();
    ctx.fillStyle = '#3dbe4a';
    ctx.beginPath();
    ctx.ellipse(s * 0.02, -s * 0.5, s * 0.13, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const angles = poseAngles(a, t);
    const len = s * 0.28;
    const [lx, ly] = armPoint(angles.armL, len);
    const [rx, ry] = armPoint(angles.armR, len);
    const thick = Math.max(6, s * 0.075);
    limb(ctx, -s * 0.1, shoulderY, -s * 0.1 + lx, shoulderY + ly, thick, '#2f9a3c');
    limb(ctx, s * 0.12, shoulderY, s * 0.12 + rx, shoulderY + ry, thick, '#2f9a3c');
    drawTurtleHead(ctx, s * 0.02, -s * 0.8, s * 0.2, {
      mask: a.mask,
      eyeOpen: a.state === 'hit' ? 0.3 : 0.85,
      tailWave: 0.6,
      t,
      glow: a.mask,
      glowAmount: 0.45,
    });
  });
}

function drawNinja(ctx: CanvasRenderingContext2D, a: Actor, t: number): void {
  const s = a.scale;
  const hipY = -s * 0.34;
  const shoulderY = -s * 0.58;
  withBody(ctx, a, t, hipY, () => {
    ctx.fillStyle = '#3a3344';
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, shoulderY);
    ctx.lineTo(-s * 0.18, hipY);
    ctx.lineTo(s * 0.18, hipY);
    ctx.lineTo(s * 0.14, shoulderY);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(3, s * 0.03);
    ctx.strokeStyle = '#0c080e';
    ctx.stroke();
    ctx.fillStyle = '#8b1520';
    ctx.fillRect(-s * 0.16, -s * 0.46, s * 0.32, Math.max(4, s * 0.05));
    const angles = poseAngles(a, t);
    const len = s * 0.3;
    const [lx, ly] = armPoint(angles.armL, len);
    const [rx, ry] = armPoint(angles.armR, len);
    const thick = Math.max(6, s * 0.07);
    limb(ctx, -s * 0.1, shoulderY, -s * 0.1 + lx, shoulderY + ly, thick, '#3a3344');
    limb(ctx, s * 0.12, shoulderY, s * 0.12 + rx, shoulderY + ry, thick, '#3a3344');
    if (a.state === 'strike') {
      const hx = s * 0.12 + rx;
      const hy = shoulderY + ry;
      ctx.strokeStyle = '#d8d2c8';
      ctx.lineWidth = Math.max(3, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + s * 0.42, hy - s * 0.02);
      ctx.stroke();
    }
    // Hood and a single glowing eye slit. No emblem.
    ctx.fillStyle = '#1a121c';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.78, s * 0.16, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0c080e';
    ctx.lineWidth = Math.max(3, s * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.7);
    ctx.lineTo(0, -s * 1.02);
    ctx.lineTo(s * 0.16, -s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const slitY = -s * 0.78;
    ctx.fillStyle = '#ff2a2a';
    ctx.fillRect(-s * 0.09, slitY, s * 0.18, Math.max(3, s * 0.035));
    ctx.fillStyle = '#fff2f2';
    ctx.fillRect(-s * 0.07, slitY + s * 0.008, s * 0.14, Math.max(2, s * 0.012));
  });
}

function drawSkeleton(ctx: CanvasRenderingContext2D, a: Actor, t: number): void {
  const s = a.scale;
  const hipY = -s * 0.34;
  const shoulderY = -s * 0.58;
  withBody(ctx, a, t, hipY, () => {
    ctx.strokeStyle = '#1a140e';
    ctx.fillStyle = '#efe6d4';
    ctx.lineWidth = Math.max(3, s * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.5, s * 0.12, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#c4b8a4';
    ctx.lineWidth = Math.max(2, s * 0.02);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, -s * 0.56 + i * s * 0.06);
      ctx.lineTo(s * 0.08, -s * 0.56 + i * s * 0.06);
      ctx.stroke();
    }
    const angles = poseAngles(a, t);
    const len = s * 0.3;
    const [lx, ly] = armPoint(angles.armL, len);
    const [rx, ry] = armPoint(angles.armR, len);
    const thick = Math.max(5, s * 0.055);
    limb(ctx, -s * 0.1, shoulderY, -s * 0.1 + lx, shoulderY + ly, thick, '#efe6d4');
    limb(ctx, s * 0.1, shoulderY, s * 0.1 + rx, shoulderY + ry, thick, '#efe6d4');
    ctx.fillStyle = '#efe6d4';
    ctx.beginPath();
    ctx.arc(0, -s * 0.8, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(3, s * 0.03);
    ctx.strokeStyle = '#1a140e';
    ctx.stroke();
    for (const side of [-1, 1]) {
      const ex = side * s * 0.05;
      const ey = -s * 0.82;
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(4, s * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14080c';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(2, s * 0.02), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
