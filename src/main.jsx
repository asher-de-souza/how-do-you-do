import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import './styles.css';

const clamp = THREE.MathUtils.clamp;
const RIDE_HEIGHT = 0.24;
const SKATER_COLLISION_RADIUS = 0.42;
const BOARD_FLIP_DURATION = 0.62;
const WALL_HALF_SIZE = 79.5;
const SKATER_WORLD_LIMIT = 77;
const WALL_LENGTH = WALL_HALF_SIZE * 2 + 1;
const GROUND_SIZE = WALL_LENGTH + 6;

const TREE_CONFIGS = [
  [-29, -25, 1.25], [-22, -29, 2.4], [-14, -25, 1.18], [12, -28, 1.05],
  [25, -24, 2.25], [31, -12, 0.92], [28, 0, 1.15], [31, 17, 2.45],
  [22, 26, 1.22], [10, 29, 0.95], [-8, 28, 1.1], [-20, 24, 2.2],
  [-30, 15, 1.05], [-28, 2, 2.05], [-26, -10, 0.98], [8, -20, 0.9],
  [15, -18, 1.95], [-12, 13, 1.06], [-19, 7, 0.92], [21, 12, 1.08],
  [-62, -58, 1.6], [-50, -44, 1.25], [-36, -62, 2.35], [-4, -58, 1.45],
  [22, -58, 1.72], [48, -52, 2.55], [64, -34, 1.38], [58, -8, 1.18],
  [66, 22, 2.1], [46, 43, 1.55], [28, 62, 2.35], [0, 57, 1.25],
  [-24, 65, 1.68], [-52, 51, 2.45], [-66, 26, 1.34], [-59, -4, 1.9],
  [-43, -16, 1.16], [43, 6, 1.28], [54, 28, 1.12], [-38, 38, 1.32],
];

const LAMP_POST_CONFIGS = [
  [-11, -12],
  [10, -10],
  [-23, 2],
  [24, 9],
  [-12, 23],
  [13, 25],
  [-56, -50],
  [-28, -58],
  [34, -52],
  [61, -18],
  [58, 34],
  [18, 59],
  [-28, 58],
  [-61, 20],
  [-54, -18],
];

const ANIMAL_CONFIGS = [
  { type: 'dog', center: [7, 5], radiusX: 8.8, radiusZ: 5.6, speed: 0.72, phase: 0.4, scale: 1.08, color: '#a76a3b', accent: '#f0d7b2' },
  { type: 'cat', center: [-9, 9], radiusX: 6.2, radiusZ: 8.4, speed: 0.9, phase: 2.3, scale: 0.9, color: '#6f757c', accent: '#f3efe0' },
  { type: 'dog', center: [35, -30], radiusX: 13.5, radiusZ: 9.5, speed: 0.5, phase: 4.1, scale: 1.18, color: '#3f2f27', accent: '#c78d5b' },
  { type: 'cat', center: [-39, -34], radiusX: 11.8, radiusZ: 7.6, speed: 0.68, phase: 1.5, scale: 0.88, color: '#d59652', accent: '#fff1d7' },
  { type: 'dog', center: [-45, 35], radiusX: 15.4, radiusZ: 10.2, speed: 0.46, phase: 5.4, scale: 1, color: '#d0b08d', accent: '#5d3b2c' },
  { type: 'cat', center: [48, 40], radiusX: 10.5, radiusZ: 13.6, speed: 0.64, phase: 3.2, scale: 0.92, color: '#20252a', accent: '#d8dde2' },
  { type: 'dog', center: [2, -48], radiusX: 18.2, radiusZ: 7.4, speed: 0.42, phase: 0.9, scale: 1.05, color: '#8c5c3f', accent: '#ffffff' },
  { type: 'cat', center: [-61, 3], radiusX: 7.4, radiusZ: 16.2, speed: 0.58, phase: 4.7, scale: 0.86, color: '#c7b9a5', accent: '#ffffff' },
];

const RAMP_CONFIGS = [
  { position: [-4.6, 0.065, 4.9], rotation: Math.PI / 2, width: 4.4, depth: 2.8, height: 0.78 },
  { position: [4.7, 0.065, -0.8], rotation: -Math.PI / 2, width: 4.4, depth: 2.8, height: 0.78 },
  { position: [0, 0.065, 8.6], rotation: Math.PI, width: 7.4, depth: 3.1, height: 1.05 },
];

const WORLD_COLLIDERS = [
  ...TREE_CONFIGS.map(([x, z, scale]) => ({
    x,
    z,
    radius: SKATER_COLLISION_RADIUS + 0.28 * scale,
  })),
  ...LAMP_POST_CONFIGS.map(([x, z]) => ({
    x,
    z,
    radius: SKATER_COLLISION_RADIUS + 0.18,
  })),
];

function getRampSample(x, z, ramp) {
  const [rampX, rampY, rampZ] = ramp.position;
  const dx = x - rampX;
  const dz = z - rampZ;
  const cos = Math.cos(ramp.rotation);
  const sin = Math.sin(ramp.rotation);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const halfWidth = ramp.width / 2;
  const halfDepth = ramp.depth / 2;
  const wheelAllowance = 0.32;

  if (
    Math.abs(localX) > halfWidth + wheelAllowance ||
    Math.abs(localZ) > halfDepth + wheelAllowance
  ) {
    return null;
  }

  const rampProgress = clamp((localZ + halfDepth) / ramp.depth, 0, 1);

  return {
    rideY: RIDE_HEIGHT + rampY + ramp.height * rampProgress,
    progress: rampProgress,
    localX,
    localZ,
    ramp,
  };
}

function getTerrainSample(x, z) {
  let bestSample = null;

  for (const ramp of RAMP_CONFIGS) {
    const sample = getRampSample(x, z, ramp);
    if (sample && (!bestSample || sample.rideY > bestSample.rideY)) {
      bestSample = sample;
    }
  }

  return bestSample ?? { rideY: RIDE_HEIGHT, progress: 0, ramp: null };
}

function resolveWorldCollisions(position, skater, forward) {
  for (const collider of WORLD_COLLIDERS) {
    const dx = position.x - collider.x;
    const dz = position.z - collider.z;
    const distance = Math.hypot(dx, dz);

    if (distance >= collider.radius) {
      continue;
    }

    const normalX = distance > 0.0001 ? dx / distance : -forward.x;
    const normalZ = distance > 0.0001 ? dz / distance : -forward.z;
    const pushDistance = collider.radius - distance;
    position.x += normalX * pushDistance;
    position.z += normalZ * pushDistance;

    const velocityX = forward.x * skater.speed;
    const velocityZ = forward.z * skater.speed;
    const movingIntoObstacle = velocityX * normalX + velocityZ * normalZ < 0;

    if (movingIntoObstacle) {
      skater.speed *= -0.22;
    } else {
      skater.speed *= 0.72;
    }
  }
}

