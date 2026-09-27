import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/sim/city/generate';
import { N_CELLS } from '../src/sim/config';
import { hashValue } from '../src/sim/engine';
import { DEFAULT_SEED, PUMP_CENTRAL_ID } from '../src/sim/scenario';
import { RoadKind, Zone } from '../src/sim/types';
import { testCity } from './helpers';

describe('procedural city', () => {
  const city = testCity();

  it('is deterministic for a seed', () => {
    const again = generateCity(DEFAULT_SEED);
    expect(hashValue(again.terrain, 1)).toBe(hashValue(city.terrain, 1));
    expect(hashValue(again.buildings.h, 1)).toBe(hashValue(city.buildings.h, 1));
    expect(again.roads.edgeCount).toBe(city.roads.edgeCount);
    expect(again.assets.map((a) => a.name)).toEqual(city.assets.map((a) => a.name));
  });

  it('differs for another seed', () => {
    const other = generateCity(DEFAULT_SEED + 1);
    expect(hashValue(other.buildings.h, 1)).not.toBe(hashValue(city.buildings.h, 1));
  });

  it('has a recognisable coastal layout', () => {
    let ocean = 0;
    let polderBelow = 0;
    let polder = 0;
    for (let c = 0; c < N_CELLS; c++) {
      if (city.ocean[c]) ocean++;
      if (city.pumpCatchment[c] >= 0) {
        polder++;
        if (city.terrain[c] < 0) polderBelow++;
      }
    }
    expect(ocean).toBeGreaterThan(N_CELLS * 0.2);
    expect(polder).toBeGreaterThan(400);
    expect(polderBelow / polder).toBeGreaterThan(0.9); // reclaimed land lies below sea level
    expect(city.levees.length).toBeGreaterThanOrEqual(3);
    expect(city.bridges.length).toBeGreaterThanOrEqual(3);
    expect(city.riverInflow.length).toBeGreaterThan(0);
    expect(city.buildings.count).toBeGreaterThan(4000);
    const tallest = Math.max(...city.buildings.h);
    expect(tallest).toBeGreaterThan(300);
  });

  it('has a single connected road network', () => {
    const g = city.roads;
    const seen = new Uint8Array(g.nodeCount);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
      const n = stack.pop()!;
      for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) {
        const m = g.adjNode[k];
        if (!seen[m]) {
          seen[m] = 1;
          count++;
          stack.push(m);
        }
      }
    }
    expect(count).toBe(g.nodeCount);
    for (let e = 0; e < g.edgeCount; e++) expect(g.edgeLen[e]).toBeGreaterThan(0);
    const bridgeEdges = Array.from(g.edgeKind).filter((k) => k === RoadKind.Bridge).length;
    expect(bridgeEdges).toBe(city.bridges.length);
  });

  it('never places buildings on water or roads', () => {
    const b = city.buildings;
    for (let k = 0; k < b.count; k++) {
      const c = b.cell[k];
      expect(city.zone[c]).not.toBe(Zone.Ocean);
      expect(city.zone[c]).not.toBe(Zone.River);
      expect(city.road[c]).toBe(0);
      expect(b.h[k]).toBeGreaterThan(0);
      expect(b.value[k]).toBeGreaterThan(0);
    }
  });

  it('provides the critical infrastructure used by the cascade models', () => {
    const kinds = new Set(city.assets.map((a) => a.kind));
    for (const k of ['plant', 'import', 'tx', 'sub', 'pump', 'water', 'hospital', 'fire', 'shelter', 'hub', 'tower']) expect(kinds.has(k as never)).toBe(true);
    expect(city.assets[PUMP_CENTRAL_ID].name).toContain('Central');
    for (const a of city.assets) {
      if (a.kind !== 'plant' && a.kind !== 'import' && a.kind !== 'tx' && a.kind !== 'sub') {
        expect(a.substation).toBeGreaterThanOrEqual(0);
        expect(city.assets[a.substation].kind).toBe('sub');
      }
      expect(a.node).toBeGreaterThanOrEqual(0);
    }
    for (const l of city.lines) {
      expect(city.assets[l.a]).toBeDefined();
      expect(city.assets[l.b]).toBeDefined();
    }
    // every substation is fed by at least one line
    for (const a of city.assets.filter((x) => x.kind === 'sub')) expect(city.lines.some((l) => l.b === a.id)).toBe(true);
  });
});
