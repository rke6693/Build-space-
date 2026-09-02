import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASSIST, HEARTS, STEP, TUNING, WORLD } from "../../src/core/constants.js";
import { Simulation } from "../../src/game/simulation.js";

const IDLE = { left: false, right: false, squish: false };

/** Advances the simulation by wall-clock seconds at the fixed step. */
function run(sim, seconds, input = IDLE) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) sim.step(STEP, input);
  return sim;
}

/** Advances until `predicate` holds, or fails after `seconds`. */
function runUntil(sim, predicate, { seconds = 6, input = IDLE, message = "condition" } = {}) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (predicate(sim)) return sim;
    sim.step(STEP, input);
  }
  assert.ok(predicate(sim), `timed out waiting for ${message}`);
  return sim;
}

function drainTypes(sim) {
  return sim.events.drain().map((event) => event.type);
}

describe("player movement", () => {
  it("starts grounded and stays there without input", () => {
    const sim = new Simulation();
    run(sim, 1);
    assert.equal(sim.player.grounded, true);
    assert.equal(sim.player.y, WORLD.ground);
  });

  it("accelerates right and never exceeds the run cap", () => {
    const sim = new Simulation();
    const startX = sim.player.x;
    run(sim, 2, { left: false, right: true, squish: false });
    assert.ok(sim.player.x > startX + 100, "player should have travelled right");
    assert.ok(sim.player.vx <= TUNING.maxRunSpeed + 0.001);
    assert.equal(sim.player.facing, 1);
  });

  it("cannot leave the level through either wall", () => {
    const sim = new Simulation();
    run(sim, 6, { left: true, right: false, squish: false });
    assert.ok(sim.player.x >= 42);
    sim.player.x = sim.level.width - 50;
    run(sim, 6, { left: false, right: true, squish: false });
    assert.ok(sim.player.x <= sim.level.width - 42);
  });
});

describe("squish and spring", () => {
  it("fills the charge while held and launches on release", () => {
    const sim = new Simulation();
    const held = { left: false, right: false, squish: true };
    run(sim, TUNING.chargeTime + 0.1, held);
    assert.equal(sim.player.charging, true);
    assert.ok(sim.player.charge > 0.99, `charge was ${sim.player.charge}`);

    sim.step(STEP, IDLE);
    assert.equal(sim.player.charging, false);
    assert.equal(sim.player.grounded, false);
    assert.ok(sim.player.vy < -(TUNING.launchBase + TUNING.launchRange * 0.9));
  });

  it("gives a minimum hop for an instant tap", () => {
    const sim = new Simulation();
    sim.step(STEP, { left: false, right: false, squish: true });
    sim.step(STEP, IDLE);
    assert.ok(sim.player.vy < -TUNING.launchBase, "a tap should still leave the ground");
    assert.ok(sim.player.vy > -(TUNING.launchBase + TUNING.launchRange * 0.5));
  });

  it("carries a squish held through a landing into a new charge", () => {
    const sim = new Simulation();
    const held = { left: false, right: false, squish: true };
    run(sim, TUNING.chargeTime + 0.05, held);
    sim.step(STEP, IDLE);
    assert.equal(sim.player.grounded, false);

    // Re-press mid-air: the charge must be buffered, not dropped.
    sim.step(STEP, held);
    assert.equal(sim.player.charging, false, "no charging while airborne");
    assert.ok(sim.player.chargeBuffer > 0, "the press should be buffered");

    runUntil(sim, (s) => s.player.grounded, { input: held, message: "landing" });
    sim.step(STEP, held);
    assert.equal(sim.player.charging, true, "the buffered squish should fire on landing");
  });

  it("reaches a higher apex from a full charge than from a tap", () => {
    const apexFor = (holdSeconds) => {
      const sim = new Simulation();
      run(sim, holdSeconds, { left: false, right: false, squish: true });
      sim.step(STEP, IDLE);
      let apex = sim.player.y;
      runUntil(sim, (s) => {
        apex = Math.min(apex, s.player.y);
        return s.player.grounded && s.player.vy === 0 && apex < s.player.y;
      }, { message: "return to ground" });
      return apex;
    };
    assert.ok(apexFor(1.0) < apexFor(0.05) - 100, "a full charge must clear noticeably more height");
  });
});

