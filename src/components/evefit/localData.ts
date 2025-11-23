export type SlotType = "high" | "mid" | "low";

export type Hull = {
  id: string;
  name: string;
  class: string;
  description: string;
  highs: number;
  mids: number;
  lows: number;
  cpu: number;
  powergrid: number;
  shield: number;
  armor: number;
  hull: number;
  shieldResists: [number, number, number, number];
  armorResists: [number, number, number, number];
  hullResists: [number, number, number, number];
};

export type Module = {
  id: string;
  name: string;
  slot: SlotType;
  description: string;
  cpu: number;
  powergrid: number;
  dps?: number;
  dpsBonusPct?: number;
  ehpBonusPct?: number;
  shieldHpBonus?: number;
  armorHpBonus?: number;
  hullHpBonus?: number;
  shieldResistBonusPct?: number;
  armorResistBonusPct?: number;
  hullResistBonusPct?: number;
};

export type Fit = {
  hullId: string | null;
  highs: string[];
  mids: string[];
  lows: string[];
};

export type FitStats = {
  cpuUsed: number;
  cpuAvailable: number;
  powergridUsed: number;
  powergridAvailable: number;
  dps: number;
  effectiveHp: number;
  shieldHp: number;
  armorHp: number;
  hullHp: number;
  shieldResist: number;
  armorResist: number;
  hullResist: number;
  shieldEhp: number;
  armorEhp: number;
  hullEhp: number;
};

export const HULLS: Hull[] = [
  {
    id: "rifter",
    name: "Rifter",
    class: "Frigate",
    description: "Iconic Minmatar attack frigate. Agile and affordable brawler.",
    highs: 4,
    mids: 3,
    lows: 3,
    cpu: 210,
    powergrid: 38,
    shield: 450,
    armor: 400,
    hull: 450,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.25, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "kestrel",
    name: "Kestrel",
    class: "Frigate",
    description: "Caldari missile frigate with roomy mid slots for tackle and tank.",
    highs: 4,
    mids: 4,
    lows: 2,
    cpu: 230,
    powergrid: 35,
    shield: 520,
    armor: 330,
    hull: 400,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.25, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "caracal",
    name: "Caracal",
    class: "Cruiser",
    description: "Caldari missile platform with generous mid slots for tank.",
    highs: 5,
    mids: 5,
    lows: 4,
    cpu: 520,
    powergrid: 850,
    shield: 2200,
    armor: 1800,
    hull: 2000,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.25, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "omen",
    name: "Omen",
    class: "Cruiser",
    description: "Amarr laser cruiser with strong armor layout and damage bonuses.",
    highs: 5,
    mids: 3,
    lows: 6,
    cpu: 430,
    powergrid: 1150,
    shield: 1400,
    armor: 2400,
    hull: 2000,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.35, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "drake",
    name: "Drake",
    class: "Battlecruiser",
    description: "Battlecruiser known for thick shields and heavy missiles.",
    highs: 7,
    mids: 6,
    lows: 4,
    cpu: 650,
    powergrid: 1150,
    shield: 3200,
    armor: 2500,
    hull: 3000,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.25, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "hurricane",
    name: "Hurricane",
    class: "Battlecruiser",
    description: "Minmatar battlecruiser with flexible slot layout and projectile bonuses.",
    highs: 6,
    mids: 4,
    lows: 6,
    cpu: 575,
    powergrid: 1050,
    shield: 3300,
    armor: 3100,
    hull: 3200,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.25, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "megathron",
    name: "Megathron",
    class: "Battleship",
    description: "Gallente hybrid battleship favoring blasters and railguns.",
    highs: 7,
    mids: 4,
    lows: 6,
    cpu: 750,
    powergrid: 15000,
    shield: 5000,
    armor: 6500,
    hull: 7000,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.35, 0.1],
    hullResists: [0, 0, 0, 0],
  },
  {
    id: "raven",
    name: "Raven",
    class: "Battleship",
    description: "Caldari battleship with cruise/torpedo bonuses and shield tank bias.",
    highs: 8,
    mids: 6,
    lows: 4,
    cpu: 760,
    powergrid: 1375,
    shield: 5200,
    armor: 4700,
    hull: 5200,
    shieldResists: [0, 0.2, 0.4, 0.5],
    armorResists: [0.6, 0.35, 0.25, 0.1],
    hullResists: [0, 0, 0, 0],
  },
];

