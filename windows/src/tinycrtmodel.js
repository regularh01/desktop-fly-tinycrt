// tinycrtmodel.js — 2D animated retro terminal pet skin for DesktopFly (Windows/Three.js),
// driven by the real FlyWire v783 connectome & MaleCNS v1.0 motor dynamics.
//
// Conforms to the identical FlyModel contract used by flymodel.js, but displays
// an upright, pixel-perfect 2D CRT monitor sprite with 9 animations.

import * as THREE from '../node_modules/three/build/three.module.js';
import { FLY_SCALE } from './flymodel.js';

export const CRT_ANIMATIONS = {
  idle: {
    row: 0, frames: 6,
    durationsMs: [1680, 660, 660, 840, 840, 1920],
    loops: true
  },
  'running-right': {
    row: 1, frames: 8,
    durationsMs: [120, 120, 120, 120, 120, 120, 120, 220],
    loops: true
  },
  'running-left': {
    row: 2, frames: 8,
    durationsMs: [120, 120, 120, 120, 120, 120, 120, 220],
    loops: true
  },
  waving: {
    row: 3, frames: 4,
    durationsMs: [140, 140, 140, 280],
    loops: true
  },
  jumping: {
    row: 4, frames: 5,
    durationsMs: [140, 140, 140, 140, 280],
    loops: false
  },
  failed: {
    row: 5, frames: 8,
    durationsMs: [140, 140, 140, 140, 140, 140, 140, 240],
    loops: true
  },
  waiting: {
    row: 6, frames: 6,
    durationsMs: [150, 150, 150, 150, 150, 260],
    loops: true
  },
  running: {
    row: 7, frames: 6,
    durationsMs: [120, 120, 120, 120, 120, 220],
    loops: true
  },
  review: {
    row: 8, frames: 6,
    durationsMs: [150, 150, 150, 150, 150, 280],
    loops: true
  }
};

function getFrameIndex(spec, timeMs) {
  const total = spec.durationsMs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const t = spec.loops ? timeMs % total : Math.min(timeMs, total - 1);
  let acc = 0;
  for (let i = 0; i < spec.durationsMs.length; i++) {
    acc += spec.durationsMs[i];
    if (t < acc) return Math.min(i, spec.frames - 1);
  }
  return Math.min(spec.durationsMs.length - 1, spec.frames - 1);
}

let cachedTexture = null;

function getSpritesheetTexture() {
  if (cachedTexture) return cachedTexture;
  if (typeof window === 'undefined') {
    // Headless / Node.js test environment: dummy texture
    cachedTexture = new THREE.Texture();
    cachedTexture.repeat.set(1 / 8, 1 / 9);
    return cachedTexture;
  }
  const loader = new THREE.TextureLoader();
  const texPath = new URL('../assets/tiny-crt/spritesheet.webp', import.meta.url).href;
  cachedTexture = loader.load(texPath);
  cachedTexture.magFilter = THREE.NearestFilter;
  cachedTexture.minFilter = THREE.LinearFilter;
  cachedTexture.repeat.set(1 / 8, 1 / 9);
  return cachedTexture;
}