const keyBindings = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

function useKeyboardInput() {
  const input = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    boost: false,
  });

  useEffect(() => {
    const update = (event, pressed) => {
      const action = keyBindings[event.code];
      if (!action) {
        return;
      }

      event.preventDefault();
      input.current[action] = pressed;
    };

    const onKeyDown = (event) => update(event, true);
    const onKeyUp = (event) => update(event, false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return input;
}

function Landing({ onPlay }) {
  return (
    <main className="landing" aria-label="How do you do, fellow kids landing page">
      <h1 className="landingTitle">How do you do, fellow kids?</h1>
      <div className="landingImageWrap">
        <img className="landingImage" src="/landing.png" alt="" />
        <button className="playButton" type="button" aria-label="Play" onClick={onPlay} />
      </div>
    </main>
  );
}

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const konamiIndex = useRef(0);
  const touchInput = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    boost: false,
  });

  useEffect(() => {
    if (!isPlaying) {
      konamiIndex.current = 0;
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.repeat) {
        return;
      }

      const expectedCode = KONAMI_CODE[konamiIndex.current];

      if (event.code === expectedCode) {
        konamiIndex.current += 1;

        if (konamiIndex.current === KONAMI_CODE.length) {
          konamiIndex.current = 0;
          setConfettiBurst((burst) => burst + 1);
        }

        return;
      }

      konamiIndex.current = event.code === KONAMI_CODE[0] ? 1 : 0;
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isPlaying]);

  return (
    <div className="app">
      {isPlaying ? (
        <div className="gameShell">
          <Canvas
            className="gameCanvas"
            camera={{ position: [0, 4.5, -9], fov: 58, near: 0.1, far: 150 }}
            dpr={[1, 2]}
            shadows
            gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
          >
            <GameScene touchInput={touchInput} />
          </Canvas>
          <button className="helpButton" type="button" aria-label="Open help" aria-expanded={isHelpOpen} onClick={() => setIsHelpOpen(true)}>
            ?
          </button>
          <button
            className="exitButton"
            type="button"
            aria-label="Return to landing page"
            onClick={() => {
              setIsHelpOpen(false);
              setIsPlaying(false);
            }}
          />
          <TouchControls input={touchInput} />
          {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
          {confettiBurst > 0 && <ConfettiShower key={confettiBurst} burstId={confettiBurst} />}
        </div>
      ) : (
        <Landing onPlay={() => setIsPlaying(true)} />
      )}
    </div>
  );
}

function HelpModal({ onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="helpModal" role="presentation" onClick={onClose}>
      <section className="helpDialog" role="dialog" aria-modal="true" aria-labelledby="helpTitle" onClick={(event) => event.stopPropagation()}>
        <button className="helpCloseButton" type="button" aria-label="Close help" onClick={onClose} />
        <h2 id="helpTitle">Controls</h2>
        <ul>
          <li>Ride with W/A/S/D or the arrow keys.</li>
          <li>Press Space to jump.</li>
          <li>Hold Shift to boost, or use Turbo on touch screens.</li>
          <li>Press Shift or Turbo again in the air to flip the board.</li>
          <li>On touch screens, use the directional pad, jump button, and turbo button.</li>
        </ul>
      </section>
    </div>
  );
}

function ConfettiShower({ burstId }) {
  const [visible, setVisible] = useState(true);
  const colors = ['#f94144', '#f9c74f', '#43aa8b', '#577590', '#f3722c', '#90be6d'];
  const pieces = useMemo(() => (
    Array.from({ length: 96 }, (_, index) => {
      const random = (salt) => {
        const value = Math.sin((index + 1) * (burstId + 7) * (salt + 3.73)) * 10000;
        return value - Math.floor(value);
      };

      return {
        id: index,
        color: colors[index % colors.length],
        x: `${Math.round(random(1) * 100)}%`,
        drift: `${Math.round((random(2) - 0.5) * 520)}px`,
        rot: `${Math.round((random(3) - 0.5) * 1080)}deg`,
        delay: `${(random(4) * 0.55).toFixed(2)}s`,
        duration: `${(2.45 + random(5) * 1.35).toFixed(2)}s`,
      };
    })
  ), [burstId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 4200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="confettiLayer" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confettiPiece"
          style={{
            '--x': piece.x,
            '--drift': piece.drift,
            '--rot': piece.rot,
            '--delay': piece.delay,
            '--duration': piece.duration,
            backgroundColor: piece.color,
          }}
        />
      ))}
    </div>
  );
}

function GameScene({ touchInput }) {
  return (
    <>
      <color attach="background" args={['#94c7ef']} />
      <fog attach="fog" args={['#94c7ef', 90, 210]} />
      <hemisphereLight args={['#d8f3ff', '#4d7a48', 1.8]} />
      <directionalLight
        castShadow
        position={[-12, 18, -8]}
        intensity={2.8}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-92}
        shadow-camera-right={92}
        shadow-camera-top={92}
        shadow-camera-bottom={-92}
      />
      <Birds />
      <ParkEnvironment />
      <RunningAnimals />
      <SkaterController touchInput={touchInput} />
    </>
  );
}

function Birds() {
  const birds = useMemo(() => ([
    { radius: 18, height: 11, speed: 0.2, phase: 0.2, scale: 2.15, offsetX: 0, offsetZ: -2 },
    { radius: 23, height: 14, speed: 0.16, phase: 1.8, scale: 1.75, offsetX: -4, offsetZ: 3 },
    { radius: 14, height: 10, speed: 0.26, phase: 3.3, scale: 1.55, offsetX: 6, offsetZ: -5 },
    { radius: 26, height: 13, speed: 0.14, phase: 4.6, scale: 1.95, offsetX: 2, offsetZ: 6 },
    { radius: 20, height: 15, speed: 0.18, phase: 5.5, scale: 1.45, offsetX: -8, offsetZ: -1 },
    { radius: 12, height: 9.5, speed: 0.3, phase: 2.7, scale: 1.35, offsetX: -2, offsetZ: 8 },
  ]), []);

  return (
    <group>
      {birds.map((bird) => (
        <Bird key={bird.phase} {...bird} />
      ))}
    </group>
  );
}

