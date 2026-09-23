/**
 * ui/iconPicker.js
 *
 * Browse and search the Font Awesome Free set. The grid shows icons with the
 * webfont (cheap for hundreds of cells); the stage draws the chosen one from its
 * SVG path.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa } from './dom.js';
import { openModal } from './modal.js';
import { ICON_STYLES, iconCount, searchIcons } from '../core/icons.js';
import { t } from '../i18n/index.js';

const RESULT_LIMIT = 400;

let lastStyle = 'all';

/**
 * @param {{ name?: string, style?: string }} [current]
 * @returns {Promise<{ name: string, style: string } | null>}
 */
export function pickIcon(current = {}) {
	return new Promise(resolve => {
		let chosen = current.name ? { name: current.name, style: current.style || 'solid' } : null;
		let style = lastStyle;
		let result = null;

		const grid = h('div', { class: 'icon-grid' });
		const status = h('span', { class: 'left' });
		const search = h('input', { type: 'text', placeholder: t('picker.search', { count: iconCount() }), spellcheck: false });
		const confirmButton = h('button', { class: 'btn primary', disabled: !chosen, onClick: () => finish(chosen) }, fa('check'), t('picker.use'));

		const tabs = h(
			'div',
			{ class: 'segmented' },
			[['all', t('picker.all')], ...ICON_STYLES].map(([value, label]) =>
				h(
					'button',
					{
						class: value === style ? 'active' : '',
						onClick: event => {
							style = lastStyle = value;
							tabs.querySelectorAll('button').forEach(button => button.classList.toggle('active', button === event.currentTarget));
							render();
						}
					},
					label
				)
			)
		);

		function render() {
			const { total, results } = searchIcons(search.value, style, RESULT_LIMIT);

			grid.replaceChildren(
				...results.map(icon =>
					h(
						'button',
						{
							class: `icon-cell${chosen && chosen.name === icon.name && chosen.style === icon.style ? ' selected' : ''}`,
							title: `${icon.label} (${icon.name}, ${icon.style})`,
							onClick: event => {
								chosen = { name: icon.name, style: icon.style };
								grid.querySelector('.selected')?.classList.remove('selected');
								event.currentTarget.classList.add('selected');
								confirmButton.disabled = false;
							},
							onDblclick: () => finish({ name: icon.name, style: icon.style })
						},
						fa(icon.name, icon.style),
						h('span', null, icon.name)
					)
				)
			);

			status.textContent =
				total > results.length
					? t('picker.truncated', { shown: results.length, total })
					: t(total === 1 ? 'picker.count.one' : 'picker.count.other', { count: total });
		}

		function finish(value) {
			result = value;
			modal.close();
		}

		let timer = 0;
		search.addEventListener('input', () => {
			clearTimeout(timer);
			timer = setTimeout(render, 90);
		});
		search.addEventListener('keydown', event => {
			if (event.key === 'Enter' && chosen) {
				finish(chosen);
			}
		});

		const modal = openModal({
			icon: 'icons',
			title: t('picker.title'),
			wide: true,
			body: [
				h('div', { class: 'tool-header' }, h('label', { class: 'search-box' }, fa('magnifying-glass'), search), tabs),
				h('div', { class: 'page', 'data-scrollbar': 'css' }, grid)
			],
			footer: [status, h('button', { class: 'btn', onClick: () => modal.close() }, t('common.cancel')), confirmButton],
			onClose: () => resolve(result)
		});

		// Open on the current icon and its neighbours rather than on page one of two thousand.
		if (chosen) {
			search.value = chosen.name;
		}

		render();
		search.focus();
		search.select();
		modal.element.querySelector('.icon-cell.selected')?.scrollIntoView({ block: 'center' });
	});
}
