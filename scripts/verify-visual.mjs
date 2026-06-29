import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === '--') {
  cliArgs.shift();
}
const appUrl = cliArgs[0] ?? process.env.APP_URL ?? 'http://localhost:5173/';
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const artifactDir = resolve('artifacts');
const userDataDir = join(tmpdir(), `fellow-kids-skate-chrome-profile-${process.pid}`);
const port = 9300 + Math.floor(Math.random() * 400);

if (!existsSync(chromePath)) {
  throw new Error(`Chrome was not found at ${chromePath}`);
}

mkdirSync(artifactDir, { recursive: true });
rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--enable-webgl2',
  '--hide-scrollbars',
  '--ignore-gpu-blocklist',
  '--no-first-run',
  '--no-default-browser-check',
  '--use-angle=swiftshader',
  'about:blank',
], {
  stdio: ['ignore', 'ignore', 'pipe'],
});

let stderr = '';
chrome.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function stopChrome() {
  return new Promise((resolveStop) => {
    if (chrome.exitCode !== null) {
      resolveStop();
      return;
    }

    const forceKill = setTimeout(() => {
      chrome.kill('SIGKILL');
    }, 1500);

    chrome.once('exit', () => {
      clearTimeout(forceKill);
      resolveStop();
    });
    chrome.kill('SIGTERM');
  });
}

function getJson(path, method = 'GET') {
  return new Promise((resolveJson, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`CDP HTTP ${res.statusCode}: ${body}`));
          return;
        }

        resolveJson(JSON.parse(body));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await getJson('/json/version');
      return;
    } catch {
      await delay(100);
    }
  }

  throw new Error(`Chrome did not expose CDP. stderr: ${stderr}`);
}

async function connectToPage() {
  let targets = await getJson('/json');
  let target = targets.find((item) => item.type === 'page');

  if (!target) {
    target = await getJson('/json/new?about%3Ablank', 'PUT');
  }

  return createCdpClient(target.webSocketDebuggerUrl);
}

function createCdpClient(wsUrl) {
  let nextId = 1;
  const pending = new Map();
  const eventWaiters = new Map();
  const ws = new WebSocket(wsUrl);

  const opened = new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', rejectOpen, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolveSend, rejectSend } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        rejectSend(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
      } else {
        resolveSend(message.result);
      }

      return;
    }

    if (message.method && eventWaiters.has(message.method)) {
      const waiters = eventWaiters.get(message.method);
      eventWaiters.delete(message.method);
      waiters.forEach((resolveWaiter) => resolveWaiter(message.params ?? {}));
    }
  });

  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId;
      nextId += 1;

      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolveSend, rejectSend });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    waitForEvent(method, timeoutMs = 8000) {
      return new Promise((resolveWaiter, rejectWaiter) => {
        const timeout = setTimeout(() => {
          rejectWaiter(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);

        const wrappedResolve = (params) => {
          clearTimeout(timeout);
          resolveWaiter(params);
        };

        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(wrappedResolve);
        eventWaiters.set(method, waiters);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }

  return result.result.value;
}

async function navigate(client, url) {
  const loaded = client.waitForEvent('Page.loadEventFired').catch(() => null);
  await client.send('Page.navigate', { url });
  await loaded;
  await delay(800);
}

async function setViewport(client, width, height, mobile = false) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: mobile,
  });
}

async function screenshot(client, name) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });
  const filePath = join(artifactDir, name);
  writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  return filePath;
}