function Bird({ radius, height, speed, phase, scale, offsetX, offsetZ }) {
  const group = useRef();
  const leftWing = useRef();
  const rightWing = useRef();

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    const time = clock.elapsedTime;
    const orbit = phase + time * speed;
    const flap = Math.sin(time * 9.5 + phase) * 0.48;

    group.current.position.set(
      offsetX + Math.cos(orbit) * radius,
      height + Math.sin(time * 0.7 + phase) * 1.3,
      offsetZ + Math.sin(orbit) * radius,
    );
    group.current.rotation.y = -orbit + Math.PI / 2;
    leftWing.current.rotation.z = 0.28 + flap;
    rightWing.current.rotation.z = -0.28 - flap;
  });

  return (
    <group ref={group} scale={scale}>
      <mesh castShadow rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.12, 0.42, 8]} />
        <meshStandardMaterial color="#2a3238" roughness={0.68} />
      </mesh>
      <mesh ref={leftWing} castShadow position={[-0.23, 0, 0]} rotation-z={0.28}>
        <boxGeometry args={[0.5, 0.035, 0.12]} />
        <meshStandardMaterial color="#1f272d" roughness={0.74} />
      </mesh>
      <mesh ref={rightWing} castShadow position={[0.23, 0, 0]} rotation-z={-0.28}>
        <boxGeometry args={[0.5, 0.035, 0.12]} />
        <meshStandardMaterial color="#1f272d" roughness={0.74} />
      </mesh>
    </group>
  );
}

function RunningAnimals() {
  return (
    <group>
      {ANIMAL_CONFIGS.map((animal) => (
        <RunningAnimal key={`${animal.type}-${animal.phase}`} {...animal} />
      ))}
    </group>
  );
}

