/**
 * ui/exportDialog.js
 *
 * Export settings, then progress. The render works on a snapshot of the project,
 * so the editor stays usable, but the dialog stays up until it finishes or is
 * cancelled.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa } from './dom.js';
import { openModal } from './modal.js';
import { section, selectField, hint } from './form.js';
import { EXPORT_FORMATS, EXPORT_QUALITIES, ExportCancelled, exportVideo } from '../export/exporter.js';
import { formatTime } from '../core/project.js';

let lastFormat = 'mp4';
let lastQuality = 'high';

export function openExportDialog({ store, assets, player }) {
	const { project } = store;
	const transparent = project.background.type === 'transparent';
	let format = transparent ? 'webm' : lastFormat;
	let quality = lastQuality;
	let running = null;

	player.pause();

	const summary = () => {
		const { width, height, fps, duration } = project.settings;
		const audible = project.audio.filter(clip => !clip.muted).length;
		return `${width} × ${height} · ${fps} fps · ${formatTime(duration)} · ${project.layers.length} camada(s) · ${audible} som(ns)`;
	};

	const alphaHint = h('div');
	const syncAlphaHint = () => {
		alphaHint.replaceChildren(
			...[
				transparent && format === 'mp4' ? hint('O fundo é transparente, mas o MP4 não guarda transparência: o fundo sairá preto. Use WebM para manter o canal alfa.', true) : null,
				transparent && format === 'webm' ? hint('O WebM será exportado com canal alfa, pronto para sobrepor no editor de vídeo.') : null
			].filter(Boolean)
		);
	};

	const settings = h(
		'div',
		{ class: 'page' },
		section(
			'film',
			'Vídeo',
			hint(summary()),
			selectField('Formato', format, EXPORT_FORMATS, value => {
				format = lastFormat = value;
				syncAlphaHint();
			}),
			selectField('Qualidade', quality, EXPORT_QUALITIES, value => (quality = lastQuality = value)),
			alphaHint
		)
	);
	syncAlphaHint();

	const phase = h('span');
	const percent = h('span');
	const bar = h('div', { class: 'progress-bar' });
	const progress = h('div', { class: 'page hidden' }, h('div', { class: 'progress-label' }, phase, percent), h('div', { class: 'progress' }, bar));

	const startButton = h('button', { class: 'btn primary', onClick: start }, fa('file-export'), 'Exportar');
	const cancelButton = h('button', { class: 'btn', onClick: cancel }, 'Cancelar');

	const modal = openModal({
		icon: 'file-export',
		title: 'Exportar vídeo',
		body: [settings, progress],
		footer: [cancelButton, startButton],
		dismissible: () => !running
	});

	function cancel() {
		if (running) {
			running.abort();
		} else {
			modal.close();
		}
	}

	async function start() {
		const outPath = await window.mecha.pickExportPath({ format, suggestedName: project.name || 'intro' });

		if (!outPath) {
			return;
		}

		running = new AbortController();
		settings.classList.add('hidden');
		progress.classList.remove('hidden');
		startButton.disabled = true;
		cancelButton.textContent = 'Cancelar exportação';

		const began = performance.now();

		try {
			const path = await exportVideo(structuredClone(store.project), assets, {
				outPath,
				format,
				quality,
				signal: running.signal,
				onProgress: ({ phase: text, ratio }) => {
					phase.textContent = text;
					percent.textContent = `${Math.round(ratio * 100)}%`;
					bar.style.width = `${ratio * 100}%`;
				}
			});

			showResult(path, (performance.now() - began) / 1000);
		} catch (error) {
			if (error instanceof ExportCancelled) {
				modal.close();
				return;
			}
			showError(error);
		} finally {
			running = null;
		}
	}

	function showResult(path, seconds) {
		progress.replaceChildren(
			h('div', { class: 'export-result' }, fa('circle-check'), h('div', null, h('strong', null, 'Vídeo exportado'), h('div', null, path))),
			hint(`Concluído em ${seconds.toFixed(1)} s.`)
		);
		modal.element.querySelector('.modal-footer').replaceChildren(
			h('button', { class: 'btn', onClick: () => window.mecha.reveal(path) }, fa('folder-open'), 'Mostrar na pasta'),
			h('button', { class: 'btn primary', onClick: () => modal.close() }, 'Fechar')
		);
	}

	function showError(error) {
		console.error('[export]', error);
		// IPC wraps main-process errors as "Error invoking remote method '...': Error: <message>".
		const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

		progress.replaceChildren(hint('A exportação falhou.', true), h('div', { class: 'export-error' }, message));
		modal.element.querySelector('.modal-footer').replaceChildren(h('button', { class: 'btn primary', onClick: () => modal.close() }, 'Fechar'));
	}
}
