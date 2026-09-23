/**
 * main.js
 *
 * Renderer entry point: builds the store, the shared asset cache and the player,
 * mounts the views, and wires keyboard shortcuts.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { Store } from './core/store.js';
import { createProject } from './core/project.js';
import { Assets } from './render/assets.js';
import { Player } from './audio/player.js';
import { createCommands } from './commands.js';
import { isEditingText } from './ui/dom.js';
import { TitlebarView } from './ui/titlebar.js';
import { LayersView } from './ui/layers.js';
import { StageView } from './ui/stage.js';
import { InspectorView } from './ui/inspector.js';
import { TimelineView } from './ui/timeline.js';

const store = new Store(createProject());

/** @type {StageView} */ let stage;
/** @type {InspectorView} */ let inspector;
/** @type {TimelineView} */ let timeline;

// An image or sound finishing its load changes what the views draw, but not the
// project, so it gets its own nudge rather than a fake 'project' event.
const assets = new Assets(() => {
	stage?.invalidate();
	timeline?.render();
	if (store.selection.kind !== 'layer' || store.find()?.type === 'image') {
		inspector?.render();
	}
});

const player = new Player(store, assets);
const commands = createCommands({ store, assets, player });
const context = { store, assets, player, commands };

// Handle for the devtools console (`__app.store.project`) and the smoke run.
window.__app = context;

const $ = id => document.getElementById(id);

new TitlebarView($('titlebar'), context);
new LayersView($('layers-panel'), context);
stage = new StageView($('stage-area'), context);
inspector = new InspectorView($('inspector-panel'), context);
timeline = new TimelineView($('timeline-panel'), context);

// ── Timeline splitter ─────────────────────────────────────────────────────

const app = $('app');
const splitter = $('timeline-splitter');

try {
	const saved = Number(localStorage.getItem('timeline-height'));
	if (saved > 0) {
		app.style.setProperty('--timeline-height', `${saved}px`);
	}
} catch {
	// Storage unavailable; the default height stands.
}

splitter.addEventListener('pointerdown', event => {
	const startY = event.clientY;
	const startHeight = $('timeline-panel').getBoundingClientRect().height;
	let height = startHeight;

	const move = e => {
		height = Math.min(window.innerHeight * 0.7, Math.max(140, startHeight - (e.clientY - startY)));
		app.style.setProperty('--timeline-height', `${height}px`);
	};
	const up = () => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		try {
			localStorage.setItem('timeline-height', String(Math.round(height)));
		} catch {
			// Not remembered; harmless.
		}
	};

	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', up);
});

// ── Keyboard ──────────────────────────────────────────────────────────────

window.addEventListener('keydown', event => {
	// Dialogs own the keyboard while open.
	if (document.getElementById('modal-root').childElementCount) {
		return;
	}

	const ctrl = event.ctrlKey || event.metaKey;
	const key = event.key.toLowerCase();

	if (ctrl) {
		const action = {
			z: () => (event.shiftKey ? store.redo() : store.undo()),
			y: () => store.redo(),
			s: () => commands.saveProject(event.shiftKey),
			o: () => commands.openProject(),
			n: () => commands.newProject(),
			e: () => commands.exportVideo(),
			d: () => commands.duplicate()
		}[key];

		// Undo inside a text field belongs to the field.
		if (action && !((key === 'z' || key === 'y') && isEditingText())) {
			event.preventDefault();
			action();
		}
		return;
	}

	if (isEditingText()) {
		return;
	}

	const step = event.shiftKey ? 10 : 1;
	const frame = 1 / store.project.settings.fps;
	const action = {
		' ': () => player.toggle(),
		home: () => player.seek(0),
		end: () => player.seek(store.project.settings.duration),
		delete: () => commands.remove(),
		backspace: () => commands.remove(),
		escape: () => store.select(null),
		',': () => player.seek(store.time - frame * step),
		'.': () => player.seek(store.time + frame * step),
		arrowleft: () => commands.nudge(-step, 0),
		arrowright: () => commands.nudge(step, 0),
		arrowup: () => commands.nudge(0, -step),
		arrowdown: () => commands.nudge(0, step),
		pageup: () => commands.shiftLayer(1),
		pagedown: () => commands.shiftLayer(-1)
	}[key];

	if (action) {
		event.preventDefault();
		action();
	}
});

// Buttons keep focus after a click, and Space would then press them again
// instead of playing; hand focus back to the page.
document.addEventListener('click', event => {
	const button = event.target.closest('button');
	if (button && !button.closest('.modal')) {
		button.blur();
	}
});

// Sync the window title and dirty flag for the initial document.
store.emit('meta');

// Open the starter project mid-way, where its layers have finished coming in;
// at 0:00 everything is still invisible and the stage looks broken.
store.setTime(Math.min(2, store.project.settings.duration / 2));
