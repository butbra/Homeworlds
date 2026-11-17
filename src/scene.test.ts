import {describe,it,expect} from 'vitest';
import {pieceModel} from './scene';

describe('physical tabletop geometry',()=>{
 it('stands stars on their square base',()=>{
  const {points}=pieceModel('blue',2,true,0);
  expect(points.slice(0,4).every(p=>p.y===0)).toBe(true);
  expect(points[4].y).toBeGreaterThan(1);
 });
 it('rests both ships on a triangle, pointing in opposite directions',()=>{
  const north=pieceModel('red',3,false,0).points;
  const south=pieceModel('red',3,false,1).points;
  for(const points of [north,south]){
   expect(points.every(p=>p.y>=-1e-7)).toBe(true);
   expect(points.filter(p=>Math.abs(p.y)<1e-7)).toHaveLength(3);
  }
  expect(north[4].x).toBeCloseTo(-south[4].x);
  expect(north[4].z).toBeCloseTo(-south[4].z);
  // Both ground-plane directions align with the camera's line of sight.
  expect(north[4].x*25-north[4].z*7).toBeCloseTo(0);
  expect(south[4].x*25-south[4].z*7).toBeCloseTo(0);
  expect(north[4].x*7+north[4].z*25).toBeGreaterThan(0);
  expect(south[4].x*7+south[4].z*25).toBeLessThan(0);
 });
});
