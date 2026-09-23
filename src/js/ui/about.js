/**
 * ui/about.js
 *
 * The About dialog: version, copyright and the GPL's "Appropriate Legal
 * Notices" (section 5(d) asks an interactive program to show them), with the
 * full license and the third-party notices one click away.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa } from './dom.js';
import { openModal } from './modal.js';
import { t } from '../i18n/index.js';

const COPYRIGHT = 'Copyright (C) 2026 The Gearfinder Studios';

// The notice text the GPL itself recommends (see "How to Apply These Terms"). It is
// the legal wording, so it stays in English whatever the interface language.
const NOTICE = [
	'This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.',
	'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.'
];

export async function openAbout() {
	const info = await window.mecha.about();
	const text = h('pre', { class: 'license-text hidden', 'data-scrollbar': 'css' });

	const show = (button, content) => {
		text.textContent = content || t('about.missing');
		text.classList.remove('hidden');
		tabs.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
	};

	const tabs = h(
		'div',
		{ class: 'segmented' },
		h('button', { onClick: event => show(event.currentTarget, info.license) }, t('about.license')),
		h('button', { onClick: event => show(event.currentTarget, info.notices) }, t('about.thirdParty'))
	);

	const modal = openModal({
		icon: 'circle-info',
		title: t('about.title'),
		body: h(
			'div',
			{ class: 'page about', 'data-scrollbar': 'css' },
			h(
				'div',
				{ class: 'about-header' },
				h('img', { src: '../build/icon.png', alt: '' }),
				h('div', null, h('h2', null, info.name), h('span', null, t('about.version', { version: info.version })), h('span', null, COPYRIGHT))
			),
			h('p', { class: 'modal-message' }, t('about.summary')),
			...NOTICE.map(paragraph => h('p', { class: 'legal' }, paragraph)),
			h(
				'p',
				{ class: 'legal' },
				'You should have received a copy of the GNU General Public License along with this program. If not, see ',
				h('a', { href: 'https://www.gnu.org/licenses/', target: '_blank' }, 'https://www.gnu.org/licenses/'),
				'.'
			),
			tabs,
			text
		),
		footer: [h('button', { class: 'btn primary', onClick: () => modal.close() }, fa('check'), t('common.close'))]
	});
}
