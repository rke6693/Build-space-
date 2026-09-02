import { ASSIST, TUNING, WORLD } from "../core/constants.js";
import { clamp, createRandom } from "../core/math.js";
import { EventQueue } from "../core/emitter.js";
import { ACT_COUNT } from "../data/levels.js";
import {
  chargeTime,
  createLevel,
  createPlayer,
  isGoalComplete,
  solidSurfaces,
  syncMover
} from "./level.js";

/**
 * The whole game rule set, with no reference to the DOM, canvas, or audio.
 *
 * The shell advances it with a fixed timestep and drains `events` once per
 * rendered frame. Everything the player can feel — a sound, a shake, a line
 * of narration, a burst of particles — leaves through that queue, which is
 * why the entire simulation is exercisable from a Node test.
 */
export class Simulation {
  constructor({ assist = false, seed = 20260901 } = {}) {
    this.assist = assist === true;
    this.random = createRandom(seed);
    this.events = new EventQueue();
    this.status = "running";
    this.levelIndex = 0;
    this.level = createLevel(0, { assist: this.assist });
    this.player = createPlayer(this.level.spawnX, { assist: this.assist });
    this.cameraX = 0;
    this.shockwaves = [];
    this.rubble = [];
    this.elapsed = 0;
    this.actElapsed = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.bestChain = 0;
    this.totals = { seeds: 0, rescues: 0, squishes: 0 };
    this.previousSquish = false;
    this.objectiveNagTimer = 0;
  }

  /** Restart the campaign from act 0 without rebuilding the shell. */
  reset({ levelIndex = 0 } = {}) {
    this.status = "running";
    this.elapsed = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.bestChain = 0;
    this.totals = { seeds: 0, rescues: 0, squishes: 0 };
    this.loadLevel(levelIndex);
  }

  loadLevel(index) {
    this.levelIndex = clamp(index | 0, 0, ACT_COUNT - 1);
    this.level = createLevel(this.levelIndex, { assist: this.assist });
    const hearts = this.player?.maxHearts;
    this.player = createPlayer(this.level.spawnX, { assist: this.assist });
    if (Number.isFinite(hearts)) this.player.maxHearts = hearts;
    this.cameraX = 0;
    this.shockwaves = [];
    this.rubble = [];
    this.actElapsed = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.previousSquish = false;
    this.status = "running";
    if (this.level.boss) this.events.push("unlock", { id: "press" });
    this.events.push("levelReady", { index: this.levelIndex });
  }

  get boss() {
    return this.level.bossEntity;
  }

  get goalComplete() {
    return isGoalComplete(this.level);
  }

  /**
   * One fixed step. `input` is a plain `{ left, right, squish }` snapshot, so
   * keyboard, touch, and gamepad all funnel through the same door.
   */
  step(dt, input = { left: false, right: false, squish: false }) {
    if (this.status !== "running") return;

    this.elapsed += dt * 1000;
    this.actElapsed += dt * 1000;
    this.level.clock += dt;

    this.#readSquishEdges(input);
    this.#updateMovers();
    this.#updatePlayer(dt, input);
    this.#updateEnemies(dt);
    this.#updateDrifters(dt);
    this.#updateSeeds(dt);
    this.#updateShockwaves(dt);
    this.#updateRubble(dt);
    if (this.level.boss) this.#updateBoss(dt);
    this.#updateCamera(dt);

    const player = this.player;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.landPulse = Math.max(0, player.landPulse - dt * 3.2);
    player.lastLaunchCharge = Math.max(0, player.lastLaunchCharge - dt * 0.28);
    player.coyote = player.grounded ? TUNING.coyoteTime : Math.max(0, player.coyote - dt);
    player.chargeBuffer = Math.max(0, player.chargeBuffer - dt);
    this.chainTimer = Math.max(0, this.chainTimer - dt);
    if (this.chainTimer === 0) this.chain = 0;
    this.objectiveNagTimer = Math.max(0, this.objectiveNagTimer - dt);
    for (const spring of this.level.springs) {
      spring.compression = Math.max(0, spring.compression - dt * 3.4);
      spring.cooldown = Math.max(0, spring.cooldown - dt);
    }
    for (const cage of this.level.cages) cage.hit = Math.max(0, cage.hit - dt * 2.5);
    this.level.exit.lockedPulse = Math.max(0, this.level.exit.lockedPulse - dt * 2.4);
  }

