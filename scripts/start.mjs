/**
 * scripts/start.mjs
 *
 * `npm start` / `npm run dev`. Launches Electron with ELECTRON_RUN_AS_NODE
 * removed from the environment: editors built on Electron (VS Code among them)
 * leak it into their terminals, and with it set Electron runs as plain Node and
 * the app dies on its first `import ... from 'electron'`.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });

child.on('close', code => process.exit(code ?? 0));