export const MODULES: Module[] = [
  {
    id: "200mm-autocannon-ii",
    name: "200mm AutoCannon II",
    slot: "high",
    description: "Close-range projectile turret. Solid dps with low fitting cost.",
    cpu: 21,
    powergrid: 8,
    dps: 24,
  },
  {
    id: "light-missile-launcher-ii",
    name: "Light Missile Launcher II",
    slot: "high",
    description: "Frigate-sized missile launcher with modest grid needs.",
    cpu: 18,
    powergrid: 7,
    dps: 30,
  },
  {
    id: "heavy-missile-launcher-ii",
    name: "Heavy Missile Launcher II",
    slot: "high",
    description: "Longer-range heavy missile launcher for cruisers and up.",
    cpu: 55,
    powergrid: 70,
    dps: 85,
  },
  {
    id: "heavy-assault-missile-ii",
    name: "Heavy Assault Missile II",
    slot: "high",
    description: "High-dps, shorter-range missiles. Great on Drakes and HACs.",
    cpu: 44,
    powergrid: 90,
    dps: 120,
  },
  {
    id: "heavy-neutron-blaster-ii",
    name: "Heavy Neutron Blaster II",
    slot: "high",
    description: "High-dps hybrid blaster for close-range brawling.",
    cpu: 38,
    powergrid: 320,
    dps: 160,
  },
  {
    id: "425mm-railgun-ii",
    name: "425mm Railgun II",
    slot: "high",
    description: "Long-range hybrid railgun for battleships.",
    cpu: 55,
    powergrid: 210,
    dps: 150,
  },
  {
    id: "gyrostabilizer-ii",
    name: "Gyrostabilizer II",
    slot: "low",
    description: "Increases projectile turret damage and rate of fire.",
    cpu: 30,
    powergrid: 10,
    dpsBonusPct: 10,
  },
  {
    id: "ballistic-control-system-ii",
    name: "Ballistic Control System II",
    slot: "low",
    description: "Increases missile damage and rate of fire.",
    cpu: 30,
    powergrid: 10,
    dpsBonusPct: 10,
  },
  {
    id: "magnetic-field-stabilizer-ii",
    name: "Magnetic Field Stabilizer II",
    slot: "low",
    description: "Increases hybrid turret damage and tracking.",
    cpu: 32,
    powergrid: 10,
    dpsBonusPct: 10,
  },
  {
    id: "heat-sink-ii",
    name: "Heat Sink II",
    slot: "low",
    description: "Boosts laser damage and rate of fire.",
    cpu: 30,
    powergrid: 10,
    dpsBonusPct: 10,
  },
  {
    id: "damage-control-ii",
    name: "Damage Control II",
    slot: "low",
    description: "Adds strong resist bonuses to shields, armor, and hull.",
    cpu: 28,
    powergrid: 1,
    shieldResistBonusPct: 5,
    armorResistBonusPct: 5,
    hullResistBonusPct: 5,
  },
  {
    id: "1600mm-rolled-tungsten-plate",
    name: "1600mm Rolled Tungsten Plate",
    slot: "low",
    description: "Adds a slab of armor hitpoints; grid heavy.",
    cpu: 40,
    powergrid: 500,
    armorHpBonus: 4500,
  },
  {
    id: "reinforced-bulkheads-ii",
    name: "Reinforced Bulkheads II",
    slot: "low",
    description: "Increases hull strength and slight hull resists.",
    cpu: 25,
    powergrid: 30,
    hullHpBonus: 1500,
    hullResistBonusPct: 8,
  },
  {
    id: "large-shield-extender-ii",
    name: "Large Shield Extender II",
    slot: "mid",
    description: "Adds a slab of shield hitpoints.",
    cpu: 30,
    powergrid: 165,
    shieldHpBonus: 2100,
  },
  {
    id: "medium-shield-extender-ii",
    name: "Medium Shield Extender II",
    slot: "mid",
    description: "Adds extra shield hitpoints for cruisers and frigates.",
    cpu: 26,
    powergrid: 75,
    shieldHpBonus: 750,
  },
  {
    id: "adaptive-invulnerability-field-ii",
    name: "Adaptive Invulnerability Field II",
    slot: "mid",
    description: "Active resist module for shields.",
    cpu: 40,
    powergrid: 30,
    shieldResistBonusPct: 20,
  },
  {
    id: "multispectrum-shield-hardener-ii",
    name: "Multispectrum Shield Hardener II",
    slot: "mid",
    description: "Active omni hardener for shields.",
    cpu: 38,
    powergrid: 28,
    shieldResistBonusPct: 18,
  },
  {
    id: "energized-adaptive-nano-membrane-ii",
    name: "Energized Adaptive Nano Membrane II",
    slot: "mid",
    description: "Armor resist module; works best on armor tanks.",
    cpu: 30,
    powergrid: 5,
    armorResistBonusPct: 20,
  },
  {
    id: "warp-scrambler-ii",
    name: "Warp Scrambler II",
    slot: "mid",
    description: "Shuts down hostile microwarpdrives. Essential tackle.",
    cpu: 30,
    powergrid: 1,
  },
  {
    id: "10mn-afterburner-ii",
    name: "10MN Afterburner II",
    slot: "mid",
    description: "Moderate speed boost with manageable fitting.",
    cpu: 40,
    powergrid: 55,
  },
  {
    id: "50mn-microwarpdrive",
    name: "50MN Microwarpdrive",
    slot: "mid",
    description: "High-speed propulsion mod. CPU/PG heavy.",
    cpu: 60,
    powergrid: 165,
  },
];

