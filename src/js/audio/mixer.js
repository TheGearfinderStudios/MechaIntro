/**
 * audio/mixer.js
 *
 * Puts the project's audio clips on a Web Audio graph. The same scheduling runs
 * against a live AudioContext for playback and an OfflineAudioContext for export,
 * so the fades you hear in the editor are the fades in the file.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { clipGainCurve, clipWindow, encodeWav } from '../core/audio.js';
import { SAMPLE_RATE } from '../render/assets.js';

/**
 * Schedule every clip as heard from timeline time `from`, with timeline `from`
 * landing on context time `at`. Returns the source nodes so playback can stop them.
 *
 * @param {BaseAudioContext} context
 * @param {object[]} clips
 * @param {Map<string, AudioBuffer>} buffers - decoded audio by path
 */
export function scheduleClips(context, clips, buffers, from, at, until = Infinity) {
	const sources = [];

	for (const clip of clips) {
		const buffer = buffers.get(clip.path);
		const span = buffer && !clip.muted ? clipWindow(clip, from, until) : null;

		if (!span) {
			continue;
		}

		const source = context.createBufferSource();
		const gain = context.createGain();
		const when = at + span.delay;
		const curve = clipGainCurve(clip, span.local);

		source.buffer = buffer;
		source.connect(gain).connect(context.destination);

		// A value curve may not overlap any other automation event, so the resting
		// value is set directly rather than with setValueAtTime().
		gain.gain.value = curve[0];
		gain.gain.setValueCurveAtTime(curve, when, span.duration);

		source.start(when, span.offset, span.duration);
		sources.push(source);
	}

	return sources;
}

/** Decode everything the clips reference. */
export async function loadClipBuffers(clips, assets) {
	const buffers = new Map();

	await Promise.all(
		[...new Set(clips.map(clip => clip.path))].map(async path => {
			buffers.set(path, await assets.audio(path));
		})
	);

	return buffers;
}

/** The whole project's audio, mixed down to a stereo WAV. Null when there is nothing to hear. */
export async function renderMixdown(project, assets) {
	const clips = project.audio.filter(clip => !clip.muted && clip.start < project.settings.duration);

	if (!clips.length) {
		return null;
	}

	const buffers = await loadClipBuffers(clips, assets);
	const { duration } = project.settings;
	const context = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);

	scheduleClips(context, clips, buffers, 0, 0, duration);

	const mixed = await context.startRendering();
	return encodeWav([mixed.getChannelData(0), mixed.getChannelData(1)], SAMPLE_RATE);
}
