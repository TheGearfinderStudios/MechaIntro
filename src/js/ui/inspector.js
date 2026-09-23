/**
 * ui/inspector.js
 *
 * Properties of whatever is selected: a layer, an audio clip, or (with nothing
 * selected) the project and its background.
 *
 * The panel is rebuilt from state when the selection changes or something else
 * edits the project, but not in response to its own edits, so a field keeps
 * focus and caret while you type in it.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa, panelTitle } from './dom.js';
import { section, row, numberField, rangeField, colorField, selectField, textField, textareaField, checkField, hint } from './form.js';
import { ANIMATIONS, MOTIONS } from '../core/animation.js';
import { EASING_OPTIONS } from '../core/easing.js';
import { ICON_STYLES, iconLabel, iconStyles } from '../core/icons.js';
import { BACKGROUND_TYPES, FONT_OPTIONS, FPS_OPTIONS, MIN_DURATION, RESOLUTIONS, resizeProject, setDuration, formatTime } from '../core/project.js';
import { t, options } from '../i18n/index.js';
import { pickIcon } from './iconPicker.js';
import { TYPE_ICONS } from './layers.js';

const SOURCE = 'inspector';

/** [value, i18n key] */
const WEIGHTS = ['300', '400', '600', '700', '900'].map(value => [value, `weight.${value}`]);
const ALIGNS = ['left', 'center', 'right'].map(value => [value, `align.${value}`]);
const FITS = ['cover', 'contain', 'stretch'].map(value => [value, `fit.${value}`]);

const percent = value => `${Math.round(value * 100)}%`;

export class InspectorView {
	constructor(root, { store, assets, commands }) {
		this.store = store;
		this.assets = assets;
		this.commands = commands;

		this.title = panelTitle('sliders', t('inspector.title'));
		this.body = h('div', { class: 'page', 'data-scrollbar': 'css' });
		root.append(this.title, this.body);

		this._off = [
			store.on('selection', () => this.render(true)),
			store.on('project', ({ source }) => {
				if (source !== SOURCE) {
					this.render();
				}
			})
		];

		this.render(true);
	}

	destroy() {
		this._off.forEach(off => off());
	}

	/** Edit the project; `rebuild` for changes that alter which fields are shown. */
	_set(key, apply, rebuild = false) {
		return value => {
			this.store.update(project => apply(project, value), {
				coalesce: `${this.store.selection.id || 'project'}:${key}`,
				source: rebuild ? null : SOURCE
			});
		};
	}

	/** Same as _set, scoped to the selected layer or clip. */
	_setTarget(key, apply, rebuild = false) {
		const { kind, id } = this.store.selection;
		const list = kind === 'audio' ? 'audio' : 'layers';

		return this._set(
			key,
			(project, value) => {
				const target = project[list].find(item => item.id === id);
				if (target) {
					apply(target, value, project);
				}
			},
			rebuild
		);
	}

	render(resetScroll = false) {
		const scroll = resetScroll ? 0 : this.body.scrollTop;
		const { selection } = this.store;
		const target = this.store.find();
		let content;
		let title = t('layers.projectAndBackground');
		let icon = TYPE_ICONS.background;

		if (target && selection.kind === 'layer') {
			content = this._layer(target);
			title = `${t(`type.${target.type}`)} · ${target.name || t('common.unnamed')}`;
			icon = TYPE_ICONS[target.type];
		} else if (target && selection.kind === 'audio') {
			content = this._audio(target);
			title = `${t('type.audio')} · ${target.name || t('common.unnamed')}`;
			icon = TYPE_ICONS.audio;
		} else {
			content = this._project();
		}

		this.title.replaceChildren(fa(icon, 'solid', 'titlebar-icon'), h('span', { class: 'text' }, title));
		this.body.replaceChildren(h('div', { class: 'inspector-body' }, content));
		this.body.scrollTop = scroll;
	}

	// ── Project & background ──────────────────────────────────────────────

