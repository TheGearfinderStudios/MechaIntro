/**
 * tests/core.test.js
 *
 * The DOM-free core: animation poses, audio envelopes, the WAV encoder, the
 * project model and the store's undo history.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ease } from '../src/js/core/easing.js';
import { layerPose } from '../src/js/core/animation.js';
import { clipGainAt, clipWindow, encodeWav } from '../src/js/core/audio.js';
import { createProject, createTextLayer, normalizeProject, resizeProject, setDuration } from '../src/js/core/project.js';
import { Store } from '../src/js/core/store.js';
import { iconGlyph, searchIcons } from '../src/js/core/icons.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);

test('easings start at 0 and end at 1', () => {
	for (const name of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'back-out', 'elastic-out', 'bounce-out']) {
		near(ease(name, 0), 0);
		near(ease(name, 1), 1);
	}
});

test('a layer is hidden outside its time range and at rest in the middle', () => {
	const project = createProject();
	const layer = createTextLayer(project, { start: 1, end: 3, x: 100, y: 200 });

	assert.equal(layerPose(layer, 0.99, 1920, 1080), null);
	assert.equal(layerPose(layer, 3, 1920, 1080), null);

	const rest = layerPose(layer, 2, 1920, 1080);
	near(rest.alpha, 1);
	near(rest.x, 100);
	near(rest.y, 200);
	near(rest.scale, 1);
});

test('fade in starts transparent, fade out ends transparent', () => {
	const project = createProject();
	const layer = createTextLayer(project, {
		start: 0,
		end: 2,
		animIn: { type: 'fade', duration: 0.5, easing: 'linear' },
		animOut: { type: 'fade', duration: 0.5, easing: 'linear' }
	});

	near(layerPose(layer, 0, 1920, 1080).alpha, 0);
	near(layerPose(layer, 0.25, 1920, 1080).alpha, 0.5);
	near(layerPose(layer, 1.75, 1920, 1080).alpha, 0.5);
	assert.ok(layerPose(layer, 1.999, 1920, 1080).alpha < 0.01);
});

test('slide-up exits upwards, mirroring its entrance', () => {
	const project = createProject();
	const layer = createTextLayer(project, {
		start: 0,
		end: 2,
		y: 500,
		animIn: { type: 'slide-up', duration: 0.5, easing: 'linear' },
		animOut: { type: 'slide-up', duration: 0.5, easing: 'linear' }
	});

	assert.ok(layerPose(layer, 0.1, 1920, 1080).y > 500, 'enters from below');
	assert.ok(layerPose(layer, 1.9, 1920, 1080).y < 500, 'leaves upwards');
});

test('entrance and exit share a layer that is too short for both', () => {
	const project = createProject();
	const layer = createTextLayer(project, {
		start: 0,
		end: 1,
		animIn: { type: 'fade', duration: 1, easing: 'linear' },
		animOut: { type: 'fade', duration: 1, easing: 'linear' }
	});

	// Squeezed to half a second each: fully in exactly at the midpoint.
	near(layerPose(layer, 0.5, 1920, 1080).alpha, 1);
});

test('clip gain follows volume and sine fades', () => {
	const clip = { volume: 0.8, length: 4, fadeIn: 1, fadeOut: 2, muted: false };

	near(clipGainAt(clip, 0), 0);
	near(clipGainAt(clip, 0.5), 0.8 * Math.sin(Math.PI / 4));
	near(clipGainAt(clip, 1.5), 0.8);
	near(clipGainAt(clip, 3), 0.8 * Math.sin(Math.PI / 4));
	near(clipGainAt(clip, 4), 0);
	near(clipGainAt({ ...clip, muted: true }, 1.5), 0);
});

test('clip window maps the playhead into the source file', () => {
	const clip = { start: 2, length: 3, trimStart: 1 };

	assert.deepEqual(clipWindow(clip, 0), { delay: 2, local: 0, offset: 1, duration: 3 });
	assert.deepEqual(clipWindow(clip, 3), { delay: 0, local: 1, offset: 2, duration: 2 });
	assert.equal(clipWindow(clip, 5), null);
	assert.equal(clipWindow(clip, 0, 4).duration, 2, 'cut at the project end');
});

test('WAV encoder writes a valid 16-bit header', () => {
	const wav = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0, 0.5, -0.5])], 48000);
	const view = new DataView(wav.buffer);
	const text = (offset, length) => String.fromCharCode(...wav.slice(offset, offset + length));

	assert.equal(text(0, 4), 'RIFF');
	assert.equal(text(8, 4), 'WAVE');
	assert.equal(view.getUint16(22, true), 2);
	assert.equal(view.getUint32(24, true), 48000);
	assert.equal(view.getUint32(40, true), 3 * 2 * 2);
	assert.equal(view.getInt16(44 + 4, true), 0x7fff);
	assert.equal(view.getInt16(44 + 8, true), -0x8000);
});

test('normalizeProject fills in what an old file left out', () => {
	const project = normalizeProject({ name: 'Old', layers: [{ type: 'text', id: 'a', text: 'Hi' }], audio: [] });

	assert.equal(project.name, 'Old');
	assert.equal(project.layers[0].text, 'Hi');
	assert.equal(project.layers[0].animIn.type, 'fade');
	assert.equal(project.settings.fps, 60);
});

test('resizeProject keeps layers in place relative to the frame', () => {
	const project = createProject();
	const layer = project.layers[0];
	const { x, y, size } = layer;

	resizeProject(project, 1280, 720);

	near(layer.x, Math.round((x * 1280) / 1920));
	near(layer.y, Math.round((y * 720) / 1080));
	near(layer.size, Math.round((size * 2) / 3));
});

test('setDuration stretches layers that ran to the end', () => {
	const project = createProject();
	project.layers[0].end = 2;

	setDuration(project, 8);

	assert.equal(project.layers[0].end, 2);
	assert.equal(project.layers[1].end, 8);
});

test('store coalesces a drag into one undo step', () => {
	const store = new Store(createProject());
	const id = store.project.layers[0].id;

	for (let x = 0; x < 10; x++) {
		store.update(p => (p.layers[0].x = x), { coalesce: 'drag' });
	}
	store.commit();
	store.update(p => (p.layers[0].y = 1));

	assert.ok(store.dirty);
	store.undo();
	assert.equal(store.project.layers[0].x, 9);
	store.undo();
	assert.notEqual(store.project.layers[0].x, 9);
	assert.equal(store.project.layers[0].id, id);
	store.redo();
	assert.equal(store.project.layers[0].x, 9);
});

test('icon catalogue finds gears and has their paths', () => {
	const { results } = searchIcons('gear', 'solid');

	assert.equal(results[0].name, 'gear');
	const glyph = iconGlyph('gear', 'solid');
	assert.equal(glyph[1], 512);
	assert.ok(glyph[2].startsWith('M'));
	assert.ok(iconGlyph('github', 'brands'), 'brands are included');
});
