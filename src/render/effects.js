import { WORLD } from "../core/constants.js";
import { clamp, positiveMod, randomRange, seeded } from "../core/math.js";
import { toneColor } from "./palette.js";

/**
 * Purely cosmetic state: particles, screen shake, flash, and the fixed
 * ambient layers. The simulation asks for these through events and never
 * holds a reference to them, so dropping every effect would still leave a
 * playable game.
 */
export class Effects {
  constructor(palette, { reducedMotion = false } = {}) {
    this.palette = palette;
    this.reducedMotion = reducedMotion;
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.flashTone = "paper";
    this.motes = Array.from({ length: 42 }, (_, index) => ({
      x: seeded(index * 13.7) * WORLD.width,
      y: 80 + seeded(index * 29.3) * 430,
      size: 1 + seeded(index * 41.9) * 3.5,
      phase: seeded(index * 67.1) * Math.PI * 2,
      depth: 0.08 + seeded(index * 79.7) * 0.28
    }));
    this.rain = Array.from({ length: 52 }, (_, index) => ({
      x: seeded(index * 17.3) * WORLD.width,
      y: seeded(index * 31.1) * WORLD.height,
      length: 7 + seeded(index * 47.3) * 18,
      speed: 180 + seeded(index * 59.9) * 250
    }));
    this.grain = createGrain(palette.paper);
  }

  /** Particle count is the first thing to go when motion is reduced. */
  burst({ x, y, tone, count, speed, kind }) {
    const total = this.reducedMotion ? Math.ceil(count * 0.35) : count;
    const color = toneColor(this.palette, tone);
    for (let i = 0; i < total; i += 1) {
      const angle = -Math.PI + (Math.PI * 2 * i) / total + randomRange(-0.25, 0.25);
      const velocity = speed * randomRange(0.35, 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - (kind === "rock" ? 80 : 30),
        life: randomRange(0.45, 1.05),
        maxLife: 1,
        color,
        size: randomRange(3, kind === "star" ? 10 : 8),
        rotation: randomRange(0, Math.PI * 2),
        spin: randomRange(-5, 5),
        kind
      });
    }
  }

  addShake(amount) {
    if (this.reducedMotion) return;
    this.shake = Math.max(this.shake, amount);
  }

  addFlash(amount, tone = "paper") {
    this.flash = Math.max(this.flash, amount);
    this.flashTone = tone;
  }

  update(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.vy += (particle.kind === "star" ? 140 : 520) * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
    }
    if (this.particles.length) this.particles = this.particles.filter((particle) => particle.life > 0);
    this.shake = Math.max(0, this.shake - dt * 24);
    this.flash = Math.max(0, this.flash - dt * 2.8);
  }

  shakeOffset() {
    if (this.reducedMotion || this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: randomRange(-this.shake, this.shake),
      y: randomRange(-this.shake * 0.55, this.shake * 0.55)
    };
  }

  drawMotes(ctx, cameraX, now) {
    for (const mote of this.motes) {
      const x = positiveMod(mote.x - cameraX * mote.depth, WORLD.width + 100) - 50;
      const y = mote.y + Math.sin(now * 0.0012 + mote.phase) * 14;
      drawGlow(ctx, x, y, mote.size * 8, this.palette.spore, 0.16);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.palette.spore;
      ctx.beginPath();
      ctx.arc(x, y, mote.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawParticles(ctx, cameraX) {
    for (const particle of this.particles) {
      const x = particle.x - cameraX;
      if (x < -40 || x > WORLD.width + 40) continue;
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.translate(x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      if (particle.kind === "star") {
        starPath(ctx, particle.size * 1.5);
        ctx.fill();
      } else if (particle.kind === "leaf") {
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size * 1.3, particle.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.kind === "rock") {
        ctx.fillRect(-particle.size, -particle.size * 0.6, particle.size * 2, particle.size * 1.2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawRain(ctx, cameraX, now) {
    if (this.reducedMotion) return;
    ctx.save();
    ctx.strokeStyle = this.palette.gameCyan;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.13;
    for (const drop of this.rain) {
      const y = positiveMod(drop.y + now * 0.001 * drop.speed, WORLD.height + 60) - 30;
      const x = positiveMod(drop.x - cameraX * 0.05 + y * 0.08, WORLD.width + 60) - 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - drop.length * 0.14, y + drop.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const gradient = ctx.createRadialGradient(
      WORLD.width * 0.5, WORLD.height * 0.45, WORLD.width * 0.18,
      WORLD.width * 0.5, WORLD.height * 0.45, WORLD.width * 0.72
    );
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(1, this.palette.shadow);
    ctx.save();
    ctx.globalAlpha = 0.44;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    if (this.grain) {
      ctx.globalAlpha = 0.04;
      ctx.globalCompositeOperation = "soft-light";
      ctx.drawImage(this.grain, 0, 0, WORLD.width, WORLD.height);
    }
    ctx.restore();
  }

  drawFlash(ctx) {
    if (this.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.flash * (this.reducedMotion ? 0.06 : 0.18);
    ctx.fillStyle = toneColor(this.palette, this.flashTone);
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.restore();
  }
}

function createGrain(color) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  for (let i = 0; i < 850; i += 1) {
    ctx.globalAlpha = randomRange(0.04, 0.18);
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function drawGlow(ctx, x, y, radius, color, alpha = 0.25) {
  ctx.save();
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function starPath(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(2, -2, size, 0);
  ctx.quadraticCurveTo(2, 2, 0, size);
  ctx.quadraticCurveTo(-2, 2, -size, 0);
  ctx.quadraticCurveTo(-2, -2, 0, -size);
}
