import { world, system, EquipmentSlot, ItemStack, Direction } from "@minecraft/server";

// ── Helpers ───────────────────────────────────────────────────────────

function setBlock(dim, x, y, z, blockId) {
  try {
    const block = dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    if (block) block.setType(blockId);
  } catch (_) {}
}

function fill(dim, x1, y1, z1, x2, y2, z2, blockId) {
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      for (let z = z1; z <= z2; z++)
        setBlock(dim, x, y, z, blockId);
}

function sparkle(dim, cx, cy, cz) {
  try {
    dim.spawnParticle("minecraft:totem_particle", { x: cx + 0.5, y: cy + 1, z: cz + 0.5 });
    dim.spawnParticle("minecraft:totem_particle", { x: cx + 2, y: cy + 2, z: cz });
    dim.spawnParticle("minecraft:totem_particle", { x: cx - 1, y: cy + 3, z: cz + 1 });
  } catch (_) {}
}

function playSound(dim, loc) {
  try { dim.playSound("random.levelup", loc); } catch (_) {}
}

// ── Cooldown tracker ──────────────────────────────────────────────────

const cooldowns = new Map();

function isReady(playerId, wandType, seconds) {
  const key = `${playerId}_${wandType}`;
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < seconds * 1000) return false;
  cooldowns.set(key, now);
  return true;
}

// ── Structure builders ────────────────────────────────────────────────

function buildFairyCottage(dim, bx, by, bz) {
  const stem = "dh:fairy_stem";
  const cap  = "dh:fairy_mushroom_red";
  const cap2 = "dh:fairy_mushroom_purple";
  const floor = "dh:fairy_toadstool";
  const glass = "dh:fairy_glass";
  const glow = "dh:fairy_glow_flower";
  const door = "minecraft:oak_door";

  // Floor
  fill(dim, bx-3, by, bz-3, bx+3, by, bz+3, floor);
  // Walls (hollow box)
  for (let wx = -3; wx <= 3; wx++) {
    for (let wz = -3; wz <= 3; wz++) {
      if (Math.abs(wx) === 3 || Math.abs(wz) === 3) {
        for (let wy = 1; wy <= 4; wy++) setBlock(dim, bx+wx, by+wy, bz+wz, stem);
      }
    }
  }
  // Hollow inside
  fill(dim, bx-2, by+1, bz-2, bx+2, by+4, bz+2, "minecraft:air");
  // Windows
  setBlock(dim, bx+3, by+2, bz, glass);
  setBlock(dim, bx-3, by+2, bz, glass);
  setBlock(dim, bx, by+2, bz+3, glass);
  // Door opening
  setBlock(dim, bx, by+1, bz-3, "minecraft:air");
  setBlock(dim, bx, by+2, bz-3, "minecraft:air");
  // Mushroom cap roof
  fill(dim, bx-4, by+5, bz-4, bx+4, by+5, bz+4, cap);
  fill(dim, bx-3, by+6, bz-3, bx+3, by+6, bz+3, cap);
  fill(dim, bx-2, by+7, bz-2, bx+2, by+7, bz+2, cap2);
  fill(dim, bx-1, by+8, bz-1, bx+1, by+8, bz+1, cap2);
  // Interior light
  setBlock(dim, bx, by+4, bz, glow);
  // Bed
  setBlock(dim, bx+2, by+1, bz+2, "dh:bed_pink");
  // Lamp
  setBlock(dim, bx-2, by+1, bz+2, "dh:lamp");
}

function buildCandyCastle(dim, bx, by, bz) {
  const wall = "dh:candy_peppermint_red";
  const wall2 = "dh:candy_peppermint_green";
  const floor = "dh:candy_chocolate";
  const roof = "dh:candy_cotton_pink";
  const trim = "dh:candy_frosting";
  const glass = "dh:candy_sugar_glass";
  const brick = "dh:candy_gingerbread";

  // Foundation
  fill(dim, bx-4, by, bz-4, bx+4, by, bz+4, floor);
  // Main walls
  for (let wx = -4; wx <= 4; wx++) {
    for (let wz = -4; wz <= 4; wz++) {
      if (Math.abs(wx) === 4 || Math.abs(wz) === 4) {
        for (let wy = 1; wy <= 5; wy++) setBlock(dim, bx+wx, by+wy, bz+wz, wall);
      }
    }
  }
  fill(dim, bx-3, by+1, bz-3, bx+3, by+5, bz+3, "minecraft:air");
  // Frosting trim at top
  for (let wx = -4; wx <= 4; wx++) {
    setBlock(dim, bx+wx, by+6, bz-4, trim);
    setBlock(dim, bx+wx, by+6, bz+4, trim);
  }
  for (let wz = -4; wz <= 4; wz++) {
    setBlock(dim, bx-4, by+6, bz+wz, trim);
    setBlock(dim, bx+4, by+6, bz+wz, trim);
  }
  // Roof
  fill(dim, bx-3, by+7, bz-3, bx+3, by+7, bz+3, roof);
  fill(dim, bx-2, by+8, bz-2, bx+2, by+8, bz+2, roof);
  fill(dim, bx-1, by+9, bz-1, bx+1, by+9, bz+1, roof);
  // Towers (corners)
  for (let corner of [[-4,-4],[4,-4],[-4,4],[4,4]]) {
    const cx = bx + corner[0], cz = bz + corner[1];
    for (let ty = 6; ty <= 9; ty++) setBlock(dim, cx, by+ty, cz, wall2);
    setBlock(dim, cx, by+10, cz, trim);
  }
  // Windows
  setBlock(dim, bx, by+3, bz-4, glass);
  setBlock(dim, bx, by+3, bz+4, glass);
  setBlock(dim, bx+4, by+3, bz, glass);
  setBlock(dim, bx-4, by+3, bz, glass);
  // Door
  setBlock(dim, bx, by+1, bz-4, "minecraft:air");
  setBlock(dim, bx, by+2, bz-4, "minecraft:air");
  // Interior
  fill(dim, bx-3, by, bz-3, bx+3, by, bz+3, floor);
  setBlock(dim, bx, by+1, bz, "dh:dining_table");
}

