/**
 * export/exporter.js
 *
 * Renders the project frame by frame, off the clock, and streams raw RGBA to an
 * ffmpeg process in the main process (electron/export.js). Offline rendering
 * means a heavy frame costs time, never a dropped frame.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { assetPaths } from '../core/project.js';
import { drawScene } from '../render/scene.js';
import { renderMixdown } from '../audio/mixer.js';
import { t } from '../i18n/index.js';

/** [value, i18n key] */
export const EXPORT_FORMATS = ['mp4', 'webm'].map(value => [value, `format.${value}`]);

/** [value, i18n key] */
export const EXPORT_QUALITIES = ['high', 'medium', 'low'].map(value => [value, `quality.${value}`]);

export class ExportCancelled extends Error {
	constructor() {
		super(t('export.cancelled'));
	}
}

/** Wait for every font the text layers use, or the first frames render in a fallback face. */
async function loadFonts(project) {
	const fonts = new Set(
		project.layers.filter(layer => layer.type === 'text').map(layer => `${layer.weight || 400} ${layer.size}px "${layer.font}"`)
	);
	await Promise.all([...fonts].map(font => document.fonts.load(font).catch(() => null)));
}

/**
 * @param {object} project - a snapshot; the editor may keep changing the live one
 * @param {{ outPath: string, format: string, quality: string, onProgress: Function, signal: AbortSignal }} options
 */
export async function exportVideo(project, assets, { outPath, format, quality, onProgress, signal }) {
	const { width, height, fps, duration } = project.settings;
	const frames = Math.max(1, Math.round(duration * fps));
	const transparent = project.background.type === 'transparent';
	const check = () => {
		if (signal?.aborted) {
			throw new ExportCancelled();
		}
	};

	onProgress({ phase: t('export.phase.assets'), ratio: 0 });
	await assets.ensureImages(assetPaths(project).images);
	await loadFonts(project);
	check();

	onProgress({ phase: t('export.phase.audio'), ratio: 0 });
	const audio = await renderMixdown(project, assets);
	check();

	const job = await window.mecha.exportBegin({ outPath, format, quality, width, height, fps, duration, transparent, audio });

	try {
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });

		for (let frame = 0; frame < frames; frame++) {
			check();

			drawScene(ctx, project, frame / fps, assets);
			await window.mecha.exportFrame(job, ctx.getImageData(0, 0, width, height).data);

			onProgress({ phase: t('export.phase.frame', { frame: frame + 1, frames }), ratio: (frame + 1) / frames });
		}

		onProgress({ phase: t('export.phase.finish'), ratio: 1 });
		return await window.mecha.exportEnd(job);
	} catch (error) {
		await window.mecha.exportCancel(job).catch(() => null);
		throw error;
	}
}
