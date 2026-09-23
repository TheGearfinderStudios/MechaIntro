/**
 * render/scene.js
 *
 * Draws one frame of a project onto a 2D canvas the size of the video. The stage
 * preview and the exporter both go through drawScene(), so what plays in the
 * editor is what ends up in the file.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { layerPose } from '../core/animation.js';
import { iconGlyph } from '../core/icons.js';

const LINE_HEIGHT = 1.2;

const glyphCache = new Map();
const measureContext = new OffscreenCanvas(1, 1).getContext('2d');

function glyph(name, style) {
	const key = `${name}|${style}`;

	if (!glyphCache.has(key)) {
		const raw = iconGlyph(name, style);
		glyphCache.set(key, raw ? { width: raw[0], height: raw[1], paths: raw.slice(2).map(d => new Path2D(d)) } : null);
	}

	return glyphCache.get(key);
}

function textFont(layer) {
	// Quoted so a family with spaces (Segoe UI) survives; the generic fallback keeps
	// a missing font from turning into the 10px browser default.
	return `${layer.weight || 400} ${layer.size}px "${layer.font}", sans-serif`;
}

function textLines(layer) {
	return String(layer.text ?? '').split('\n');
}

/** Unrotated, unscaled size of a layer, centred on its x/y. */
export function layerSize(layer, assets) {
	switch (layer.type) {
		case 'icon': {
			const g = glyph(layer.icon?.name, layer.icon?.style);
			const ratio = g ? g.width / g.height : 1;
			return { width: layer.size * ratio, height: layer.size };
		}
		case 'text': {
			measureContext.font = textFont(layer);
			measureContext.letterSpacing = `${layer.letterSpacing || 0}px`;
			const lines = textLines(layer);
			const width = Math.max(...lines.map(line => measureContext.measureText(line).width), layer.size * 0.3);
			return { width, height: lines.length * layer.size * LINE_HEIGHT };
		}
		case 'image': {
			const bitmap = assets?.image(layer.path);
			const ratio = bitmap ? bitmap.height / bitmap.width : 9 / 16;
			return { width: layer.width, height: layer.width * ratio };
		}
	}
	return { width: 0, height: 0 };
}

function drawBackground(ctx, background, width, height, assets) {
	ctx.clearRect(0, 0, width, height);

	switch (background.type) {
		case 'transparent':
			return;

		case 'solid':
			ctx.fillStyle = background.color;
			ctx.fillRect(0, 0, width, height);
			break;

		case 'linear': {
			// CSS convention: 0deg points up, 180deg points down.
			const angle = ((Number(background.angle) || 0) * Math.PI) / 180;
			const dx = Math.sin(angle);
			const dy = -Math.cos(angle);
			const reach = Math.abs((width / 2) * dx) + Math.abs((height / 2) * dy);
			const gradient = ctx.createLinearGradient(
				width / 2 - dx * reach,
				height / 2 - dy * reach,
				width / 2 + dx * reach,
				height / 2 + dy * reach
			);
			gradient.addColorStop(0, background.from);
			gradient.addColorStop(1, background.to);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			break;
		}

		case 'radial': {
			const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2);
			gradient.addColorStop(0, background.from);
			gradient.addColorStop(1, background.to);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			break;
		}

		case 'image': {
			ctx.fillStyle = background.color;
			ctx.fillRect(0, 0, width, height);

			const bitmap = assets.image(background.image);
			if (bitmap) {
				drawFitted(ctx, bitmap, background.imageFit, width, height);
			}
			if (background.imageDim > 0) {
				ctx.fillStyle = `rgba(0, 0, 0, ${background.imageDim})`;
				ctx.fillRect(0, 0, width, height);
			}
			break;
		}
	}

	if (background.vignette > 0) {
		const radius = Math.hypot(width, height) / 2;
		const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.35, width / 2, height / 2, radius);
		gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		gradient.addColorStop(1, `rgba(0, 0, 0, ${background.vignette})`);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	}
}

