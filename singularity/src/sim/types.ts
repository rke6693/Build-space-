/* ------------------------------------------------------------------------------------------
 * Core data model shared by the simulation (worker), the renderer and the UI.
 * The simulation never imports DOM or three.js code so it can run in a Worker or in Node tests.
 * ---------------------------------------------------------------------------------------- */

// ---------- City (static, deterministically generated from a seed) ----------

export const enum Zone {
  Ocean = 0,
  River = 1,
  Shore = 2,
  Park = 3,
  Forest = 4,
  Residential = 5,
  Commercial = 6,
  Downtown = 7,
  Industrial = 8,
  Port = 9,
}

export const ZONE_NAMES = ['Ocean', 'River', 'Shore', 'Park', 'Forest', 'Residential', 'Commercial', 'Downtown', 'Industrial', 'Port'];

export const enum RoadKind {
  None = 0,
  Street = 1,
  Arterial = 2,
  Bridge = 3,
}

export const enum BType {
  House = 0,
  Apartment = 1,
  Office = 2,
  Tower = 3,
  Warehouse = 4,
  Factory = 5,
  Hospital = 6,
  FireStation = 7,
  Shelter = 8,
  Civic = 9,
  Retail = 10,
}

export const BTYPE_NAMES = ['House', 'Apartment block', 'Office', 'High-rise tower', 'Warehouse', 'Factory', 'Hospital', 'Fire station', 'Shelter', 'Civic', 'Retail'];

export const enum SClass {
  WoodFrame = 0,
  URM = 1,
  RCPreCode = 2,
  RCModern = 3,
  SteelFrame = 4,
  BaseIsolated = 5,
  SteelLight = 6,
}

export const SCLASS_NAMES = [
  'Light wood frame',
  'Unreinforced masonry',
  'Reinforced concrete (pre-code)',
  'Reinforced concrete (modern code)',
  'Steel moment frame',
  'Base-isolated high-code',
  'Light steel (industrial)',
];

export interface District {
  id: number;
  name: string;
  kind: string;
  cx: number;
  cz: number;
  cells: number;
}

export interface RoadGraph {
  nodeCount: number;
  nodeX: Float32Array;
  nodeZ: Float32Array;
  nodeCell: Int32Array;
  nodeZone: Uint8Array; // routing zone id
  edgeCount: number;
  edgeA: Int32Array;
  edgeB: Int32Array;
  edgeLen: Float32Array;
  edgeKind: Uint8Array;
  edgeCap: Float32Array; // vehicles that fit comfortably
  edgeBridge: Int16Array; // bridge id or -1
  edgeCellStart: Int32Array; // CSR into edgeCells (length edgeCount + 1)
  edgeCells: Int32Array;
  adjStart: Int32Array; // CSR adjacency (length nodeCount + 1)
  adjEdge: Int32Array;
  adjNode: Int32Array;
  zoneCount: number;
  zoneTarget: Int32Array; // routing target node per zone
}

export interface Buildings {
  count: number;
  x: Float32Array;
  z: Float32Array;
  w: Float32Array; // footprint along x
  d: Float32Array; // footprint along z
  h: Float32Array; // height
  baseY: Float32Array; // ground elevation of footprint
  type: Uint8Array;
  sclass: Uint8Array;
  district: Uint8Array;
  floors: Uint8Array;
  year: Uint16Array;
  cell: Int32Array;
  node: Int32Array; // nearest road node
  residents: Float32Array; // night-time occupants (people)
  value: Float32Array; // replacement value (USD, illustrative)
  fuel: Float32Array; // relative fire load 0..1
  substation: Int16Array; // serving distribution substation asset id
  asset: Int16Array; // infrastructure asset housed in this building, or -1
  style: Uint8Array; // render style variant
}

export type AssetKind =
  | 'plant'
  | 'import'
  | 'tx'
  | 'sub'
  | 'pump'
  | 'water'
  | 'hospital'
  | 'fire'
  | 'shelter'
  | 'hub'
  | 'tower'
  | 'eoc';

export const ASSET_KIND_NAMES: Record<AssetKind, string> = {
  plant: 'Power plant',
  import: 'Grid interconnect',
  tx: 'Transmission substation',
  sub: 'Distribution substation',
  pump: 'Flood pump station',
  water: 'Water treatment & pumping',
  hospital: 'Hospital',
  fire: 'Fire station',
  shelter: 'Emergency shelter',
  hub: 'Telecom exchange',
  tower: 'Cell tower',
  eoc: 'Emergency operations centre',
};

