/**
 * ui/titlebar.js
 *
 * The window's own titlebar (the native one is hidden; Windows draws only the
 * min/max/close buttons over the right edge). Doubles as the file toolbar.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa, iconButton } from './dom.js';
import { fileName } from '../core/project.js';
import { openAbout } from './about.js';

export class TitlebarView {
	constructor(root, { store, commands }) {
		this.store = store;

		this.docName = h('span', { class: 'doc-name' });
		this.undoButton = iconButton('rotate-left', 'Desfazer (Ctrl+Z)', () => store.undo());
		this.redoButton = iconButton('rotate-right', 'Refazer (Ctrl+Y)', () => store.redo());

		root.append(
			h('div', { class: 'brand' }, h('img', { class: 'brand-icon', src: '../build/icon.png', alt: '' }), h('span', { class: 'brand-name' }, 'MechaIntro')),
			h(
				'div',
				{ class: 'tb-group' },
				iconButton('file', 'Novo projeto (Ctrl+N)', () => commands.newProject()),
				iconButton('folder-open', 'Abrir projeto (Ctrl+O)', () => commands.openProject()),
				iconButton('floppy-disk', 'Salvar (Ctrl+S)', () => commands.saveProject()),
				iconButton('file-pen', 'Salvar como (Ctrl+Shift+S)', () => commands.saveProject(true))
			),
			h('span', { class: 'tb-sep' }),
			h('div', { class: 'tb-group' }, this.undoButton, this.redoButton),
			this.docName,
			h('span', { class: 'tb-spacer' }),
			iconButton('circle-info', 'Sobre o MechaIntro', () => openAbout()),
			h('button', { class: 'btn primary', title: 'Exportar vídeo (Ctrl+E)', onClick: () => commands.exportVideo() }, fa('file-export'), 'Exportar vídeo')
		);

		store.on('project', () => this.sync());
		store.on('meta', () => this.sync());
		this.sync();
	}

	sync() {
		const { store } = this;
		const name = store.path ? fileName(store.path) : store.project.name || 'Sem título';

		this.docName.replaceChildren(name, ...(store.dirty ? [h('span', { class: 'dirty-dot', title: 'Alterações não salvas' }, '●')] : []));
		this.docName.title = store.path || 'Projeto ainda não salvo';
		this.undoButton.disabled = !store.canUndo;
		this.redoButton.disabled = !store.canRedo;

		window.mecha.setTitle(`${store.dirty ? '• ' : ''}${name} - MechaIntro`);
		window.mecha.setDirty(store.dirty);
	}
}