describe("hazards and health", () => {
  it("loses a heart on side contact and grants mercy frames", () => {
    const sim = new Simulation();
    const enemy = sim.level.enemies[0];
    sim.player.x = enemy.x;
    sim.step(STEP, IDLE);
    assert.equal(sim.player.hearts, HEARTS - 1);
    assert.ok(sim.player.invulnerable > 0);

    // A second contact inside the mercy window must not stack.
    sim.step(STEP, IDLE);
    assert.equal(sim.player.hearts, HEARTS - 1);
  });

  it("ends the run when the last heart goes", () => {
    const sim = new Simulation();
    for (let i = 0; i < HEARTS; i += 1) {
      sim.player.invulnerable = 0;
      sim.damagePlayer(1);
    }
    assert.equal(sim.player.hearts, 0);
    assert.equal(sim.status, "gameOver");
    assert.ok(drainTypes(sim).includes("gameOver"));
  });

  it("stops simulating once the run is over", () => {
    const sim = new Simulation();
    sim.status = "gameOver";
    const before = { ...sim.player };
    run(sim, 1, { left: false, right: true, squish: true });
    assert.equal(sim.player.x, before.x);
    assert.equal(sim.elapsed, 0);
  });

  it("returns the player to the last checkpoint after a fall", () => {
    const sim = new Simulation();
    sim.player.checkpointX = 1450;
    sim.player.x = 1450;
    sim.player.y = TUNING.fallLimit + 10;
    sim.step(STEP, IDLE);
    assert.equal(sim.player.x, 1450);
    assert.ok(sim.player.y < WORLD.ground + 1);
    assert.equal(sim.player.hearts, HEARTS - 1);
  });

  it("advances the checkpoint forward only", () => {
    const sim = new Simulation();
    sim.player.x = 2800;
    sim.step(STEP, IDLE);
    assert.equal(sim.player.checkpointX, 2780);
    sim.player.x = 200;
    sim.step(STEP, IDLE);
    assert.equal(sim.player.checkpointX, 2780, "walking back must not move the checkpoint");
  });

  it("hurts the player standing in a thorn patch", () => {
    const sim = new Simulation();
    const [hazard] = sim.level.hazards;
    sim.player.x = hazard.x + hazard.w / 2;
    sim.step(STEP, IDLE);
    assert.equal(sim.player.hearts, HEARTS - 1);
  });
});

describe("enemies", () => {
  it("deflates a Needler landed on from above and bounces the player", () => {
    const sim = new Simulation();
    const enemy = sim.level.enemies[0];
    sim.player.x = enemy.x;
    sim.player.y = enemy.y - enemy.h - 20;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 200;
    sim.player.grounded = false;

    runUntil(sim, (s) => s.level.enemies[0].defeated, { seconds: 1, message: "the stomp" });
    assert.equal(enemy.defeated, true);
    assert.ok(sim.player.vy < 0, "the player should bounce off");
    assert.equal(sim.totals.squishes, 1);
  });

  it("pops a Drifter with more lift than a Needler gives", () => {
    const liftFrom = (list) => {
      const sim = new Simulation();
      const target = sim.level[list][0];
      sim.player.x = target.x;
      sim.player.y = target.y - target.h - 20;
      sim.player.previousBottom = sim.player.y;
      sim.player.vy = 200;
      sim.player.grounded = false;
      sim.player.lastLaunchCharge = 0;
      runUntil(sim, (s) => s.level[list][0].defeated, { seconds: 1, message: `${list} stomp` });
      return sim.player.vy;
    };
    assert.ok(liftFrom("drifters") < liftFrom("enemies"), "drifters should launch the player higher");
  });

  it("unlocks the field note when a creature comes into view", () => {
    const sim = new Simulation();
    sim.player.x = sim.level.enemies[0].x - 300;
    sim.step(STEP, IDLE);
    const unlocks = sim.events.drain().filter((event) => event.type === "unlock").map((event) => event.id);
    assert.ok(unlocks.includes("needler"));
  });
});

describe("cages", () => {
  it("needs a real impact to break an amber lock", () => {
    const sim = new Simulation({});
    sim.loadLevel(1);
    sim.events.drain();
    const cage = sim.level.cages[0];

    // A gentle landing rests on the cage without opening it.
    sim.player.x = cage.x;
    sim.player.y = cage.y - cage.h - 6;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 120;
    sim.player.lastLaunchCharge = 0;
    sim.player.grounded = false;
    run(sim, 0.2);
    assert.equal(cage.rescued, false, "a soft landing should not break the lock");

    // A charged slam does.
    sim.player.y = cage.y - cage.h - 40;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 600;
    sim.player.grounded = false;
    runUntil(sim, (s) => s.level.cages[0].rescued, { seconds: 1, message: "the lock breaking" });
    assert.equal(cage.rescued, true);
    assert.equal(sim.level.rescued, 1);
    assert.equal(sim.totals.rescues, 1);
  });
});

