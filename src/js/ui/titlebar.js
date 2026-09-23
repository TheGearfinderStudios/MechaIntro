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
import { t } from '../i18n/index.js';
import { openAbout } from './about.js';
import { openLanguageDialog } from './language.js';

export class TitlebarView {
	constructor(root, { store, commands, changeLocale }) {
		this.store = store;

		this.docName = h('span', { class: 'doc-name' });
		this.undoButton = iconButton('rotate-left', t('titlebar.undo'), () => store.undo());
		this.redoButton = iconButton('rotate-right', t('titlebar.redo'), () => store.redo());

		root.append(
			h('div', { class: 'brand' }, h('img', { class: 'brand-icon', src: '../build/icon.png', alt: '' }), h('span', { class: 'brand-name' }, 'MechaIntro')),
			h(
				'div',
				{ class: 'tb-group' },
				iconButton('file', t('titlebar.new'), () => commands.newProject()),
				iconButton('folder-open', t('titlebar.open'), () => commands.openProject()),
				iconButton('floppy-disk', t('titlebar.save'), () => commands.saveProject()),
				iconButton('file-pen', t('titlebar.saveAs'), () => commands.saveProject(true))
			),
			h('span', { class: 'tb-sep' }),
			h('div', { class: 'tb-group' }, this.undoButton, this.redoButton),
			this.docName,
			h('span', { class: 'tb-spacer' }),
			iconButton('language', t('titlebar.language'), () => openLanguageDialog(changeLocale)),
			iconButton('circle-info', t('titlebar.about'), () => openAbout()),
			h('button', { class: 'btn primary', title: t('titlebar.exportHint'), onClick: () => commands.exportVideo() }, fa('file-export'), t('titlebar.export'))
		);

		this._off = [store.on('project', () => this.sync()), store.on('meta', () => this.sync())];
		this.sync();
	}

	destroy() {
		this._off.forEach(off => off());
	}

	sync() {
		const { store } = this;
		const name = store.path ? fileName(store.path) : store.project.name || t('titlebar.untitled');

		this.docName.replaceChildren(name, ...(store.dirty ? [h('span', { class: 'dirty-dot', title: t('titlebar.unsaved') }, '●')] : []));
		this.docName.title = store.path || t('titlebar.notSaved');
		this.undoButton.disabled = !store.canUndo;
		this.redoButton.disabled = !store.canRedo;

		window.mecha.setTitle(`${store.dirty ? '• ' : ''}${name} - MechaIntro`);
		window.mecha.setDirty(store.dirty);
	}
}