  // ---------------------------------------------------------------- input

  #readSquishEdges(input) {
    const squish = input.squish === true;
    const player = this.player;
    if (squish && !this.previousSquish) {
      if (player.grounded || player.coyote > 0) this.#beginCharge();
      else player.chargeBuffer = TUNING.chargeBufferTime;
    }
    if (!squish && this.previousSquish && player.charging) this.#launch();
    this.previousSquish = squish;
  }

  #beginCharge() {
    const player = this.player;
    if (player.charging) return;
    player.charging = true;
    player.chargeBuffer = 0;
    this.events.sound("charge");
  }

  #launch() {
    const player = this.player;
    const charge = Math.max(TUNING.minCharge, player.charge);
    player.charging = false;
    player.grounded = false;
    player.groundMoverId = null;
    player.coyote = 0;
    player.lastLaunchCharge = charge;
    player.vy = -(TUNING.launchBase + charge * TUNING.launchRange);
    player.vx += player.facing * charge * TUNING.launchDrift;
    player.charge = 0;
    this.events.sound("jump", charge);
    this.events.burst(player.x, player.y - 5, "accent", 13, 170 + charge * 90, "droplet");
  }

  /** Used when a dialog opens or the run restarts — drops any stored charge. */
  cancelCharge() {
    const player = this.player;
    player.charging = false;
    player.charge = 0;
    player.chargeBuffer = 0;
    this.previousSquish = false;
  }

  // ---------------------------------------------------------------- world

  #updateMovers() {
    const level = this.level;
    const player = this.player;
    for (const mover of level.movers) syncMover(mover, level.clock);
    if (player.groundMoverId === null) return;

    const mover = level.movers.find((entry) => entry.id === player.groundMoverId);
    if (!mover) {
      player.groundMoverId = null;
      return;
    }
    player.x += mover.x - mover.previousX;
    player.y = mover.y;
    player.previousBottom = mover.y;
    const half = this.#playerWidth() * 0.36;
    if (player.x + half < mover.x || player.x - half > mover.x + mover.w) {
      player.grounded = false;
      player.groundMoverId = null;
    }
  }

  #updatePlayer(dt, input) {
    const player = this.player;
    const level = this.level;
    const direction = Number(input.right === true) - Number(input.left === true);
    const acceleration = player.grounded ? TUNING.groundAcceleration : TUNING.airAcceleration;
    const maxSpeed = player.charging ? TUNING.chargeMoveSpeed : TUNING.maxRunSpeed;

    if (direction !== 0) {
      player.vx += direction * acceleration * dt;
      player.facing = direction;
    } else {
      const drag = player.grounded ? TUNING.groundDrag : TUNING.airDrag;
      player.vx *= Math.max(0, 1 - drag * dt);
    }
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);

    // Holding the squish through a landing keeps the charge going.
    if (input.squish === true && player.grounded && !player.charging) this.#beginCharge();
    if (player.chargeBuffer > 0 && player.grounded && !player.charging) this.#beginCharge();

    if (player.charging) {
      player.charge = clamp(player.charge + dt / chargeTime(this.assist), 0, 1);
      player.vx *= Math.max(0, 1 - 8 * dt);
      player.stepPhase = 0;
    } else if (player.grounded) {
      player.stepPhase += Math.abs(player.vx) * dt * 0.06;
    }

    player.x = clamp(player.x + player.vx * dt, 42, level.width - 42);
    player.previousBottom = player.y;
    player.vy += TUNING.gravity * dt;

    let nextBottom = player.y + player.vy * dt;
    const halfWidth = this.#playerWidth() * 0.36;
    let landing = null;

    if (player.vy > 80) nextBottom = this.#resolveStomps(player, nextBottom, halfWidth) ?? nextBottom;
    if (player.vy > 110) {
      const cageLanding = this.#resolveCages(player, nextBottom, halfWidth);
      if (cageLanding?.landed) landing = cageLanding.landing ?? landing;
      if (cageLanding?.nextBottom !== undefined) nextBottom = cageLanding.nextBottom;
    }
    if (level.boss && player.vy > 90) nextBottom = this.#resolveBossContact(player, nextBottom, halfWidth) ?? nextBottom;

    if (player.vy >= 0 && nextBottom >= player.previousBottom) {
      for (const surface of solidSurfaces(level)) {
        if (player.x + halfWidth <= surface.left || player.x - halfWidth >= surface.right) continue;
        const tolerance = surface.moverId === null ? 3 : 6;
        if (player.previousBottom > surface.y + tolerance || nextBottom < surface.y) continue;
        if (!landing || surface.y < landing.y) {
          landing = { y: surface.y, impact: player.vy, moverId: surface.moverId };
        }
      }
    }

    if (landing) {
      this.#land(player, landing);
    } else if (player.vy !== 0) {
      player.y = nextBottom;
      if (player.grounded) player.coyote = TUNING.coyoteTime;
      player.grounded = false;
      player.groundMoverId = null;
    }

    if (player.y > TUNING.fallLimit) this.damagePlayer(0, { fell: true });

    for (const hazard of level.hazards) {
      const touches = player.x + halfWidth * 0.65 > hazard.x && player.x - halfWidth * 0.65 < hazard.x + hazard.w;
      if (touches && player.y > WORLD.ground - 46) {
        this.damagePlayer(player.x < hazard.x + hazard.w * 0.5 ? -1 : 1);
      }
    }

    this.#trackCheckpoint(player);
    if (!level.boss) this.#checkExit(player);
  }

  #land(player, landing) {
    const wasGrounded = player.grounded;
    player.y = landing.y;
    player.vy = 0;
    player.grounded = true;
    player.coyote = TUNING.coyoteTime;
    player.groundMoverId = landing.moverId ?? null;

    if (!wasGrounded && landing.impact > TUNING.landImpactThreshold) {
      player.landPulse = clamp(landing.impact / 1100, 0.25, 1);
      this.events.sound("land", player.landPulse);
      this.events.burst(player.x, player.y, "cyan", 8, 95 + landing.impact * 0.08, "splash");
    }
    if (landing.y === WORLD.ground) this.#checkSprings(player);
  }

  #checkSprings(player) {
    for (const spring of this.level.springs) {
      if (spring.cooldown > 0) continue;
      if (Math.abs(player.x - spring.x) > spring.w * 0.5) continue;
      spring.compression = 1;
      spring.cooldown = 0.22;
      player.vy = -TUNING.springBounce;
      player.grounded = false;
      player.groundMoverId = null;
      player.charging = false;
      player.charge = 0;
      player.lastLaunchCharge = 1;
      this.events.sound("spring");
      this.events.burst(spring.x, spring.y - 12, "mint", 18, 260, "leaf");
      this.events.push("unlock", { id: "bloomspring" });
      return;
    }
  }

  #resolveStomps(player, nextBottom, halfWidth) {
    for (const enemy of [...this.level.enemies, ...this.level.drifters]) {
      if (enemy.defeated) continue;
      const top = enemy.y - enemy.h * (1 - enemy.squash * 0.6);
      const horizontal = player.x + halfWidth > enemy.x - enemy.w * 0.5
        && player.x - halfWidth < enemy.x + enemy.w * 0.5;
      if (!horizontal || player.previousBottom > top + 5 || nextBottom < top) continue;

      this.#defeatEnemy(enemy);
      player.y = top;
      const lift = enemy.type === "drifter" ? 1.25 : 1;
      player.vy = -(TUNING.stompBounce + Math.min(1, player.lastLaunchCharge + 0.25) * TUNING.stompBounceCharge) * lift;
      player.grounded = false;
      player.groundMoverId = null;
      return player.y;
    }
    return null;
  }

  #resolveCages(player, nextBottom, halfWidth) {
    for (const cage of this.level.cages) {
      if (cage.rescued) continue;
      const top = cage.y - cage.h;
      const horizontal = player.x + halfWidth > cage.x - cage.w * 0.5
        && player.x - halfWidth < cage.x + cage.w * 0.5;
      if (!horizontal || player.previousBottom > top + 5 || nextBottom < top) continue;

      const impact = player.vy;
      if (impact > TUNING.cageBreakImpact || player.lastLaunchCharge > TUNING.cageBreakCharge) {
        this.#rescueCage(cage);
        player.y = top;
        player.vy = -380;
        player.grounded = false;
        player.groundMoverId = null;
        return { landed: false, nextBottom: player.y };
      }
      return { landed: true, landing: { y: top, impact, moverId: null } };
    }
    return null;
  }

  #resolveBossContact(player, nextBottom, halfWidth) {
    const boss = this.boss;
    if (!boss || boss.defeated) return null;
    const top = boss.y - boss.h * 0.74;
    const horizontal = player.x + halfWidth > boss.x - boss.w * 0.36
      && player.x - halfWidth < boss.x + boss.w * 0.36;
    if (!horizontal || player.previousBottom > top + 8 || nextBottom < top) return null;

    if (boss.exposed && !boss.hitThisOpening) {
      this.hitBoss();
      player.y = top;
      player.vy = -TUNING.bossStompBounce;
      player.grounded = false;
      player.groundMoverId = null;
      return player.y;
    }
    this.damagePlayer(boss.x > player.x ? -1 : 1);
    return null;
  }

  #trackCheckpoint(player) {
    for (const x of this.level.checkpoints) {
      if (player.x >= x && x > player.checkpointX) {
        player.checkpointX = x;
        player.checkpointY = WORLD.ground;
      }
    }
  }

  #checkExit(player) {
    const exit = this.level.exit;
    const atExit = player.x > exit.x - 55 && player.x < exit.x + 85 && player.y > WORLD.ground - 150;
    if (!atExit) return;
    if (this.goalComplete) {
      this.level.completed = true;
      this.status = "levelComplete";
      this.events.push("levelComplete", { index: this.levelIndex, actElapsed: this.actElapsed });
      return;
    }
    if (this.objectiveNagTimer > 0) return;
    this.objectiveNagTimer = 2.2;
    exit.lockedPulse = 1;
    this.events.push("objectiveReminder");
  }

  // -------------------------------------------------------------- enemies

  #updateEnemies(dt) {
    const player = this.player;
    for (const enemy of this.level.enemies) {
      if (enemy.defeated) {
        enemy.squash = clamp(enemy.squash + dt * 3, 0, 1);
        continue;
      }
      enemy.x += enemy.direction * enemy.speed * dt;
      if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) {
        enemy.x = clamp(enemy.x, enemy.minX, enemy.maxX);
        enemy.direction *= -1;
      }
      if (!enemy.seen && Math.abs(enemy.x - player.x) < 460) {
        enemy.seen = true;
        this.events.push("unlock", { id: "needler" });
      }
      if (this.#touchesPlayer(enemy)) this.damagePlayer(enemy.x > player.x ? -1 : 1);
    }
  }

  #updateDrifters(dt) {
    const player = this.player;
    const level = this.level;
    for (const drifter of level.drifters) {
      if (drifter.defeated) {
        drifter.squash = clamp(drifter.squash + dt * 3, 0, 1);
        drifter.y += 220 * dt;
        continue;
      }
      drifter.phase += dt * drifter.bobSpeed;
      drifter.x += drifter.direction * drifter.speed * dt;
      if (drifter.x <= drifter.minX || drifter.x >= drifter.maxX) {
        drifter.x = clamp(drifter.x, drifter.minX, drifter.maxX);
        drifter.direction *= -1;
      }
      drifter.y = drifter.baseY + Math.sin(drifter.phase) * drifter.amplitude;
      if (!drifter.seen && Math.abs(drifter.x - player.x) < 460) {
        drifter.seen = true;
        this.events.push("unlock", { id: "drifter" });
      }
      if (this.#touchesPlayer(drifter)) this.damagePlayer(drifter.x > player.x ? -1 : 1);
    }
  }

  /** Side/underneath contact only — a clean landing is handled by the stomp pass. */
  #touchesPlayer(enemy) {
    const player = this.player;
    const width = this.#playerWidth() * 0.54;
    const height = this.#playerHeight() * 0.78;
    const top = enemy.y - enemy.h;
    const inside = player.x + width * 0.5 > enemy.x - enemy.w * 0.45
      && player.x - width * 0.5 < enemy.x + enemy.w * 0.45
      && player.y > top
      && player.y - height < enemy.y;
    return inside && player.y - height * 0.25 > top + 8;
  }

  #defeatEnemy(enemy) {
    if (enemy.defeated) return;
    enemy.defeated = true;
    enemy.squash = 0.45;
    this.totals.squishes += 1;
    this.events.sound("squish");
    this.events.burst(
      enemy.x,
      enemy.y - enemy.h * 0.5,
      enemy.type === "drifter" ? "cyan" : "mint",
      14,
      190,
      "leaf"
    );
    this.events.say(
      enemy.type === "drifter"
        ? "Drifter popped. Its lift is yours for a moment."
        : "Needler deflated. It will recover somewhere less pointy."
    );
  }

  #rescueCage(cage) {
    if (cage.rescued) return;
    cage.rescued = true;
    cage.hit = 1;
    this.level.rescued += 1;
    this.totals.rescues += 1;
    this.events.push("unlock", { id: "plink" });
    this.events.sound("unlock");
    this.events.burst(cage.x, cage.y - cage.h * 0.55, "spore", 24, 240, "star");
    this.events.say(`Amber lock opened. ${this.level.rescued} of ${this.level.rescueGoal} Plinks are free.`);
  }

  #updateSeeds(dt) {
    const player = this.player;
    const level = this.level;
    const playerMiddle = player.y - this.#playerHeight() * 0.48;
    for (const seed of level.seeds) {
      if (seed.collected) continue;
      const y = seed.y + Math.sin(level.clock * 2 + seed.phase) * 8;
      if (Math.hypot(player.x - seed.x, playerMiddle - y) > 58) continue;

      seed.collected = true;
      level.collected += 1;
      this.totals.seeds += 1;
      this.chain = this.chainTimer > 0 ? this.chain + 1 : 1;
      this.chainTimer = TUNING.chainWindow;
      this.bestChain = Math.max(this.bestChain, this.chain);
      this.events.sound("seed", clamp(this.chain / 6, 0.2, 1));
      this.events.burst(seed.x, y, "spore", 18, 210, "star");
      this.events.push("seed", { chain: this.chain, remaining: Math.max(0, level.seedGoal - level.collected) });

      const remaining = Math.max(0, level.seedGoal - level.collected);
      this.events.say(
        remaining
          ? `Echo Seed gathered. ${remaining} remain.`
          : "All required Echo Seeds gathered. The beacon is open."
      );
    }
    void dt;
  }

  // ----------------------------------------------------------------- boss

  #updateBoss(dt) {
    const boss = this.boss;
    if (!boss) return;

    if (boss.defeated) {
      boss.defeatTimer -= dt;
      if (boss.defeatTimer <= 0 && this.status === "running") {
        this.status = "victory";
        this.events.push("victory", { elapsed: this.elapsed });
      }
      return;
    }

    const cycle = this.assist ? ASSIST.bossCycleScale : 1;
    boss.bob += dt;
    boss.timer -= dt;

    if (boss.state === "idle" && boss.timer <= 0) {
      boss.state = "windup";
      boss.timer = (boss.phase === 2 ? 0.68 : 0.85) * cycle;
      boss.exposed = false;
      this.events.push("bossWindup");
    } else if (boss.state === "windup" && boss.timer <= 0) {
      this.#bossSlam(boss);
    } else if (boss.state === "exposed" && boss.timer <= 0) {
      boss.state = "recover";
      boss.timer = 0.7 * cycle;
      boss.exposed = false;
    } else if (boss.state === "recover" && boss.timer <= 0) {
      boss.state = "idle";
      const base = boss.phase === 2 ? 1.05 : 1.5;
      boss.timer = Math.max(0.6, base - (boss.maxHp - boss.hp) * 0.1) * cycle;
    }

    const player = this.player;
    const overlapping = player.x > boss.x - boss.w * 0.4 && player.x < boss.x + boss.w * 0.4
      && player.y > boss.y - boss.h * 0.65 && player.y - this.#playerHeight() < boss.y;
    if (overlapping && !boss.exposed) this.damagePlayer(boss.x > player.x ? -1 : 1);
  }

  #bossSlam(boss) {
    const cycle = this.assist ? ASSIST.bossCycleScale : 1;
    const waveSpeed = (this.assist ? ASSIST.shockwaveSpeedScale : 1) * 470;
    boss.state = "exposed";
    boss.timer = (boss.phase === 2 ? 1.85 : 2.35) * cycle;
    boss.exposed = true;
    boss.hitThisOpening = false;
    boss.slamCount += 1;

    this.events.shake(17);
    this.events.sound("slam");
    this.events.burst(boss.x, WORLD.ground, "brass", 24, 260, "rock");

    this.shockwaves.push(
      { x: boss.x - boss.w * 0.35, y: WORLD.ground - 12, direction: -1, speed: waveSpeed, life: 2.5, hit: false },
      { x: boss.x + boss.w * 0.35, y: WORLD.ground - 12, direction: 1, speed: waveSpeed, life: 2.5, hit: false }
    );

    if (boss.phase === 2) {
      // Second wave, a beat behind and faster, so the safe window narrows.
      this.shockwaves.push(
        { x: boss.x - boss.w * 0.35, y: WORLD.ground - 12, direction: -1, speed: waveSpeed * 1.35, life: 2.5, hit: false, delay: 0.45 },
        { x: boss.x + boss.w * 0.35, y: WORLD.ground - 12, direction: 1, speed: waveSpeed * 1.35, life: 2.5, hit: false, delay: 0.45 }
      );
      for (let i = 0; i < 3; i += 1) {
        this.rubble.push({
          x: 180 + this.random() * (WORLD.width - 360),
          y: -60 - i * 90,
          vy: 240 + this.random() * 130,
          spin: this.random() * 4 - 2,
          rotation: 0,
          hit: false
        });
      }
    }

    this.events.say("The Press slammed. Its eye is open.");
  }

  hitBoss() {
    const boss = this.boss;
    if (!boss || !boss.exposed || boss.hitThisOpening) return;
    boss.hitThisOpening = true;
    boss.exposed = false;
    boss.state = "recover";
    boss.timer = 0.85;
    boss.hp -= 1;

    this.events.shake(12);
    this.events.flash(0.5, "coral");
    this.events.sound("bossHit");
    this.events.burst(boss.x, boss.y - boss.h * 0.58, "coral", 26, 300, "star");
    this.events.push("bossHit", { hp: boss.hp, maxHp: boss.maxHp });
    this.events.say(`The Press has ${boss.hp} ${boss.hp === 1 ? "seal" : "seals"} left.`);

    if (boss.hp <= boss.maxHp / 2 && boss.phase === 1) {
      boss.phase = 2;
      this.events.push("bossPhase", { phase: 2 });
    }
    if (boss.hp <= 0) {
      boss.defeated = true;
      boss.defeatTimer = 1.8;
      this.shockwaves = [];
      this.rubble = [];
      this.events.burst(boss.x, boss.y - boss.h * 0.45, "spore", 70, 420, "star");
      this.events.push("bossDefeated");
    }
  }

  #updateShockwaves(dt) {
    const player = this.player;
    for (const wave of this.shockwaves) {
      if (wave.delay > 0) {
        wave.delay -= dt;
        continue;
      }
      wave.x += wave.direction * wave.speed * dt;
      wave.life -= dt;
      const closeX = Math.abs(player.x - wave.x) < 44;
      const lowEnough = player.y > WORLD.ground - 64;
      if (!wave.hit && closeX && lowEnough) {
        wave.hit = true;
        this.damagePlayer(wave.direction);
      }
    }
    this.shockwaves = this.shockwaves.filter(
      (wave) => wave.life > 0 && wave.x > -100 && wave.x < this.level.width + 100
    );
  }

  #updateRubble(dt) {
    const player = this.player;
    for (const piece of this.rubble) {
      piece.vy += TUNING.gravity * 0.35 * dt;
      piece.y += piece.vy * dt;
      piece.rotation += piece.spin * dt;
      const near = Math.abs(player.x - piece.x) < 46
        && piece.y > player.y - this.#playerHeight()
        && piece.y < player.y + 10;
      if (!piece.hit && near) {
        piece.hit = true;
        this.damagePlayer(piece.x > player.x ? -1 : 1);
      }
      if (!piece.landed && piece.y >= WORLD.ground) {
        piece.landed = true;
        this.events.burst(piece.x, WORLD.ground, "brass", 8, 150, "rock");
      }
    }
    this.rubble = this.rubble.filter((piece) => piece.y < WORLD.ground + 40);
  }

  // ----------------------------------------------------------------- harm

  damagePlayer(direction = 0, { fell = false } = {}) {
    const player = this.player;
    if (player.invulnerable > 0 || this.status !== "running") return;

    player.hearts -= 1;
    player.invulnerable = TUNING.invulnerableTime * (this.assist ? ASSIST.invulnerableScale : 1);
    player.charging = false;
    player.charge = 0;
    player.vx = direction * TUNING.knockbackX;
    player.vy = TUNING.knockbackY;
    this.chain = 0;
    this.chainTimer = 0;

    this.events.shake(10);
    this.events.flash(0.7, "paper");
    this.events.sound("hurt");
    this.events.burst(player.x, player.y - 40, "coral", 14, 220, "droplet");
    this.events.push("hurt", { hearts: player.hearts, fell });

    if (fell) this.respawnPlayer();
    if (player.hearts <= 0) {
      this.status = "gameOver";
      this.events.push("gameOver", { elapsed: this.elapsed });
    } else {
      this.events.say(`${player.hearts} ${player.hearts === 1 ? "heart" : "hearts"} left.`);
    }
  }

  respawnPlayer() {
    const player = this.player;
    player.x = player.checkpointX;
    player.y = player.checkpointY - 2;
    player.previousBottom = player.y;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    player.groundMoverId = null;
  }

  // ------------------------------------------------------------ geometry

  #playerWidth() {
    const player = this.player;
    return player.baseW * (1 + player.charge * 0.42 + player.landPulse * 0.1);
  }

  #playerHeight() {
    const player = this.player;
    if (player.charging) return player.baseH * (1 - player.charge * 0.38);
    const airStretch = player.grounded ? 0 : clamp(-player.vy / 1200, -0.13, 0.19);
    return player.baseH * (1 + airStretch - player.landPulse * 0.16);
  }

  /** Public for the renderer, which needs the same squash-and-stretch box. */
  playerBox() {
    return { width: this.#playerWidth(), height: this.#playerHeight() };
  }

  #updateCamera(dt) {
    const target = clamp(
      this.player.x - WORLD.width * TUNING.cameraLead,
      0,
      Math.max(0, this.level.width - WORLD.width)
    );
    this.cameraX += (target - this.cameraX) * Math.min(1, dt * TUNING.cameraEase);
  }

  /** One-line description of what the player should be doing right now. */
  objectiveCopy() {
    const level = this.level;
    if (level.boss) {
      return level.bossEntity?.state === "exposed"
        ? "The eye is open. Spring onto it now."
        : level.objective;
    }
    if (this.goalComplete) return "The coral beacon is open";
    if (level.rescueGoal) {
      return `${level.rescued} / ${level.rescueGoal} locks · ${level.collected} / ${level.seedGoal} seeds`;
    }
    return `${level.collected} / ${level.seedGoal} Echo Seeds`;
  }
}