	_project() {
		const { project } = this.store;
		const { settings, background } = project;
		const resolution = `${settings.width}x${settings.height}`;
		const known = RESOLUTIONS.some(([value]) => value === resolution);
		const resolutions = [...(known ? [] : [[resolution, `${settings.width} × ${settings.height}`]]), ...options(RESOLUTIONS)];

		return [
			section(
				'film',
				t('inspector.project'),
				textField(t('inspector.name'), project.name, this._set('name', (p, v) => (p.name = v))),
				selectField(
					t('inspector.resolution'),
					resolution,
					resolutions,
					this._set(
						'resolution',
						(p, v) => {
							const [width, height] = v.split('x').map(Number);
							resizeProject(p, width, height);
						},
						true
					)
				),
				row(
					selectField(t('inspector.fps'), settings.fps, options(FPS_OPTIONS), this._set('fps', (p, v) => (p.settings.fps = Number(v)))),
					numberField(
						t('inspector.duration'),
						settings.duration,
						this._set('duration', (p, v) => setDuration(p, v), true),
						// Only on commit: typing "12" would otherwise pass through "1" and cut
						// every layer down to one second on the way.
						{ min: 0.5, max: 600, step: 0.5, unit: 's', commitOnly: true }
					)
				)
			),
			section(
				'fill-drip',
				t('inspector.background'),
				selectField(t('inspector.type'), background.type, options(BACKGROUND_TYPES), this._set('bg-type', (p, v) => (p.background.type = v), true)),
				...this._backgroundFields(background)
			)
		];
	}

	_backgroundFields(background) {
		const bg = key => this._set(`bg-${key}`, (p, v) => (p.background[key] = v));
		const vignette = rangeField(t('inspector.vignette'), background.vignette, bg('vignette'), { max: 1, format: percent });

		switch (background.type) {
			case 'solid':
				return [colorField(t('inspector.color'), background.color, bg('color')), vignette];

			case 'linear':
			case 'radial': {
				const radial = background.type === 'radial';
				return [
					row(
						colorField(radial ? t('inspector.gradientCentre') : t('inspector.gradientStart'), background.from, bg('from')),
						colorField(radial ? t('inspector.gradientEdge') : t('inspector.gradientEnd'), background.to, bg('to'))
					),
					radial ? null : rangeField(t('inspector.angle'), background.angle, bg('angle'), { min: 0, max: 360, step: 1, format: v => `${v}°` }),
					vignette
				];
			}

			case 'image': {
				const error = background.image ? this.assets.imageError(background.image) : null;

				return [
					this._fileChoice(background.image, t('inspector.chooseImage'), async () => {
						const path = await window.mecha.pickAsset('image');
						if (path) {
							this._set('bg-image', p => (p.background.image = path), true)();
						}
					}),
					error ? hint(t('inspector.imageError', { error }), true) : null,
					row(
						selectField(t('inspector.fit'), background.imageFit, options(FITS), bg('imageFit')),
						colorField(t('inspector.colorBehind'), background.color, bg('color'))
					),
					rangeField(t('inspector.dim'), background.imageDim, bg('imageDim'), { max: 1, format: percent }),
					vignette
				];
			}

			case 'transparent':
				return [hint(t('inspector.transparentHint'))];
		}

		return [];
	}

	// ── Visual layers ─────────────────────────────────────────────────────

	_layer(layer) {
		const set = (key, rebuild = false) => this._setTarget(key, (target, value) => (target[key] = value), rebuild);
		const nested = (group, key, rebuild = false) => this._setTarget(`${group}.${key}`, (target, value) => (target[group][key] = value), rebuild);
		const { duration } = this.store.project.settings;

		return [
			section('tag', t('inspector.layer'), textField(t('inspector.name'), layer.name, set('name'))),
			section(
				'clock',
				t('inspector.timing'),
				row(
					numberField(t('inspector.appearsAt'), layer.start, this._setTarget('start', (target, v) => (target.start = Math.min(v, target.end - MIN_DURATION))), {
						min: 0,
						max: duration,
						step: 0.1,
						unit: 's'
					}),
					numberField(t('inspector.leavesAt'), layer.end, this._setTarget('end', (target, v) => (target.end = Math.max(v, target.start + MIN_DURATION))), {
						min: 0,
						max: duration,
						step: 0.1,
						unit: 's'
					})
				)
			),
			this._content(layer, set),
			section(
				'up-down-left-right',
				t('inspector.transform'),
				row(numberField('X', layer.x, set('x'), { step: 1, unit: 'px', precision: 0 }), numberField('Y', layer.y, set('y'), { step: 1, unit: 'px', precision: 0 })),
				row(
					numberField(t('inspector.rotation'), layer.rotation, set('rotation'), { min: -360, max: 360, step: 1, unit: '°', precision: 1 }),
					h(
						'div',
						{ class: 'field' },
						h('span', { class: 'field-label' }, t('inspector.centre')),
						h('button', { class: 'btn', onClick: () => this.commands.centerLayer(layer.id) }, fa('crosshairs'), t('inspector.centreInFrame'))
					)
				),
				rangeField(t('inspector.opacity'), layer.opacity, set('opacity'), { max: 1, format: percent })
			),
			section(
				'sun',
				t('inspector.shadow'),
				row(
					colorField(t('inspector.color'), layer.shadow.color, nested('shadow', 'color')),
					rangeField(t('inspector.intensity'), layer.shadow.blur, nested('shadow', 'blur'), { min: 0, max: 120, step: 1, format: v => `${v}px` })
				),
				hint(t('inspector.shadowHint'))
			),
			this._animation('right-to-bracket', t('inspector.entrance'), layer.animIn, 'animIn'),
			this._animation('right-from-bracket', t('inspector.exit'), layer.animOut, 'animOut'),
			this._motion(layer)
		];
	}