describe("seeds and echo chains", () => {
  it("collects a seed and starts a chain", () => {
    const sim = new Simulation();
    const seed = sim.level.seeds[0];
    sim.player.x = seed.x;
    sim.player.y = seed.y + 20;
    sim.step(STEP, IDLE);
    assert.equal(seed.collected, true);
    assert.equal(sim.level.collected, 1);
    assert.equal(sim.chain, 1);
  });

  it("grows the chain for quick pickups and drops it after the window", () => {
    const sim = new Simulation();
    const [first, second] = sim.level.seeds;
    sim.player.x = first.x;
    sim.player.y = first.y + 20;
    sim.step(STEP, IDLE);
    sim.player.x = second.x;
    sim.player.y = second.y + 20;
    sim.step(STEP, IDLE);
    assert.equal(sim.chain, 2);
    assert.equal(sim.bestChain, 2);

    run(sim, TUNING.chainWindow + 0.2);
    assert.equal(sim.chain, 0, "the chain should lapse");
    assert.equal(sim.bestChain, 2, "the best is kept");
  });

  it("resets the chain when the player is hurt", () => {
    const sim = new Simulation();
    const seed = sim.level.seeds[0];
    sim.player.x = seed.x;
    sim.player.y = seed.y + 20;
    sim.step(STEP, IDLE);
    assert.equal(sim.chain, 1);
    sim.damagePlayer(1);
    assert.equal(sim.chain, 0);
  });
});

describe("act flow", () => {
  it("reminds the player at a locked beacon and completes once the goal is met", () => {
    const sim = new Simulation();
    sim.player.x = sim.level.exit.x;
    sim.step(STEP, IDLE);
    assert.ok(drainTypes(sim).includes("objectiveReminder"));
    assert.equal(sim.status, "running");

    sim.level.collected = sim.level.seedGoal;
    sim.step(STEP, IDLE);
    assert.equal(sim.status, "levelComplete");
    const complete = sim.events.drain().find((event) => event.type === "levelComplete");
    assert.equal(complete.index, 0);
    assert.ok(complete.actElapsed > 0);
  });

  it("does not open the Root Vault beacon on seeds alone", () => {
    const sim = new Simulation();
    sim.loadLevel(1);
    sim.level.collected = sim.level.seedGoal;
    sim.player.x = sim.level.exit.x;
    run(sim, 0.1);
    assert.equal(sim.status, "running", "the locks still have to be broken");
    sim.level.rescued = sim.level.rescueGoal;
    sim.step(STEP, IDLE);
    assert.equal(sim.status, "levelComplete");
  });

  it("announces a fresh level and hands the boss note over on act three", () => {
    const sim = new Simulation();
    sim.events.drain();
    sim.loadLevel(2);
    const events = sim.events.drain();
    assert.ok(events.some((event) => event.type === "levelReady"));
    assert.ok(events.some((event) => event.type === "unlock" && event.id === "press"));
  });
});

describe("the Press", () => {
  function reachSlam(sim) {
    runUntil(sim, (s) => s.level.bossEntity.state === "exposed", { seconds: 8, message: "the first slam" });
  }

  it("cycles idle → windup → exposed and throws shockwaves", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    assert.equal(sim.boss.state, "idle");
    reachSlam(sim);
    assert.equal(sim.boss.exposed, true);
    assert.equal(sim.shockwaves.length, 2, "phase one throws one wave each way");
  });

  it("only accepts one hit per opening", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    reachSlam(sim);
    sim.hitBoss();
    assert.equal(sim.boss.hp, 5);
    sim.hitBoss();
    assert.equal(sim.boss.hp, 5, "the eye closes after a hit");
  });

  it("escalates to phase two at half health and adds delayed waves", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    for (let i = 0; i < 3; i += 1) {
      sim.boss.exposed = true;
      sim.boss.hitThisOpening = false;
      sim.hitBoss();
    }
    assert.equal(sim.boss.hp, 3);
    assert.equal(sim.boss.phase, 2);
    assert.ok(sim.events.drain().some((event) => event.type === "bossPhase"));

    sim.shockwaves = [];
    sim.rubble = [];
    reachSlam(sim);
    assert.equal(sim.shockwaves.length, 4, "phase two doubles up");
    assert.equal(sim.rubble.length, 3, "phase two drops rubble");
    assert.ok(sim.shockwaves.some((wave) => wave.delay > 0), "the second pair is delayed");
  });

  it("takes a hit when the player actually lands on the open eye", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    reachSlam(sim);
    const boss = sim.boss;

    // Drop Gloob onto the platen from above, through the real collision path.
    sim.player.x = boss.x;
    sim.player.y = boss.y - boss.h * 0.74 - 30;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 150;
    sim.player.grounded = false;
    sim.player.invulnerable = 0;

    runUntil(sim, (s) => s.boss.hp === 5, { seconds: 1, message: "the stomp landing" });
    assert.equal(boss.hp, 5);
    assert.ok(sim.player.vy < 0, "a successful strike bounces the player clear");
    assert.equal(sim.player.hearts, HEARTS, "striking the eye must not also hurt");
  });

  it("hurts a player who lands on the Press while its eye is shut", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    const boss = sim.boss;
    assert.equal(boss.exposed, false);

    sim.player.x = boss.x;
    sim.player.y = boss.y - boss.h * 0.74 - 30;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 150;
    sim.player.grounded = false;

    runUntil(sim, (s) => s.player.hearts < HEARTS, { seconds: 1, message: "the rebuff" });
    assert.equal(boss.hp, boss.maxHp, "a closed eye takes no damage");
  });

  it("hurts the player who stands in a shockwave", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    reachSlam(sim);
    sim.player.x = sim.shockwaves[0].x;
    sim.player.y = WORLD.ground;
    sim.player.invulnerable = 0;
    sim.step(STEP, IDLE);
    assert.equal(sim.player.hearts, HEARTS - 1);
  });

  it("wins the game a beat after the last seal breaks", () => {
    const sim = new Simulation();
    sim.loadLevel(2);
    for (let i = 0; i < 6; i += 1) {
      sim.boss.exposed = true;
      sim.boss.hitThisOpening = false;
      sim.hitBoss();
    }
    assert.equal(sim.boss.defeated, true);
    assert.equal(sim.shockwaves.length, 0, "the arena is cleared on defeat");
    assert.equal(sim.status, "running", "there is a beat before the epilogue");

    runUntil(sim, (s) => s.status === "victory", { seconds: 3, message: "the victory" });
    assert.equal(sim.status, "victory");
  });
});

