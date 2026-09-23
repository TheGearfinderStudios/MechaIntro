/**
 * core/icons.js
 *
 * The Font Awesome Free catalogue (built by scripts/build-icon-catalog.mjs):
 * lookup by name for drawing, and search for the picker.
 *
 * Each entry is { n: name, l: label, t: search terms, s: { style: [w, h, ...paths] } }.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import catalog from '../../generated/icons.js';

export const ICON_STYLES = [
	['solid', 'Solid'],
	['regular', 'Regular'],
	['brands', 'Brands']
];

const byName = new Map(catalog.map(icon => [icon.n, icon]));

export function iconCount() {
	return catalog.length;
}

/** [width, height, ...paths] for an icon in a style, falling back to any style it has. */
export function iconGlyph(name, style) {
	const icon = byName.get(name);

	if (!icon) {
		return null;
	}
	return icon.s[style] || Object.values(icon.s)[0];
}

export function iconStyles(name) {
	return Object.keys(byName.get(name)?.s || {});
}

export function iconLabel(name) {
	return byName.get(name)?.l || name;
}

/**
 * Icons matching `query` in `style` ('all' for any), best first: a name that starts
 * with the query, then a name that contains it, then a label or search term.
 */
export function searchIcons(query, style = 'all', limit = 400) {
	const needle = query.trim().toLowerCase();
	const scored = [];

	for (const icon of catalog) {
		const styles = Object.keys(icon.s);

		if (style !== 'all' && !styles.includes(style)) {
			continue;
		}

		let score = 3;

		if (needle) {
			if (icon.n === needle) {
				score = 0;
			} else if (icon.n.startsWith(needle)) {
				score = 1;
			} else if (icon.n.includes(needle)) {
				score = 2;
			} else if (icon.l.toLowerCase().includes(needle) || icon.t.includes(needle)) {
				score = 3;
			} else {
				continue;
			}
		}

		for (const iconStyle of style === 'all' ? styles : [style]) {
			scored.push({ name: icon.n, label: icon.l, style: iconStyle, score });
		}
	}

	scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));

	return { total: scored.length, results: scored.slice(0, limit) };
}