function buildCozyCabin(dim, bx, by, bz) {
  const wall = "dh:cozy_plank_pink";
  const wall2 = "dh:cozy_plank_blue";
  const floor = "dh:cozy_checker";
  const roof = "dh:cozy_plank_mint";
  const glass = "dh:cozy_rainbow_glass";
  const carpet = "dh:cozy_carpet_pink";

  fill(dim, bx-3, by, bz-3, bx+3, by, bz+3, floor);
  for (let wx = -3; wx <= 3; wx++) {
    for (let wz = -3; wz <= 3; wz++) {
      if (Math.abs(wx) === 3 || Math.abs(wz) === 3) {
        const w = (wx + wz) % 2 === 0 ? wall : wall2;
        for (let wy = 1; wy <= 4; wy++) setBlock(dim, bx+wx, by+wy, bz+wz, w);
      }
    }
  }
  fill(dim, bx-2, by+1, bz-2, bx+2, by+4, bz+2, "minecraft:air");
  // Peaked roof
  fill(dim, bx-4, by+5, bz-4, bx+4, by+5, bz+4, roof);
  fill(dim, bx-3, by+6, bz-3, bx+3, by+6, bz+3, roof);
  fill(dim, bx-2, by+7, bz-2, bx+2, by+7, bz+2, roof);
  // Windows
  setBlock(dim, bx+3, by+2, bz, glass);
  setBlock(dim, bx-3, by+2, bz, glass);
  // Door
  setBlock(dim, bx, by+1, bz-3, "minecraft:air");
  setBlock(dim, bx, by+2, bz-3, "minecraft:air");
  // Interior furniture
  setBlock(dim, bx+2, by+1, bz+2, "dh:bed_blue");
  setBlock(dim, bx-2, by+1, bz+2, "dh:lamp");
  setBlock(dim, bx, by+1, bz, "dh:coffee_table");
  // Chimney
  for (let cy = 5; cy <= 9; cy++) setBlock(dim, bx+3, by+cy, bz+3, "minecraft:bricks");
}

function buildTreehouse(dim, bx, by, bz) {
  const log = "minecraft:oak_log";
  const leaves = "dh:fairy_leaf_roof";
  const plank = "dh:cozy_plank_green";
  const glass = "dh:fairy_glass";
  const bark = "dh:fairy_bark";

  // Trunk
  for (let ty = 0; ty <= 10; ty++) setBlock(dim, bx, by+ty, bz, log);
  // Branches at the top
  for (let boff of [[-2,8],[-1,9],[1,9],[2,8]]) {
    setBlock(dim, bx+boff[0], by+boff[1], bz, log);
    setBlock(dim, bx, by+boff[1], bz+boff[0], log);
  }
  // Canopy
  fill(dim, bx-4, by+10, bz-4, bx+4, by+10, bz+4, leaves);
  fill(dim, bx-3, by+11, bz-3, bx+3, by+11, bz+3, leaves);
  fill(dim, bx-2, by+12, bz-2, bx+2, by+12, bz+2, leaves);
  // Platform
  fill(dim, bx-3, by+7, bz-3, bx+3, by+7, bz+3, plank);
  // Walls (half walls)
  for (let wx = -3; wx <= 3; wx++) {
    for (let wz = -3; wz <= 3; wz++) {
      if (Math.abs(wx) === 3 || Math.abs(wz) === 3) {
        setBlock(dim, bx+wx, by+8, bz+wz, bark);
        setBlock(dim, bx+wx, by+9, bz+wz, bark);
      }
    }
  }
  fill(dim, bx-2, by+8, bz-2, bx+2, by+9, bz+2, "minecraft:air");
  // Windows
  setBlock(dim, bx+3, by+8, bz, glass);
  setBlock(dim, bx-3, by+8, bz, glass);
  // Ladder
  for (let ly = 1; ly <= 7; ly++) setBlock(dim, bx+1, by+ly, bz-3, "minecraft:ladder");
  // Interior
  setBlock(dim, bx-2, by+8, bz+2, "dh:lamp");
}

