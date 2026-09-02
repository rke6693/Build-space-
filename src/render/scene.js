import { WORLD } from "../core/constants.js";
import { clamp } from "../core/math.js";
import { isDrawable } from "./art.js";
import { drawGlow, roundedRect, starPath } from "./effects.js";
import { isGoalComplete } from "../game/level.js";

/**
 * Draws one frame of the marsh. Reads simulation state, mutates nothing.
 *
 * The painted plate does the heavy lifting for mood; everything the player
 * interacts with is drawn as vector shapes on top so hitboxes and visuals can
 * never disagree.
 */
export class Scene {
  constructor({ palette, art, effects }) {
    this.palette = palette;
    this.art = art;
    this.effects = effects;
  }

  draw(ctx, sim, now) {
    const visualNow = this.effects.reducedMotion ? 0 : now;
    const offset = this.effects.shakeOffset();

    ctx.save();
    ctx.translate(offset.x, offset.y);
    this.#drawBackground(ctx, sim, visualNow);
    this.#drawGround(ctx, visualNow);
    this.#drawLevel(ctx, sim, visualNow);
    this.#drawPlayerReflection(ctx, sim);
    this.#drawPlayer(ctx, sim);
    this.effects.drawParticles(ctx, sim.cameraX);
    this.effects.drawRain(ctx, sim.cameraX, now);
    this.effects.drawVignette(ctx);
    ctx.restore();

    this.effects.drawFlash(ctx);
  }