function RunningAnimal({ type, center, radiusX, radiusZ, speed, phase, scale, color, accent }) {
  const group = useRef();
  const legs = useRef([]);
  const tail = useRef();
  const isDog = type === 'dog';

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const orbit = phase + time * speed;
    const x = center[0] + Math.cos(orbit) * radiusX;
    const z = center[1] + Math.sin(orbit) * radiusZ;
    const heading = Math.atan2(-Math.sin(orbit) * radiusX, Math.cos(orbit) * radiusZ);
    const stride = Math.sin(time * (isDog ? 11 : 13) + phase) * 0.55;
    const bounce = Math.abs(Math.sin(time * (isDog ? 11 : 13) + phase)) * (isDog ? 0.06 : 0.045);

    group.current.position.set(x, 0.02 + bounce, z);
    group.current.rotation.y = heading;

    legs.current.forEach((leg, index) => {
      if (leg) {
        leg.rotation.x = (index % 2 === 0 ? stride : -stride) * (isDog ? 0.7 : 0.82);
      }
    });

    if (tail.current) {
      tail.current.rotation.y = Math.sin(time * 8 + phase) * (isDog ? 0.32 : 0.22);
    }
  });

  return (
    <group ref={group} scale={scale}>
      <mesh castShadow position={[0, 0.36, 0]} rotation-x={Math.PI / 2} scale={isDog ? [1.18, 1, 1] : [0.9, 0.82, 1.25]}>
        <capsuleGeometry args={[isDog ? 0.18 : 0.14, isDog ? 0.46 : 0.5, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, isDog ? 0.48 : 0.45, isDog ? 0.38 : 0.36]} scale={isDog ? [1.05, 0.9, 1] : [0.86, 0.78, 0.9]}>
        <sphereGeometry args={[isDog ? 0.19 : 0.16, 20, 14]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, isDog ? 0.43 : 0.4, isDog ? 0.52 : 0.48]} scale={isDog ? [0.9, 0.72, 0.68] : [0.56, 0.45, 0.78]}>
        <sphereGeometry args={[isDog ? 0.12 : 0.08, 16, 10]} />
        <meshStandardMaterial color={accent} roughness={0.72} />
      </mesh>

      {isDog ? (
        <>
          {[-0.13, 0.13].map((x) => (
            <mesh key={x} castShadow position={[x, 0.5, 0.36]} rotation-z={x < 0 ? 0.42 : -0.42} scale={[0.56, 1, 0.34]}>
              <sphereGeometry args={[0.09, 12, 8]} />
              <meshStandardMaterial color={accent} roughness={0.8} />
            </mesh>
          ))}
          <group ref={tail} position={[0, 0.5, -0.34]} rotation-x={-0.76}>
            <mesh castShadow position={[0, 0.12, -0.02]}>
              <cylinderGeometry args={[0.035, 0.045, 0.35, 10]} />
              <meshStandardMaterial color={accent} roughness={0.78} />
            </mesh>
          </group>
        </>
      ) : (
        <>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} castShadow position={[x, 0.61, 0.34]} rotation-z={x < 0 ? 0.28 : -0.28}>
              <coneGeometry args={[0.055, 0.16, 4]} />
              <meshStandardMaterial color={color} roughness={0.78} />
            </mesh>
          ))}
          <group ref={tail} position={[0, 0.42, -0.36]}>
            <mesh castShadow position={[0, 0.08, -0.12]} rotation-x={-0.88}>
              <cylinderGeometry args={[0.026, 0.034, 0.34, 10]} />
              <meshStandardMaterial color={color} roughness={0.74} />
            </mesh>
            <mesh castShadow position={[0, 0.23, -0.24]} rotation-x={-0.28}>
              <cylinderGeometry args={[0.02, 0.026, 0.28, 10]} />
              <meshStandardMaterial color={color} roughness={0.74} />
            </mesh>
          </group>
        </>
      )}

      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.5, isDog ? 0.54 : 0.48]}>
          <sphereGeometry args={[0.019, 8, 6]} />
          <meshStandardMaterial color="#101416" roughness={0.45} />
        </mesh>
      ))}
      {[[-0.11, -0.18], [0.11, -0.18], [-0.11, 0.2], [0.11, 0.2]].map(([x, z], index) => (
        <group
          key={`${x}-${z}`}
          ref={(node) => {
            legs.current[index] = node;
          }}
          position={[x, 0.19, z]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[isDog ? 0.035 : 0.027, isDog ? 0.032 : 0.024, isDog ? 0.32 : 0.28, 8]} />
            <meshStandardMaterial color={index < 2 ? color : accent} roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, -0.17, 0.035]} scale={[1, 0.42, 1.25]}>
            <sphereGeometry args={[isDog ? 0.045 : 0.034, 10, 8]} />
            <meshStandardMaterial color={index < 2 ? color : accent} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SkaterController({ touchInput }) {
  const group = useRef();
  const board = useRef();
  const torso = useRef();
  const wheels = useRef([]);
  const keyboard = useKeyboardInput();
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraLookAt = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const state = useRef({
    position: new THREE.Vector3(0, RIDE_HEIGHT, -10),
    heading: 0.2,
    speed: 0,
    verticalVelocity: 0,
    grounded: true,
    jumpWasDown: false,
    boostWasDown: false,
    boardFlipTime: 0,
    boardFlipDirection: 1,
  });

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return undefined;
    }

    const debugApi = {
      getPose: () => {
        const skater = state.current;
        const terrain = getTerrainSample(skater.position.x, skater.position.z);

        return {
          x: skater.position.x,
          y: skater.position.y,
          z: skater.position.z,
          heading: skater.heading,
          speed: skater.speed,
          grounded: skater.grounded,
          terrainY: terrain.rideY,
          onRamp: Boolean(terrain.ramp),
        };
      },
      setPose: ({ x = 0, z = -10, heading = 0.2, speed = 0, y = null }) => {
        const skater = state.current;
        const terrain = getTerrainSample(x, z);
        skater.position.set(x, y ?? terrain.rideY, z);
        skater.heading = heading;
        skater.speed = speed;
        skater.verticalVelocity = 0;
        skater.grounded = true;
        skater.jumpWasDown = false;
        skater.boostWasDown = false;
        skater.boardFlipTime = 0;
      },
    };

    window.__skaterDebug = debugApi;

    return () => {
      if (window.__skaterDebug === debugApi) {
        delete window.__skaterDebug;
      }
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const controls = {
      forward: keyboard.current.forward || touchInput.current.forward,
      backward: keyboard.current.backward || touchInput.current.backward,
      left: keyboard.current.left || touchInput.current.left,
      right: keyboard.current.right || touchInput.current.right,
      jump: keyboard.current.jump || touchInput.current.jump,
      boost: keyboard.current.boost || touchInput.current.boost,
    };

    const throttle = (controls.forward ? 1 : 0) - (controls.backward ? 1 : 0);
    const turn = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
    const maxSpeed = controls.boost ? 16 : 11;
    const acceleration = controls.boost ? 17 : 10;
    const friction = throttle === 0 ? 1.9 : 0.72;
    const skater = state.current;
    const jumpPressed = controls.jump && !skater.jumpWasDown;
    const boostPressed = controls.boost && !skater.boostWasDown;
    const wasGrounded = skater.grounded;
    skater.jumpWasDown = controls.jump;
    skater.boostWasDown = controls.boost;

    if (jumpPressed && skater.grounded) {
      skater.verticalVelocity = 8.2;
      skater.grounded = false;
    }

    if (boostPressed) {
      if (wasGrounded) {
        skater.speed = Math.max(skater.speed, 8.5);
      } else {
        skater.boardFlipTime = BOARD_FLIP_DURATION;
        skater.boardFlipDirection = turn !== 0 ? -Math.sign(turn) : -skater.boardFlipDirection;
      }
    }

    skater.speed += throttle * acceleration * dt;
    skater.speed -= skater.speed * friction * dt;
    skater.speed = clamp(skater.speed, -4, maxSpeed);

    const airControl = skater.grounded ? 1 : 0.58;
    const turnGrip = clamp(Math.abs(skater.speed) / 5, 0.24, 1.4) * airControl;
    skater.heading += turn * turnGrip * 2.6 * dt * (skater.speed >= 0 ? 1 : -1);

    forward.set(Math.sin(skater.heading), 0, Math.cos(skater.heading));
    skater.position.x += forward.x * skater.speed * dt;
    skater.position.z += forward.z * skater.speed * dt;
    resolveWorldCollisions(skater.position, skater, forward);

    if (Math.abs(skater.position.x) > SKATER_WORLD_LIMIT) {
      skater.position.x = clamp(skater.position.x, -SKATER_WORLD_LIMIT, SKATER_WORLD_LIMIT);
      skater.speed *= -0.32;
    }

    if (Math.abs(skater.position.z) > SKATER_WORLD_LIMIT) {
      skater.position.z = clamp(skater.position.z, -SKATER_WORLD_LIMIT, SKATER_WORLD_LIMIT);
      skater.speed *= -0.32;
    }

    const terrain = getTerrainSample(skater.position.x, skater.position.z);

    if (skater.grounded) {
      const dropDistance = skater.position.y - terrain.rideY;

      if (dropDistance > 0.16 && !terrain.ramp) {
        skater.grounded = false;
        skater.verticalVelocity = Math.max(skater.verticalVelocity, skater.speed * 0.05);
      } else {
        skater.position.y = terrain.rideY;
        skater.verticalVelocity = 0;
      }
    } else {
      skater.verticalVelocity -= 20.5 * dt;
      skater.position.y += skater.verticalVelocity * dt;

      if (skater.position.y <= terrain.rideY) {
        skater.position.y = terrain.rideY;
        skater.verticalVelocity = 0;
        skater.grounded = true;
        skater.boardFlipTime = 0;
      }
    }

    skater.boardFlipTime = Math.max(0, skater.boardFlipTime - dt);
    const flipProgress = 1 - skater.boardFlipTime / BOARD_FLIP_DURATION;
    const flipRotation = skater.boardFlipTime > 0
      ? skater.boardFlipDirection * flipProgress * Math.PI * 2
      : 0;

    group.current.position.copy(skater.position);
    group.current.rotation.y = skater.heading;
    const rampTilt = terrain.ramp ? -terrain.ramp.height / terrain.ramp.depth : 0;
    board.current.rotation.x = clamp(rampTilt + skater.verticalVelocity / 28, -0.32, 0.28);
    board.current.rotation.z = flipRotation - turn * clamp(Math.abs(skater.speed) / 12, 0, 0.24);
    torso.current.rotation.x = clamp(rampTilt * 0.45 - skater.verticalVelocity / 48, -0.18, 0.18);
    torso.current.rotation.z = -turn * clamp(Math.abs(skater.speed) / 18, 0, 0.18);

    wheels.current.forEach((wheel) => {
      if (wheel) {
        wheel.rotation.x -= skater.speed * dt * 7.5;
      }
    });

    cameraPosition.set(
      skater.position.x - forward.x * 8,
      skater.position.y + 4.4,
      skater.position.z - forward.z * 8,
    );
    camera.position.lerp(cameraPosition, 1 - Math.pow(0.0007, dt));
    cameraLookAt.set(
      skater.position.x + forward.x * 2.2,
      skater.position.y + 1.45,
      skater.position.z + forward.z * 2.2,
    );
    camera.lookAt(cameraLookAt);
  });

  return (
    <group ref={group}>
      <SkaterModel boardRef={board} torsoRef={torso} wheelRefs={wheels} />
    </group>
  );
}

