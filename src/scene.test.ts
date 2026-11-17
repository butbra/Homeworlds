import {describe,it,expect} from 'vitest';
import {pieceModel,tabletopPieceScale} from './scene';

describe('physical tabletop geometry',()=>{
 it('uses a consistent shared physical scale with clear size steps',()=>{
  const small=tabletopPieceScale(37,49,60),medium=tabletopPieceScale(48,64,60),large=tabletopPieceScale(60,80,60);
  expect(medium/small).toBeCloseTo(1.30,1);
  expect(large/medium).toBeCloseTo(1.25,2);
  expect(tabletopPieceScale(60,80,120)).toBeCloseTo(large/2);
  const lengths=[pieceModel('red',3,true,0),pieceModel('red',3,false,0),pieceModel('red',3,false,1)].map(({points})=>points[0].distanceTo(points[1])*large);
  expect(lengths[1]).toBeCloseTo(lengths[0]);expect(lengths[2]).toBeCloseTo(lengths[0]);
 });
 it('stands stars on their square base',()=>{
  const {points}=pieceModel('blue',2,true,0);
  expect(points.slice(0,4).every(p=>p.y===0)).toBe(true);
  expect(points[4].y).toBeGreaterThan(1);
 });
 it('keeps both ships above the board, pointed toward opposite players',()=>{
  const north=pieceModel('red',3,false,0).points;
  const south=pieceModel('red',3,false,1).points;
  for(const points of [north,south]){
   expect(points.every(p=>p.y>=-1e-7)).toBe(true);
   expect(points.filter(p=>Math.abs(p.y)<1e-7).length).toBeGreaterThanOrEqual(2);
  }
  expect(north[4].x*25-north[4].z*7).toBeCloseTo(0);
  expect(south[4].x*25-south[4].z*7).toBeCloseTo(0);
  expect(north[4].x*7+north[4].z*25).toBeGreaterThan(0);
  expect(south[4].x*7+south[4].z*25).toBeLessThan(0);
 });
});
