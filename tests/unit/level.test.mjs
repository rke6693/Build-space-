import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WORLD } from "../../src/core/constants.js";
import { LEVEL_DEFS } from "../../src/data/levels.js";
import { createLevel, isGoalComplete, moverAt, solidSurfaces } from "../../src/game/level.js";

describe("level data", () => {
  it("gives every act enough seeds to satisfy its goal", () => {
    for (const def of LEVEL_DEFS) {
      assert.ok(
        def.seeds.length >= def.seedGoal,
        `${def.id} asks for ${def.seedGoal} seeds but places ${def.seeds.length}`
      );
    }
  });

  it("gives every act enough cages to satisfy its rescue goal", () => {
    for (const def of LEVEL_DEFS) {
      assert.equal(
        (def.cages ?? []).length,
        def.rescueGoal,
        `${def.id} rescue goal and cage count disagree`
      );
    }
  });

  it("keeps every entity inside the level bounds", () => {
    for (const def of LEVEL_DEFS) {
      const points = [
        ...def.seeds.map(([x]) => x),
        ...def.enemies.map(([x]) => x),
        ...(def.cages ?? []).map(([x]) => x),
        ...(def.springs ?? []).map(([x]) => x),
        ...def.checkpoints
      ];
      for (const x of points) {
        assert.ok(x >= 0 && x <= def.width, `${def.id} has an entity at x=${x}, outside 0..${def.width}`);
      }
    }
  });

  it("starts the player on solid ground, never inside a hazard", () => {
    for (const def of LEVEL_DEFS) {
      for (const [x, width] of def.hazards) {
        assert.ok(
          def.spawnX < x - 60 || def.spawnX > x + width + 60,
          `${def.id} spawns the player on a hazard`
        );
      }
    }
  });

  it("only ever declares one boss act", () => {
    assert.equal(LEVEL_DEFS.filter((def) => def.boss).length, 1);
  });

  /**
   * Ground furniture has to stay separable. A Bloomspring inside a thorn
   * patch or under a patrol route is unplayable, and an amber lock a Needler
   * walks through reads as a rendering bug.
   */
  it("keeps ground furniture from overlapping", () => {
    const span = (centre, width) => [centre - width / 2, centre + width / 2];
    const clashes = (a, b) => a[0] < b[1] && b[0] < a[1];

    for (const def of LEVEL_DEFS) {
      const springs = (def.springs ?? []).map(([x]) => span(x, 92));
      const cages = (def.cages ?? []).map(([x]) => span(x, 92));
      const hazards = def.hazards.map(([x, width]) => [x, x + width]);
      // Patrols sweep their whole range, so the footprint is range plus body.
      const patrols = def.enemies.map(([, , minX, maxX]) => [minX - 34, maxX + 34]);

      for (const [name, a, b] of [
        ["spring/hazard", springs, hazards],
        ["spring/patrol", springs, patrols],
        ["spring/cage", springs, cages],
        ["cage/hazard", cages, hazards],
        ["cage/patrol", cages, patrols]
      ]) {
        for (const first of a) {
          for (const second of b) {
            assert.ok(
              !clashes(first, second),
              `${def.id}: ${name} overlap at ${first} vs ${second}`
            );
          }
        }
      }
    }
  });
});

describe("createLevel", () => {
  it("inflates tuples into independent mutable entities", () => {
    const a = createLevel(0);
    const b = createLevel(0);
    a.seeds[0].collected = true;
    assert.equal(b.seeds[0].collected, false, "levels must not share entity objects");
  });

  it("only builds a boss for the boss act", () => {
    assert.equal(createLevel(0).bossEntity, null);
    assert.equal(createLevel(1).bossEntity, null);
    assert.equal(createLevel(2).bossEntity?.maxHp, 6);
  });

  it("clamps an out-of-range act index instead of throwing", () => {
    assert.equal(createLevel(99).id, LEVEL_DEFS.at(-1).id);
    assert.equal(createLevel(-4).id, LEVEL_DEFS[0].id);
  });

  it("counts a goal complete only once seeds and rescues are both met", () => {
    const level = createLevel(1);
    level.collected = level.seedGoal;
    assert.equal(isGoalComplete(level), false, "locks still outstanding");
    level.rescued = level.rescueGoal;
    assert.equal(isGoalComplete(level), true);
  });

  it("always exposes the ground as a surface, plus every platform and mover", () => {
    const level = createLevel(0);
    const surfaces = solidSurfaces(level);
    assert.equal(surfaces.length, 1 + level.platforms.length + level.movers.length);
    assert.equal(surfaces[0].y, WORLD.ground);
    assert.equal(surfaces[0].left, -Infinity);
  });
});

describe("movers", () => {
  it("stays inside its declared travel range", () => {
    const [mover] = createLevel(0).movers;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 40; t += 0.02) {
      const { x } = moverAt(mover, t);
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    assert.ok(min >= mover.originX - mover.range / 2 - 0.001);
    assert.ok(max <= mover.originX + mover.range / 2 + 0.001);
  });

  it("is a pure function of the clock, so it survives a pause", () => {
    const [mover] = createLevel(0).movers;
    assert.deepEqual(moverAt(mover, 3.5), moverAt(mover, 3.5));
  });

  it("moves on the axis it declares and holds the other one still", () => {
    const level = createLevel(0);
    const horizontal = level.movers.find((mover) => mover.axis === "x");
    const vertical = level.movers.find((mover) => mover.axis === "y");
    assert.equal(moverAt(horizontal, 1.7).y, horizontal.originY);
    assert.equal(moverAt(vertical, 1.7).x, vertical.originX);
  });
});