export function buildTinyCRTModel(buildLegFunc, wingMeshFunc) {
  const root = new THREE.Object3D();
  root.scale.set(FLY_SCALE, FLY_SCALE, FLY_SCALE);

  const texture = getSpritesheetTexture().clone();
  texture.repeat.set(1 / 8, 1 / 9);
  texture.offset.set(0, 1 - 1 / 9);

  const geo = new THREE.PlaneGeometry(44, 48);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const planeMesh = new THREE.Mesh(geo, mat);
  planeMesh.position.set(0, 0, 10);
  root.add(planeMesh);

  // Six dummy legs matching real fly geometry to satisfy FlyModel contract and test invariants
  const z = 4.5;
  const specs = [
    [ 1, [ 3.1,  5.3, z],  0.95, 0.0, true,  4.2,  4.8, 3.2],
    [-1, [-3.1,  5.3, z],  0.95, 0.5, true,  4.2,  4.8, 3.2],
    [ 1, [ 3.7,  2.0, z], -0.10, 0.5, false, 4.8,  5.6, 3.8],
    [-1, [-3.7,  2.0, z], -0.10, 0.0, false, 4.8,  5.6, 3.8],
    [ 1, [ 3.3, -1.2, z], -0.95, 0.0, false, 5.8,  7.0, 4.6],
    [-1, [-3.3, -1.2, z], -0.95, 0.5, false, 5.8,  7.0, 4.6]
  ];
  const dummyLegs = [];
  for (const [side, attach, yawOff, phase, front, femur, tibia, tarsus] of specs) {
    const baseYaw = side > 0 ? yawOff : (Math.PI - yawOff);
    const leg = buildLegFunc(attach, baseYaw, side, phase, front, femur, tibia, tarsus);
    leg.root.visible = false;
    root.add(leg.root);
    dummyLegs.append ? dummyLegs.append(leg) : dummyLegs.push(leg);
  }

  // Dummy folded wings and abdomen
  const dummyFoldedWings = new THREE.Object3D();
  dummyFoldedWings.visible = false;
  const dummyW1 = wingMeshFunc ? wingMeshFunc() : new THREE.Object3D();
  const dummyW2 = wingMeshFunc ? wingMeshFunc() : new THREE.Object3D();
  dummyFoldedWings.add(dummyW1);
  dummyFoldedWings.add(dummyW2);
  root.add(dummyFoldedWings);

  const dummyBlurL = new THREE.Object3D();
  dummyBlurL.visible = false;
  dummyBlurL.material = { opacity: 0 };
  root.add(dummyBlurL);

  const dummyBlurR = new THREE.Object3D();
  dummyBlurR.visible = false;
  dummyBlurR.material = { opacity: 0 };
  root.add(dummyBlurR);

  const dummyAbdomen = new THREE.Object3D();
  dummyAbdomen.visible = false;
  root.add(dummyAbdomen);

  let currentAnim = 'idle';
  let animTimeMs = 0;
  let lastHorizontalDir = 1.0;
  let dirHoldTimeMs = 1000.0;

  // Position tracking for true physical displacement
  let lastPosX = null;
  let lastPosY = null;

  // One-shot state control (e.g. escape jumping)
  let isOneShotPlaying = false;
  let oneShotAnim = '';
  let oneShotElapsedMs = 0;
  let lastIsEscaping = false;

  // Hysteresis for running vs walking
  let isSprinting = false;
  let isMoving = false;
  let stateHoldTimeMs = 1000.0;

  function onUpdate(fly, dt) {
    const dtMs = dt * 1000;

    // 1. Calculate true displacement velocity from world coordinates
    let actualVx = 0;
    let actualSpeed = 0;
    if (lastPosX !== null && lastPosY !== null && fly.pos) {
      const dx = fly.pos.x - lastPosX;
      const dy = fly.pos.y - lastPosY;
      if (Math.abs(dx) < 150 && Math.abs(dy) < 150 && dt > 1e-4) {
        actualVx = dx / dt;
        actualSpeed = Math.hypot(dx, dy) / dt;
      } else {
        const moveSign = fly.backwardTimer > 0 ? -1.0 : 1.0;
        actualVx = Math.cos(fly.heading) * (fly.backwardTimer > 0 ? 22 : fly.speed) * moveSign;
        actualSpeed = fly.backwardTimer > 0 ? 22 : fly.speed;
      }
    } else {
      const moveSign = fly.backwardTimer > 0 ? -1.0 : 1.0;
      actualVx = Math.cos(fly.heading) * (fly.backwardTimer > 0 ? 22 : fly.speed) * moveSign;
      actualSpeed = fly.backwardTimer > 0 ? 22 : fly.speed;
    }
    if (fly.pos) {
      lastPosX = fly.pos.x;
      lastPosY = fly.pos.y;
    }

    // 2. Escape scare trigger: strictly via explicit escape flag (rising edge) or visual scare trigger
    const isEscapingNow = Boolean(fly.isEscaping);
    const isEscapeTriggered = (isEscapingNow && !lastIsEscaping) || Boolean(fly.visualScare);
    fly.visualScare = false;
    lastIsEscaping = isEscapingNow;

    if (isEscapeTriggered && !isOneShotPlaying) {
      isOneShotPlaying = true;
      oneShotAnim = 'jumping';
      oneShotElapsedMs = 0;
      currentAnim = 'jumping';
      animTimeMs = 0;
    }

    // 3. Determine target animation
    let targetAnim = currentAnim;

    if (isOneShotPlaying) {
      oneShotElapsedMs += dtMs;
      animTimeMs = oneShotElapsedMs;
      const spec = CRT_ANIMATIONS[oneShotAnim];
      const total = spec ? spec.durationsMs.reduce((a, b) => a + b, 0) : 840;
      if (oneShotElapsedMs >= total) {
        isOneShotPlaying = false;
      }
      targetAnim = oneShotAnim;
    } else {
      // Physical moving vs stopped hysteresis: move >= 4.0, stop < 1.5
      if (isMoving) {
        if (actualSpeed < 1.5 && (!fly.backwardTimer || fly.backwardTimer === 0)) {
          isMoving = false;
        }
      } else {
        if (actualSpeed >= 4.0 || (fly.backwardTimer && fly.backwardTimer > 0)) {
          isMoving = true;
        }
      }

      // Speed hysteresis for sprinting / running:
      // Must be physically moving; drops out if physical speed < 65 OR if stopped
      if (isSprinting) {
        if (!isMoving || actualSpeed < 65.0) isSprinting = false;
      } else {
        if (isMoving && actualSpeed >= 85.0) isSprinting = true;
      }

      if (fly.state === 'flying') {
        // Ongoing flight / takeoff: fast running animation
        targetAnim = 'running';
      } else if (fly.state === 'grooming') {
        // Grooming (aDN1 neuron): waiting / clean screen animation
        targetAnim = 'waiting';
      } else if (fly.state === 'idle' || fly.state === 'sleeping' || !isMoving) {
        targetAnim = 'idle';
      } else if (isSprinting) {
        targetAnim = 'running';
      } else {
        // Walking (including MDN backward stepping)
        dirHoldTimeMs += dtMs;
        let desiredDir = null;
        if (actualVx > 2.0) {
          desiredDir = 1.0;
        } else if (actualVx < -2.0) {
          desiredDir = -1.0;
        }

        if (desiredDir !== null && desiredDir !== lastHorizontalDir) {
          if (dirHoldTimeMs >= 100.0) {
            lastHorizontalDir = desiredDir;
            dirHoldTimeMs = 0;
          }
        }
        targetAnim = lastHorizontalDir > 0 ? 'running-right' : 'running-left';
      }

      stateHoldTimeMs += dtMs;
      if (targetAnim !== currentAnim) {
        if (stateHoldTimeMs >= 100.0 || targetAnim === 'idle' || targetAnim === 'running') {
          currentAnim = targetAnim;
          animTimeMs = 0;
          stateHoldTimeMs = 0;
        }
      } else {
        animTimeMs += dtMs;
      }
    }

    const spec = CRT_ANIMATIONS[currentAnim] || CRT_ANIMATIONS.idle;
    const frameIdx = getFrameIndex(spec, animTimeMs);

    // Update Three.js UV offset
    const col = frameIdx;
    const row = spec.row;
    texture.offset.set(col / 8, 1 - (row + 1) / 9);

    // Cancel Fly node's z-rotation so Tiny CRT stays upright on the desktop
    planeMesh.rotation.set(0, 0, -(fly.heading - Math.PI / 2));
  }

  return {
    root,
    legs: dummyLegs,
    foldedWings: dummyFoldedWings,
    blurWingL: dummyBlurL,
    blurWingR: dummyBlurR,
    abdomen: dummyAbdomen,
    wingFlightSpread: 1.1,
    onUpdate,
    getCurrentAnim: () => currentAnim,
    getCurrentFrame: () => getFrameIndex(CRT_ANIMATIONS[currentAnim] || CRT_ANIMATIONS.idle, animTimeMs),
    isOneShotPlaying: () => isOneShotPlaying,
    getUVOffset: () => ({ x: texture.offset.x, y: texture.offset.y })
  };
}