function SkaterModel({ boardRef, torsoRef, wheelRefs }) {
  return (
    <group>
      <group ref={boardRef}>
        <SkateboardDeck />
        {[-0.72, 0.72].map((z) => (
          <Truck key={z} z={z} />
        ))}
        {[[-0.48, 0, -0.72], [0.48, 0, -0.72], [-0.48, 0, 0.72], [0.48, 0, 0.72]].map((position, index) => (
          <SkateWheel
            key={position.join('-')}
            position={position}
            index={index}
            wheelRefs={wheelRefs}
          />
        ))}
      </group>

      <PlayerModel torsoRef={torsoRef} />
    </group>
  );
}

function PlayerModel({ torsoRef }) {
  return (
    <group position={[0, 0.2, 0]}>
      <Sneaker position={[-0.2, 0.32, -0.32]} rotation={-0.16} />
      <Sneaker position={[0.2, 0.32, 0.32]} rotation={0.18} />

      <mesh castShadow position={[-0.18, 0.77, -0.16]} rotation-x={-0.1}>
        <capsuleGeometry args={[0.09, 0.58, 8, 14]} />
        <meshStandardMaterial color="#293343" roughness={0.84} />
      </mesh>
      <mesh castShadow position={[0.18, 0.77, 0.18]} rotation-x={0.1}>
        <capsuleGeometry args={[0.09, 0.58, 8, 14]} />
        <meshStandardMaterial color="#293343" roughness={0.84} />
      </mesh>
      <mesh castShadow position={[-0.18, 0.66, -0.43]} scale={[1, 0.55, 0.42]}>
        <sphereGeometry args={[0.12, 16, 10]} />
        <meshStandardMaterial color="#1f2632" roughness={0.76} />
      </mesh>
      <mesh castShadow position={[0.18, 0.66, 0.45]} scale={[1, 0.55, 0.42]}>
        <sphereGeometry args={[0.12, 16, 10]} />
        <meshStandardMaterial color="#1f2632" roughness={0.76} />
      </mesh>

      <group ref={torsoRef} position={[0, 1.34, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.38, 0.52, 12, 20]} />
          <meshStandardMaterial color="#b83b3d" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 0.02, 0.34]} scale={[0.78, 0.72, 0.09]}>
          <boxGeometry args={[0.68, 0.78, 0.08]} />
          <meshStandardMaterial color="#c8cdd2" roughness={0.88} />
        </mesh>
        <mesh castShadow position={[0, -0.03, 0.395]}>
          <boxGeometry args={[0.028, 0.58, 0.035]} />
          <meshStandardMaterial color="#23272d" roughness={0.64} />
        </mesh>
        <mesh castShadow position={[0, -0.22, 0.41]}>
          <boxGeometry args={[0.42, 0.18, 0.045]} />
          <meshStandardMaterial color="#9d3035" roughness={0.8} />
        </mesh>
        {[-0.08, 0.08].map((x) => (
          <mesh key={x} castShadow position={[x, 0.14, 0.41]} rotation-z={x < 0 ? -0.14 : 0.14}>
            <cylinderGeometry args={[0.009, 0.009, 0.34, 8]} />
            <meshStandardMaterial color="#f4ead7" roughness={0.7} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 0.43, 0]} rotation-x={Math.PI / 2} scale={[1.1, 0.7, 0.38]}>
          <torusGeometry args={[0.22, 0.04, 10, 28]} />
          <meshStandardMaterial color="#942f34" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, 0.02, -0.33]} scale={[0.74, 0.88, 0.28]}>
          <capsuleGeometry args={[0.28, 0.34, 10, 16]} />
          <meshStandardMaterial color="#8e2b31" roughness={0.82} />
        </mesh>
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} castShadow position={[x, 0.04, -0.45]}>
            <boxGeometry args={[0.07, 0.6, 0.045]} />
            <meshStandardMaterial color="#5e242a" roughness={0.82} />
          </mesh>
        ))}

        <mesh castShadow position={[-0.47, 0.02, 0.08]} rotation-z={-0.62}>
          <capsuleGeometry args={[0.075, 0.62, 8, 14]} />
          <meshStandardMaterial color="#b83b3d" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0.47, 0.0, 0.1]} rotation-z={0.62}>
          <capsuleGeometry args={[0.075, 0.62, 8, 14]} />
          <meshStandardMaterial color="#b83b3d" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[-0.67, -0.25, 0.1]} scale={[1.2, 0.72, 1]}>
          <sphereGeometry args={[0.085, 16, 10]} />
          <meshStandardMaterial color="#9d3035" roughness={0.82} />
        </mesh>
        <mesh castShadow position={[0.67, -0.25, 0.1]} scale={[1.2, 0.72, 1]}>
          <sphereGeometry args={[0.085, 16, 10]} />
          <meshStandardMaterial color="#9d3035" roughness={0.82} />
        </mesh>
        <mesh castShadow position={[-0.73, -0.34, 0.1]}>
          <sphereGeometry args={[0.08, 16, 12]} />
          <meshStandardMaterial color="#c98b72" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0.73, -0.34, 0.1]}>
          <sphereGeometry args={[0.08, 16, 12]} />
          <meshStandardMaterial color="#c98b72" roughness={0.78} />
        </mesh>
      </group>

      <mesh castShadow position={[0, 2.03, 0]}>
        <sphereGeometry args={[0.31, 32, 20]} />
        <meshStandardMaterial color="#c98b72" roughness={0.78} />
      </mesh>
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} castShadow position={[x, 2.02, 0]} scale={[0.55, 0.8, 0.36]}>
          <sphereGeometry args={[0.09, 16, 10]} />
          <meshStandardMaterial color="#bd806a" roughness={0.8} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.89, 0.25]} scale={[1.05, 0.78, 0.46]}>
        <sphereGeometry args={[0.24, 24, 16]} />
        <meshStandardMaterial color="#1d1715" roughness={0.88} />
      </mesh>
      <mesh castShadow position={[0, 2.01, 0.31]} scale={[0.66, 0.5, 0.68]}>
        <sphereGeometry args={[0.07, 16, 10]} />
        <meshStandardMaterial color="#b87862" roughness={0.76} />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 2.08, 0.3]}>
          <sphereGeometry args={[0.028, 12, 8]} />
          <meshStandardMaterial color="#171a1d" roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 1.94, 0.305]}>
        <boxGeometry args={[0.14, 0.018, 0.012]} />
        <meshStandardMaterial color="#7e3c36" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[0, 2.25, 0.02]} scale={[1.05, 0.54, 1.05]}>
        <sphereGeometry args={[0.34, 32, 16]} />
        <meshStandardMaterial color="#e83e4a" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[0, 2.42, 0.02]}>
        <sphereGeometry args={[0.04, 14, 10]} />
        <meshStandardMaterial color="#c42f3b" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 2.21, 0.35]} rotation-x={0.12}>
        <boxGeometry args={[0.48, 0.06, 0.34]} />
        <meshStandardMaterial color="#e83e4a" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[0, 2.18, -0.28]} rotation-x={-0.1}>
        <boxGeometry args={[0.34, 0.035, 0.09]} />
        <meshStandardMaterial color="#982934" roughness={0.74} />
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 2.06, 0.31]}>
          <torusGeometry args={[0.105, 0.012, 10, 24]} />
          <meshStandardMaterial color="#d8dde2" metalness={0.6} roughness={0.18} />
        </mesh>
      ))}
      <mesh position={[0, 2.06, 0.31]}>
        <boxGeometry args={[0.08, 0.014, 0.012]} />
        <meshStandardMaterial color="#d8dde2" metalness={0.6} roughness={0.18} />
      </mesh>
    </group>
  );
}