async function verifyLanding(client, label) {
  const stats = await evaluate(client, `(() => {
    const landing = document.querySelector('.landing');
    const title = document.querySelector('.landingTitle');
    const image = document.querySelector('.landingImage');
    const button = document.querySelector('.playButton');
    if (!landing || !title || !image || !button) {
      return {
        ok: false,
        reason: 'missing landing title, image, or play button',
        href: location.href,
        title: document.title,
        html: document.documentElement.outerHTML.slice(0, 600),
      };
    }

    const buttonRect = button.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;

    return {
      ok: true,
      hasTitle: title.innerText.trim().toLowerCase() === 'how do you do, fellow kids?',
      hasLandingImage: image.currentSrc.includes('landing.png') || image.src.includes('landing.png'),
      imageWidth: Math.round(imageRect.width),
      imageHeight: Math.round(imageRect.height),
      buttonWidth: Math.round(buttonRect.width),
      buttonHeight: Math.round(buttonRect.height),
      centerX: Math.round(centerX),
      centerY: Math.round(centerY),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      imageIsSmaller: imageRect.width < Math.min(420, window.innerWidth * 0.78) &&
        imageRect.height < window.innerHeight * 0.72,
      buttonCenteredOnImage: Math.abs(centerX - (imageRect.left + imageRect.width / 2)) < 3 &&
        Math.abs(centerY - (imageRect.top + imageRect.height / 2)) < 3,
    };
  })()`);

  if (!stats.ok || !stats.hasTitle || !stats.hasLandingImage || !stats.imageIsSmaller || !stats.buttonCenteredOnImage) {
    throw new Error(`${label} landing failed: ${JSON.stringify(stats)}`);
  }

  return stats;
}

async function verifyCanvas(client, label) {
  const stats = await evaluate(client, `(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return {
        ok: false,
        reason: 'missing canvas',
        href: location.href,
        title: document.title,
        errors: window.__visualErrors ?? [],
        body: document.body.innerHTML.slice(0, 900),
      };
    }

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      return { ok: false, reason: 'missing webgl context', width: canvas.width, height: canvas.height };
    }

    const points = [
      [0.18, 0.22],
      [0.5, 0.5],
      [0.82, 0.32],
      [0.35, 0.74],
      [0.68, 0.82],
    ];
    const colors = points.map(([px, py]) => {
      const x = Math.max(0, Math.min(gl.drawingBufferWidth - 1, Math.floor(gl.drawingBufferWidth * px)));
      const y = Math.max(0, Math.min(gl.drawingBufferHeight - 1, Math.floor(gl.drawingBufferHeight * py)));
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel);
    });
    const unique = new Set(colors.map((color) => color.join(','))).size;
    const nonBlank = colors.some(([r, g, b, a]) => a > 0 && r + g + b > 20);
    const rect = canvas.getBoundingClientRect();

    return {
      ok: nonBlank && unique > 1,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      rect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      unique,
      colors,
    };
  })()`);

  if (!stats.ok) {
    throw new Error(`${label} canvas failed: ${JSON.stringify(stats)}`);
  }

  return stats;
}

async function clickPlay(client) {
  await evaluate(client, `document.querySelector('.playButton')?.click(); true`);
  await delay(2200);
}

async function verifyHelpModal(client) {
  await evaluate(client, `document.querySelector('.helpButton')?.click(); true`);
  await delay(250);
  const stats = await evaluate(client, `(() => {
    const dialog = document.querySelector('.helpDialog');
    const text = dialog?.innerText ?? '';
    const opened = Boolean(dialog);
    const hasControls = text.includes('Controls');
    const hasJump = text.includes('Space to jump');
    const hasBoost = text.includes('Shift to boost');
    return {
      opened,
      hasControls,
      hasJump,
      hasBoost,
      hasHelpButton: Boolean(document.querySelector('.helpButton')),
    };
  })()`);

  if (!stats.opened || !stats.hasControls || !stats.hasJump || !stats.hasBoost) {
    throw new Error(`help modal failed: ${JSON.stringify(stats)}`);
  }

  await evaluate(client, `document.querySelector('.helpCloseButton')?.click(); true`);
  await delay(250);
  return stats;
}

