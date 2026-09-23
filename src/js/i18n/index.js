/**
 * i18n/index.js
 *
 * Interface text. Every string a user reads goes through t(key), looked up in the
 * current locale's dictionary and falling back to English, then to the key itself
 * (so a missing entry shows up as `section.name` rather than as nothing).
 *
 * Placeholders are written {name} and filled from the params object.
 *
 * The choice is remembered in localStorage; English is the default.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import en from './en.js';
import ptBR from './pt-BR.js';

export const DEFAULT_LOCALE = 'en';

/** [code, name in its own language] */
export const LOCALES = [
	['en', 'English'],
	['pt-BR', 'Português (Brasil)']
];

export const DICTIONARIES = { en, 'pt-BR': ptBR };

const STORAGE_KEY = 'locale';

let current = DEFAULT_LOCALE;

try {
	const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
	if (saved && DICTIONARIES[saved]) {
		current = saved;
	}
} catch {
	// No storage (tests, private contexts): stay on the default.
}

export function locale() {
	return current;
}

export function setLocale(code) {
	if (!DICTIONARIES[code]) {
		return;
	}

	current = code;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, code);
	} catch {
		// Not remembered; harmless.
	}
}

export function t(key, params) {
	const text = DICTIONARIES[current][key] ?? en[key] ?? key;

	if (!params) {
		return text;
	}
	return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Translate the labels of an option list given as [value, key] pairs. */
export function options(pairs) {
	return pairs.map(([value, key]) => [value, t(key)]);
}
