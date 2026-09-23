/**
 * ui/timeline.js
 *
 * One track per visual layer (in stacking order, top first) and one per audio
 * clip. Bars move and resize by dragging; audio bars trim from either edge and
 * carry their fade handles on top. Edges snap to the playhead, to other edges
 * and to the project's ends; everything else lands on whole frames.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa, svg, panelTitle, dragGesture } from './dom.js';
import { MIN_DURATION, formatTime } from '../core/project.js';
import { TYPE_ICONS } from './layers.js';
import { t } from '../i18n/index.js';

const HEAD_WIDTH = 190;
const TAIL = 160;
const SNAP_PX = 8;
const MIN_PPS = 8;
const MAX_PPS = 2000;
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];

export class TimelineView {
	constructor(root, { store, assets, player }) {
		this.store = store;
		this.assets = assets;
		this.player = player;
		this.pps = null; // pixels per second; null = fit to width
		this.snap = true;

		this.zoomLabel = h('span', { class: 'zoom-label' });
		this.snapButton = h('button', { class: 'icon-btn active', title: t('timeline.snap'), onClick: () => this._toggleSnap() }, fa('magnet'));

		this.content = h('div', { class: 'tl-content' });
		this.scroll = h('div', { class: 'tl-scroll', 'data-scrollbar': 'css' }, this.content);
		this.playhead = h('div', { class: 'tl-playhead' });
		this.cap = h('div', { class: 'tl-cap' });

		root.append(
			panelTitle(
				'timeline',
				t('timeline.title'),
				h('button', { class: 'icon-btn', title: t('timeline.zoomOut'), onClick: () => this._zoom(1 / 1.4) }, fa('magnifying-glass-minus')),
				this.zoomLabel,
				h('button', { class: 'icon-btn', title: t('timeline.zoomIn'), onClick: () => this._zoom(1.4) }, fa('magnifying-glass-plus')),
				h('button', { class: 'icon-btn', title: t('timeline.fit'), onClick: () => this._fit() }, fa('left-right')),
				this.snapButton
			),
			this.scroll
		);

		this.scroll.addEventListener(
			'wheel',
			event => {
				if (event.ctrlKey) {
					event.preventDefault();
					this._zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX);
				}
			},
			{ passive: false }
		);

		const resize = new ResizeObserver(() =>
			requestAnimationFrame(() => {
				if (this.pps === null) {
					this.render();
				}
			})
		);
		resize.observe(this.scroll);

		this._off = [
			() => resize.disconnect(),
			store.on('project', () => this.render()),
			store.on('selection', () => this.render()),
			store.on('time', () => this._placePlayhead(true))
		];

		this.render();
	}

	destroy() {
		this._off.forEach(off => off());
	}

	get pixelsPerSecond() {
		if (this.pps !== null) {
			return this.pps;
		}
		// Fitted, the whole project and the shaded tail fit without a scrollbar.
		const available = Math.max(200, this.scroll.clientWidth - HEAD_WIDTH - TAIL - 12);
		return Math.min(MAX_PPS, Math.max(MIN_PPS, available / this.store.project.settings.duration));
	}

	_zoom(factor, clientX = null) {
		const before = this.pixelsPerSecond;
		const rect = this.scroll.getBoundingClientRect();
		const anchorX = clientX === null ? rect.width / 2 : clientX - rect.left;
		const anchorTime = (this.scroll.scrollLeft + anchorX - HEAD_WIDTH) / before;

		this.pps = Math.min(MAX_PPS, Math.max(MIN_PPS, before * factor));
		this.render();

		// Keep the moment under the cursor where it was.
		this.scroll.scrollLeft = anchorTime * this.pps + HEAD_WIDTH - anchorX;
	}

	_fit() {
		this.pps = null;
		this.scroll.scrollLeft = 0;
		this.render();
	}

	_toggleSnap() {
		this.snap = !this.snap;
		this.snapButton.classList.toggle('active', this.snap);
	}

	_x(time) {
		return HEAD_WIDTH + time * this.pixelsPerSecond;
	}

	render() {
		const { project, selection } = this.store;
		const pps = this.pixelsPerSecond;
		const { duration } = project.settings;
		const laneWidth = duration * pps + TAIL;

		this.zoomLabel.textContent = `${Math.round(pps)} px/s`;
		this.content.style.width = `${HEAD_WIDTH + laneWidth}px`;

		const rows = [this._ruler(laneWidth)];

		rows.push(this._groupRow(t('layers.visual'), laneWidth));
		for (const layer of [...project.layers].reverse()) {
			rows.push(this._layerRow(layer, selection, laneWidth));
		}

		rows.push(this._groupRow(t('layers.audio'), laneWidth));
		for (const clip of project.audio) {
			rows.push(this._audioRow(clip, selection, laneWidth));
		}

		if (!project.layers.length && !project.audio.length) {
			rows.push(h('div', { class: 'tl-empty' }, t('timeline.empty')));
		}

		this.content.replaceChildren(...rows, this.playhead);
		this._placePlayhead(false);
	}

	_placePlayhead(follow) {
		const x = this._x(this.store.time);

		this.playhead.style.left = `${x}px`;
		this.cap.style.left = `${x - HEAD_WIDTH}px`;

		// While playing, page the view along so the playhead never runs off the edge.
		if (follow && this.store.playing) {
			const { scrollLeft, clientWidth } = this.scroll;
			if (x > scrollLeft + clientWidth - 40 || x < scrollLeft + HEAD_WIDTH) {
				this.scroll.scrollLeft = x - HEAD_WIDTH - 40;
			}
		}
	}

	// ── Rows ──────────────────────────────────────────────────────────────

	_pastEnd(laneWidth) {
		return h('div', { class: 'tl-past-end', style: { left: `${this.store.project.settings.duration * this.pixelsPerSecond}px`, width: `${TAIL}px` } });
	}

	_ruler(laneWidth) {
		const pps = this.pixelsPerSecond;
		const { duration } = this.store.project.settings;
		const major = TICK_STEPS.find(step => step * pps >= 70) || 60;
		const minor = major / (major * pps >= 150 ? 10 : 5);
		const ticks = [];

		for (let i = 0; i * minor <= duration + 1e-6; i++) {
			const time = i * minor;
			const isMajor = Math.abs(time / major - Math.round(time / major)) < 1e-6;
			const left = `${time * pps}px`;

			ticks.push(h('div', { class: `tl-tick${isMajor ? ' major' : ''}`, style: { left } }));
			if (isMajor) {
				ticks.push(h('div', { class: 'tl-tick-label', style: { left } }, formatTime(time, major < 1)));
			}
		}

		const lane = h('div', { class: 'tl-lane', style: { width: `${laneWidth}px` } }, ...ticks, this._pastEnd(laneWidth), this.cap);
		lane.addEventListener('pointerdown', event => this._scrub(event, lane));

		return h('div', { class: 'tl-row ruler' }, h('div', { class: 'tl-head' }, t('timeline.time')), lane);
	}

	_groupRow(label, laneWidth) {
		return h('div', { class: 'tl-row group' }, h('div', { class: 'tl-head' }, label), h('div', { class: 'tl-lane', style: { width: `${laneWidth}px` } }));
	}

	_emptyLane(laneWidth) {
		const lane = h('div', { class: 'tl-lane body', style: { width: `${laneWidth}px` } }, this._pastEnd(laneWidth));

		lane.addEventListener('pointerdown', event => {
			if (event.target === lane) {
				this._scrub(event, lane);
			}
		});
		return lane;
	}

	_head(icon, name, selected, onSelect, toggle) {
		return h('div', { class: 'tl-head', title: name, onClick: onSelect }, h('span', { class: 'type-icon' }, icon), h('span', { class: 'name' }, name || t('common.unnamed')), toggle);
	}

	_toggleButton(icon, title, onClick) {
		return h(
			'button',
			{
				class: 'row-btn',
				title,
				onClick: event => {
					event.stopPropagation();
					onClick();
				}
			},
			fa(icon)
		);
	}

	_layerRow(layer, selection, laneWidth) {
		const selected = selection.kind === 'layer' && selection.id === layer.id;
		const pps = this.pixelsPerSecond;
		const span = layer.end - layer.start;
		const inDuration = layer.animIn.type === 'none' ? 0 : Math.min(layer.animIn.duration, span);
		const outDuration = layer.animOut.type === 'none' ? 0 : Math.min(layer.animOut.duration, span);
		const icon = layer.type === 'icon' ? fa(layer.icon.name, layer.icon.style) : fa(TYPE_ICONS[layer.type]);

		const clip = h(
			'div',
			{
				class: `tl-clip layer${selected ? ' selected' : ''}${layer.visible ? '' : ' off'}`,
				style: { left: `${layer.start * pps}px`, width: `${Math.max(2, span * pps)}px` }
			},
			h('div', { class: 'anim-in', style: { width: `${inDuration * pps}px` } }),
			h('div', { class: 'anim-out', style: { width: `${outDuration * pps}px` } }),
			h('div', { class: 'clip-label' }, fa(TYPE_ICONS[layer.type]), layer.name || t('common.unnamed')),
			h('div', { class: 'tl-handle left', dataset: { edge: 'start' } }),
			h('div', { class: 'tl-handle right', dataset: { edge: 'end' } })
		);

		clip.addEventListener('pointerdown', event => this._dragLayer(event, layer));

		const lane = this._emptyLane(laneWidth);
		lane.append(clip);

		return h(
			'div',
			{ class: `tl-row${selected ? ' selected' : ''}` },
			this._head(
				icon,
				layer.name,
				selected,
				() => this.store.select('layer', layer.id),
				this._toggleButton(layer.visible ? 'eye' : 'eye-slash', layer.visible ? t('layers.hide') : t('layers.show'), () =>
					this.store.update(project => {
						const target = project.layers.find(item => item.id === layer.id);
						if (target) {
							target.visible = !target.visible;
						}
					})
				)
			),
			lane
		);
	}

	_audioRow(clip, selection, laneWidth) {
		const selected = selection.kind === 'audio' && selection.id === clip.id;
		const pps = this.pixelsPerSecond;
		const width = Math.max(2, clip.length * pps);
		const fadeIn = Math.min(clip.fadeIn, clip.length);
		const fadeOut = Math.min(clip.fadeOut, clip.length);
		const fi = (fadeIn / clip.length) * 100;
		const fo = 100 - (fadeOut / clip.length) * 100;

		const fades = svg('svg', { class: 'tl-fades', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
		fades.append(
			svg('polygon', { points: `0,0 ${fi},0 0,100` }),
			svg('polygon', { points: `${fo},0 100,0 100,100` }),
			svg('polyline', { points: `0,100 ${fi},0 ${fo},0 100,100` })
		);

		const bar = h(
			'div',
			{
				class: `tl-clip audio${selected ? ' selected' : ''}${clip.muted ? ' off' : ''}`,
				style: { left: `${clip.start * pps}px`, width: `${width}px` }
			},
			this._waveform(clip, width),
			fades,
			h('div', { class: 'clip-label' }, fa(clip.muted ? 'volume-xmark' : 'music'), `${clip.name} · ${Math.round(clip.volume * 100)}%`),
			h('div', { class: 'tl-handle left', dataset: { edge: 'start' } }),
			h('div', { class: 'tl-handle right', dataset: { edge: 'end' } }),
			h('div', { class: 'tl-fade-handle', title: t('timeline.fadeIn'), dataset: { fade: 'in' }, style: { left: `${fadeIn * pps}px` } }),
			h('div', { class: 'tl-fade-handle', title: t('timeline.fadeOut'), dataset: { fade: 'out' }, style: { left: `${width - fadeOut * pps}px` } })
		);

		bar.addEventListener('pointerdown', event => this._dragAudio(event, clip));

		const lane = this._emptyLane(laneWidth);
		lane.append(bar);

		return h(
			'div',
			{ class: `tl-row${selected ? ' selected' : ''}` },
			this._head(
				fa('music'),
				clip.name,
				selected,
				() => this.store.select('audio', clip.id),
				this._toggleButton(clip.muted ? 'volume-xmark' : 'volume-high', clip.muted ? t('layers.unmute') : t('layers.mute'), () =>
					this.store.update(project => {
						const target = project.audio.find(item => item.id === clip.id);
						if (target) {
							target.muted = !target.muted;
						}
					})
				)
			),
			lane
		);
	}

	_waveform(clip, width) {
		const peaks = this.assets.waveform(clip.path);
		const canvas = h('canvas', { class: 'tl-wave' });

		if (!peaks || !clip.sourceDuration) {
			return canvas;
		}

		const pixels = Math.min(4000, Math.ceil(width));
		const height = 26;
		canvas.width = pixels;
		canvas.height = height;

		const ctx = canvas.getContext('2d');
		ctx.fillStyle = 'rgba(28, 26, 31, 0.5)';

		for (let x = 0; x < pixels; x++) {
			const time = clip.trimStart + (x / pixels) * clip.length;
			const peak = peaks[Math.min(peaks.length - 1, Math.floor((time / clip.sourceDuration) * peaks.length))] || 0;
			const bar = Math.max(1, peak * height * 0.9);
			ctx.fillRect(x, (height - bar) / 2, 1, bar);
		}

		return canvas;
	}

	// ── Gestures ──────────────────────────────────────────────────────────

	_timeAt(event, lane) {
		const rect = lane.getBoundingClientRect();
		return (event.clientX - rect.left) / this.pixelsPerSecond;
	}

	_scrub(event, lane) {
		if (event.button !== 0) {
			return;
		}

		const seek = e => this.player.seek(Math.min(this.store.project.settings.duration, Math.max(0, this._timeAt(e, lane))));

		seek(event);
		dragGesture(event, { onMove: seek });
	}

	/**
	 * Snap a time to the nearest edge worth landing on, or else to a whole frame.
	 * Returns { time, distance } so a two-edged move can keep whichever edge snapped closer.
	 */
	_snapTime(time, event, ignoreId) {
		const { project, time: playhead } = this.store;
		const frame = 1 / project.settings.fps;
		const quantized = Math.round(time / frame) * frame;

		if (!this.snap || event.altKey) {
			return { time: quantized, distance: Infinity };
		}

		const targets = [0, project.settings.duration, playhead];
		for (const layer of project.layers) {
			if (layer.id !== ignoreId) {
				targets.push(layer.start, layer.end);
			}
		}
		for (const clip of project.audio) {
			if (clip.id !== ignoreId) {
				targets.push(clip.start, clip.start + clip.length);
			}
		}

		let best = { time: quantized, distance: Infinity };
		for (const target of targets) {
			const distance = Math.abs(target - time) * this.pixelsPerSecond;
			if (distance < SNAP_PX && distance < best.distance) {
				best = { time: target, distance };
			}
		}
		return best;
	}

	_dragLayer(event, layer) {
		if (event.button !== 0) {
			return;
		}
		event.stopPropagation();
		this.store.select('layer', layer.id);

		const edge = event.target.dataset.edge || 'move';
		const origin = { start: layer.start, end: layer.end };
		const { duration } = this.store.project.settings;
		const gesture = `tl-layer:${Date.now()}`;

		dragGesture(event, {
			onMove: (e, dx) => {
				const dt = dx / this.pixelsPerSecond;
				let { start, end } = origin;

				if (edge === 'start') {
					start = Math.min(Math.max(0, this._snapTime(origin.start + dt, e, layer.id).time), end - MIN_DURATION);
				} else if (edge === 'end') {
					end = Math.max(Math.min(duration, this._snapTime(origin.end + dt, e, layer.id).time), start + MIN_DURATION);
				} else {
					const span = origin.end - origin.start;
					const byStart = this._snapTime(origin.start + dt, e, layer.id);
					const byEnd = this._snapTime(origin.end + dt, e, layer.id);
					start = byEnd.distance < byStart.distance ? byEnd.time - span : byStart.time;
					start = Math.min(Math.max(0, start), Math.max(0, duration - span));
					end = start + span;
				}

				this._apply(gesture, 'layers', layer.id, target => {
					target.start = start;
					target.end = end;
				});
			},
			onEnd: () => this.store.commit()
		});
	}

	_dragAudio(event, clip) {
		if (event.button !== 0) {
			return;
		}
		event.stopPropagation();
		this.store.select('audio', clip.id);

		const edge = event.target.dataset.edge || null;
		const fade = event.target.dataset.fade || null;
		const origin = { ...clip };
		const { duration } = this.store.project.settings;
		const gesture = `tl-audio:${Date.now()}`;

		dragGesture(event, {
			onMove: (e, dx) => {
				const dt = dx / this.pixelsPerSecond;

				this._apply(gesture, 'audio', clip.id, target => {
					if (fade === 'in') {
						target.fadeIn = Math.min(Math.max(0, origin.fadeIn + dt), target.length - target.fadeOut);
					} else if (fade === 'out') {
						target.fadeOut = Math.min(Math.max(0, origin.fadeOut - dt), target.length - target.fadeIn);
					} else if (edge === 'start') {
						// Trimming the head: the clip starts later on the timeline and later
						// in the file by the same amount, so the rest of it stays put.
						let delta = this._snapTime(origin.start + dt, e, clip.id).time - origin.start;
						delta = Math.max(delta, -origin.start, -origin.trimStart);
						delta = Math.min(delta, origin.length - MIN_DURATION);
						target.start = origin.start + delta;
						target.trimStart = origin.trimStart + delta;
						target.length = origin.length - delta;
						target.fadeIn = Math.min(target.fadeIn, target.length);
					} else if (edge === 'end') {
						const end = this._snapTime(origin.start + origin.length + dt, e, clip.id).time;
						target.length = Math.min(Math.max(MIN_DURATION, end - origin.start), origin.sourceDuration - origin.trimStart);
						target.fadeOut = Math.min(target.fadeOut, target.length);
					} else {
						const byStart = this._snapTime(origin.start + dt, e, clip.id);
						const byEnd = this._snapTime(origin.start + origin.length + dt, e, clip.id);
						const start = byEnd.distance < byStart.distance ? byEnd.time - origin.length : byStart.time;
						target.start = Math.min(Math.max(0, start), duration - MIN_DURATION);
					}
				});
			},
			onEnd: () => this.store.commit()
		});
	}

	_apply(gesture, list, id, mutate) {
		this.store.update(
			project => {
				const target = project[list].find(item => item.id === id);
				if (target) {
					mutate(target);
				}
			},
			{ coalesce: gesture }
		);
	}
}
