/**
 * core/animation.js
 *
 * Where a layer is, and how it looks, at a given moment.
 *
 * Every entrance is a pose parameterised by p: 0 is fully hidden, 1 is at rest.
 * Exits reuse the same poses played backwards, with the offsets mirrored so an
 * element that slid up on its way in keeps travelling up on its way out.
 *
 * On top of that sits the layer's motion: a loop that runs for as long as the
 * layer is on screen (a gear turning, a logo breathing).
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { ease } from './easing.js';

/** [value, i18n key] */
export const ANIMATIONS = ['none', 'fade', 'zoom', 'zoom-out', 'pop', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'spin', 'blur', 'drop'].map(
	name => [name, `animation.${name}`]
);

/** [value, i18n key] */
export const MOTIONS = ['none', 'rotate', 'pulse', 'float', 'swing'].map(name => [name, `motion.${name}`]);

const clamp01 = v => Math.min(1, Math.max(0, v));

/**
 * The pose of an entrance at progress p (already eased).
 * Offsets are fractions of the canvas so a preset reads the same at any resolution.
 */
export function entrancePose(type, p, width, height) {
	const pose = { dx: 0, dy: 0, scale: 1, rotation: 0, alpha: 1, blur: 0 };
	const hidden = 1 - p;

	switch (type) {
		case 'fade':
			pose.alpha = clamp01(p);
			break;
		case 'zoom':
			pose.scale = 0.5 + 0.5 * p;
			pose.alpha = clamp01(p);
			break;
		case 'zoom-out':
			pose.scale = 1.6 - 0.6 * p;
			pose.alpha = clamp01(p);
			break;
		case 'pop':
			pose.scale = Math.max(0, p);
			pose.alpha = clamp01(p * 3);
			break;
		case 'slide-up':
			pose.dy = hidden * height * 0.15;
			pose.alpha = clamp01(p);
			break;
		case 'slide-down':
			pose.dy = -hidden * height * 0.15;
			pose.alpha = clamp01(p);
			break;
		case 'slide-left':
			pose.dx = hidden * width * 0.15;
			pose.alpha = clamp01(p);
			break;
		case 'slide-right':
			pose.dx = -hidden * width * 0.15;
			pose.alpha = clamp01(p);
			break;
		case 'spin':
			pose.rotation = -hidden * Math.PI;
			pose.scale = Math.max(0, 0.3 + 0.7 * p);
			pose.alpha = clamp01(p);
			break;
		case 'blur':
			pose.blur = Math.max(0, hidden * 24);
			pose.scale = 1.08 - 0.08 * p;
			pose.alpha = clamp01(p);
			break;
		case 'drop':
			pose.dy = -hidden * height * 0.35;
			pose.alpha = clamp01(p * 4);
			break;
	}

	return pose;
}

/** The loop a layer runs while visible, `local` seconds after it appeared. */
export function motionPose(motion, local, height) {
	const pose = { dx: 0, dy: 0, scale: 1, rotation: 0 };

	if (!motion || motion.type === 'none') {
		return pose;
	}

	const speed = Number(motion.speed) || 0;
	const amount = Number(motion.amount) || 0;
	const wave = Math.sin(local * speed * 2 * Math.PI);

	switch (motion.type) {
		case 'rotate':
			// speed is turns per second; negative turns the other way.
			pose.rotation = local * speed * 2 * Math.PI;
			break;
		case 'pulse':
			pose.scale = 1 + amount * 0.25 * wave;
			break;
		case 'float':
			pose.dy = amount * height * 0.03 * wave;
			break;
		case 'swing':
			pose.rotation = amount * 0.4 * wave;
			break;
	}

	return pose;
}

/**
 * The combined pose of `layer` at time `t`, or null while it is off screen.
 * Position comes back absolute (canvas pixels), not as an offset.
 */
export function layerPose(layer, t, width, height) {
	if (!layer.visible || t < layer.start || t >= layer.end) {
		return null;
	}

	const local = t - layer.start;
	const span = layer.end - layer.start;
	const animIn = layer.animIn || {};
	const animOut = layer.animOut || {};

	// A layer too short for both animations shares its time between them rather
	// than letting the exit start before the entrance has finished.
	let inDuration = Math.max(0, Number(animIn.duration) || 0);
	let outDuration = Math.max(0, Number(animOut.duration) || 0);

	if (animIn.type === 'none') {
		inDuration = 0;
	}
	if (animOut.type === 'none') {
		outDuration = 0;
	}
	if (inDuration + outDuration > span && inDuration + outDuration > 0) {
		const ratio = span / (inDuration + outDuration);
		inDuration *= ratio;
		outDuration *= ratio;
	}

	const enter = inDuration > 0 ? entrancePose(animIn.type, ease(animIn.easing, local / inDuration), width, height) : null;

	let exit = null;
	const outStart = span - outDuration;

	if (outDuration > 0 && local > outStart) {
		const q = ease(animOut.easing, (local - outStart) / outDuration);
		exit = entrancePose(animOut.type, 1 - q, width, height);
		exit.dx = -exit.dx;
		exit.dy = -exit.dy;
		exit.rotation = -exit.rotation;
	}

	const motion = motionPose(layer.motion, local, height);

	let dx = motion.dx;
	let dy = motion.dy;
	let scale = motion.scale;
	let rotation = motion.rotation;
	let alpha = 1;
	let blur = 0;

	for (const pose of [enter, exit]) {
		if (!pose) {
			continue;
		}
		dx += pose.dx;
		dy += pose.dy;
		scale *= pose.scale;
		rotation += pose.rotation;
		alpha *= pose.alpha;
		blur += pose.blur;
	}

	return {
		x: layer.x + dx,
		y: layer.y + dy,
		scale: Math.max(0, scale),
		rotation: ((Number(layer.rotation) || 0) * Math.PI) / 180 + rotation,
		alpha: clamp01(alpha * (layer.opacity ?? 1)),
		blur
	};
}
