/**
 * electron/main.js
 *
 * MechaIntro main process: the window, file dialogs, disk access for the
 * renderer, and the ffmpeg side of exporting.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginExport, writeFrame, finishExport, cancelExport, killAllExports } from './export.js';
// One set of dictionaries for both processes; the renderer reports which one is in use.
import { t, setLocale } from '../src/js/i18n/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isDev = process.argv.includes('--dev');

// Functions, not constants: the names are read in whatever language is current.
const PROJECT_FILTER = () => ({ name: t('dialog.filter.project'), extensions: ['mintro'] });
const ASSET_FILTERS = {
	image: () => [{ name: t('dialog.filter.images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }],
	audio: () => [{ name: t('dialog.filter.audio'), extensions: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'webm'] }]
};
const EXPORT_FILTERS = {
	mp4: () => [{ name: t('dialog.filter.mp4'), extensions: ['mp4'] }],
	webm: () => [{ name: t('dialog.filter.webm'), extensions: ['webm'] }]
};

/** @type {BrowserWindow | null} */
let win = null;
let dirty = false;

function createWindow() {
	win = new BrowserWindow({
		width: 1600,
		height: 960,
		minWidth: 1200,
		minHeight: 720,
		title: 'MechaIntro',
		backgroundColor: '#1c1a1f',
		show: false,
		titleBarStyle: 'hidden',
		titleBarOverlay: { color: '#1c1a1f', symbolColor: '#d9c69c', height: 40 },
		// The packaged exe carries its own icon; this one is for running from source.
		icon: join(root, 'build/icon.png'),
		webPreferences: {
			preload: join(root, 'electron/preload.cjs'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false
		}
	});

	win.once('ready-to-show', () => {
		win.maximize();
		win.show();
	});

	win.on('close', event => {
		if (!dirty) {
			return;
		}

		const choice = dialog.showMessageBoxSync(win, {
			type: 'warning',
			buttons: [t('quit.discard'), t('common.cancel')],
			defaultId: 1,
			cancelId: 1,
			title: t('quit.title'),
			message: t('quit.message'),
			detail: t('quit.detail')
		});

		if (choice !== 0) {
			event.preventDefault();
		}
	});

	win.on('closed', () => {
		win = null;
	});

	// Links never open inside the editor.
	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: 'deny' };
	});

	win.loadFile(join(root, 'src/index.html'));

	if (isDev) {
		win.webContents.openDevTools({ mode: 'detach' });
	}
	if (isDev) {
		win.webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
			console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`);
		});
	}
}

function registerIpc() {
	ipcMain.handle('app:set-dirty', (_event, value) => {
		dirty = Boolean(value);
	});

	ipcMain.handle('app:set-locale', (_event, code) => {
		setLocale(code);
	});

	ipcMain.handle('app:set-title', (_event, title) => {
		win?.setTitle(String(title));
	});

	ipcMain.handle('app:about', async () => {
		// Packaged, they sit next to the exe (extraFiles): electron-builder keeps
		// LICENSE and .md files out of the asar.
		const base = app.isPackaged ? dirname(process.execPath) : root;
		const read = name => readFile(join(base, name), 'utf8').catch(() => '');

		return {
			name: app.getName(),
			version: app.getVersion(),
			license: await read('LICENSE'),
			notices: await read('THIRD_PARTY_NOTICES.md')
		};
	});

	ipcMain.handle('project:open', async () => {
		const { canceled, filePaths } = await dialog.showOpenDialog(win, {
			title: t('dialog.openProject'),
			filters: [PROJECT_FILTER()],
			properties: ['openFile']
		});

		if (canceled || !filePaths.length) {
			return null;
		}

		const path = filePaths[0];
		return { path, data: JSON.parse(await readFile(path, 'utf8')) };
	});

	ipcMain.handle('project:save', async (_event, { path, data, saveAs, suggestedName }) => {
		let target = path;

		if (!target || saveAs) {
			const { canceled, filePath } = await dialog.showSaveDialog(win, {
				title: t('dialog.saveProject'),
				defaultPath: target || `${suggestedName || 'intro'}.mintro`,
				filters: [PROJECT_FILTER()]
			});

			if (canceled || !filePath) {
				return null;
			}
			target = filePath;
		}

		await writeFile(target, JSON.stringify(data, null, '\t'), 'utf8');
		return target;
	});

	ipcMain.handle('asset:pick', async (_event, kind) => {
		const { canceled, filePaths } = await dialog.showOpenDialog(win, {
			title: kind === 'audio' ? t('dialog.chooseAudio') : t('dialog.chooseImage'),
			filters: ASSET_FILTERS[kind]?.() || [],
			properties: ['openFile']
		});

		return canceled ? null : filePaths[0] || null;
	});

	ipcMain.handle('asset:read', async (_event, path) => {
		const buffer = await readFile(path);
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	});

	ipcMain.handle('export:pick', async (_event, { format, suggestedName }) => {
		const { canceled, filePath } = await dialog.showSaveDialog(win, {
			title: t('export.title'),
			defaultPath: `${suggestedName || 'intro'}.${format}`,
			filters: EXPORT_FILTERS[format]?.() || []
		});

		return canceled ? null : filePath || null;
	});

	ipcMain.handle('export:begin', (_event, options) => beginExport(options));
	ipcMain.handle('export:frame', (_event, id, frame) => writeFrame(id, frame));
	ipcMain.handle('export:end', (_event, id) => finishExport(id));
	ipcMain.handle('export:cancel', (_event, id) => cancelExport(id));

	ipcMain.handle('shell:reveal', (_event, path) => {
		shell.showItemInFolder(path);
	});
}

app.whenReady().then(() => {
	Menu.setApplicationMenu(null);
	registerIpc();
	createWindow();
});

app.on('window-all-closed', () => {
	killAllExports();
	app.quit();
});
