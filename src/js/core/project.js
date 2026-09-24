/**
 * core/project.js
 *
 * The project document: what a .mintro file holds, the defaults for everything
 * in it, and the factories that make new layers and clips.
 *
 * Coordinates are canvas pixels with the origin at the top-left; a layer's x/y
 * is its centre. Times are seconds on the timeline.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { t } from '../i18n/index.js';

export const FORMAT_VERSION = 1;
export const FILE_EXTENSION = 'mintro';

// Option lists are [value, i18n key]; the UI translates the labels.

export const RESOLUTIONS = ['1920x1080', '1280x720', '2560x1440', '3840x2160', '1080x1920', '1080x1080'].map(value => [value, `resolution.${value}`]);

export const FPS_OPTIONS = ['24', '30', '60'].map(value => [value, `fps.${value}`]);

export const BACKGROUND_TYPES = ['solid', 'linear', 'radial', 'image', 'transparent'].map(value => [value, `background.${value}`]);

export const FONT_OPTIONS = ['Arial', 'Segoe UI', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Impact', 'Consolas', 'Courier New'];

export const MIN_DURATION = 0.1;

export function uid(prefix) {
	return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function baseLayer(type, project, overrides) {
	const { width, height, duration } = project.settings;

	return {
		id: uid('layer'),
		type,
		name: '',
		visible: true,
		start: 0,
		end: duration,
		x: width / 2,
		y: height / 2,
		rotation: 0,
		opacity: 1,
		color: '#d9c69c',
		shadow: { color: '#000000', blur: 0 },
		animIn: { type: 'fade', duration: 0.6, easing: 'ease-out' },
		animOut: { type: 'fade', duration: 0.5, easing: 'ease-in' },
		motion: { type: 'none', speed: 0.25, amount: 0.5 },
		...overrides
	};
}

export function createIconLayer(project, overrides = {}) {
	return baseLayer('icon', project, {
		name: t('default.icon'),
		icon: { name: 'gear', style: 'solid' },
		size: Math.round(project.settings.height * 0.25),
		...overrides
	});
}

export function createTextLayer(project, overrides = {}) {
	return baseLayer('text', project, {
		name: t('default.text'),
		text: t('default.textContent'),
		font: 'Georgia',
		size: Math.round(project.settings.height * 0.08),
		weight: 700,
		align: 'center',
		letterSpacing: 0,
		...overrides
	});
}

export function createImageLayer(project, path, overrides = {}) {
	return baseLayer('image', project, {
		name: fileName(path) || t('default.image'),
		path,
		width: Math.round(project.settings.width * 0.3),
		color: undefined,
		...overrides
	});
}

export function createAudioClip(project, path, sourceDuration, overrides = {}) {
	const available = Math.max(MIN_DURATION, project.settings.duration);

	return {
		id: uid('audio'),
		name: fileName(path) || t('default.audio'),
		path,
		sourceDuration,
		start: 0,
		trimStart: 0,
		length: Math.min(sourceDuration, available),
		volume: 1,
		fadeIn: 0.5,
		fadeOut: 1,
		muted: false,
		...overrides
	};
}

export function fileName(path) {
	return String(path || '')
		.split(/[\\/]/)
		.pop()
		.replace(/\.[^.]+$/, '');
}

/** The project a new window opens with: something to look at rather than a black box. */
export function createProject() {
	const project = {
		version: FORMAT_VERSION,
		name: t('default.project'),
		settings: { width: 1920, height: 1080, fps: 60, duration: 5 },
		background: {
			type: 'radial',
			color: '#1c1a1f',
			from: '#423837',
			to: '#1c1a1f',
			angle: 180,
			image: null,
			imageFit: 'cover',
			imageDim: 0.3,
			vignette: 0.4
		},
		layers: [],
		audio: []
	};

	project.layers.push(
		createIconLayer(project, {
			name: t('default.gear'),
			y: 460,
			size: 300,
			shadow: { color: '#000000', blur: 30 },
			animIn: { type: 'pop', duration: 0.8, easing: 'back-out' },
			motion: { type: 'rotate', speed: 0.08, amount: 0.5 }
		}),
		createTextLayer(project, {
			name: t('default.title'),
			text: 'The Gearfinder Society',
			y: 760,
			size: 96,
			color: '#f2e6c9',
			start: 0.5,
			shadow: { color: '#000000', blur: 16 },
			animIn: { type: 'slide-up', duration: 0.8, easing: 'ease-out' }
		})
	);

	return project;
}