  #drawBackground(ctx, sim, now) {
    const { palette } = this;
    ctx.fillStyle = palette.deep;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    if (isDrawable(this.art.marsh)) {
      const image = this.art.marsh.image;
      const zoom = sim.levelIndex === 1 ? 1.25 : 1.16;
      const sourceW = image.naturalWidth / zoom;
      const sourceH = image.naturalHeight / zoom;
      const rangeX = Math.max(0, image.naturalWidth - sourceW);
      const span = sim.level.width - WORLD.width;
      const normalized = span > 0 ? sim.cameraX / span : 0.5;
      const sourceX = rangeX * clamp(normalized, 0, 1);
      const sourceY = (image.naturalHeight - sourceH) * (sim.levelIndex === 2 ? 0.34 : 0.5);
      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, WORLD.width, WORLD.height);
    }

    ctx.save();
    ctx.globalAlpha = sim.levelIndex === 1 ? 0.32 : sim.levelIndex === 2 ? 0.46 : 0.18;
    ctx.fillStyle = sim.levelIndex === 2 ? palette.shadow : palette.water;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.restore();

    this.effects.drawMotes(ctx, sim.cameraX, now);
  }

  #drawGround(ctx, now) {
    const { palette } = this;
    const wave = Math.sin(now * 0.0015) * 2;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = palette.stone;
    ctx.fillRect(0, WORLD.ground, WORLD.width, WORLD.height - WORLD.ground);
    ctx.fillStyle = palette.moss;
    ctx.fillRect(0, WORLD.ground, WORLD.width, 9);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = palette.water;
    ctx.fillRect(0, WORLD.ground + 24, WORLD.width, WORLD.height - WORLD.ground - 24);
    ctx.strokeStyle = palette.gameCyan;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.16;
    for (let y = WORLD.ground + 34; y < WORLD.height; y += 21) {
      ctx.beginPath();
      ctx.moveTo((y * 7 + now * 0.03) % 160 - 80, y + wave);
      for (let x = -80; x < WORLD.width + 80; x += 160) {
        ctx.lineTo(x + 72, y + Math.sin(x * 0.03 + now * 0.001) * 3);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawLevel(ctx, sim, now) {
    const level = sim.level;
    const camera = sim.cameraX;

    for (const platform of level.platforms) this.#drawPlatform(ctx, platform, camera, false);
    for (const mover of level.movers) this.#drawPlatform(ctx, mover, camera, true);
    for (const spring of level.springs) this.#drawSpring(ctx, spring, camera);
    for (const seed of level.seeds) if (!seed.collected) this.#drawSeed(ctx, seed, camera, level.clock, now);
    for (const hazard of level.hazards) this.#drawHazard(ctx, hazard, camera);
    for (const cage of level.cages) this.#drawCage(ctx, cage, camera, now);
    for (const enemy of level.enemies) this.#drawNeedler(ctx, enemy, camera, now);
    for (const drifter of level.drifters) this.#drawDrifter(ctx, drifter, camera, now);
    if (!level.boss) this.#drawExit(ctx, level, camera, now);
    if (level.boss) this.#drawBoss(ctx, sim, now);
    for (const wave of sim.shockwaves) this.#drawShockwave(ctx, wave, camera);
    for (const piece of sim.rubble) this.#drawRubble(ctx, piece, camera);
  }

  #drawPlatform(ctx, platform, camera, isMover) {
    const { palette } = this;
    const x = platform.x - camera;
    if (x + platform.w < -40 || x > WORLD.width + 40) return;
    ctx.save();
    roundedRect(ctx, x, platform.y, platform.w, platform.h + 18, 10);
    ctx.fillStyle = palette.stone;
    ctx.fill();
    ctx.strokeStyle = isMover ? palette.brass : palette.stoneHi;
    ctx.lineWidth = isMover ? 3 : 2;
    ctx.stroke();
    roundedRect(ctx, x, platform.y - 6, platform.w, 13, 7);
    ctx.fillStyle = palette.moss;
    ctx.fill();
    // A wet lip along the top edge keeps the shelf readable against the plate.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.mossHi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, platform.y - 5);
    ctx.lineTo(x + platform.w - 6, platform.y - 5);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette.mossHi;
    for (let dot = 12; dot < platform.w - 8; dot += 28) {
      ctx.beginPath();
      ctx.arc(x + dot, platform.y - 3 + Math.sin(dot) * 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isMover) {
      // A brass rail under a moving shelf reads as "this one travels".
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = palette.brass;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const railY = platform.y + platform.h + 22;
      if (platform.axis === "y") {
        ctx.moveTo(x + platform.w * 0.5, platform.originY - platform.range * 0.5);
        ctx.lineTo(x + platform.w * 0.5, platform.originY + platform.range * 0.5 + 20);
      } else {
        ctx.moveTo(platform.originX - platform.range * 0.5 - camera, railY);
        ctx.lineTo(platform.originX + platform.range * 0.5 + platform.w - camera, railY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawSpring(ctx, spring, camera) {
    const { palette } = this;
    const x = spring.x - camera;
    if (x < -80 || x > WORLD.width + 80) return;
    const squash = spring.compression;
    const height = 54 * (1 - squash * 0.68);

    ctx.save();
    ctx.translate(x, spring.y);
    drawGlow(ctx, 0, -height * 0.6, 66, palette.mint, 0.18 + squash * 0.26);

    // Base plate: the part that stays put.
    ctx.fillStyle = palette.stone;
    roundedRect(ctx, -34, -10, 68, 12, 5);
    ctx.fill();
    ctx.strokeStyle = palette.stoneHi;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Coil: a zigzag that visibly bunches up as the spring compresses.
    const turns = 4;
    ctx.strokeStyle = palette.mossHi;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-20, -10);
    for (let i = 1; i <= turns * 2; i += 1) {
      ctx.lineTo(i % 2 ? 20 : -20, -10 - (height - 20) * (i / (turns * 2)));
    }
    ctx.stroke();

    // Cap: the surface the player actually lands on.
    ctx.fillStyle = palette.mint;
    roundedRect(ctx, -32, -height - 14, 64, 16, 8);
    ctx.fill();
    ctx.strokeStyle = palette.mossHi;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = palette.paper;
    roundedRect(ctx, -24, -height - 11, 48, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  #drawSeed(ctx, seed, camera, clock, now) {
    const { palette } = this;
    const x = seed.x - camera;
    if (x < -60 || x > WORLD.width + 60) return;
    const y = seed.y + Math.sin(clock * 2 + seed.phase) * 8;
    drawGlow(ctx, x, y, 56, palette.spore, 0.3);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 0.0008 + seed.phase);
    ctx.fillStyle = palette.spore;
    starPath(ctx, 18);
    ctx.fill();
    ctx.fillStyle = palette.paper;
    ctx.beginPath();
    ctx.arc(-3, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  #drawHazard(ctx, hazard, camera) {
    const { palette } = this;
    const x = hazard.x - camera;
    if (x + hazard.w < 0 || x > WORLD.width) return;
    ctx.save();
    ctx.fillStyle = palette.thorn;
    ctx.strokeStyle = palette.mossHi;
    ctx.lineWidth = 2;
    for (let dx = 0; dx < hazard.w; dx += 22) {
      ctx.beginPath();
      ctx.moveTo(x + dx, WORLD.ground);
      ctx.lineTo(x + dx + 10, WORLD.ground - 32 - (dx % 3) * 5);
      ctx.lineTo(x + dx + 20, WORLD.ground);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawNeedler(ctx, enemy, camera, now) {
    const { palette } = this;
    const x = enemy.x - camera;
    if (x < -100 || x > WORLD.width + 100) return;
    const squash = enemy.defeated ? 0.58 + enemy.squash * 0.22 : Math.sin(now * 0.004 + enemy.id) * 0.04;
    const height = enemy.h * (1 - squash);
    const width = enemy.w * (1 + squash * 0.55);
    ctx.save();
    ctx.translate(x, enemy.y);
    ctx.scale(enemy.direction, 1);
    ctx.fillStyle = palette.moss;
    ctx.strokeStyle = palette.mossHi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      const radius = i % 2 ? width * 0.44 : width * 0.58;
      const px = Math.cos(angle) * radius;
      const py = -height * 0.55 + Math.sin(angle) * height * 0.55;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!enemy.defeated) this.#drawFace(ctx, height);
    ctx.restore();
  }

  #drawDrifter(ctx, drifter, camera, now) {
    const { palette } = this;
    const x = drifter.x - camera;
    if (x < -110 || x > WORLD.width + 110) return;
    const squash = drifter.defeated ? 0.5 + drifter.squash * 0.3 : Math.sin(now * 0.003 + drifter.id) * 0.05;
    const height = drifter.h * (1 - squash);
    const width = drifter.w * (1 + squash * 0.4);
    ctx.save();
    ctx.translate(x, drifter.y);
    ctx.globalAlpha = drifter.defeated ? Math.max(0, 1 - drifter.squash) : 1;
    drawGlow(ctx, 0, -height * 0.55, 58, palette.gameCyan, 0.22);

    // Tether below the balloon reads the drop direction at a glance.
    ctx.strokeStyle = palette.mossHi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6, 14, 2, 24);
    ctx.stroke();

    ctx.fillStyle = palette.gameCyan;
    ctx.beginPath();
    ctx.ellipse(0, -height * 0.58, width * 0.46, height * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.4;
    ctx.fillStyle = palette.paper;
    ctx.beginPath();
    ctx.ellipse(-width * 0.14, -height * 0.78, width * 0.14, height * 0.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = drifter.defeated ? Math.max(0, 1 - drifter.squash) : 1;
    if (!drifter.defeated) this.#drawFace(ctx, height * 1.05);
    ctx.restore();
  }

  #drawFace(ctx, height) {
    const { palette } = this;
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.arc(-12, -height * 0.58, 5, 0, Math.PI * 2);
    ctx.arc(10, -height * 0.58, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-19, -height * 0.76);
    ctx.lineTo(-5, -height * 0.7);
    ctx.moveTo(3, -height * 0.7);
    ctx.lineTo(17, -height * 0.76);
    ctx.stroke();
  }

  #drawCage(ctx, cage, camera, now) {
    const { palette } = this;
    const x = cage.x - camera;
    if (x < -130 || x > WORLD.width + 130) return;
    ctx.save();
    ctx.translate(x, cage.y);
    if (cage.hit) ctx.rotate(Math.sin(now * 0.05) * cage.hit * 0.08);
    if (cage.rescued) {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = palette.brass;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, -16, 42, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    drawGlow(ctx, 0, -52, 52, palette.cyan, 0.28);
    ctx.fillStyle = palette.cyan;
    ctx.beginPath();
    ctx.ellipse(0, -43, 27, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.arc(-9, -48, 3.5, 0, Math.PI * 2);
    ctx.arc(9, -48, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.brass;
    ctx.lineWidth = 7;
    roundedRect(ctx, -cage.w / 2, -cage.h, cage.w, cage.h, 18);
    ctx.stroke();
    for (let bar = -26; bar <= 26; bar += 26) {
      ctx.beginPath();
      ctx.moveTo(bar, -cage.h + 5);
      ctx.lineTo(bar, -5);
      ctx.stroke();
    }
    ctx.fillStyle = palette.coral;
    roundedRect(ctx, -18, -21, 36, 26, 8);
    ctx.fill();
    ctx.restore();
  }

  #drawExit(ctx, level, camera, now) {
    const { palette } = this;
    const exit = level.exit;
    const x = exit.x - camera;
    if (x < -160 || x > WORLD.width + 160) return;
    const open = isGoalComplete(level);
    const pulse = 1 + Math.sin(now * 0.004) * 0.08 + exit.lockedPulse * 0.16;
    ctx.save();
    ctx.translate(x, exit.y);
    drawGlow(ctx, 0, -104, open ? 115 : 72, open ? palette.coral : palette.brass, open ? 0.34 : 0.16);
    ctx.strokeStyle = palette.brass;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-48, 0);
    ctx.lineTo(-48, -128);
    ctx.quadraticCurveTo(0, -178, 48, -128);
    ctx.lineTo(48, 0);
    ctx.stroke();
    ctx.scale(pulse, pulse);
    ctx.fillStyle = open ? palette.coral : palette.stoneHi;
    ctx.beginPath();
    ctx.moveTo(0, -154);
    ctx.lineTo(17, -120);
    ctx.lineTo(0, -86);
    ctx.lineTo(-17, -120);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  #drawBoss(ctx, sim, now) {
    const { palette } = this;
    const boss = sim.level.bossEntity;
    if (!boss) return;
    const x = boss.x - sim.cameraX;
    const windup = boss.state === "windup" ? 1 - boss.timer / 0.85 : 0;
    const exposed = boss.state === "exposed" ? 1 : 0;
    const defeat = boss.defeated ? clamp(1 - boss.defeatTimer / 1.8, 0, 1) : 0;

    // Phase two paints a hot brass ring under the machine before every slam.
    if (boss.phase === 2 && !boss.defeated) {
      drawGlow(ctx, x, WORLD.ground - 8, 150 + windup * 90, palette.gameCoral, 0.14 + windup * 0.2);
    }

    ctx.save();
    ctx.translate(x, boss.y);
    ctx.rotate(defeat * 0.22 * Math.sin(now * 0.02));
    const scaleX = 1 + windup * 0.14 - exposed * 0.06;
    const scaleY = 1 - windup * 0.16 + exposed * 0.04;
    ctx.scale(scaleX * (1 - defeat * 0.2), scaleY * (1 - defeat * 0.42));
    ctx.globalAlpha = 1 - defeat * 0.55;
    drawGlow(ctx, 0, -boss.h * 0.54, exposed ? 96 : 52, palette.coral, exposed ? 0.44 : 0.18);

    if (isDrawable(this.art.press)) {
      const drawW = boss.w * 1.48;
      const drawH = boss.h * 1.48;
      ctx.drawImage(this.art.press.image, -drawW / 2, -drawH, drawW, drawH);
    } else {
      ctx.fillStyle = palette.brass;
      roundedRect(ctx, -boss.w / 2, -boss.h, boss.w, boss.h, 36);
      ctx.fill();
    }

    if (exposed) {
      ctx.fillStyle = palette.paper;
      ctx.globalAlpha = 0.75 + Math.sin(now * 0.012) * 0.2;
      ctx.beginPath();
      ctx.arc(0, -boss.h * 0.64, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  #drawShockwave(ctx, wave, camera) {
    if (wave.delay > 0) return;
    const { palette } = this;
    const x = wave.x - camera;
    ctx.save();
    ctx.globalAlpha = clamp(wave.life / 0.7, 0, 1);
    ctx.strokeStyle = palette.coral;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, wave.y + 8, 29, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.paper;
    ctx.beginPath();
    ctx.arc(x, wave.y + 8, 40, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  #drawRubble(ctx, piece, camera) {
    const { palette } = this;
    ctx.save();
    ctx.translate(piece.x - camera, piece.y);
    ctx.rotate(piece.rotation);
    ctx.fillStyle = palette.brass;
    roundedRect(ctx, -15, -11, 30, 22, 5);
    ctx.fill();
    ctx.strokeStyle = palette.stoneHi;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  #drawPlayerReflection(ctx, sim) {
    const player = sim.player;
    if (player.y < WORLD.ground - 18 || !isDrawable(this.art.gloob)) return;
    const { width, height } = sim.playerBox();
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.translate(player.x - sim.cameraX, WORLD.ground + 16);
    ctx.scale(player.facing, -0.34);
    ctx.drawImage(this.art.gloob.image, -width * 0.66, 0, width * 1.32, height * 1.16);
    ctx.restore();
  }

  #drawPlayer(ctx, sim) {
    const { palette } = this;
    const player = sim.player;
    // Invulnerability blink: skip alternating 12ths of a second.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;

    const x = player.x - sim.cameraX;
    const { width, height } = sim.playerBox();
    drawGlow(ctx, x, player.y - height * 0.46, 76 + player.charge * 35, palette.gameCyan, 0.2 + player.charge * 0.1);
    ctx.save();
    ctx.translate(x, player.y);
    ctx.scale(player.facing, 1);
    if (isDrawable(this.art.gloob)) {
      ctx.drawImage(this.art.gloob.image, -width * 0.66, -height * 1.18, width * 1.32, height * 1.18);
    } else {
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.ellipse(0, -height * 0.48, width * 0.48, height * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