export interface Asset {
  id: number;
  kind: AssetKind;
  name: string;
  x: number;
  z: number;
  cell: number;
  district: number;
  node: number; // nearest road node
  building: number; // building index or -1
  /** Lognormal fragility medians (PGA, g) for slight/moderate/extensive/complete. */
  fragility: [number, number, number, number];
  beta: number;
  year: number;
  /** Water depth (m) at which the asset stops working. */
  floodLimit: number;
  /** Hours of backup power (generator / battery). 0 = none. */
  backupHours: number;
  /** Serving distribution substation (for consumers) or -1. */
  substation: number;
  capacity: number; // shelter/hospital: agents; pump: m3/s; plant: MW
  repairCost: number; // USD, illustrative
  description: string;
}

export interface PowerLine {
  id: number;
  a: number; // upstream asset id
  b: number; // downstream asset id
  kind: 'transmission' | 'subtransmission';
  name: string;
  windRating: number; // m/s gust capacity
  quakeMedian: number; // PGA (g) at which pylons fail (median)
  points: number[]; // pylon positions, flattened x,z
}

export interface Bridge {
  id: number;
  name: string;
  edge: number;
  year: number;
  style: 'cable' | 'girder' | 'arch';
  fragility: [number, number, number, number];
  x: number;
  z: number;
  cells: number[];
  deckY: number;
  repairCost: number;
}

export interface LeveeSegment {
  id: number;
  name: string;
  cells: number[];
  crest: number; // crest elevation above datum (m)
  x: number;
  z: number;
}

export interface City {
  seed: number;
  name: string;
  terrain: Float32Array; // cell-centre ground elevation (m), excludes levees
  zone: Uint8Array;
  district: Int8Array;
  soil: Float32Array; // soft-soil / liquefaction susceptibility 0..1
  ocean: Uint8Array; // 1 = open sea boundary cell (fixed water level)
  road: Uint8Array; // RoadKind per cell
  roadEdge: Int32Array; // edge index covering the cell or -1
  vegetation: Float32Array; // vegetation fire load 0..1
  drainCapacity: Float32Array; // storm-drain capacity, m/s equivalent
  pumpCatchment: Int16Array; // pump asset id draining this cell or -1
  riverInflow: number[]; // north-boundary cells receiving river discharge
  leveeHeight: Float32Array; // initial levee height above terrain (m)
  leveeSegment: Int16Array; // levee segment id or -1
  districts: District[];
  roads: RoadGraph;
  buildings: Buildings;
  assets: Asset[];
  lines: PowerLine[];
  bridges: Bridge[];
  levees: LeveeSegment[];
  population: number; // modeled residents (agents * PEOPLE_PER_AGENT)
  stats: { landCells: number; urbanCells: number; roadLengthKm: number };
}

// ---------- Scenario & commands ----------

export interface EnvBase {
  rainfall: number; // mm/h
  windSpeed: number; // m/s
  windDir: number; // degrees, direction the wind blows FROM (meteorological)
  temperature: number; // deg C
  seaLevel: number; // m offset from datum
  soilSaturation: number; // 0..1
}

export type CommandSpec =
  | { kind: 'earthquake'; x: number; z: number; magnitude: number; depthKm: number; durationS?: number; aftershocks: boolean }
  | { kind: 'rain'; rate: number; durationMin: number }
  | { kind: 'surge'; height: number; durationMin: number }
  | { kind: 'levee_breach'; segment: number; width: number }
  | { kind: 'river_flood'; peak: number; durationMin: number }
  | { kind: 'fire'; x: number; z: number; radius: number }
  | { kind: 'storm'; category: number; dirDeg: number; durationMin: number; lightning: boolean }
  | { kind: 'asset'; assetId: number; action: 'damage' | 'trip' | 'restore' }
  | { kind: 'line'; lineId: number; action: 'damage' | 'restore' }
  | { kind: 'evacuate'; x: number; z: number; radius: number }
  | { kind: 'env'; env: Partial<EnvBase> };

export type CommandKind = CommandSpec['kind'];

export interface Command {
  id: number;
  tick: number;
  source: 'scenario' | 'interactive';
  spec: CommandSpec;
}

export interface ResilienceSettings {
  leveeRaise: number; // m added to all levees
  substationRetrofit: boolean; // anchored equipment: fragility x1.7
  backupHoursScale: number; // multiplier on generator/battery autonomy
  pumpCapacityScale: number;
  buildingRetrofit: boolean; // old masonry/pre-code retrofitted
  crewsPerStation: number;
  autoEvacuation: boolean;
  aftershocks: boolean;
}