	_content(layer, set) {
		switch (layer.type) {
			case 'icon': {
				const available = iconStyles(layer.icon.name);
				const styleOptions = ICON_STYLES.filter(([value]) => available.includes(value));

				return section(
					'icons',
					t('type.icon'),
					h(
						'button',
						{
							class: 'icon-choice',
							onClick: async () => {
								const picked = await pickIcon(layer.icon);
								if (picked) {
									this.commands.setIcon(layer.id, picked);
								}
							}
						},
						h('span', { class: 'preview' }, fa(layer.icon.name, layer.icon.style)),
						h('span', { class: 'meta' }, h('strong', null, iconLabel(layer.icon.name)), h('span', null, t('inspector.iconChange', { name: layer.icon.name })))
					),
					h('div', { style: { height: '8px' } }),
					styleOptions.length > 1
						? selectField(t('inspector.iconStyle'), layer.icon.style, styleOptions, this._setTarget('icon.style', (target, v) => (target.icon = { ...target.icon, style: v }), true))
						: null,
					row(
						numberField(t('inspector.size'), layer.size, set('size'), { min: 1, max: 4000, step: 1, unit: 'px', precision: 0 }),
						colorField(t('inspector.color'), layer.color, set('color'))
					)
				);
			}

			case 'text': {
				const fonts = h('datalist', { id: 'font-list' }, FONT_OPTIONS.map(value => h('option', { value })));
				const fontField = textField(t('inspector.font'), layer.font, set('font'), { placeholder: t('inspector.fontPlaceholder') });
				fontField.querySelector('input').setAttribute('list', 'font-list');

				return section(
					'font',
					t('type.text'),
					textareaField(t('inspector.content'), layer.text, set('text')),
					fonts,
					fontField,
					row(
						numberField(t('inspector.size'), layer.size, set('size'), { min: 1, max: 2000, step: 1, unit: 'px', precision: 0 }),
						selectField(t('inspector.weight'), layer.weight, options(WEIGHTS), this._setTarget('weight', (target, v) => (target.weight = Number(v))))
					),
					row(
						selectField(t('inspector.align'), layer.align, options(ALIGNS), set('align')),
						numberField(t('inspector.letterSpacing'), layer.letterSpacing, set('letterSpacing'), { min: -50, max: 200, step: 1, unit: 'px', precision: 0 })
					),
					colorField(t('inspector.color'), layer.color, set('color'))
				);
			}

			case 'image': {
				const error = this.assets.imageError(layer.path);

				return section(
					'image',
					t('type.image'),
					this._fileChoice(layer.path, t('inspector.replaceImage'), async () => {
						const path = await window.mecha.pickAsset('image');
						if (path) {
							this._setTarget('path', target => (target.path = path), true)();
						}
					}),
					error ? hint(t('inspector.imageError', { error }), true) : null,
					numberField(t('inspector.width'), layer.width, set('width'), { min: 1, max: 8000, step: 1, unit: 'px', precision: 0 })
				);
			}
		}

		return null;
	}