/**
 * Bring a loaded document up to the current shape: fill in whatever an older
 * file (or a hand-edited one) left out, so the rest of the app never has to
 * guard against a missing field.
 */
export function normalizeProject(raw) {
	const fresh = createProject();
	const project = {
		...fresh,
		...raw,
		version: FORMAT_VERSION,
		settings: { ...fresh.settings, ...(raw?.settings || {}) },
		background: { ...fresh.background, ...(raw?.background || {}) }
	};

	project.layers = (Array.isArray(raw?.layers) ? raw.layers : []).map(layer => normalizeLayer(project, layer));
	project.audio = (Array.isArray(raw?.audio) ? raw.audio : []).map(clip => normalizeClip(project, clip));

	return project;
}

/** A visual layer with every field present, defaults filling the gaps. */
export function normalizeLayer(project, layer) {
	const factory = { icon: createIconLayer, text: createTextLayer }[layer.type];
	const base = factory ? factory(project) : createImageLayer(project, layer.path);

	return {
		...base,
		...layer,
		shadow: { ...base.shadow, ...(layer.shadow || {}) },
		animIn: { ...base.animIn, ...(layer.animIn || {}) },
		animOut: { ...base.animOut, ...(layer.animOut || {}) },
		motion: { ...base.motion, ...(layer.motion || {}) }
	};
}

/** An audio clip with every field present, defaults filling the gaps. */
export function normalizeClip(project, clip) {
	return {
		...createAudioClip(project, clip.path, Number(clip.sourceDuration) || Number(clip.length) || 1),
		...clip
	};
}

/**
 * Change the canvas size, carrying the layout across: positions keep their place
 * relative to the frame, sizes scale with the smaller of the two ratios so nothing
 * that fitted before falls off the edge.
 */
export function resizeProject(project, width, height) {
	const rx = width / project.settings.width;
	const ry = height / project.settings.height;
	const scale = Math.min(rx, ry);

	for (const layer of project.layers) {
		layer.x = Math.round(layer.x * rx);
		layer.y = Math.round(layer.y * ry);
		layer.shadow.blur = Math.round(layer.shadow.blur * scale);

		if (layer.type === 'image') {
			layer.width = Math.round(layer.width * scale);
		} else {
			layer.size = Math.round(layer.size * scale);
		}
		if (layer.type === 'text') {
			layer.letterSpacing = Math.round((layer.letterSpacing || 0) * scale);
		}
	}

	project.settings.width = width;
	project.settings.height = height;
}

/**
 * Change the project length. Layers that ran to the old end keep running to the
 * new one; that is almost always what someone lengthening an intro wants.
 */
export function setDuration(project, duration) {
	const previous = project.settings.duration;
	const next = Math.max(MIN_DURATION * 5, duration);

	for (const layer of project.layers) {
		if (Math.abs(layer.end - previous) < 1e-6 || layer.end > next) {
			layer.end = next;
		}
		layer.start = Math.min(layer.start, layer.end - MIN_DURATION);
	}

	project.settings.duration = next;
}

/** Everything the project needs from disk. */
export function assetPaths(project) {
	const images = new Set();

	if (project.background.type === 'image' && project.background.image) {
		images.add(project.background.image);
	}
	for (const layer of project.layers) {
		if (layer.type === 'image' && layer.path) {
			images.add(layer.path);
		}
	}

	return {
		images: [...images],
		audio: [...new Set(project.audio.map(clip => clip.path).filter(Boolean))]
	};
}

export function formatTime(seconds, withFraction = true) {
	const safe = Math.max(0, seconds);
	const minutes = Math.floor(safe / 60);
	const rest = safe - minutes * 60;
	const whole = String(Math.floor(rest)).padStart(2, '0');

	if (!withFraction) {
		return `${minutes}:${whole}`;
	}
	return `${minutes}:${whole}.${String(Math.floor((rest % 1) * 100)).padStart(2, '0')}`;
}
