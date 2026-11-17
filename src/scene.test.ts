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
  // Both ground-plane directions are near the camera's line of sight.
  const cosOffset=Math.cos(Math.PI/15);
  expect(Math.abs(north[4].x*7+north[4].z*25)/Math.hypot(north[4].x,north[4].z)/Math.hypot(7,25)).toBeCloseTo(cosOffset);
  expect(Math.abs(south[4].x*7+south[4].z*25)/Math.hypot(south[4].x,south[4].z)/Math.hypot(7,25)).toBeCloseTo(cosOffset);
  expect(north[4].x*7+north[4].z*25).toBeGreaterThan(0);
  expect(south[4].x*7+south[4].z*25).toBeLessThan(0);
 });
});
