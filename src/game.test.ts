import { describe, expect, it } from 'vitest';
import { areConnected, colors, createInitialState, sizes, type StarSystem } from './game';

describe('suggested opening', () => {
  it('conserves all 36 pieces with three of every color and size', () => {
    const state = createInitialState();
    const pieces = [...state.bank, ...state.systems.flatMap(s => [...s.stars, ...s.ships])];
    expect(state.bank).toHaveLength(30);
    expect(pieces).toHaveLength(36);
    for (const color of colors) for (const size of sizes) expect(pieces.filter(p => p.color === color && p.size === size)).toHaveLength(3);
    expect(state.systems.map(s => s.ships[0].owner)).toEqual([0, 1]);
  });
  it('creates independent positions on restart', () => {
    const first = createInitialState();
    first.bank.pop();
    first.systems[0].ships.pop();
    expect(createInitialState().bank).toHaveLength(30);
    expect(createInitialState().systems[0].ships).toHaveLength(1);
  });
});

describe('star connections', () => {
  const system = (id: string, starSizes: (1|2|3)[]): StarSystem => ({id, name: id, stars: starSizes.map(size => ({size, color: 'blue'})), ships: []});
  it('connects disjoint sizes in both directions', () => {
    const a = system('a', [1, 3]), b = system('b', [2]);
    expect(areConnected(a, b)).toBe(true);
    expect(areConnected(b, a)).toBe(true);
  });
  it('rejects overlapping sizes, self travel, and destroyed stars', () => {
    const a = system('a', [1, 3]);
    expect(areConnected(a, system('b', [3]))).toBe(false);
    expect(areConnected(a, a)).toBe(false);
    expect(areConnected(a, system('empty', []))).toBe(false);
  });
  it('keeps the suggested homeworlds disconnected', () => {
    const {systems} = createInitialState();
    expect(areConnected(systems[0], systems[1])).toBe(false);
  });
});
