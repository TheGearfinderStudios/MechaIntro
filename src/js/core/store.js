/**
 * core/store.js
 *
 * The one place the open project lives, plus what the editor is doing with it
 * (selection, playhead, file path). Views subscribe to events and re-read state;
 * nothing writes to the project except through update(), which is what makes
 * undo and the dirty flag work.
 *
 * Events: 'project' ({ source }), 'selection', 'time', 'meta'.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

const HISTORY_LIMIT = 150;

// Edits carrying the same coalesce key this close together are one undo step:
// a drag or a slider sweep is dozens of updates and should undo in one go.
const COALESCE_WINDOW = 1000;

export class Store {
	constructor(project) {
		this.project = project;
		this.path = null;
		this.dirty = false;
		this.selection = { kind: null, id: null };
		this.time = 0;
		this.playing = false;

		this._listeners = new Map();
		this._undo = [];
		this._redo = [];
		this._lastKey = null;
		this._lastAt = 0;
	}

	on(event, listener) {
		if (!this._listeners.has(event)) {
			this._listeners.set(event, new Set());
		}
		this._listeners.get(event).add(listener);
		return () => this._listeners.get(event).delete(listener);
	}

	emit(event, detail = {}) {
		for (const listener of this._listeners.get(event) || []) {
			listener(detail);
		}
	}

	/**
	 * Change the project. `mutate` edits it in place.
	 * @param {(project: object) => void} mutate
	 * @param {{ coalesce?: string, source?: string }} [options]
	 */
	update(mutate, { coalesce = null, source = null } = {}) {
		const now = Date.now();
		const merge = coalesce && coalesce === this._lastKey && now - this._lastAt < COALESCE_WINDOW;

		if (!merge) {
			this._undo.push(JSON.stringify(this.project));
			if (this._undo.length > HISTORY_LIMIT) {
				this._undo.shift();
			}
		}

		this._lastKey = coalesce;
		this._lastAt = now;
		this._redo.length = 0;

		mutate(this.project);
		this._markDirty(true);
		this.emit('project', { source });
	}

	/** Close the current coalescing run, so the next edit is its own undo step. */
	commit() {
		this._lastKey = null;
	}

	get canUndo() {
		return this._undo.length > 0;
	}

	get canRedo() {
		return this._redo.length > 0;
	}

	undo() {
		this._travel(this._undo, this._redo);
	}

	redo() {
		this._travel(this._redo, this._undo);
	}

	_travel(from, to) {
		if (!from.length) {
			return;
		}

		to.push(JSON.stringify(this.project));
		this.project = JSON.parse(from.pop());
		this._lastKey = null;
		this._markDirty(true);

		if (!this.find(this.selection)) {
			this.selection = { kind: null, id: null };
			this.emit('selection');
		}

		this.emit('project', { source: 'history' });
	}

	/** Swap in a whole document (new / open). History starts over. */
	load(project, path = null) {
		this.project = project;
		this.path = path;
		this._undo.length = 0;
		this._redo.length = 0;
		this._lastKey = null;
		this.selection = { kind: null, id: null };
		this.time = 0;
		this._markDirty(false, true);
		this.emit('selection');
		this.emit('project', { source: 'load' });
		this.emit('time');
	}

	markSaved(path) {
		this.path = path;
		this._markDirty(false, true);
	}

	_markDirty(dirty, force = false) {
		if (this.dirty !== dirty || force) {
			this.dirty = dirty;
			this.emit('meta');
		}
	}

	select(kind, id = null) {
		if (this.selection.kind === kind && this.selection.id === id) {
			return;
		}
		this.selection = { kind, id };
		this._lastKey = null;
		this.emit('selection');
	}

	/** The layer or clip a selection points at, or null. */
	find(selection = this.selection) {
		if (selection.kind === 'layer') {
			return this.project.layers.find(layer => layer.id === selection.id) || null;
		}
		if (selection.kind === 'audio') {
			return this.project.audio.find(clip => clip.id === selection.id) || null;
		}
		return null;
	}

	setTime(time) {
		const clamped = Math.min(Math.max(0, time), this.project.settings.duration);

		if (clamped !== this.time) {
			this.time = clamped;
			this.emit('time');
		}
	}

	setPlaying(playing) {
		if (this.playing !== playing) {
			this.playing = playing;
			this.emit('meta');
		}
	}
}
