/**
 * tests/i18n.test.js
 *
 * Every language has every string, and every string the code asks for exists.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DICTIONARIES, DEFAULT_LOCALE, locale, setLocale, t } from '../src/js/i18n/index.js';
import { ANIMATIONS, MOTIONS } from '../src/js/core/animation.js';
import { EASING_OPTIONS } from '../src/js/core/easing.js';
import { RESOLUTIONS, FPS_OPTIONS, BACKGROUND_TYPES } from '../src/js/core/project.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = DICTIONARIES.en;

function sources(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return entry.name === 'i18n' || entry.name === 'generated' ? [] : sources(path);
		}
		return /\.(m|c)?js$/.test(entry.name) ? [path] : [];
	});
}

test('English is the default', () => {
	assert.equal(DEFAULT_LOCALE, 'en');
	assert.equal(locale(), 'en');
});

test('every language has exactly the English keys', () => {
	for (const [code, dictionary] of Object.entries(DICTIONARIES)) {
		const missing = Object.keys(en).filter(key => !(key in dictionary));
		const extra = Object.keys(dictionary).filter(key => !(key in en));
		assert.deepEqual(missing, [], `${code} is missing keys`);
		assert.deepEqual(extra, [], `${code} has keys English lacks`);
	}
});

test('translations keep the same placeholders', () => {
	const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join();

	for (const [code, dictionary] of Object.entries(DICTIONARIES)) {
		for (const key of Object.keys(en)) {
			assert.equal(placeholders(dictionary[key]), placeholders(en[key]), `${code} ${key}`);
		}
	}
});

test('every key the code asks for exists', () => {
	const used = new Set();

	for (const file of [...sources(join(root, 'src/js')), ...sources(join(root, 'electron'))]) {
		for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([\w.-]+)'/g)) {
			used.add(key);
		}
		for (const [, key] of readFileSync(file, 'utf8').matchAll(/\?\s*'([\w-]+\.[\w.-]+)'\s*:\s*'([\w-]+\.[\w.-]+)'/g)) {
			used.add(key);
		}
	}

	// Keys built at run time.
	for (const list of [ANIMATIONS, MOTIONS, EASING_OPTIONS, RESOLUTIONS, FPS_OPTIONS, BACKGROUND_TYPES]) {
		for (const [, key] of list) {
			used.add(key);
		}
	}
	for (const type of ['icon', 'text', 'image', 'audio']) {
		used.add(`type.${type}`);
	}
	for (const value of ['300', '400', '600', '700', '900']) {
		used.add(`weight.${value}`);
	}
	for (const key of ['align.left', 'align.center', 'align.right', 'fit.cover', 'fit.contain', 'fit.stretch']) {
		used.add(key);
	}
	for (const key of ['format.mp4', 'format.webm', 'quality.high', 'quality.medium', 'quality.low', 'picker.count.one', 'picker.count.other']) {
		used.add(key);
	}

	const missing = [...used].filter(key => !(key in en));
	assert.deepEqual(missing, []);
});

test('t fills placeholders and falls back to the key', () => {
	setLocale('pt-BR');
	assert.equal(t('common.copyOf', { name: 'Logo' }), 'Logo (cópia)');
	setLocale('en');
	assert.equal(t('common.copyOf', { name: 'Logo' }), 'Logo (copy)');
	assert.equal(t('no.such.key'), 'no.such.key');
});