export const DEFAULT_FIT: Fit = {
  hullId: HULLS[0]?.id ?? null,
  highs: [],
  mids: [],
  lows: [],
};

export const getHullById = (id: string | null) => HULLS.find((hull) => hull.id === id) ?? null;

export const getModuleById = (id: string) => MODULES.find((module) => module.id === id) ?? null;

const slotKey = (slot: SlotType): "highs" | "mids" | "lows" => {
  if (slot === "high") return "highs";
  if (slot === "mid") return "mids";
  return "lows";
};

const STACKING_MULTIPLIERS = [1, 0.869, 0.571, 0.283, 0.105, 0.029, 0.007];

const applyStackingPenalties = (bonuses: number[]) => {
  const sorted = [...bonuses].sort((a, b) => b - a);
  return sorted.reduce((sum, value, index) => {
    const multiplier = STACKING_MULTIPLIERS[index] ?? 0;
    return sum + value * multiplier;
  }, 0);
};

export const calculateFitStats = (fit: Fit): FitStats => {
  const hull = getHullById(fit.hullId);

  const modules = [
    ...fit.highs.map(getModuleById).filter(Boolean),
    ...fit.mids.map(getModuleById).filter(Boolean),
    ...fit.lows.map(getModuleById).filter(Boolean),
  ] as Module[];

  const cpuUsed = modules.reduce((sum, mod) => sum + mod.cpu, 0);
  const powergridUsed = modules.reduce((sum, mod) => sum + mod.powergrid, 0);

  const shieldHpBonus = modules.reduce((sum, mod) => sum + (mod.shieldHpBonus ?? 0), 0);
  const armorHpBonus = modules.reduce((sum, mod) => sum + (mod.armorHpBonus ?? 0), 0);
  const hullHpBonus = modules.reduce((sum, mod) => sum + (mod.hullHpBonus ?? 0), 0);

  const shieldResistBonusPct = applyStackingPenalties(
    modules.map((mod) => mod.shieldResistBonusPct ?? 0).filter((v) => v > 0),
  );
  const armorResistBonusPct = applyStackingPenalties(
    modules.map((mod) => mod.armorResistBonusPct ?? 0).filter((v) => v > 0),
  );
  const hullResistBonusPct = applyStackingPenalties(
    modules.map((mod) => mod.hullResistBonusPct ?? 0).filter((v) => v > 0),
  );

  const rawDps = modules.reduce((sum, mod) => sum + (mod.dps ?? 0), 0);
  const dpsBonusPct = applyStackingPenalties(modules.map((mod) => mod.dpsBonusPct ?? 0).filter((v) => v > 0));
  const dps = Math.round(rawDps * (1 + dpsBonusPct / 100));

  const clampResist = (value: number) => Math.min(0.85, Math.max(0, value));
  const averageResist = (resists: [number, number, number, number], bonusPct: number) => {
    const base = resists.reduce((sum, value) => sum + value, 0) / resists.length;
    return clampResist(base * (1 + bonusPct / 100));
  };

  const shieldResist = hull ? averageResist(hull.shieldResists, shieldResistBonusPct) : 0;
  const armorResist = hull ? averageResist(hull.armorResists, armorResistBonusPct) : 0;
  const hullResist = hull ? averageResist(hull.hullResists, hullResistBonusPct) : 0;

  const shieldHp = (hull?.shield ?? 0) + shieldHpBonus;
  const armorHp = (hull?.armor ?? 0) + armorHpBonus;
  const hullHp = (hull?.hull ?? 0) + hullHpBonus;

  const effectiveShield = shieldHp > 0 ? shieldHp / (1 - shieldResist) : 0;
  const effectiveArmor = armorHp > 0 ? armorHp / (1 - armorResist) : 0;
  const effectiveHull = hullHp > 0 ? hullHp / (1 - hullResist) : 0;

  const shieldEhp = Math.round(effectiveShield);
  const armorEhp = Math.round(effectiveArmor);
  const hullEhp = Math.round(effectiveHull);
  const effectiveHp = shieldEhp + armorEhp + hullEhp;

  return {
    cpuUsed,
    cpuAvailable: hull?.cpu ?? 0,
    powergridUsed,
    powergridAvailable: hull?.powergrid ?? 0,
    dps,
    effectiveHp,
    shieldHp,
    armorHp,
    hullHp,
    shieldResist,
    armorResist,
    hullResist,
    shieldEhp,
    armorEhp,
    hullEhp,
  };
};

export const encodeFit = (fit: Fit) => {
  const payload = JSON.stringify(fit);
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(payload);
  }
  return Buffer.from(payload, "utf8").toString("base64");
};

export const decodeFit = (encoded: string): Fit | null => {
  try {
    const json =
      typeof window !== "undefined" && typeof window.atob === "function"
        ? window.atob(encoded)
        : Buffer.from(encoded, "base64").toString("utf8");

    const parsed = JSON.parse(json) as Fit;

    return {
      hullId: parsed.hullId ?? null,
      highs: Array.isArray(parsed.highs) ? parsed.highs.filter(Boolean) : [],
      mids: Array.isArray(parsed.mids) ? parsed.mids.filter(Boolean) : [],
      lows: Array.isArray(parsed.lows) ? parsed.lows.filter(Boolean) : [],
    };
  } catch {
    return null;
  }
};

export const clampSlotList = (fit: Fit, hull: Hull | null, slot: SlotType) => {
  if (!hull) return fit;

  const key = slotKey(slot);
  const limit = hull[key];
  const trimmed = fit[key].slice(0, limit);

  if (trimmed.length === fit[key].length) {
    return fit;
  }

  return {
    ...fit,
    [key]: trimmed,
  };
};