function Sneaker({ position, rotation }) {
  return (
    <group position={position} rotation-x={rotation}>
      <mesh castShadow position={[0, -0.055, 0]}>
        <boxGeometry args={[0.29, 0.052, 0.52]} />
        <meshStandardMaterial color="#171a1d" roughness={0.66} />
      </mesh>
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.24, 0.13, 0.4]} />
        <meshStandardMaterial color="#f2eadb" roughness={0.54} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 0.19]} scale={[0.96, 0.5, 0.7]}>
        <sphereGeometry args={[0.14, 16, 10]} />
        <meshStandardMaterial color="#f2eadb" roughness={0.54} />
      </mesh>
      <mesh castShadow position={[0, 0.07, 0.05]}>
        <boxGeometry args={[0.18, 0.018, 0.18]} />
        <meshStandardMaterial color="#b83b3d" roughness={0.58} />
      </mesh>
    </group>
  );
}

function createDeckShape(width = 0.84, length = 2.24) {
  const shape = new THREE.Shape();
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const shoulder = halfLength - 0.31;

  shape.moveTo(-halfWidth * 0.78, -halfLength);
  shape.bezierCurveTo(-halfWidth, -halfLength, -halfWidth, -shoulder, -halfWidth, -shoulder + 0.08);
  shape.lineTo(-halfWidth, shoulder - 0.08);
  shape.bezierCurveTo(-halfWidth, shoulder, -halfWidth, halfLength, -halfWidth * 0.78, halfLength);
  shape.bezierCurveTo(-halfWidth * 0.24, halfLength + 0.08, halfWidth * 0.24, halfLength + 0.08, halfWidth * 0.78, halfLength);
  shape.bezierCurveTo(halfWidth, halfLength, halfWidth, shoulder, halfWidth, shoulder - 0.08);
  shape.lineTo(halfWidth, -shoulder + 0.08);
  shape.bezierCurveTo(halfWidth, -shoulder, halfWidth, -halfLength, halfWidth * 0.78, -halfLength);
  shape.bezierCurveTo(halfWidth * 0.24, -halfLength - 0.08, -halfWidth * 0.24, -halfLength - 0.08, -halfWidth * 0.78, -halfLength);

  return shape;
}

function SkateboardDeck() {
  const deckGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(createDeckShape(), {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.018,
      bevelThickness: 0.014,
    });
    geometry.center();
    return geometry;
  }, []);
  const gripGeometry = useMemo(() => new THREE.ShapeGeometry(createDeckShape(0.74, 1.86), 28), []);
  const kickGeometry = useMemo(() => new THREE.ShapeGeometry(createDeckShape(0.66, 0.38), 24), []);

  return (
    <>
      <mesh castShadow receiveShadow geometry={deckGeometry} position={[0, 0.12, 0]} rotation-x={Math.PI / 2}>
        <meshStandardMaterial color="#a7663d" roughness={0.7} />
      </mesh>
      <mesh castShadow geometry={gripGeometry} position={[0, 0.168, 0]} rotation-x={Math.PI / 2}>
        <meshStandardMaterial color="#171a1d" roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow geometry={kickGeometry} position={[0, 0.184, 0.91]} rotation-x={Math.PI / 2 - 0.28}>
        <meshStandardMaterial color="#b23334" roughness={0.58} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow geometry={kickGeometry} position={[0, 0.184, -0.91]} rotation-x={Math.PI / 2 + 0.28}>
        <meshStandardMaterial color="#b23334" roughness={0.58} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function Truck({ z }) {
  return (
    <group position={[0, 0, z]}>
      <mesh castShadow position={[0, 0.056, 0]}>
        <boxGeometry args={[0.4, 0.05, 0.22]} />
        <meshStandardMaterial color="#71777f" metalness={0.42} roughness={0.28} />
      </mesh>
      <mesh castShadow position={[0, 0.018, 0]}>
        <boxGeometry args={[0.22, 0.08, 0.16]} />
        <meshStandardMaterial color="#8d949c" metalness={0.5} roughness={0.25} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.052, 0.052, 1.08, 16]} />
        <meshStandardMaterial color="#6f767f" metalness={0.62} roughness={0.22} />
      </mesh>
    </group>
  );
}

function SkateWheel({ position, index, wheelRefs }) {
  const side = position[0] > 0 ? 1 : -1;

  return (
    <group
      ref={(node) => {
        wheelRefs.current[index] = node;
      }}
      position={position}
    >
      <mesh castShadow rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.18, 0.18, 0.18, 28]} />
        <meshStandardMaterial color="#f0e6ad" roughness={0.38} />
      </mesh>
      <mesh castShadow position={[side * 0.096, 0, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.075, 0.075, 0.024, 18]} />
        <meshStandardMaterial color="#c84d4c" roughness={0.42} />
      </mesh>
      <mesh castShadow position={[side * 0.111, 0, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.032, 0.032, 0.024, 14]} />
        <meshStandardMaterial color="#6f767f" metalness={0.65} roughness={0.24} />
      </mesh>
    </group>
  );
}