function buildRainbowTent(dim, bx, by, bz) {
  const colors = [
    "dh:candy_gumdrop_red",
    "dh:cozy_plank_yellow",
    "dh:candy_gumdrop_green",
    "dh:cozy_plank_blue",
    "dh:cozy_plank_purple",
    "dh:cozy_plank_pink"
  ];
  const carpet = "dh:cozy_carpet_pink";

  // Floor
  fill(dim, bx-2, by, bz-2, bx+2, by, bz+2, carpet);
  // Tent walls — A-frame shape
  for (let row = 0; row < 4; row++) {
    const width = 3 - row;
    const c = colors[row % colors.length];
    for (let wz = -2; wz <= 2; wz++) {
      setBlock(dim, bx-width, by+row+1, bz+wz, c);
      setBlock(dim, bx+width, by+row+1, bz+wz, c);
    }
  }
  // Peak
  for (let wz = -2; wz <= 2; wz++) setBlock(dim, bx, by+5, bz+wz, colors[4]);
  // Open front
  setBlock(dim, bx, by+1, bz-2, "minecraft:air");
  setBlock(dim, bx, by+2, bz-2, "minecraft:air");
  // Interior
  setBlock(dim, bx, by+1, bz+1, "dh:lamp");
}

// ── Wand mapping ──────────────────────────────────────────────────────

const WAND_BUILDERS = {
  "dh:wand_fairy":   buildFairyCottage,
  "dh:wand_candy":   buildCandyCastle,
  "dh:wand_cozy":    buildCozyCabin,
  "dh:wand_tree":    buildTreehouse,
  "dh:wand_rainbow": buildRainbowTent,
};

const WAND_NAMES = {
  "dh:wand_fairy":   "Fairy Cottage Wand",
  "dh:wand_candy":   "Candy Castle Wand",
  "dh:wand_cozy":    "Cozy Cabin Wand",
  "dh:wand_tree":    "Treehouse Wand",
  "dh:wand_rainbow": "Rainbow Tent Wand",
};

// ── Event: use wand on a block ────────────────────────────────────────

world.beforeEvents.itemUseOn.subscribe((ev) => {
  const item = ev.itemStack;
  if (!item) return;
  const wandId = item.typeId;
  const builder = WAND_BUILDERS[wandId];
  if (!builder) return;

  const player = ev.source;
  ev.cancel = true;

  system.run(() => {
    if (!isReady(player.id, wandId, 8)) {
      player.sendMessage("§cThe wand is recharging... wait a moment!");
      return;
    }

    const block = ev.block;
    const bx = block.x;
    const by = block.y + 1;
    const bz = block.z;
    const dim = block.dimension;

    player.sendMessage(`§d✨ Building ${WAND_NAMES[wandId] || "structure"}... ✨`);
    sparkle(dim, bx, by, bz);
    playSound(dim, { x: bx, y: by, z: bz });

    try {
      builder(dim, bx, by, bz);
      player.sendMessage("§a🏠 Done! Your new home is ready!");
    } catch (e) {
      player.sendMessage("§cOops! Couldn't build here. Try a flatter spot!");
    }
  });
});

// ── Give wands via command ────────────────────────────────────────────

world.afterEvents.chatSend.subscribe((ev) => {
  if (ev.message === "!wands") {
    const player = ev.sender;
    system.run(() => {
      try {
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (!inv) return;
        for (const wandId of Object.keys(WAND_BUILDERS)) {
          const stack = new ItemStack(wandId, 1);
          inv.addItem(stack);
        }
        player.sendMessage("§d✨ You received all 5 magic wands! Tap a block to build!");
      } catch (_) {
        player.sendMessage("§cCouldn't give wands — try in creative mode.");
      }
    });
  }
  if (ev.message === "!pets") {
    const player = ev.sender;
    system.run(() => {
      try {
        const loc = player.location;
        const dim = player.dimension;
        dim.spawnEntity("dh:puppy", { x: loc.x + 2, y: loc.y, z: loc.z });
        dim.spawnEntity("dh:bunny", { x: loc.x - 2, y: loc.y, z: loc.z });
        player.sendMessage("§d🐾 Your pets have arrived!");
      } catch (_) {
        player.sendMessage("§cCouldn't spawn pets here.");
      }
    });
  }
});
