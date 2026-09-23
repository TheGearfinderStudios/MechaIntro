/**
 * ui/stage.js
 *
 * The preview: the frame at the playhead, drawn at full video resolution and
 * scaled to fit, with the selection outlined on top. Layers are picked and
 * dragged here; snapping pulls them onto the centre lines.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa, svg, iconButton, dragGesture } from './dom.js';
import { drawScene, hitTest, layerCorners, layerSize } from '../render/scene.js';
import { formatTime } from '../core/project.js';
import { t } from '../i18n/index.js';

// How close (in screen pixels) a dragged layer's centre gets to a centre line before it snaps.
const SNAP_SCREEN_PX = 10;

export class StageView {
	constructor(root, { store, assets, player }) {
		this.store = store;
		this.assets = assets;
		this.player = player;
		this._pending = false;
		this._guides = { x: false, y: false };

		this.canvas = h('canvas');
		this.ctx = this.canvas.getContext('2d');
		this.overlay = svg('svg', { class: 'stage-overlay', preserveAspectRatio: 'none' });
		this.frame = h('div', { class: 'stage-frame' }, this.canvas, this.overlay);
		this.viewport = h('div', { class: 'stage-viewport' }, this.frame);

		this.playButton = iconButton('play', t('stage.play'), () => player.toggle(), { class: 'icon-btn play-btn' });
		this.loopButton = iconButton('repeat', t('stage.loop'), () => {
			player.loop = !player.loop;
			this.loopButton.classList.toggle('active', player.loop);
		});
		this.loopButton.classList.toggle('active', player.loop);
		this.timeCurrent = h('span');
		this.timeTotal = h('span', { class: 'total' });
		this.meta = h('span', { class: 'meta' });

		const transport = h(
			'div',
			{ class: 'transport' },
			iconButton('backward-step', t('stage.toStart'), () => player.seek(0)),
			this.playButton,
			iconButton('forward-step', t('stage.toEnd'), () => player.seek(store.project.settings.duration)),
			h('span', { class: 'time' }, this.timeCurrent, ' / ', this.timeTotal),
			this.loopButton,
			this.meta
		);

		root.append(this.viewport, transport);

		this.overlay.addEventListener('pointerdown', event => this._onPointerDown(event));
		// Deferred a frame: resizing the frame inside the observer callback would
		// re-trigger layout in the same pass ("ResizeObserver loop" warnings).
		const resize = new ResizeObserver(() => requestAnimationFrame(() => this._fit()));
		resize.observe(this.viewport);

		this._off = [
			() => resize.disconnect(),
			store.on('project', () => {
				this._fit();
				this.invalidate();
			}),
			store.on('time', () => this.invalidate()),
			store.on('selection', () => this.invalidate()),
			store.on('meta', () => this._syncTransport())
		];

		this._fit();
		this._syncTransport();
		this.invalidate();
	}

	destroy() {
		this._off.forEach(off => off());
	}

	invalidate() {
		if (this._pending) {
			return;
		}
		this._pending = true;
		requestAnimationFrame(() => {
			this._pending = false;
			this._draw();
		});
	}

	_fit() {
		const { width, height } = this.store.project.settings;
		const bounds = this.viewport.getBoundingClientRect();
		const margin = 24;
		const scale = Math.max(0.05, Math.min((bounds.width - margin * 2) / width, (bounds.height - margin * 2) / height));

		this.frame.style.width = `${Math.floor(width * scale)}px`;
		this.frame.style.height = `${Math.floor(height * scale)}px`;
		this.frame.classList.toggle('checker', this.store.project.background.type === 'transparent');
		this.overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
	}

	_draw() {
		const { project, time } = this.store;
		const { width, height, duration } = project.settings;

		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
		}

		drawScene(this.ctx, project, time, this.assets);
		this._drawOverlay();

		this.timeCurrent.textContent = formatTime(time);
		this.timeTotal.textContent = formatTime(duration);
		this.meta.textContent = `${width} × ${height} · ${project.settings.fps} fps`;
	}

	_drawOverlay() {
		const { project, time, selection } = this.store;
		const { width, height } = project.settings;
		const children = [];

		if (this._guides.x) {
			children.push(svg('line', { class: 'guide', x1: width / 2, y1: 0, x2: width / 2, y2: height }));
		}
		if (this._guides.y) {
			children.push(svg('line', { class: 'guide', x1: 0, y1: height / 2, x2: width, y2: height / 2 }));
		}

		const layer = selection.kind === 'layer' ? this.store.find() : null;

		if (layer) {
			// Off screen at this moment: outline where it rests, dashed, so it can still be found.
			const live = layerCorners(layer, project, time, this.assets);
			const corners = live || this._restCorners(layer);

			children.push(
				svg('polygon', {
					class: `selection${live ? '' : ' resting'}`,
					points: corners.map(point => point.join(',')).join(' ')
				})
			);
		}

		this.overlay.replaceChildren(...children);
	}

	_restCorners(layer) {
		const { width, height } = layerSize(layer, this.assets);
		const angle = ((layer.rotation || 0) * Math.PI) / 180;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		return [
			[-width / 2, -height / 2],
			[width / 2, -height / 2],
			[width / 2, height / 2],
			[-width / 2, height / 2]
		].map(([x, y]) => [layer.x + x * cos - y * sin, layer.y + x * sin + y * cos]);
	}

	_syncTransport() {
		const playing = this.store.playing;
		this.playButton.replaceChildren(fa(playing ? 'pause' : 'play'));
		this.playButton.title = playing ? t('stage.pause') : t('stage.play');
	}

	/** Screen point -> canvas pixels. */
	_toCanvas(event) {
		const rect = this.overlay.getBoundingClientRect();
		const { width, height } = this.store.project.settings;

		return {
			x: ((event.clientX - rect.left) / rect.width) * width,
			y: ((event.clientY - rect.top) / rect.height) * height,
			perScreenPixel: width / rect.width
		};
	}

	_onPointerDown(event) {
		if (event.button !== 0) {
			return;
		}

		const { store } = this;
		const point = this._toCanvas(event);
		let layer = hitTest(store.project, store.time, point.x, point.y, this.assets);

		// The selected layer keeps priority when it is off screen right now: its dashed
		// outline is still grabbable.
		const selected = store.selection.kind === 'layer' ? store.find() : null;
		if (!layer && selected && !layerCorners(selected, store.project, store.time, this.assets) && this._inside(this._restCorners(selected), point)) {
			layer = selected;
		}

		if (!layer) {
			store.select('background');
			return;
		}

		store.select('layer', layer.id);

		const id = layer.id;
		const origin = { x: layer.x, y: layer.y };
		const { width, height } = store.project.settings;
		const snap = SNAP_SCREEN_PX * point.perScreenPixel;
		const gesture = `stage-drag:${Date.now()}`;

		this.overlay.classList.add('dragging');

		dragGesture(event, {
			onMove: (e, dx, dy) => {
				let x = origin.x + dx * point.perScreenPixel;
				let y = origin.y + dy * point.perScreenPixel;

				// Shift locks the drag to whichever axis moved further.
				if (e.shiftKey) {
					if (Math.abs(dx) > Math.abs(dy)) {
						y = origin.y;
					} else {
						x = origin.x;
					}
				}

				this._guides = { x: false, y: false };
				if (!e.altKey) {
					if (Math.abs(x - width / 2) < snap) {
						x = width / 2;
						this._guides.x = true;
					}
					if (Math.abs(y - height / 2) < snap) {
						y = height / 2;
						this._guides.y = true;
					}
				}

				store.update(
					project => {
						const target = project.layers.find(item => item.id === id);
						if (target) {
							target.x = Math.round(x);
							target.y = Math.round(y);
						}
					},
					{ coalesce: gesture }
				);
			},
			onEnd: () => {
				this._guides = { x: false, y: false };
				this.overlay.classList.remove('dragging');
				store.commit();
				this.invalidate();
			}
		});
	}

	_inside(corners, { x, y }) {
		let inside = false;

		for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
			const [xi, yi] = corners[i];
			const [xj, yj] = corners[j];
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}
}