function ParkEnvironment() {
  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color="#6ba35c" roughness={0.96} />
      </mesh>

      <PathSegment position={[0, 0.024, -14]} length={42} width={4.2} rotation={0.3} />
      <PathSegment position={[-15, 0.026, 5]} length={34} width={3.7} rotation={-0.86} />
      <PathSegment position={[16, 0.026, 8]} length={32} width={3.4} rotation={0.82} />
      <PathSegment position={[0, 0.021, -48]} length={104} width={4.4} rotation={Math.PI / 2} />
      <PathSegment position={[52, 0.021, 0]} length={94} width={4} rotation={0} />
      <PathSegment position={[0, 0.021, 52]} length={108} width={4.1} rotation={Math.PI / 2} />
      <PathSegment position={[-54, 0.021, 0]} length={94} width={4} rotation={0} />
      <PathSegment position={[-38, 0.022, -38]} length={54} width={3.6} rotation={0.74} />
      <PathSegment position={[39, 0.022, 38]} length={58} width={3.6} rotation={0.74} />
      <SkatePlaza />
      <WaterFeature />
      <StoneWalls />
      <TreeGrove />
      <ParkFurniture />
      <Skyline />
    </group>
  );
}

function PathSegment({ position, length, width, rotation }) {
  return (
    <mesh receiveShadow position={position} rotation-y={rotation}>
      <boxGeometry args={[width, 0.055, length]} />
      <meshStandardMaterial color="#d5caa4" roughness={0.93} />
    </mesh>
  );
}

function SkatePlaza() {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.035, 2]}>
        <boxGeometry args={[17, 0.07, 15]} />
        <meshStandardMaterial color="#bfc4bd" roughness={0.86} />
      </mesh>
      {RAMP_CONFIGS.map((ramp) => (
        <Ramp
          key={`${ramp.position[0]}-${ramp.position[2]}`}
          position={ramp.position}
          rotation={ramp.rotation}
          width={ramp.width}
          depth={ramp.depth}
          height={ramp.height}
        />
      ))}
      <mesh castShadow position={[0, 0.68, 2]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.055, 0.055, 8.8, 16]} />
        <meshStandardMaterial color="#6b7279" metalness={0.7} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[-4.4, 0.36, 2]}>
        <boxGeometry args={[0.12, 0.7, 0.12]} />
        <meshStandardMaterial color="#6b7279" metalness={0.7} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[4.4, 0.36, 2]}>
        <boxGeometry args={[0.12, 0.7, 0.12]} />
        <meshStandardMaterial color="#6b7279" metalness={0.7} roughness={0.22} />
      </mesh>
    </group>
  );
}

function Ramp({ position, rotation = 0, width = 4.4, depth = 2.8, height = 0.78 }) {
  const geometry = useMemo(() => {
    const w = width / 2;
    const d = depth / 2;
    const vertices = new Float32Array([
      -w, 0, -d,
      w, 0, -d,
      -w, 0, d,
      w, 0, d,
      -w, height, d,
      w, height, d,
    ]);
    const indices = [
      0, 1, 5, 0, 5, 4,
      2, 4, 5, 2, 5, 3,
      0, 2, 3, 0, 3, 1,
      0, 4, 2,
      1, 3, 5,
    ];
    const ramp = new THREE.BufferGeometry();
    ramp.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    ramp.setIndex(indices);
    ramp.computeVertexNormals();
    return ramp;
  }, [depth, height, width]);

  return (
    <mesh castShadow receiveShadow geometry={geometry} position={position} rotation-y={rotation}>
      <meshStandardMaterial color="#9fa6a0" roughness={0.82} />
    </mesh>
  );
}

function WaterFeature() {
  return (
    <group position={[19, 0.035, -12]}>
      <mesh receiveShadow rotation-x={-Math.PI / 2} scale={[7.8, 3.4, 1]}>
        <circleGeometry args={[1, 72]} />
        <meshStandardMaterial color="#4e9ab8" metalness={0.05} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.035, 0]} rotation-x={-Math.PI / 2} scale={[8.3, 3.9, 1]}>
        <ringGeometry args={[0.98, 1.08, 72]} />
        <meshStandardMaterial color="#8b8575" roughness={0.9} />
      </mesh>
    </group>
  );
}

function StoneWalls() {
  const wallMaterial = <meshStandardMaterial color="#7e8178" roughness={0.92} />;

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.42, -WALL_HALF_SIZE]}>
        <boxGeometry args={[WALL_LENGTH, 0.84, 0.9]} />
        {wallMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.42, WALL_HALF_SIZE]}>
        <boxGeometry args={[WALL_LENGTH, 0.84, 0.9]} />
        {wallMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-WALL_HALF_SIZE, 0.42, 0]}>
        <boxGeometry args={[0.9, 0.84, WALL_LENGTH]} />
        {wallMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[WALL_HALF_SIZE, 0.42, 0]}>
        <boxGeometry args={[0.9, 0.84, WALL_LENGTH]} />
        {wallMaterial}
      </mesh>
    </group>
  );
}

function TreeGrove() {
  return (
    <group>
      {TREE_CONFIGS.map(([x, z, scale]) => (
        <Tree key={`${x}-${z}`} position={[x, 0, z]} scale={scale} />
      ))}
    </group>
  );
}

function Tree({ position, scale }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 1.02, 0]}>
        <cylinderGeometry args={[0.18, 0.24, 2.05, 10]} />
        <meshStandardMaterial color="#7b4e31" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 2.48, 0]}>
        <sphereGeometry args={[0.95, 18, 14]} />
        <meshStandardMaterial color="#2f7b4a" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0.46, 2.18, -0.18]}>
        <sphereGeometry args={[0.62, 16, 12]} />
        <meshStandardMaterial color="#3f9352" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[-0.48, 2.22, 0.18]}>
        <sphereGeometry args={[0.58, 16, 12]} />
        <meshStandardMaterial color="#2f6f43" roughness={0.82} />
      </mesh>
    </group>
  );
}

function ParkFurniture() {
  return (
    <group>
      {[
        [-7.5, -6, 0.2],
        [7.2, 9.2, -0.8],
        [-16.5, 17, 0.9],
        [18.5, -5.6, -0.25],
        [-46, -49, 0.45],
        [38, -48, -0.72],
        [55, 20, 0.2],
        [24, 55, -0.62],
        [-36, 54, 0.68],
        [-59, 7, -0.24],
      ].map(([x, z, rotation]) => (
        <Bench key={`${x}-${z}`} position={[x, 0, z]} rotation={rotation} />
      ))}
      {LAMP_POST_CONFIGS.map(([x, z]) => (
        <LampPost key={`${x}-${z}`} position={[x, 0, z]} />
      ))}
      <FoodCart position={[-24, 0, -19]} rotation={0.5} />
      <FoodCart position={[43, 0, 48]} rotation={-0.65} />
      <FoodCart position={[-57, 0, -42]} rotation={0.92} />
    </group>
  );
}