function drawFitted(ctx, bitmap, fit, width, height) {
	if (fit === 'stretch') {
		ctx.drawImage(bitmap, 0, 0, width, height);
		return;
	}

	const scale = (fit === 'contain' ? Math.min : Math.max)(width / bitmap.width, height / bitmap.height);
	const w = bitmap.width * scale;
	const h = bitmap.height * scale;
	ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
}

function drawLayer(ctx, layer, pose, assets) {
	ctx.save();
	ctx.globalAlpha = pose.alpha;

	if (pose.blur > 0.05) {
		ctx.filter = `blur(${pose.blur}px)`;
	}
	if (layer.shadow?.blur > 0) {
		ctx.shadowColor = layer.shadow.color;
		ctx.shadowBlur = layer.shadow.blur;
	}

	ctx.translate(pose.x, pose.y);
	ctx.rotate(pose.rotation);
	ctx.scale(pose.scale, pose.scale);

	switch (layer.type) {
		case 'icon': {
			const g = glyph(layer.icon?.name, layer.icon?.style);
			if (g) {
				const scale = layer.size / g.height;
				ctx.scale(scale, scale);
				ctx.translate(-g.width / 2, -g.height / 2);
				ctx.fillStyle = layer.color;
				for (const path of g.paths) {
					ctx.fill(path);
				}
			}
			break;
		}

		case 'text': {
			const lines = textLines(layer);
			const { width } = layerSize(layer, assets);
			const lineHeight = layer.size * LINE_HEIGHT;
			const anchor = { left: -width / 2, right: width / 2 }[layer.align] ?? 0;

			ctx.font = textFont(layer);
			ctx.letterSpacing = `${layer.letterSpacing || 0}px`;
			ctx.textAlign = layer.align || 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = layer.color;

			lines.forEach((line, i) => {
				ctx.fillText(line, anchor, (i - (lines.length - 1) / 2) * lineHeight);
			});
			break;
		}

		case 'image': {
			const bitmap = assets.image(layer.path);
			if (bitmap) {
				const { width, height } = layerSize(layer, assets);
				ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
			}
			break;
		}
	}

	ctx.restore();
}

/** One frame of `project` at time `t` (seconds). */
export function drawScene(ctx, project, t, assets) {
	const { width, height } = project.settings;

	ctx.save();
	drawBackground(ctx, project.background, width, height, assets);

	for (const layer of project.layers) {
		const pose = layerPose(layer, t, width, height);
		if (pose && pose.alpha > 0) {
			drawLayer(ctx, layer, pose, assets);
		}
	}

	ctx.restore();
}

/** The four corners of a layer on the canvas at time `t`, or null while it is off screen. */
export function layerCorners(layer, project, t, assets) {
	const pose = layerPose(layer, t, project.settings.width, project.settings.height);

	if (!pose) {
		return null;
	}

	const { width, height } = layerSize(layer, assets);
	const cos = Math.cos(pose.rotation) * pose.scale;
	const sin = Math.sin(pose.rotation) * pose.scale;

	return [
		[-width / 2, -height / 2],
		[width / 2, -height / 2],
		[width / 2, height / 2],
		[-width / 2, height / 2]
	].map(([x, y]) => [pose.x + x * cos - y * sin, pose.y + x * sin + y * cos]);
}

/** The topmost layer under canvas point (x, y) at time `t`. */
export function hitTest(project, t, x, y, assets) {
	for (let i = project.layers.length - 1; i >= 0; i--) {
		const layer = project.layers[i];
		const pose = layerPose(layer, t, project.settings.width, project.settings.height);

		if (!pose || pose.scale === 0) {
			continue;
		}

		// Into the layer's own frame: undo the translation, rotation and scale.
		const cos = Math.cos(-pose.rotation);
		const sin = Math.sin(-pose.rotation);
		const px = x - pose.x;
		const py = y - pose.y;
		const lx = (px * cos - py * sin) / pose.scale;
		const ly = (px * sin + py * cos) / pose.scale;
		const { width, height } = layerSize(layer, assets);

		if (Math.abs(lx) <= width / 2 && Math.abs(ly) <= height / 2) {
			return layer;
		}
	}

	return null;
}