async function verifyWorldInteractions(client) {
  const rampStats = await evaluate(client, `(() => {
    window.__skaterDebug?.setPose({ x: 0, z: 10.2, heading: Math.PI, speed: 8 });
    return Boolean(window.__skaterDebug);
  })()`);

  if (!rampStats) {
    throw new Error('skater debug API was not available for world interaction checks');
  }

  await delay(950);
  const rampPose = await evaluate(client, `window.__skaterDebug.getPose()`);

  await evaluate(client, `(() => {
    window.__skaterDebug.setPose({ x: 8, z: -18.8, heading: Math.PI, speed: 8 });
    return true;
  })()`);
  await delay(650);
  const collisionPose = await evaluate(client, `(() => {
    const pose = window.__skaterDebug.getPose();
    return {
      ...pose,
      distanceFromTree: Math.hypot(pose.x - 8, pose.z + 20),
    };
  })()`);

  await evaluate(client, `(() => {
    window.__skaterDebug.setPose({ x: 0, z: -10, heading: 0.2, speed: 0 });
    return true;
  })()`);
  await delay(300);

  const checks = {
    rampRaisedSkater: rampPose.y > 0.55,
    rampDetected: rampPose.onRamp,
    treeCollisionHeld: collisionPose.distanceFromTree > 0.62,
  };

  if (!checks.rampRaisedSkater || !checks.rampDetected || !checks.treeCollisionHeld) {
    throw new Error(`world interaction checks failed: ${JSON.stringify({ checks, rampPose, collisionPose })}`);
  }

  return {
    rampY: Number(rampPose.y.toFixed(3)),
    rampDetected: rampPose.onRamp,
    treeDistance: Number(collisionPose.distanceFromTree.toFixed(3)),
  };
}

async function verifyKonamiConfetti(client) {
  const stats = await evaluate(client, `(() => {
    const codes = [
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

    for (const code of codes) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    }

    return true;
  })()`);

  if (!stats) {
    throw new Error('Konami input dispatch failed');
  }

  await delay(200);
  const confetti = await evaluate(client, `(() => ({
    layerVisible: Boolean(document.querySelector('.confettiLayer')),
    pieceCount: document.querySelectorAll('.confettiPiece').length,
  }))()`);

  if (!confetti.layerVisible || confetti.pieceCount < 80) {
    throw new Error(`Konami confetti failed: ${JSON.stringify(confetti)}`);
  }

  return confetti;
}

async function nudgeSkater(client) {
  await evaluate(client, `(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true }));
    return true;
  })()`);
  await delay(950);
  await evaluate(client, `(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd', bubbles: true }));
    return true;
  })()`);
  await delay(350);
  await evaluate(client, `(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    return true;
  })()`);
  await delay(120);
  await evaluate(client, `(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
    return true;
  })()`);
  await delay(260);
}

let client;

try {
  await waitForChrome();
  client = await connectToPage();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__visualErrors = [];
      window.addEventListener('error', (event) => {
        window.__visualErrors.push(String(event.error?.stack || event.message || 'unknown error'));
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__visualErrors.push(String(event.reason?.stack || event.reason || 'unknown rejection'));
      });
    `,
  });

  await setViewport(client, 1280, 800, false);
  await navigate(client, appUrl);
  const desktopLanding = await verifyLanding(client, 'desktop');
  const desktopLandingShot = await screenshot(client, 'landing-desktop.png');
  await clickPlay(client);
  const helpModal = await verifyHelpModal(client);
  const worldInteractions = await verifyWorldInteractions(client);
  const konamiConfetti = await verifyKonamiConfetti(client);
  await nudgeSkater(client);
  const desktopCanvas = await verifyCanvas(client, 'desktop');
  const desktopSceneShot = await screenshot(client, 'scene-desktop.png');

  await setViewport(client, 390, 844, true);
  await navigate(client, appUrl);
  const mobileLanding = await verifyLanding(client, 'mobile');
  const mobileLandingShot = await screenshot(client, 'landing-mobile.png');
  await clickPlay(client);
  const mobileCanvas = await verifyCanvas(client, 'mobile');
  const mobileSceneShot = await screenshot(client, 'scene-mobile.png');

  console.log(JSON.stringify({
    desktopLanding,
    helpModal,
    worldInteractions,
    konamiConfetti,
    desktopCanvas,
    desktopLandingShot,
    desktopSceneShot,
    mobileLanding,
    mobileCanvas,
    mobileLandingShot,
    mobileSceneShot,
  }, null, 2));
} finally {
  client?.close();
  await stopChrome();
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
