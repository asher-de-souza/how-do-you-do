import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] ?? 'dev';
const extraArgs = process.argv.slice(3);
if (extraArgs[0] === '--') {
  extraArgs.shift();
}
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const safeRoot = join(tmpdir(), 'fellow-kids-skate-vite');
const copiedFiles = ['index.html', 'package.json', 'pnpm-lock.yaml', 'vite.config.js'];
const copiedDirs = ['src', 'public'];

function copyPath(from, to) {
  if (!existsSync(from)) {
    return;
  }

  mkdirSync(dirname(to), { recursive: true });
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

function copyProject() {
  mkdirSync(safeRoot, { recursive: true });

  for (const file of copiedFiles) {
    copyPath(join(projectRoot, file), join(safeRoot, file));
  }

  for (const dir of copiedDirs) {
    copyPath(join(projectRoot, dir), join(safeRoot, dir));
  }
}

function installDependencies() {
  const result = spawnSync('pnpm', ['install', '--prefer-offline'], {
    cwd: safeRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function run(command, args) {
  const child = spawn(command, args, {
    cwd: safeRoot,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (mode === 'build' && code === 0) {
      copyPath(join(safeRoot, 'dist'), join(projectRoot, 'dist'));
    }

    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

copyProject();
installDependencies();

if (mode === 'dev') {
  run('pnpm', ['exec', 'vite', '--host', '0.0.0.0', ...extraArgs]);
} else if (mode === 'build') {
  run('pnpm', ['exec', 'vite', 'build', ...extraArgs]);
} else if (mode === 'preview') {
  run('pnpm', ['exec', 'vite', 'preview', '--host', '0.0.0.0', ...extraArgs]);
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}