function Bench({ position, rotation }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh castShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[2.4, 0.16, 0.46]} />
        <meshStandardMaterial color="#6f4428" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, 0.96, -0.24]} rotation-x={-0.18}>
        <boxGeometry args={[2.4, 0.16, 0.5]} />
        <meshStandardMaterial color="#6f4428" roughness={0.78} />
      </mesh>
      {[-0.82, 0.82].map((x) => (
        <mesh key={x} castShadow position={[x, 0.28, 0]}>
          <boxGeometry args={[0.12, 0.5, 0.42]} />
          <meshStandardMaterial color="#3c4144" metalness={0.25} roughness={0.42} />
        </mesh>
      ))}
    </group>
  );
}

function LampPost({ position }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 3.15, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 6.3, 12]} />
        <meshStandardMaterial color="#1f2930" metalness={0.38} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 6.42, 0]}>
        <boxGeometry args={[0.46, 0.12, 0.46]} />
        <meshStandardMaterial color="#1f2930" metalness={0.38} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 6.72, 0]}>
        <sphereGeometry args={[0.32, 18, 14]} />
        <meshStandardMaterial color="#f9e8a6" emissive="#ffce70" emissiveIntensity={0.65} roughness={0.28} />
      </mesh>
      <pointLight position={[0, 6.72, 0]} color="#ffd985" intensity={0.7} distance={12} decay={2} />
    </group>
  );
}

function FoodCart({ position, rotation }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
        <boxGeometry args={[2.2, 1.1, 1.15]} />
        <meshStandardMaterial color="#f5d03d" roughness={0.62} />
      </mesh>
      <mesh castShadow position={[0, 1.42, 0]}>
        <boxGeometry args={[2.55, 0.14, 1.42]} />
        <meshStandardMaterial color="#d43e35" roughness={0.7} />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} castShadow position={[x, 0.05, -0.62]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.23, 0.23, 0.12, 18]} />
          <meshStandardMaterial color="#22252b" roughness={0.58} />
        </mesh>
      ))}
    </group>
  );
}

function Skyline() {
  const buildings = [
    [-73, 8, 22, '#4d5661'],
    [-63, 7, 34, '#66717c'],
    [-54, 9, 27, '#3f4853'],
    [-43, 6, 41, '#5b6470'],
    [-34, 10, 24, '#737d88'],
    [-22, 8, 36, '#454d59'],
    [-12, 7, 29, '#697483'],
    [-2, 11, 46, '#303944'],
    [11, 8, 32, '#687380'],
    [22, 10, 39, '#525d69'],
    [35, 7, 25, '#78818b'],
    [45, 9, 43, '#3d4651'],
    [57, 8, 31, '#5f6975'],
    [68, 10, 37, '#4d5560'],
  ];

  const sides = [
    { id: 'north', position: [0, 0, WALL_HALF_SIZE + 8], rotation: 0, heightShift: 0 },
    { id: 'south', position: [0, 0, -WALL_HALF_SIZE - 8], rotation: Math.PI, heightShift: 4 },
    { id: 'east', position: [WALL_HALF_SIZE + 8, 0, 0], rotation: Math.PI / 2, heightShift: -2 },
    { id: 'west', position: [-WALL_HALF_SIZE - 8, 0, 0], rotation: -Math.PI / 2, heightShift: 2 },
  ];

  return (
    <group>
      {sides.map((side) => (
        <SkylineSide
          key={side.id}
          buildings={buildings}
          position={side.position}
          rotation={side.rotation}
          heightShift={side.heightShift}
        />
      ))}
    </group>
  );
}

function SkylineSide({ buildings, position, rotation, heightShift }) {
  return (
    <group position={position} rotation-y={rotation}>
      {buildings.map(([offset, width, height, color], index) => (
        <Building
          key={`${offset}-${index}`}
          x={offset}
          width={width}
          height={Math.max(18, height + heightShift + (index % 3) * 2)}
          depth={6 + (index % 4)}
          color={color}
          seed={offset + heightShift * 11 + index}
        />
      ))}
      <mesh receiveShadow position={[0, 0.5, -1.2]}>
        <boxGeometry args={[WALL_LENGTH + 8, 1, 2.1]} />
        <meshStandardMaterial color="#606761" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Building({ x, width, height, depth = 6, color, seed = x }) {
  const windows = useMemo(() => {
    const cells = [];
    const columns = Math.max(2, Math.floor(width / 1.4));
    const rows = Math.max(3, Math.floor(height / 2.3));

    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        if ((column + row + Math.round(seed)) % 4 !== 0) {
          cells.push([
            -width / 2 + 0.72 + column * ((width - 1.4) / Math.max(1, columns - 1)),
            2.1 + row * ((height - 4) / Math.max(1, rows - 1)),
          ]);
        }
      }
    }

    return cells;
  }, [height, seed, width]);

  return (
    <group position={[x, 0, 0]}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      {windows.map(([wx, wy]) => (
        <mesh key={`${wx}-${wy}`} position={[wx, wy, -depth / 2 - 0.04]}>
          <planeGeometry args={[0.42, 0.78]} />
          <meshBasicMaterial color="#f7dc86" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function TouchControls({ input }) {
  const setInput = (name, value) => (event) => {
    event.preventDefault();
    input.current[name] = value;
  };

  return (
    <div className="touchControls" aria-hidden="true">
      <button className="touchButton touchForward" onPointerDown={setInput('forward', true)} onPointerUp={setInput('forward', false)} onPointerLeave={setInput('forward', false)}>
        ▲
      </button>
      <button className="touchButton touchLeft" onPointerDown={setInput('left', true)} onPointerUp={setInput('left', false)} onPointerLeave={setInput('left', false)}>
        ◀
      </button>
      <button className="touchButton touchRight" onPointerDown={setInput('right', true)} onPointerUp={setInput('right', false)} onPointerLeave={setInput('right', false)}>
        ▶
      </button>
      <button className="touchButton touchBack" onPointerDown={setInput('backward', true)} onPointerUp={setInput('backward', false)} onPointerLeave={setInput('backward', false)}>
        ▼
      </button>
      <button className="touchButton touchTurbo" onPointerDown={setInput('boost', true)} onPointerUp={setInput('boost', false)} onPointerLeave={setInput('boost', false)}>
        ⚡
      </button>
      <button className="touchButton touchJump" onPointerDown={setInput('jump', true)} onPointerUp={setInput('jump', false)} onPointerLeave={setInput('jump', false)}>
        ●
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
