/**
 * commands.js
 *
 * Everything the user can do that is more than setting a field: file handling,
 * adding and removing things, restacking. Menus, buttons and shortcuts all come
 * through here, so each action behaves the same wherever it is triggered from.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import {
	createProject,
	normalizeProject,
	createIconLayer,
	createTextLayer,
	createImageLayer,
	createAudioClip,
	fileName,
	uid,
	MIN_DURATION
} from './core/project.js';
import { iconLabel } from './core/icons.js';
import { pickIcon } from './ui/iconPicker.js';
import { confirmDialog, toast } from './ui/modal.js';
import { openExportDialog } from './ui/exportDialog.js';

const errorText = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export function createCommands({ store, assets, player }) {
	const findLayer = (project, id) => project.layers.find(layer => layer.id === id);
	const findClip = (project, id) => project.audio.find(clip => clip.id === id);

	/** Resolves false when the user would rather keep the unsaved work. */
	async function allowDiscard() {
		if (!store.dirty) {
			return true;
		}
		return confirmDialog({
			icon: 'triangle-exclamation',
			title: 'Alterações não salvas',
			message: 'O projeto atual tem alterações que não foram salvas. Descartar e continuar?',
			confirm: 'Descartar',
			danger: true
		});
	}

	function addLayer(layer) {
		store.update(project => project.layers.push(layer));
		store.select('layer', layer.id);
	}

	const commands = {
		async newProject() {
			if (await allowDiscard()) {
				player.stop();
				store.load(createProject());
			}
		},

		async openProject() {
			if (!(await allowDiscard())) {
				return;
			}

			try {
				const opened = await window.mecha.openProject();
				if (opened) {
					player.stop();
					store.load(normalizeProject(opened.data), opened.path);
					toast(`Projeto aberto: ${fileName(opened.path)}`, 'success');
				}
			} catch (error) {
				toast(`Não foi possível abrir o projeto: ${errorText(error)}`, 'error', 6000);
			}
		},

		async saveProject(saveAs = false) {
			try {
				const path = await window.mecha.saveProject({
					path: store.path,
					data: store.project,
					saveAs,
					suggestedName: store.project.name
				});

				if (path) {
					store.markSaved(path);
					toast(`Salvo em ${path}`, 'success');
				}
			} catch (error) {
				toast(`Não foi possível salvar: ${errorText(error)}`, 'error', 6000);
			}
		},

		exportVideo() {
			openExportDialog({ store, assets, player });
		},

		async addIcon() {
			const picked = await pickIcon();
			if (picked) {
				addLayer(createIconLayer(store.project, { name: iconLabel(picked.name), icon: picked }));
			}
		},

		addText() {
			addLayer(createTextLayer(store.project));
		},

		async addImage() {
			const path = await window.mecha.pickAsset('image');
			if (path) {
				addLayer(createImageLayer(store.project, path));
			}
		},

		async addAudio() {
			const path = await window.mecha.pickAsset('audio');
			if (!path) {
				return;
			}

			try {
				const buffer = await assets.audio(path);
				const { duration } = store.project.settings;
				// Drop it at the playhead, unless that would leave nothing of it inside the video.
				const start = store.time < duration - MIN_DURATION ? store.time : 0;
				const clip = createAudioClip(store.project, path, buffer.duration, { start });

				clip.length = Math.min(buffer.duration, Math.max(MIN_DURATION, duration - start));
				store.update(project => project.audio.push(clip));
				store.select('audio', clip.id);
			} catch (error) {
				toast(`Não foi possível ler o áudio: ${errorText(error)}`, 'error', 6000);
			}
		},

		async replaceAudio(id) {
			const path = await window.mecha.pickAsset('audio');
			if (!path) {
				return;
			}

			try {
				const buffer = await assets.audio(path);
				store.update(project => {
					const clip = findClip(project, id);
					if (clip) {
						clip.path = path;
						clip.name = fileName(path);
						clip.sourceDuration = buffer.duration;
						clip.trimStart = Math.min(clip.trimStart, Math.max(0, buffer.duration - MIN_DURATION));
						clip.length = Math.min(clip.length, buffer.duration - clip.trimStart);
					}
				});
			} catch (error) {
				toast(`Não foi possível ler o áudio: ${errorText(error)}`, 'error', 6000);
			}
		},

		setIcon(id, icon) {
			store.update(project => {
				const layer = findLayer(project, id);
				if (layer) {
					// Keep a name the user typed; follow the icon when it was just the old icon's label.
					if (!layer.name || layer.name === iconLabel(layer.icon.name)) {
						layer.name = iconLabel(icon.name);
					}
					layer.icon = icon;
				}
			});
		},

		remove(selection = store.selection) {
			if (!selection.kind || selection.kind === 'background') {
				return;
			}

			store.update(project => {
				const list = selection.kind === 'audio' ? project.audio : project.layers;
				const index = list.findIndex(item => item.id === selection.id);
				if (index >= 0) {
					list.splice(index, 1);
				}
			});

			if (store.selection.id === selection.id) {
				store.select(null);
			}
		},

		duplicate() {
			const { kind, id } = store.selection;
			const original = store.find();

			if (!original || (kind !== 'layer' && kind !== 'audio')) {
				return;
			}

			const copy = { ...structuredClone(original), id: uid(kind === 'audio' ? 'audio' : 'layer'), name: `${original.name} (cópia)` };

			store.update(project => {
				const list = kind === 'audio' ? project.audio : project.layers;
				list.splice(list.findIndex(item => item.id === id) + 1, 0, copy);
			});
			store.select(kind, copy.id);
		},

		/** Move layer `id` directly above or below layer `targetId` in the stack. */
		restackLayer(id, targetId, where) {
			store.update(project => {
				const from = project.layers.findIndex(layer => layer.id === id);
				if (from < 0) {
					return;
				}

				const [layer] = project.layers.splice(from, 1);
				const target = project.layers.findIndex(item => item.id === targetId);
				project.layers.splice(where === 'above' ? target + 1 : target, 0, layer);
			});
		},

		/** Raise (+1) or lower (-1) the selected layer one step in the stack. */
		shiftLayer(step) {
			const { kind, id } = store.selection;
			if (kind !== 'layer') {
				return;
			}

			store.update(project => {
				const from = project.layers.findIndex(layer => layer.id === id);
				const to = Math.min(project.layers.length - 1, Math.max(0, from + step));
				if (from >= 0 && to !== from) {
					project.layers.splice(to, 0, project.layers.splice(from, 1)[0]);
				}
			});
		},

		toggleVisible(id) {
			store.update(project => {
				const layer = findLayer(project, id);
				if (layer) {
					layer.visible = !layer.visible;
				}
			});
		},

		toggleMute(id) {
			store.update(project => {
				const clip = findClip(project, id);
				if (clip) {
					clip.muted = !clip.muted;
				}
			});
		},

		centerLayer(id) {
			store.update(project => {
				const layer = findLayer(project, id);
				if (layer) {
					layer.x = project.settings.width / 2;
					layer.y = project.settings.height / 2;
				}
			});
		},

		nudge(dx, dy) {
			const { kind, id } = store.selection;
			if (kind !== 'layer') {
				return;
			}

			store.update(
				project => {
					const layer = findLayer(project, id);
					if (layer) {
						layer.x += dx;
						layer.y += dy;
					}
				},
				{ coalesce: `nudge:${id}` }
			);
		}
	};

	return commands;
}
