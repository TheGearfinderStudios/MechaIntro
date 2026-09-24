/**
 * tests/clipboard.test.js
 *
 * Copy and paste of layers and audio clips.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serializeElement, parseElement, prepareElement } from '../src/js/core/clipboard.js';
import { createProject, createAudioClip, setDuration } from '../src/js/core/project.js';

test('a layer survives the round trip and gets a new id', () => {
	const project = createProject();
	const original = project.layers[0];
	const entry = parseElement(serializeElement('layer', original));

	assert.equal(entry.kind, 'layer');

	const pasted = prepareElement(project, entry);
	assert.notEqual(pasted.id, original.id);
	assert.deepEqual({ ...pasted, id: original.id }, original);
});

test('an audio clip survives the round trip', () => {
	const project = createProject();
	const clip = createAudioClip(project, 'C:/music/theme.mp3', 12, { start: 1, volume: 0.7, fadeOut: 2 });
	const pasted = prepareElement(project, parseElement(serializeElement('audio', clip)));

	assert.notEqual(pasted.id, clip.id);
	assert.equal(pasted.path, clip.path);
	assert.equal(pasted.volume, 0.7);
	assert.equal(pasted.fadeOut, 2);
});

test('anything that is not a MechaIntro element is ignored', () => {
	assert.equal(parseElement('hello'), null);
	assert.equal(parseElement(''), null);
	assert.equal(parseElement('{"format":"something/else","kind":"layer","item":{}}'), null);
	assert.equal(parseElement(serializeElement('layer', { type: 'video' })), null);
	assert.equal(parseElement(serializeElement('audio', { name: 'no path' })), null);
});

test('a pasted element is missing no fields', () => {
	const project = createProject();
	const pasted = prepareElement(project, parseElement(serializeElement('layer', { type: 'text', text: 'Hi' })));

	assert.equal(pasted.text, 'Hi');
	assert.equal(pasted.animIn.type, 'fade');
	assert.ok(pasted.shadow);
	assert.ok(pasted.motion);
});

test('timing from a longer project is pulled inside a shorter one', () => {
	const long = createProject();
	setDuration(long, 20);
	const late = { ...long.layers[0], start: 12, end: 15 };
	const running = { ...long.layers[0], start: 2, end: 20 };

	const short = createProject(); // 5 s

	const moved = prepareElement(short, parseElement(serializeElement('layer', late)));
	assert.equal(moved.start, 0, 'a layer that would start after the end moves to 0');
	assert.equal(moved.end, 3, 'and keeps its length');

	const cut = prepareElement(short, parseElement(serializeElement('layer', running)));
	assert.equal(cut.start, 2);
	assert.equal(cut.end, 5, 'a layer running past the end is cut at the end');
});
