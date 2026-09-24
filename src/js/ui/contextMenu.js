/**
 * ui/contextMenu.js
 *
 * Right-click menu. elementMenu() is the one the layer list, the timeline and
 * the stage share, so an element offers the same actions wherever it is clicked.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa } from './dom.js';
import { t } from '../i18n/index.js';

let current = null;

function close() {
	if (!current) {
		return;
	}
	current.menu.remove();
	window.removeEventListener('pointerdown', current.onPointerDown, true);
	window.removeEventListener('keydown', current.onKey, true);
	window.removeEventListener('blur', close);
	window.removeEventListener('resize', current.onResize);
	current = null;
}

/**
 * @param {MouseEvent} event - the contextmenu event; the menu opens at the pointer
 * @param {Array<{ icon: string, label: string, shortcut?: string, danger?: boolean, onClick: Function } | 'separator'>} items
 */
export function openContextMenu(event, items) {
	event.preventDefault();
	event.stopPropagation();
	close();

	const menu = h(
		'div',
		{ class: 'context-menu', role: 'menu' },
		items.map(item =>
			item === 'separator'
				? h('div', { class: 'context-separator' })
				: h(
						'button',
						{
							class: `context-item${item.danger ? ' danger' : ''}`,
							role: 'menuitem',
							onClick: () => {
								close();
								item.onClick();
							}
						},
						fa(item.icon),
						h('span', { class: 'label' }, item.label),
						item.shortcut ? h('span', { class: 'shortcut' }, item.shortcut) : null
					)
		)
	);

	document.body.append(menu);

	// Keep it on screen: flip left or up when it would run past an edge.
	const { width, height } = menu.getBoundingClientRect();
	const x = event.clientX + width > window.innerWidth ? event.clientX - width : event.clientX;
	const y = event.clientY + height > window.innerHeight ? event.clientY - height : event.clientY;
	menu.style.left = `${Math.max(4, x)}px`;
	menu.style.top = `${Math.max(4, y)}px`;

	const onPointerDown = e => {
		if (!menu.contains(e.target)) {
			close();
		}
	};
	const onKey = e => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	};

	// Chromium fires `resize` with the window unchanged (selecting the element
	// re-lays out the panels), so only a real change of size closes the menu.
	const size = `${window.innerWidth}x${window.innerHeight}`;
	const onResize = () => {
		if (`${window.innerWidth}x${window.innerHeight}` !== size) {
			close();
		}
	};

	window.addEventListener('pointerdown', onPointerDown, true);
	window.addEventListener('keydown', onKey, true);
	window.addEventListener('blur', close);
	window.addEventListener('resize', onResize);

	current = { menu, onPointerDown, onKey, onResize };
}

/**
 * The menu for an element (selects it first), or for empty space when
 * `selection` is null: then only Paste is offered.
 */
export function openElementMenu(event, { store, commands }, selection) {
	if (selection) {
		store.select(selection.kind, selection.id);
	}

	const paste = { icon: 'paste', label: t('menu.paste'), shortcut: 'Ctrl+V', onClick: () => commands.paste() };

	if (!selection) {
		openContextMenu(event, [paste]);
		return;
	}

	openContextMenu(event, [
		{ icon: 'copy', label: t('menu.copy'), shortcut: 'Ctrl+C', onClick: () => commands.copy() },
		{ icon: 'scissors', label: t('menu.cut'), shortcut: 'Ctrl+X', onClick: () => commands.cut() },
		paste,
		{ icon: 'clone', label: t('menu.duplicate'), shortcut: 'Ctrl+D', onClick: () => commands.duplicate() },
		'separator',
		{ icon: 'trash-can', label: t('menu.delete'), shortcut: 'Del', danger: true, onClick: () => commands.remove(selection) }
	]);
}