export interface EconomicSettings {
  costScale: number; // multiplier on replacement cost per m2
  contentsRatio: number; // contents value as fraction of structure
  businessInterruptionPerHour: number; // fraction of commercial value lost per outage hour
  infraCostScale: number;
}

export interface Bookmark {
  tick: number;
  label: string;
}

export interface Scenario {
  version: 1;
  id: string;
  name: string;
  description: string;
  seed: number;
  agents: number;
  startHour: number; // local time of day at t = 0
  durationMin: number;
  env: EnvBase;
  resilience: ResilienceSettings;
  economics: EconomicSettings;
  commands: Command[];
  bookmarks: Bookmark[];
  builtin?: boolean;
}

// ---------- Events (causal graph) ----------

export type EventCategory = 'seismic' | 'flood' | 'fire' | 'weather' | 'power' | 'transport' | 'health' | 'population' | 'comms' | 'water' | 'user';

export type EventType =
  | 'earthquake'
  | 'aftershock'
  | 'building_damage'
  | 'building_collapse'
  | 'critical_damage'
  | 'liquefaction'
  | 'bridge_damage'
  | 'bridge_collapse'
  | 'substation_damage'
  | 'line_failure'
  | 'power_loss'
  | 'power_restored'
  | 'backup_start'
  | 'backup_exhausted'
  | 'pump_failure'
  | 'pump_restored'
  | 'levee_overtop'
  | 'levee_breach'
  | 'flood_zone'
  | 'flood_receding'
  | 'river_flood'
  | 'road_closure'
  | 'fire_ignition'
  | 'fire_major'
  | 'fire_contained'
  | 'crew_dispatched'
  | 'crew_blocked'
  | 'hospital_isolated'
  | 'hospital_degraded'
  | 'hospital_restored'
  | 'hospital_overload'
  | 'comm_outage'
  | 'comm_restored'
  | 'water_outage'
  | 'water_restored'
  | 'evac_order'
  | 'shelter_full'
  | 'lightning'
  | 'storm'
  | 'storm_surge'
  | 'rain'
  | 'env_change'
  | 'casualties';

export interface SimEvent {
  id: number;
  tick: number;
  type: EventType;
  category: EventCategory;
  severity: 0 | 1 | 2 | 3; // info, minor, major, critical
  title: string;
  detail: string;
  x: number;
  z: number;
  causes: number[];
  subject?: { kind: 'asset' | 'building' | 'bridge' | 'levee' | 'district' | 'line' | 'cell'; id: number };
  radius?: number; // framing radius for cameras (m)
}

// ---------- Metrics ----------

export interface Metrics {
  tick: number;
  t: number; // simulated seconds
  population: number;
  affected: number;
  evacuating: number;
  stranded: number; // evacuating but with no passable route to an open shelter
  evacuated: number; // reached shelter
  sheltered: number;
  injured: number;
  hospitalized: number;
  trapped: number;
  bNone: number;
  bSlight: number;
  bModerate: number;
  bExtensive: number;
  bCollapsed: number;
  bBurning: number;
  bFlooded: number;
  gridAvailability: number; // fraction of buildings with power
  substationsOnline: number;
  substationsTotal: number;
  roadAccessibility: number; // fraction of road length open
  roadsClosed: number;
  bridgesOpen: number;
  bridgesTotal: number;
  floodedAreaKm2: number;
  maxFloodDepth: number;
  floodVolume: number; // m3 on land
  activeFires: number; // burning cells
  burnedAreaKm2: number;
  fireIncidents: number;
  hospitalsOperational: number;
  hospitalsAccessible: number;
  hospitalsTotal: number;
  hospitalAccess: number; // fraction of population with a reachable operational hospital
  commAvailability: number;
  waterAvailability: number;
  pumpsOnline: number;
  pumpsTotal: number;
  lossBuildings: number;
  lossContents: number;
  lossInfrastructure: number;
  lossBusiness: number;
  lossTotal: number;
  rain: number;
  wind: number;
  visibilityKm: number;
  seaSurface: number;
  peakPGA: number;
}

// ---------- Dynamic state ----------

export const enum AgentState {
  Inside = 0,
  Traveling = 1,
  Evacuating = 2,
  Sheltered = 3,
  Injured = 4,
  ToHospital = 5,
  Hospitalized = 6,
  Trapped = 7,
}

export const AGENT_STATE_NAMES = ['Indoors', 'Travelling', 'Evacuating', 'Sheltered', 'Injured', 'To hospital', 'Hospitalized', 'Trapped'];

