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
import { pickIcon } from './iconPicker.js';
import { TYPE_ICONS } from './layers.js';

const SOURCE = 'inspector';

const WEIGHTS = [
	['300', 'Leve'],
	['400', 'Normal'],
	['600', 'Semi-negrito'],
	['700', 'Negrito'],
	['900', 'Black']
];

const ALIGNS = [
	['left', 'Esquerda'],
	['center', 'Centro'],
	['right', 'Direita']
];

const FITS = [
	['cover', 'Preencher'],
	['contain', 'Conter'],
	['stretch', 'Esticar']
];

const TYPE_NAMES = { icon: 'Ícone', text: 'Texto', image: 'Imagem', audio: 'Áudio' };

const percent = value => `${Math.round(value * 100)}%`;

export class InspectorView {
	constructor(root, { store, assets, commands }) {
		this.store = store;
		this.assets = assets;
		this.commands = commands;

		this.title = panelTitle('sliders', 'Propriedades');
		this.body = h('div', { class: 'page', 'data-scrollbar': 'css' });
		root.append(this.title, this.body);

		store.on('selection', () => this.render(true));
		store.on('project', ({ source }) => {
			if (source !== SOURCE) {
				this.render();
			}
		});

		this.render(true);
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
		let title = 'Projeto e fundo';
		let icon = TYPE_ICONS.background;

		if (target && selection.kind === 'layer') {
			content = this._layer(target);
			title = `${TYPE_NAMES[target.type]} · ${target.name || 'sem nome'}`;
			icon = TYPE_ICONS[target.type];
		} else if (target && selection.kind === 'audio') {
			content = this._audio(target);
			title = `Áudio · ${target.name || 'sem nome'}`;
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
		const resolutions = RESOLUTIONS.some(([value]) => value === resolution)
			? RESOLUTIONS
			: [[resolution, `${settings.width} × ${settings.height}`], ...RESOLUTIONS];

		return [
			section(
				'film',
				'Projeto',
				textField('Nome', project.name, this._set('name', (p, v) => (p.name = v))),
				selectField(
					'Resolução',
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
					selectField('Quadros por segundo', settings.fps, FPS_OPTIONS, this._set('fps', (p, v) => (p.settings.fps = Number(v)))),
					numberField(
						'Duração',
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
				'Fundo',
				selectField('Tipo', background.type, BACKGROUND_TYPES, this._set('bg-type', (p, v) => (p.background.type = v), true)),
				...this._backgroundFields(background)
			)
		];
	}

	_backgroundFields(background) {
		const bg = key => this._set(`bg-${key}`, (p, v) => (p.background[key] = v));
		const vignette = rangeField('Vinheta', background.vignette, bg('vignette'), { max: 1, format: percent });

		switch (background.type) {
			case 'solid':
				return [colorField('Cor', background.color, bg('color')), vignette];

			case 'linear':
			case 'radial':
				return [
					row(colorField(background.type === 'radial' ? 'Centro' : 'Início', background.from, bg('from')), colorField(background.type === 'radial' ? 'Borda' : 'Fim', background.to, bg('to'))),
					background.type === 'linear' ? rangeField('Ângulo', background.angle, bg('angle'), { min: 0, max: 360, step: 1, format: v => `${v}°` }) : null,
					vignette
				];

			case 'image': {
				const error = background.image ? this.assets.imageError(background.image) : null;

				return [
					this._fileChoice(background.image, 'Escolher imagem', async () => {
						const path = await window.mecha.pickAsset('image');
						if (path) {
							this._set('bg-image', p => (p.background.image = path), true)();
						}
					}),
					error ? hint(`Não foi possível abrir a imagem: ${error}`, true) : null,
					row(selectField('Ajuste', background.imageFit, FITS, bg('imageFit')), colorField('Cor por trás', background.color, bg('color'))),
					rangeField('Escurecer', background.imageDim, bg('imageDim'), { max: 1, format: percent }),
					vignette
				];
			}

			case 'transparent':
				return [hint('O fundo fica vazio. Exporte em WebM para manter a transparência; o MP4 não tem canal alfa e sai com fundo preto.')];
		}

		return [];
	}

	// ── Visual layers ─────────────────────────────────────────────────────

	_layer(layer) {
		const set = (key, rebuild = false) => this._setTarget(key, (target, value) => (target[key] = value), rebuild);
		const nested = (group, key, rebuild = false) => this._setTarget(`${group}.${key}`, (target, value) => (target[group][key] = value), rebuild);
		const { duration } = this.store.project.settings;

		return [
			section('tag', 'Camada', textField('Nome', layer.name, set('name'))),
			section(
				'clock',
				'Tempo',
				row(
					numberField('Aparece em', layer.start, this._setTarget('start', (t, v) => (t.start = Math.min(v, t.end - MIN_DURATION))), {
						min: 0,
						max: duration,
						step: 0.1,
						unit: 's'
					}),
					numberField('Some em', layer.end, this._setTarget('end', (t, v) => (t.end = Math.max(v, t.start + MIN_DURATION))), {
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
				'Transformação',
				row(numberField('X', layer.x, set('x'), { step: 1, unit: 'px', precision: 0 }), numberField('Y', layer.y, set('y'), { step: 1, unit: 'px', precision: 0 })),
				row(
					numberField('Rotação', layer.rotation, set('rotation'), { min: -360, max: 360, step: 1, unit: '°', precision: 1 }),
					h(
						'div',
						{ class: 'field' },
						h('span', { class: 'field-label' }, 'Centralizar'),
						h(
							'button',
							{ class: 'btn', onClick: () => this.commands.centerLayer(layer.id) },
							fa('crosshairs'),
							'No quadro'
						)
					)
				),
				rangeField('Opacidade', layer.opacity, set('opacity'), { max: 1, format: percent })
			),
			section(
				'sun',
				'Sombra / brilho',
				row(
					colorField('Cor', layer.shadow.color, nested('shadow', 'color')),
					rangeField('Intensidade', layer.shadow.blur, nested('shadow', 'blur'), { min: 0, max: 120, step: 1, format: v => `${v}px` })
				),
				hint('Sombra preta para destacar do fundo; use a cor do próprio elemento para um brilho.')
			),
			this._animation('right-to-bracket', 'Entrada', layer.animIn, 'animIn'),
			this._animation('right-from-bracket', 'Saída', layer.animOut, 'animOut'),
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
					'Ícone',
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
						h('span', { class: 'meta' }, h('strong', null, iconLabel(layer.icon.name)), h('span', null, `${layer.icon.name} · clique para trocar`))
					),
					h('div', { style: { height: '8px' } }),
					styleOptions.length > 1
						? selectField('Estilo', layer.icon.style, styleOptions, this._setTarget('icon.style', (t, v) => (t.icon = { ...t.icon, style: v }), true))
						: null,
					row(numberField('Tamanho', layer.size, set('size'), { min: 1, max: 4000, step: 1, unit: 'px', precision: 0 }), colorField('Cor', layer.color, set('color')))
				);
			}

			case 'text': {
				const fonts = h('datalist', { id: 'font-list' }, FONT_OPTIONS.map(([value]) => h('option', { value })));
				const fontField = textField('Fonte', layer.font, set('font'), { placeholder: 'Qualquer fonte instalada' });
				fontField.querySelector('input').setAttribute('list', 'font-list');

				return section(
					'font',
					'Texto',
					textareaField('Conteúdo', layer.text, set('text')),
					fonts,
					fontField,
					row(
						numberField('Tamanho', layer.size, set('size'), { min: 1, max: 2000, step: 1, unit: 'px', precision: 0 }),
						selectField('Peso', layer.weight, WEIGHTS, this._setTarget('weight', (t, v) => (t.weight = Number(v))))
					),
					row(selectField('Alinhamento', layer.align, ALIGNS, set('align')), numberField('Espaçamento', layer.letterSpacing, set('letterSpacing'), { min: -50, max: 200, step: 1, unit: 'px', precision: 0 })),
					colorField('Cor', layer.color, set('color'))
				);
			}

			case 'image': {
				const error = this.assets.imageError(layer.path);

				return section(
					'image',
					'Imagem',
					this._fileChoice(layer.path, 'Trocar imagem', async () => {
						const path = await window.mecha.pickAsset('image');
						if (path) {
							this._setTarget('path', t => (t.path = path), true)();
						}
					}),
					error ? hint(`Não foi possível abrir a imagem: ${error}`, true) : null,
					numberField('Largura', layer.width, set('width'), { min: 1, max: 8000, step: 1, unit: 'px', precision: 0 })
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
			selectField('Animação', anim.type, ANIMATIONS, setAnim('type', true)),
			anim.type === 'none'
				? null
				: row(
						numberField('Duração', anim.duration, setAnim('duration'), { min: 0, max: 30, step: 0.1, unit: 's' }),
						selectField('Curva', anim.easing, EASING_OPTIONS, setAnim('easing'))
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
				numberField('Velocidade', motion.speed, setMotion('speed'), { min: -10, max: 10, step: 0.05, unit: 'volta/s' }),
				hint('Valores negativos giram no sentido anti-horário.')
			);
		} else if (motion.type !== 'none') {
			fields.push(
				row(
					numberField('Frequência', motion.speed, setMotion('speed'), { min: 0, max: 10, step: 0.05, unit: 'Hz' }),
					rangeField('Intensidade', motion.amount, setMotion('amount'), { max: 1, format: percent })
				)
			);
		}

		return section('arrows-spin', 'Movimento contínuo', selectField('Tipo', motion.type, MOTIONS, setMotion('type', true)), ...fields);
	}

	// ── Audio clips ───────────────────────────────────────────────────────

	_audio(clip) {
		const set = key => this._setTarget(key, (target, value) => (target[key] = value));
		const { duration } = this.store.project.settings;
		const available = Math.max(MIN_DURATION, clip.sourceDuration - clip.trimStart);

		return [
			section(
				'music',
				'Arquivo',
				textField('Nome', clip.name, set('name')),
				this._fileChoice(clip.path, 'Trocar arquivo', () => this.commands.replaceAudio(clip.id)),
				hint(`O arquivo tem ${formatTime(clip.sourceDuration)} de duração.`)
			),
			section(
				'clock',
				'Tempo',
				row(
					numberField('Começa em', clip.start, set('start'), { min: 0, max: duration, step: 0.1, unit: 's' }),
					numberField('Duração', clip.length, set('length'), { min: MIN_DURATION, max: available, step: 0.1, unit: 's' })
				),
				numberField(
					'Pular do início do arquivo',
					clip.trimStart,
					this._setTarget('trimStart', (t, v) => {
						t.trimStart = Math.min(v, t.sourceDuration - MIN_DURATION);
						t.length = Math.min(t.length, t.sourceDuration - t.trimStart);
					}),
					{ min: 0, max: clip.sourceDuration, step: 0.1, unit: 's' }
				)
			),
			section(
				'volume-high',
				'Volume e fades',
				rangeField('Volume', clip.volume, set('volume'), { min: 0, max: 1.5, step: 0.01, format: percent }),
				row(
					numberField('Fade in', clip.fadeIn, set('fadeIn'), { min: 0, max: clip.length, step: 0.1, unit: 's' }),
					numberField('Fade out', clip.fadeOut, set('fadeOut'), { min: 0, max: clip.length, step: 0.1, unit: 's' })
				),
				checkField('Silenciado', clip.muted, this._setTarget('muted', (t, v) => (t.muted = v), true)),
				hint('Os fades também podem ser arrastados pelas bolinhas no topo do clipe, na linha do tempo.')
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
				h('span', { class: 'path', title: path || '' }, path ? `‎${path}` : 'Nenhum arquivo'),
				h('button', { class: 'btn', title: label, onClick: onPick }, fa('folder-open'))
			)
		);
	}
}
