// tinycrttest.js — Strict unit tests for Tiny CRT state mapper, animations and hysteresis.
import assert from 'node:assert/strict';
import { Fly, BODY_FORM } from '../src/flymodel.js';

let failures = 0;
function check(name, run) {
  try {
    const result = run();
    console.log(`PASS ${name}: ${result}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

// 1. Leg Geometry & Interface Check
check('TinyCRTModel builder contract conformance', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  assert.equal(fly.model.legs.length, 6);
  assert(fly.model.foldedWings);
  assert(fly.model.blurWingL);
  assert(fly.model.blurWingR);
  assert.equal(fly.model.blurWingL.material.opacity, 0);
  assert.equal(typeof fly.model.getCurrentAnim, 'function');
  assert.equal(typeof fly.model.getCurrentFrame, 'function');
  assert.equal(typeof fly.model.isOneShotPlaying, 'function');
  return '6 dummy legs, folded wings, blur wings with opacity intact and getters exposed';
});

// 2. Escape Jumping One-shot Test with Strict Assertions
check('Escape scare trigger plays jumping once for 840ms then reverts', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;
  
  fly.state = 'idle';
  fly.speed = 0;
  fly.isEscaping = false;
  model.onUpdate(fly, dt);
  assert.equal(model.getCurrentAnim(), 'idle', 'Initial state must be idle');
  assert.equal(model.isOneShotPlaying(), false, 'One-shot must not be playing initially');

  // Trigger escape scare via startFlight(..., { escape: true })
  fly.startFlight({ width: 1000, height: 1000 }, { escape: true });
  assert.equal(fly.isEscaping, true, 'isEscaping must be set true on escape flight');
  model.onUpdate(fly, dt);
  
  assert.equal(model.getCurrentAnim(), 'jumping', 'Must transition to jumping on escape trigger');
  assert.equal(model.isOneShotPlaying(), true, 'One-shot must be active');

  // Mid-way during one-shot (18 frames ~= 300ms elapsed)
  for (let i = 0; i < 18; i++) {
    fly.state = 'walking'; // Attempt to interrupt with walking
    fly.speed = 40;
    model.onUpdate(fly, dt);
    assert.equal(model.getCurrentAnim(), 'jumping', `Frame ${i}: Jumping must not be interrupted`);
    assert.equal(model.isOneShotPlaying(), true, `Frame ${i}: One-shot must still be active`);
  }
  
  // Advance through remaining duration past 840ms (50 frames ~= 833ms + 300ms > 840ms)
  for (let i = 0; i < 50; i++) {
    model.onUpdate(fly, dt);
  }
  
  // After 840ms, one-shot must be finished
  assert.equal(model.isOneShotPlaying(), false, 'One-shot must terminate after 840ms');
  
  // Resume grounded walking: pos moves eastward at moderate speed (40 pt/s) for 10 frames (> 100ms)
  fly.isEscaping = false;
  fly.state = 'walking';
  fly.speed = 40;
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 40 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running-right', 'Must restore to running-right based on positive displacement');
  
  return 'jumping strictly asserted for 840ms, resists interruption, and returns to running-right';
});

// 3. Normal Flight Mapping (Never Triggering Jumping)
check('Normal flight maps to running, not jumping', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  
  // Casual takeoff: escape is false
  fly.startFlight({ width: 1000, height: 1000 }, { escape: false });
  assert.equal(fly.isEscaping, false, 'Casual flight must have isEscaping == false');
  assert.equal(fly.scareCooldown, 2.5, 'scareCooldown is 2.5 on casual flight in FlyModel');
  
  model.onUpdate(fly, 1 / 60);
  
  assert.notEqual(model.getCurrentAnim(), 'jumping', 'Casual flight must NEVER trigger jumping');
  assert.equal(model.getCurrentAnim(), 'running', 'Casual flight must map to high-speed running');
  assert.equal(model.isOneShotPlaying(), false, 'One-shot must remain false during casual flight');
  
  return 'casual flight with scareCooldown=2.5 correctly maps to running with jumping=false';
});

// 4. Backward Walking (MDN) Mapping
check('MDN backward walking maps to actual walk direction, not failed', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;
  
  fly.state = 'walking';
  fly.heading = 0; // facing east
  fly.speed = 0; // speed is 0 in unpowered MDN
  fly.backwardTimer = 0.5; // moving westward (-22 pt/s)
  fly.isEscaping = false;
  fly.pos = { x: 100, y: 0 };
  model.onUpdate(fly, dt);

  // Stepped backwards to west by 22 * dt for 10 frames (> 100ms)
  for (let i = 0; i < 10; i++) {
    fly.pos.x -= 22 * dt;
    model.onUpdate(fly, dt);
  }
  
  assert.notEqual(model.getCurrentAnim(), 'failed', 'Backward walk must NOT map to failed');
  assert.equal(model.getCurrentAnim(), 'running-left', 'Westward backward step must map to running-left');
  
  return 'backward walk verified: actual displacement westward maps to running-left and not failed';
});

// 5. Speed Hysteresis & Stop-to-Idle Test
check('Speed hysteresis and stop-to-idle detection', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;
  fly.state = 'walking';
  fly.isEscaping = false;
  fly.pos = { x: 0, y: 0 };
  model.onUpdate(fly, dt);

  // 1. Physically stopped in walking state (dx = 0, speed = 0)
  fly.speed = 0;
  fly.pos = { x: 0, y: 0 };
  model.onUpdate(fly, dt);
  assert.equal(model.getCurrentAnim(), 'idle', 'Stopped fly in walking state must be idle');

  // 2. Moving eastward at moderate speed (speed = 40 pt/s) for 10 frames (> 100ms)
  fly.speed = 40;
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 40 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running-right', 'Moderate east walk must be running-right');

  // 3. Accelerates to 90 pt/s: triggers sprinting (running)
  fly.speed = 90;
  fly.pos.x += 90 * dt;
  model.onUpdate(fly, dt);
  assert.equal(model.getCurrentAnim(), 'running', 'Speed >= 85 must enter running');

  // 4. Decelerates to 75 pt/s: hysteresis must keep running
  fly.speed = 75;
  fly.pos.x += 75 * dt;
  model.onUpdate(fly, dt);
  assert.equal(model.getCurrentAnim(), 'running', 'Speed 75 in hysteresis band must stay in running');

  // 5. Decelerates to 50 pt/s for 10 frames (> 100ms): hysteresis clears, returns to running-right
  fly.speed = 50;
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 50 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running-right', 'Speed < 65 must drop out of running to running-right');

  return 'strictly asserted stop->idle, speed 90->running, 75->running (hold), 50->running-right';
});

// 6. Wall Boundary Collision: High internal speed but zero physical displacement
check('Wall collision drops sprinting to idle even with high internal speed', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;
  fly.state = 'walking';
  fly.isEscaping = false;

  // Fly is running at 100 pt/s eastward
  fly.speed = 100;
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 100 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running', 'Must be running at speed 100');

  // Hits wall: clamped, position stops advancing (dx = 0), but internal speed stays 100
  fly.pos.x = 500; // wall edge
  for (let i = 0; i < 5; i++) {
    model.onUpdate(fly, dt); // zero displacement
  }
  assert.equal(model.getCurrentAnim(), 'idle', 'Must drop to idle when physically blocked by wall');

  return 'wall collision with speed=100 correctly drops to idle due to actualSpeed=0';
});

// 7. Stop-to-Move Hysteresis Stability (1.5 ~ 4.0 band)
check('Stop-to-Move hysteresis prevents state chattering between 1.5 and 4.0 pt/s', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;
  fly.state = 'walking';
  fly.isEscaping = false;

  // Start stopped
  fly.speed = 0;
  fly.pos = { x: 0, y: 0 };
  model.onUpdate(fly, dt);
  model.onUpdate(fly, dt);
  assert.equal(model.getCurrentAnim(), 'idle', 'Initial state must be idle');

  // Fluctuates around 2.0 pt/s (below 4.0 move threshold): must stay idle
  for (let i = 0; i < 10; i++) {
    const spd = i % 2 === 0 ? 1.9 : 2.1;
    fly.speed = spd;
    fly.pos.x += spd * dt;
    model.onUpdate(fly, dt);
    assert.equal(model.getCurrentAnim(), 'idle', `Frame ${i} at speed ${spd}: Must hold idle below 4.0 threshold`);
  }

  // Crosses move threshold (speed = 5.0 >= 4.0) for 10 frames (> 100ms): transitions to running-right
  for (let i = 0; i < 10; i++) {
    fly.speed = 5.0;
    fly.pos.x += 5.0 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running-right', 'Must enter running-right at speed 5.0');

  // Drops back to 2.5 pt/s (above 1.5 stop threshold): must remain walking (running-right)
  for (let i = 0; i < 10; i++) {
    fly.speed = 2.5;
    fly.pos.x += 2.5 * dt;
    model.onUpdate(fly, dt);
    assert.equal(model.getCurrentAnim(), 'running-right', `Frame ${i}: Must stay walking above 1.5 stop threshold`);
  }

  // Drops below 1.5 pt/s (speed = 1.0): stops to idle
  for (let i = 0; i < 5; i++) {
    fly.speed = 1.0;
    fly.pos.x += 1.0 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'idle', 'Must drop to idle when speed < 1.5');

  return 'hysteresis band [1.5, 4.0] strictly prevents idle/walk chattering';
});

// 8. Secondary Fly Scare Jump Test (Preserves legacy flight physics without escape: true)
check('Secondary fly scare triggers jumping animation via visualScare without altering flight physics', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;

  // Secondary fly startled by mouse approaching SCARE_RADIUS
  const mouse = { x: 50, y: 0 };
  fly.pos = { x: 0, y: 0 };
  fly.triggerVisualScare();
  fly.startFlight({ width: 1000, height: 1000 }, { awayFrom: mouse }); // escape is false (casual flight physics preserved!)
  assert.equal(fly.isEscaping, false, 'Secondary fly must retain casual flight physics (isEscaping == false)');
  assert.equal(fly.visualScare, true, 'Visual scare flag must be set');
  
  model.onUpdate(fly, dt);
  assert.equal(model.getCurrentAnim(), 'jumping', 'Secondary fly visual scare must trigger jumping');
  assert.equal(model.isOneShotPlaying(), true, 'One-shot must be active on secondary fly');
  assert.equal(fly.visualScare, false, 'Visual scare flag must be consumed after update');

  return 'secondary fly scare correctly triggers jumping while preserving casual flight physics';
});

// 9. High internal speed with low actual speed does not chatter sprinting
check('Sprinting hysteresis strictly relies on actualSpeed, preventing chattering', () => {
  BODY_FORM.current = 'tinyCRT';
  const fly = new Fly({ x: 0, y: 0 });
  const model = fly.model;
  const dt = 1 / 60;
  fly.state = 'walking';
  fly.isEscaping = false;

  // Case: Internal speed = 100, but partially impeded so actualSpeed = 30
  // Under old logic: entered sprint because speed >= 85 && actualSpeed >= 20,
  // then immediately dropped because actualSpeed < 65, chattering every frame.
  // Under new unified logic: actualSpeed (30) < 85, so it NEVER enters sprint and stays walking-right stably.
  fly.pos = { x: 0, y: 0 };
  model.onUpdate(fly, dt); // settle position

  fly.speed = 100;
  let anims = [];
  for (let i = 0; i < 20; i++) {
    fly.pos.x += 30 * dt;
    model.onUpdate(fly, dt);
    anims.push(model.getCurrentAnim());
  }
  const allWalkingRight = anims.every(a => a === 'running-right');
  assert.equal(allWalkingRight, true, `All frames must be stable walking (running-right), no chattering. Got: ${JSON.stringify(anims.slice(0, 5))}`);

  // Now actualSpeed rises to 90 (>= 85 threshold)
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 90 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running', 'Must enter running when actualSpeed >= 85');

  // actualSpeed drops to 70 (in hysteresis band 65~85)
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 70 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running', 'Must stay running in hysteresis band [65, 85]');

  // actualSpeed drops to 60 (< 65 threshold)
  for (let i = 0; i < 10; i++) {
    fly.pos.x += 60 * dt;
    model.onUpdate(fly, dt);
  }
  assert.equal(model.getCurrentAnim(), 'running-right', 'Must exit running to running-right when actualSpeed < 65');

  return 'sprint hysteresis strictly uses actualSpeed, 0 chattering';
});

// 10. Transient visualScare lifecycle and skin swap leakage prevention
check('visualScare expires per frame and does not leak across swapBody() from fly skin to CRT skin', () => {
  // Start with fruit fly skin
  BODY_FORM.current = 'fly';
  const fly = new Fly({ x: 0, y: 0 });
  const dt = 1 / 60;
  const bounds = { width: 1000, height: 1000 };

  // Trigger visual scare on fruit fly skin (e.g. secondary fly startled by mouse)
  fly.triggerVisualScare();
  assert.equal(fly.visualScare, true, 'visualScare flag must be set');

  // Update fruit fly: frame ends, visualScare must expire even though fly skin does not have onUpdate
  fly.update(dt, bounds, null, {});
  assert.equal(fly.visualScare, false, 'visualScare must expire immediately after frame update on any skin');

  // Now simulate another scenario: scare triggered, and before update swapBody() is called
  fly.triggerVisualScare();
  assert.equal(fly.visualScare, true, 'visualScare set prior to swap');
  BODY_FORM.current = 'tinyCRT';
  fly.swapBody();
  assert.equal(fly.visualScare, false, 'swapBody() must clear any residual visualScare flag');

  // Next update on tinyCRT: must NOT trigger jumping
  fly.pos = { x: 0, y: 0 };
  fly.state = 'idle';
  fly.speed = 0;
  fly.update(dt, bounds, null, {});
  assert.notEqual(fly.model.getCurrentAnim?.(), 'jumping', 'Must not trigger jumping after swapping skin');
  assert.equal(fly.model.isOneShotPlaying?.(), false, 'One-shot jumping must remain false');

  return 'visualScare cleanly expires per frame and does not leak across swapBody()';
});

if (failures > 0) {
  console.error(`\n${failures} tests failed.`);
  process.exit(1);
} else {
  console.log('\nALL STRICT TINY CRT TESTS PASS');
}
