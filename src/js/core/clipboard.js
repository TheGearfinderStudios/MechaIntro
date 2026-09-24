/**
 * core/clipboard.js
 *
 * Copy and paste of layers and audio clips. What goes on the system clipboard is
 * plain JSON with a format tag, so an element copied in one project (or one
 * window) pastes into another, and anything else on the clipboard is ignored.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { MIN_DURATION, normalizeClip, normalizeLayer, uid } from './project.js';

const FORMAT = 'mechaintro/element';
const VERSION = 1;
const LAYER_TYPES = ['icon', 'text', 'image'];

/** The clipboard text for a layer (`kind` 'layer') or an audio clip (`kind` 'audio'). */
export function serializeElement(kind, item) {
	return JSON.stringify({ format: FORMAT, version: VERSION, kind, item });
}

/** { kind, item } from clipboard text, or null when it holds no MechaIntro element. */
export function parseElement(text) {
	let data;

	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}

	if (data?.format !== FORMAT || !data.item || typeof data.item !== 'object') {
		return null;
	}
	if (data.kind === 'layer' && LAYER_TYPES.includes(data.item.type)) {
		return { kind: 'layer', item: data.item };
	}
	if (data.kind === 'audio' && typeof data.item.path === 'string') {
		return { kind: 'audio', item: data.item };
	}
	return null;
}

/**
 * The element as it should land in `project`: a fresh id, every field present,
 * and its timing pulled inside the project when it came from a longer one.
 */
export function prepareElement(project, { kind, item }) {
	const { duration } = project.settings;

	if (kind === 'audio') {
		const clip = { ...normalizeClip(project, item), id: uid('audio') };

		if (clip.start >= duration) {
			clip.start = 0;
		}
		return clip;
	}

	const layer = { ...normalizeLayer(project, item), id: uid('layer') };
	const span = Math.max(MIN_DURATION, layer.end - layer.start);

	if (layer.start >= duration) {
		// Would never be seen: keep its length, move it to the start.
		layer.start = 0;
		layer.end = Math.min(span, duration);
	} else {
		layer.end = Math.min(layer.end, duration);
	}
	layer.end = Math.max(layer.end, layer.start + MIN_DURATION);

	return layer;
}
