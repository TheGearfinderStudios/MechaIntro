/**
 * audio/player.js
 *
 * Playback transport. The audio clock drives the playhead while playing, so
 * picture and sound cannot drift apart however long the preview runs.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { loadClipBuffers, scheduleClips } from './mixer.js';
import { SAMPLE_RATE } from '../render/assets.js';

// Headroom between asking for a sound and it starting, so the first few
// milliseconds of each clip are not lost to scheduling latency.
const LEAD = 0.05;

export class Player {
	constructor(store, assets) {
		this.store = store;
		this.assets = assets;
		this.loop = false;

		this._context = null;
		this._sources = [];
		this._anchorContext = 0;
		this._anchorTime = 0;
		this._frame = 0;
		this._session = 0;

		// Editing a clip, or the project length, while it plays: pick the sound back up
		// from where the playhead is rather than finishing with stale fades.
		store.on('project', () => {
			if (store.playing) {
				this._restart();
			}
		});
	}

	get context() {
		if (!this._context) {
			this._context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
		}
		return this._context;
	}

	toggle() {
		if (this.store.playing) {
			this.pause();
		} else {
			this.play();
		}
	}

	async play() {
		const { store } = this;

		if (store.playing) {
			return;
		}
		if (store.time >= store.project.settings.duration - 1e-3) {
			store.setTime(0);
		}

		store.setPlaying(true);
		await this.context.resume();
		await this._restart();
		this._tick();
	}

	pause() {
		this._stopSources();
		this._session++;
		cancelAnimationFrame(this._frame);
		this.store.setPlaying(false);
	}

	stop() {
		this.pause();
		this.store.setTime(0);
	}

	/** Move the playhead; if playing, the sound follows it. */
	seek(time) {
		this.store.setTime(time);
		if (this.store.playing) {
			this._restart();
		}
	}

	async _restart() {
		const session = ++this._session;
		const { project } = this.store;
		let buffers;

		try {
			buffers = await loadClipBuffers(project.audio, this.assets);
		} catch (error) {
			console.warn('[player] audio unavailable:', error);
			buffers = new Map();
		}

		// A pause or another restart happened while decoding; that one wins.
		if (session !== this._session || !this.store.playing) {
			return;
		}

		this._stopSources();
		this._anchorTime = this.store.time;
		this._anchorContext = this.context.currentTime + LEAD;
		this._sources = scheduleClips(
			this.context,
			project.audio,
			buffers,
			this._anchorTime,
			this._anchorContext,
			project.settings.duration
		);
	}

	_stopSources() {
		for (const source of this._sources) {
			try {
				source.stop();
			} catch {
				// Already finished.
			}
		}
		this._sources = [];
	}

	_tick() {
		const { store } = this;

		if (!store.playing) {
			return;
		}

		const elapsed = Math.max(0, this.context.currentTime - this._anchorContext);
		const time = this._anchorTime + elapsed;
		const { duration } = store.project.settings;

		if (time >= duration) {
			if (this.loop) {
				store.setTime(0);
				this._restart();
			} else {
				store.setTime(duration);
				this.pause();
				return;
			}
		} else {
			store.setTime(time);
		}

		this._frame = requestAnimationFrame(() => this._tick());
	}
}
