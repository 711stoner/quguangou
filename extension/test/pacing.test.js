import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveAttempt } from '../lib/pacing.js';

test('twenty successful reservations trigger a real thirty-minute cooldown',()=>{
 let state={},now=10_000;
 for(let i=0;i<20;i++){
  const result=reserveAttempt(state,now);
  assert.equal(result.allowed,true,`attempt ${i+1}`);
  state=structuredClone(result.state);
  assert.equal(state.count,i+1);
  if(i<19){
   assert.ok(state.nextAt>=now+16_000,`attempt ${i+1} minimum delay`);
   assert.ok(state.nextAt<=now+90_000,`attempt ${i+1} maximum delay`);
   assert.equal(reserveAttempt(state,state.nextAt-1).allowed,false);
   now=state.nextAt;
  }
 }
 assert.equal(state.cooldownUntil,now+1_800_000);
 assert.equal(reserveAttempt(state,state.cooldownUntil-1).allowed,false);
 const next=reserveAttempt(state,state.cooldownUntil);
 assert.equal(next.allowed,true);
 assert.equal(next.state.count,1);
 assert.equal(next.state.cooldownUntil,0);
});

test('action attempts never occur less than sixteen seconds apart',()=>{
 for(let run=0;run<50;run++){
  const first=reserveAttempt({},run*180_000+1_000);
  assert.equal(first.allowed,true);
  assert.ok(first.state.nextAt>=(run*180_000+1_000)+16_000);
  assert.equal(reserveAttempt(first.state,first.state.nextAt-1).allowed,false);
  assert.equal(reserveAttempt(first.state,first.state.nextAt).allowed,true);
 }
});

test('periodic longer breaks cannot exceed ninety seconds and are still enforced',()=>{
 let state={},now=0;let sawLongBreak=false;
 for(let i=0;i<19;i++){
  const next=reserveAttempt(state,now);
  assert.equal(next.allowed,true);
  const delay=next.state.nextAt-now;
  assert.ok(delay>=16_000&&delay<=90_000);
  if(delay>=45_000)sawLongBreak=true;
  assert.equal(reserveAttempt(next.state,next.state.nextAt-1).allowed,false);
  state=next.state;now=state.nextAt;
 }
 assert.ok(sawLongBreak,'A 20-target batch should include at least one longer break');
});
