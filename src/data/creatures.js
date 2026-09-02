/** Field-note entries. `id` doubles as the unlock key stored in the save. */
export const CREATURES = Object.freeze([
  {
    id: "gloob",
    mark: "G",
    tone: "pear",
    name: "Gloob",
    kind: "Elastic lumpling",
    note: "Stores pressure in a soft middle, then gives all of it back. Surprisingly decisive for someone with no bones."
  },
  {
    id: "mote",
    mark: "•",
    tone: "cyan",
    name: "Mote",
    kind: "Memory light",
    note: "A marsh-light carrying a tiny piece of Lumenfen’s old song. Speaks quickly when worried, which is most of the time."
  },
  {
    id: "needler",
    mark: "N",
    tone: "mint",
    name: "Needler",
    kind: "Bramble puff",
    note: "Not cruel. Just overinflated and unable to see past its own thorns. A careful landing lets the air out."
  },
  {
    id: "drifter",
    mark: "D",
    tone: "cyan",
    name: "Drifter",
    kind: "Spore balloon",
    note: "Rides the warm air off the vents and forgets to look down. Landing on one pops a pocket of lift that Gloob can borrow."
  },
  {
    id: "plink",
    mark: "P",
    tone: "cyan",
    name: "Plink",
    kind: "Puddle singer",
    note: "Keeps rhythm by tapping the water with its feet. The Press locked three of them away because rhythm makes shapes wander."
  },
  {
    id: "bloomspring",
    mark: "↑",
    tone: "mint",
    name: "Bloomspring",
    kind: "Coiled flower",
    note: "Spent a century compressed under a fallen shelf. It has been waiting to give that back to somebody light enough to enjoy it."
  },
  {
    id: "mossmellow",
    mark: "M",
    tone: "pear",
    name: "Mossmellow",
    kind: "Root sleeper",
    note: "Sleeps through storms and wakes for good soil. Its moss records every place it has rested."
  },
  {
    id: "press",
    mark: "▰",
    tone: "coral",
    name: "The Press",
    kind: "Compression automaton",
    note: "Built to preserve delicate life by giving it one permanent shape. It forgot that living things survive by changing."
  }
]);

/** Unlocked from the first frame — Gloob and Mote are the framing device. */
export const STARTING_UNLOCKS = Object.freeze(["gloob", "mote"]);

export const CREATURE_IDS = Object.freeze(CREATURES.map((creature) => creature.id));

export function findCreature(id) {
  return CREATURES.find((creature) => creature.id === id) ?? null;
}
