/**
 * core/audio.js
 *
 * The arithmetic behind the audio track: how loud a clip is at any point in its
 * life, and how a mixed buffer becomes a WAV file for ffmpeg.
 *
 * Fades use an equal-power (sine) curve: a linear gain ramp sounds like it drops
 * off a cliff at the end, this one sounds like a fade.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

/** Gain of `clip` `local` seconds after its start on the timeline. */
export function clipGainAt(clip, local) {
	const volume = clip.muted ? 0 : Math.max(0, Number(clip.volume) || 0);
	const length = Math.max(0, Number(clip.length) || 0);

	if (local < 0 || local > length) {
		return 0;
	}

	let envelope = 1;
	const fadeIn = Math.min(Number(clip.fadeIn) || 0, length);
	const fadeOut = Math.min(Number(clip.fadeOut) || 0, length);

	if (fadeIn > 0 && local < fadeIn) {
		envelope = Math.min(envelope, Math.sin((local / fadeIn) * (Math.PI / 2)));
	}
	if (fadeOut > 0 && local > length - fadeOut) {
		envelope = Math.min(envelope, Math.sin(((length - local) / fadeOut) * (Math.PI / 2)));
	}

	return volume * Math.max(0, envelope);
}

/**
 * The gain envelope from `fromLocal` to the clip's end, sampled `rate` times per
 * second, for AudioParam.setValueCurveAtTime().
 */
export function clipGainCurve(clip, fromLocal = 0, rate = 200) {
	const remaining = Math.max(0, clip.length - fromLocal);
	const count = Math.max(2, Math.ceil(remaining * rate) + 1);
	const curve = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		curve[i] = clipGainAt(clip, fromLocal + (remaining * i) / (count - 1));
	}

	return curve;
}

/**
 * Where a clip lands relative to a playhead at `from` (seconds on the timeline):
 * how long until it starts, where in the source file to begin, and for how long.
 * Null when the clip is already over.
 */
export function clipWindow(clip, from, until = Infinity) {
	const end = Math.min(clip.start + clip.length, until);

	if (end <= from || clip.length <= 0) {
		return null;
	}

	const skipped = Math.max(0, from - clip.start);

	return {
		delay: Math.max(0, clip.start - from),
		local: skipped,
		offset: (Number(clip.trimStart) || 0) + skipped,
		duration: end - Math.max(from, clip.start)
	};
}

/** 16-bit PCM WAV from per-channel Float32Arrays. */
export function encodeWav(channels, sampleRate) {
	const channelCount = channels.length;
	const frames = channels[0]?.length || 0;
	const dataSize = frames * channelCount * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	const ascii = (offset, text) => {
		for (let i = 0; i < text.length; i++) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};

	ascii(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * 2, true);
	view.setUint16(32, channelCount * 2, true);
	view.setUint16(34, 16, true);
	ascii(36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channelCount; c++) {
			const sample = Math.max(-1, Math.min(1, channels[c][i]));
			view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
			offset += 2;
		}
	}

	return new Uint8Array(buffer);
}