export interface AgentsState {
  count: number;
  x: Float32Array;
  z: Float32Array;
  node: Int32Array; // current/last node
  edge: Int32Array; // current edge or -1 when at a node / inside
  prog: Float32Array; // metres along edge from its start node
  fwd: Uint8Array; // 1 = travelling A->B
  state: Uint8Array;
  health: Float32Array;
  home: Int32Array;
  work: Int32Array;
  destNode: Int32Array;
  destBuilding: Int32Array;
  at: Int32Array; // building currently inside (-1 if none)
  dwell: Float32Array;
  alerted: Uint8Array;
  affected: Uint8Array;
  stuck: Uint16Array;
  target: Int16Array; // shelter/hospital asset id
  prevNode: Int32Array;
}

export interface CrewsState {
  count: number;
  station: Int16Array; // asset id
  state: Uint8Array; // 0 idle,1 enroute,2 fighting,3 returning,4 blocked
  node: Int32Array;
  edge: Int32Array;
  prog: Float32Array;
  fwd: Uint8Array;
  x: Float32Array;
  z: Float32Array;
  incident: Int16Array;
  targetNode: Int32Array;
  nextHop: Int16Array; // count * nodeCount routing table toward current target
  blockedEvent: Int32Array;
}

export interface QuakeState {
  id: number;
  eventId: number;
  x: number;
  z: number;
  depthKm: number;
  magnitude: number;
  startTick: number;
  duration: number; // significant shaking duration (s)
  aftershock: boolean;
  aftershocks: boolean; // generate aftershocks
  parentEvent: number;
  done: boolean;
  summarized: boolean;
  peakSeen: number;
}

export interface StormState {
  eventId: number;
  startTick: number;
  duration: number; // s
  category: number;
  dirDeg: number;
  rainPeak: number;
  windPeak: number;
  surgePeak: number;
  lightning: number;
}

export interface PulseState {
  kind: 'rain' | 'surge' | 'river';
  eventId: number;
  startTick: number;
  duration: number;
  peak: number;
}

export interface Incident {
  id: number;
  eventId: number;
  cell: number;
  x: number;
  z: number;
  startTick: number;
  detectTick: number;
  active: boolean;
  burning: number;
  maxBurning: number;
  crews: number;
  majorReported: boolean;
  buildingsLost: number;
  blockedEvent: number; // crew_blocked event id, -1 if never blocked
}

export interface EvacOrder {
  eventId: number;
  x: number;
  z: number;
  radius: number;
  tick: number;
}

export interface Strike {
  x: number;
  z: number;
  tick: number;
  eventId: number;
}

export interface EnvEffective extends EnvBase {
  surge: number;
  tide: number;
  seaSurface: number;
  riverQ: number;
  visibilityKm: number;
  stormIntensity: number; // 0..1
  lightningRate: number; // strikes / minute
  cloudCover: number; // 0..1 mean
  windX: number; // wind velocity vector (towards), m/s
  windZ: number;
  gust: number;
  timeOfDay: number; // hours
}

