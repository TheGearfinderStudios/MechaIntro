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

const COPYRIGHT = 'Copyright (C) 2026 The Gearfinder Studios';

// The notice text the GPL itself recommends (see "How to Apply These Terms"), kept in
// English because it is the legal wording.
const NOTICE = [
	'This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.',
	'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.'
];

export async function openAbout() {
	const info = await window.mecha.about();
	const text = h('pre', { class: 'license-text', 'data-scrollbar': 'css' });

	const show = (button, content) => {
		text.textContent = content || 'Arquivo não encontrado.';
		text.classList.remove('hidden');
		tabs.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
	};

	const tabs = h(
		'div',
		{ class: 'segmented' },
		h('button', { onClick: event => show(event.currentTarget, info.license) }, 'Licença (GPL-3.0)'),
		h('button', { onClick: event => show(event.currentTarget, info.notices) }, 'Componentes de terceiros')
	);

	text.classList.add('hidden');

	const modal = openModal({
		icon: 'circle-info',
		title: 'Sobre o MechaIntro',
		body: h(
			'div',
			{ class: 'page about', 'data-scrollbar': 'css' },
			h(
				'div',
				{ class: 'about-header' },
				h('img', { src: '../build/icon.png', alt: '' }),
				h('div', null, h('h2', null, info.name), h('span', null, `Versão ${info.version}`), h('span', null, COPYRIGHT))
			),
			h('p', { class: 'modal-message' }, 'Software livre, distribuído sob a GNU General Public License, versão 3 ou posterior. Você pode usar, estudar, modificar e redistribuir, desde que mantenha a mesma licença.'),
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
		footer: [h('button', { class: 'btn primary', onClick: () => modal.close() }, fa('check'), 'Fechar')],
		wide: false
	});
}