describe("movers and springs", () => {
  it("carries a player standing on a moving shelf", () => {
    const sim = new Simulation();
    const mover = sim.level.movers.find((entry) => entry.axis === "x");
    sim.player.x = mover.originX + mover.w / 2;
    sim.player.y = mover.originY - 30;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 120;
    sim.player.grounded = false;

    runUntil(sim, (s) => s.player.groundMoverId === mover.id, { seconds: 1, message: "landing on the mover" });
    const offset = sim.player.x - mover.x;
    run(sim, 0.5);
    assert.equal(sim.player.groundMoverId, mover.id, "the player should still be riding");
    assert.ok(Math.abs(sim.player.x - mover.x - offset) < 1.5, "the offset on the shelf should hold");
  });

  it("launches the player off a Bloomspring without any charge", () => {
    const sim = new Simulation();
    const [spring] = sim.level.springs;
    sim.player.x = spring.x;
    sim.player.y = WORLD.ground - 40;
    sim.player.previousBottom = sim.player.y;
    sim.player.vy = 100;
    sim.player.grounded = false;

    runUntil(sim, (s) => s.player.vy < -600, { seconds: 1, message: "the spring launch" });
    assert.ok(sim.player.vy < -600);
    assert.equal(sim.player.grounded, false);
    assert.ok(sim.events.drain().some((event) => event.type === "unlock" && event.id === "bloomspring"));
  });
});

describe("assist mode", () => {
  it("adds hearts and charges faster", () => {
    const assisted = new Simulation({ assist: true });
    assert.equal(assisted.player.hearts, ASSIST.hearts);

    const held = { left: false, right: false, squish: true };
    run(assisted, TUNING.chargeTime * ASSIST.chargeTimeScale + 0.02, held);
    assert.ok(assisted.player.charge > 0.99, `assisted charge was ${assisted.player.charge}`);

    const normal = new Simulation();
    run(normal, TUNING.chargeTime * ASSIST.chargeTimeScale + 0.02, held);
    assert.ok(normal.player.charge < 0.9, "standard mode should still be charging");
  });

  it("slows the Press down", () => {
    const timeToSlam = (assist) => {
      const sim = new Simulation({ assist });
      sim.loadLevel(2);
      let seconds = 0;
      while (sim.boss.state !== "exposed" && seconds < 12) {
        sim.step(STEP, IDLE);
        seconds += STEP;
      }
      return seconds;
    };
    assert.ok(timeToSlam(true) > timeToSlam(false));
  });
});

describe("determinism", () => {
  it("produces identical state for identical input", () => {
    const script = [
      [1.2, { left: false, right: true, squish: false }],
      [0.9, { left: false, right: true, squish: true }],
      [1.5, { left: false, right: false, squish: false }],
      [0.7, { left: true, right: false, squish: false }]
    ];
    const play = () => {
      const sim = new Simulation({ seed: 7 });
      for (const [seconds, input] of script) run(sim, seconds, input);
      return { x: sim.player.x, y: sim.player.y, vx: sim.player.vx, seeds: sim.totals.seeds };
    };
    assert.deepEqual(play(), play());
  });
});