export interface SimState {
  tick: number;
  rng: Record<'quake' | 'fire' | 'pop' | 'weather' | 'infra', Uint32Array>;
  env: EnvBase;
  eff: EnvEffective;
  riverQ: number;
  cloudOX: number;
  cloudOZ: number;
  // grids (N_CELLS)
  water: Float32Array; // water depth (m)
  qx: Float32Array; // unit discharge across east faces (m²/s)
  qz: Float32Array; // unit discharge across south faces (m²/s)
  maxWater: Uint8Array; // max depth experienced, 5 cm steps
  settlement: Float32Array; // permanent ground settlement (m)
  levee: Float32Array; // current levee height above terrain (m)
  burn: Float32Array; // fire intensity 0..1
  heat: Float32Array; // accumulated radiant/convective heat towards ignition
  fuel: Float32Array; // remaining fuel load
  burned: Uint8Array; // 1 = burnt out
  smoke: Float32Array;
  peakPGA: Float32Array; // max PGA experienced (g)
  // weather grid (WX_GRID^2)
  clouds: Float32Array;
  wetness: Float32Array; // fuel moisture from rain 0..1
  // buildings
  bDamage: Float32Array; // structural damage ratio 0..1
  bDS: Uint8Array; // 0..4
  bDSStart: Uint8Array; // damage state at the start of the current shaking episode
  bFire: Float32Array; // fire damage 0..1
  bPeak: Float32Array; // running peak PGA in the current shaking episode
  episode: number; // id of the quake that opened the current shaking episode
  episodeEvent: number;
  aPeak: Float32Array;
  brPeak: Float32Array;
  lPeak: Float32Array;
  // assets
  aDS: Uint8Array;
  aEnergized: Uint8Array; // grid nodes: energised; consumers: has power (grid or backup)
  aOnBackup: Uint8Array;
  aBackup: Float32Array; // remaining backup seconds
  aOperational: Uint8Array; // 0 down, 1 degraded, 2 ok
  aFlooded: Uint8Array;
  aAccessible: Uint8Array;
  aTrip: Float32Array; // seconds of protective trip remaining
  aEvent: Int32Array; // last status-change event
  aDamageEvent: Int32Array;
  aFloodEvent: Int32Array;
  aTripEvent: Int32Array;
  aBackupEvent: Int32Array;
  aLoad: Int32Array; // shelter/hospital occupancy (agents)
  aFlag: Uint8Array; // misc one-shot flags (1 = full/overload reported)
  // lines
  lDamaged: Uint8Array;
  lEvent: Int32Array;
  // bridges
  brDS: Uint8Array;
  brEvent: Int32Array;
  // levees (per segment)
  lsState: Uint8Array; // 0 ok, 1 overtopped, 2 breached
  lsSettled: Float32Array;
  lsEvent: Int32Array;
  // roads (per edge)
  eClosed: Uint8Array; // bit flags: 1 flood, 2 debris, 4 fire, 8 structural
  eDebris: Uint8Array;
  eClosedEvent: Int32Array; // cause of the current closure
  routingDirty: number;
  routingVersion: number;
  zoneHop: Int16Array; // zoneCount * nodeCount
  shelterHop: Int16Array;
  shelterDist: Float32Array;
  shelterOf: Int16Array;
  hospitalHop: Int16Array;
  hospitalDist: Float32Array;
  hospitalOf: Int16Array;
  mainReach: Uint8Array;
  // agents & crews
  agents: AgentsState;
  crews: CrewsState;
  incidents: Incident[];
  nextIncidentId: number;
  // hazards / disasters
  quakes: QuakeState[];
  nextQuakeId: number;
  storms: StormState[];
  pulses: PulseState[];
  strikes: Strike[];
  evacOrders: EvacOrder[];
  // per district
  dFloodEvent: Int32Array;
  dFlooded: Uint8Array;
  dEvacuated: Uint8Array;
  dLiqEvent: Int32Array;
  dCollapseEvent: Int32Array;
  dClosureTick: Int32Array; // last tick a closure event was emitted (per district*4 reasons)
  dClosureEvent: Int32Array;
  // global services
  commEvent: number;
  waterEvent: number;
  commOk: number;
  waterOk: number;
  // bookkeeping
  nextEventId: number;
  lossBusiness: number;
  windPeak: number; // highest gust evaluated for wind damage (m/s)
  windDamagePending: number; // buildings newly damaged by wind since the last summary event
  injuredReported: number;
  injuredCauses: Record<string, number>;
  repairedNaN: number;
}

// ---------- Worker frame (render snapshot) ----------

export interface FrameAsset {
  status: number; // 0 down,1 degraded,2 ok
  energized: number;
  onBackup: number;
  backup: number; // remaining seconds
  ds: number;
  flooded: number;
  accessible: number;
  load: number;
}

export interface ActiveQuakeView {
  id: number;
  x: number;
  z: number;
  depthKm: number;
  magnitude: number;
  elapsed: number; // s since origin
  duration: number;
  aftershock: boolean;
}

export interface Frame {
  tick: number;
  frontier: number;
  playing: boolean;
  speed: number;
  replay: boolean;
  eff: EnvEffective;
  water: Float32Array;
  burn: Float32Array;
  smoke: Float32Array;
  shaking: Float32Array;
  peakPGA: Float32Array;
  settlement: Float32Array;
  levee: Float32Array;
  clouds: Float32Array;
  bState: Uint8Array; // bits 0-2 DS, 3 burning, 4 powered, 5 flooded
  bDamage: Float32Array;
  agentsXZ: Float32Array;
  agentsState: Uint8Array;
  crewsXZ: Float32Array;
  crewsState: Uint8Array;
  eClosed: Uint8Array;
  eOcc: Uint16Array;
  assets: FrameAsset[];
  lines: Uint8Array;
  bridges: Uint8Array; // DS
  levees: Uint8Array; // 0 ok, 1 overtopped, 2 breached
  strikes: Strike[];
  quakes: ActiveQuakeView[];
  incidents: { x: number; z: number; burning: number; active: boolean }[];
  metrics: Metrics;
}
