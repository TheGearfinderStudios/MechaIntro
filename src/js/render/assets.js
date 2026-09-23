/**
 * render/assets.js
 *
 * Images and sounds the project points at on disk, loaded once and shared by the
 * stage, the timeline and the exporter.
 *
 * Bytes come over IPC and become Blob-backed ImageBitmaps / AudioBuffers. Going
 * through a Blob rather than a file:// URL keeps the canvas untainted, which the
 * exporter needs to read pixels back.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { t } from '../i18n/index.js';

export const SAMPLE_RATE = 48000;

const WAVEFORM_BUCKETS = 1600;

export class Assets {
	/** @param {() => void} onChange - called when something finishes loading */
	constructor(onChange) {
		this._onChange = onChange;
		this._images = new Map();
		this._audio = new Map();
		this._waveforms = new Map();
		this._decoder = new OfflineAudioContext(2, 1, SAMPLE_RATE);
	}

	/** The bitmap for `path` if it is ready; otherwise starts loading it and returns null. */
	image(path) {
		if (!path) {
			return null;
		}

		const entry = this._images.get(path);

		if (entry) {
			return entry.bitmap;
		}

		this._loadImage(path);
		return null;
	}

	imageError(path) {
		return this._images.get(path)?.error || null;
	}

	_loadImage(path) {
		const entry = { bitmap: null, error: null, promise: null };

		entry.promise = window.mecha
			.readAsset(path)
			.then(bytes => createImageBitmap(new Blob([bytes])))
			.then(bitmap => {
				entry.bitmap = bitmap;
				this._onChange();
			})
			.catch(error => {
				entry.error = error.message || String(error);
				console.warn(`[assets] image ${path}:`, error);
				this._onChange();
			});

		this._images.set(path, entry);
		return entry;
	}

	async ensureImages(paths) {
		await Promise.all(paths.map(path => (this._images.get(path) || this._loadImage(path)).promise));

		const failed = paths.filter(path => !this._images.get(path).bitmap);
		if (failed.length) {
			throw new Error(t('error.loadAssets', { paths: failed.join(', ') }));
		}
	}

	/** Decoded audio for `path`. The promise is cached, so every caller shares one decode. */
	audio(path) {
		if (!this._audio.has(path)) {
			const promise = window.mecha
				.readAsset(path)
				.then(bytes => this._decoder.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
				.then(buffer => {
					this._onChange();
					return buffer;
				});

			// Drop failures so the next attempt re-reads the file instead of replaying the error.
			promise.catch(() => this._audio.delete(path));
			this._audio.set(path, promise);
		}

		return this._audio.get(path);
	}

	/**
	 * Peak amplitudes of a sound across its whole length, for drawing its waveform.
	 * Null until decoded (the decode is started, and onChange fires when it lands).
	 */
	waveform(path) {
		if (this._waveforms.has(path)) {
			return this._waveforms.get(path);
		}

		this._waveforms.set(path, null);
		this.audio(path)
			.then(buffer => {
				this._waveforms.set(path, peaks(buffer, WAVEFORM_BUCKETS));
				this._onChange();
			})
			.catch(() => this._waveforms.delete(path));

		return null;
	}
}

function peaks(buffer, buckets) {
	const result = new Float32Array(buckets);
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
	const size = buffer.length / buckets;

	for (let b = 0; b < buckets; b++) {
		const from = Math.floor(b * size);
		const to = Math.min(buffer.length, Math.floor((b + 1) * size));
		let peak = 0;

		for (const data of channels) {
			for (let i = from; i < to; i++) {
				const value = Math.abs(data[i]);
				if (value > peak) {
					peak = value;
				}
			}
		}
		result[b] = peak;
	}

	return result;
}