	_animation(icon, title, anim, key) {
		const setAnim = (field, rebuild = false) => this._setTarget(`${key}.${field}`, (target, value) => (target[key] = { ...target[key], [field]: value }), rebuild);

		return section(
			icon,
			title,
			selectField(t('inspector.animation'), anim.type, options(ANIMATIONS), setAnim('type', true)),
			anim.type === 'none'
				? null
				: row(
						numberField(t('inspector.duration'), anim.duration, setAnim('duration'), { min: 0, max: 30, step: 0.1, unit: 's' }),
						selectField(t('inspector.easing'), anim.easing, options(EASING_OPTIONS), setAnim('easing'))
					)
		);
	}

	_motion(layer) {
		const setMotion = (field, rebuild = false) =>
			this._setTarget(`motion.${field}`, (target, value) => (target.motion = { ...target.motion, [field]: value }), rebuild);
		const { motion } = layer;
		const fields = [];

		if (motion.type === 'rotate') {
			fields.push(
				numberField(t('inspector.speed'), motion.speed, setMotion('speed'), { min: -10, max: 10, step: 0.05, unit: t('inspector.turnsPerSecond') }),
				hint(t('inspector.rotateHint'))
			);
		} else if (motion.type !== 'none') {
			fields.push(
				row(
					numberField(t('inspector.frequency'), motion.speed, setMotion('speed'), { min: 0, max: 10, step: 0.05, unit: 'Hz' }),
					rangeField(t('inspector.intensity'), motion.amount, setMotion('amount'), { max: 1, format: percent })
				)
			);
		}

		return section('arrows-spin', t('inspector.motion'), selectField(t('inspector.type'), motion.type, options(MOTIONS), setMotion('type', true)), ...fields);
	}

	// ── Audio clips ───────────────────────────────────────────────────────

	_audio(clip) {
		const set = key => this._setTarget(key, (target, value) => (target[key] = value));
		const { duration } = this.store.project.settings;
		const available = Math.max(MIN_DURATION, clip.sourceDuration - clip.trimStart);

		return [
			section(
				'music',
				t('inspector.file'),
				textField(t('inspector.name'), clip.name, set('name')),
				this._fileChoice(clip.path, t('inspector.replaceFile'), () => this.commands.replaceAudio(clip.id)),
				hint(t('inspector.fileLength', { length: formatTime(clip.sourceDuration) }))
			),
			section(
				'clock',
				t('inspector.timing'),
				row(
					numberField(t('inspector.startsAt'), clip.start, set('start'), { min: 0, max: duration, step: 0.1, unit: 's' }),
					numberField(t('inspector.duration'), clip.length, set('length'), { min: MIN_DURATION, max: available, step: 0.1, unit: 's' })
				),
				numberField(
					t('inspector.trimStart'),
					clip.trimStart,
					this._setTarget('trimStart', (target, v) => {
						target.trimStart = Math.min(v, target.sourceDuration - MIN_DURATION);
						target.length = Math.min(target.length, target.sourceDuration - target.trimStart);
					}),
					{ min: 0, max: clip.sourceDuration, step: 0.1, unit: 's' }
				)
			),
			section(
				'volume-high',
				t('inspector.volumeAndFades'),
				rangeField(t('inspector.volume'), clip.volume, set('volume'), { min: 0, max: 1.5, step: 0.01, format: percent }),
				row(
					numberField(t('inspector.fadeIn'), clip.fadeIn, set('fadeIn'), { min: 0, max: clip.length, step: 0.1, unit: 's' }),
					numberField(t('inspector.fadeOut'), clip.fadeOut, set('fadeOut'), { min: 0, max: clip.length, step: 0.1, unit: 's' })
				),
				checkField(t('inspector.muted'), clip.muted, this._setTarget('muted', (target, v) => (target.muted = v), true)),
				hint(t('inspector.fadeHint'))
			)
		];
	}

	_fileChoice(path, label, onPick) {
		return h(
			'div',
			{ class: 'field' },
			h(
				'div',
				{ class: 'file-choice' },
				h('span', { class: 'path', title: path || '' }, path ? `‎${path}` : t('inspector.noFile')),
				h('button', { class: 'btn', title: label, onClick: onPick }, fa('folder-open'))
			)
		);
	}
}
