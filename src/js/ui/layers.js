/**
 * ui/layers.js
 *
 * The layer list: visual layers top to bottom in the order they are stacked
 * (top of the list draws last), then the audio clips. Drag a row to restack it.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa, panelTitle } from './dom.js';

export const TYPE_ICONS = { icon: 'icons', text: 'font', image: 'image', audio: 'music', background: 'fill-drip' };

export class LayersView {
	constructor(root, { store, commands }) {
		this.store = store;
		this.commands = commands;
		this.list = h('div', { class: 'page', 'data-scrollbar': 'css' });

		root.append(
			panelTitle('layer-group', 'Camadas'),
			h(
				'div',
				{ class: 'tool-header' },
				h('span', { class: 'label' }, 'Adicionar'),
				this._addButton('icons', 'Ícone', () => commands.addIcon()),
				this._addButton('font', 'Texto', () => commands.addText()),
				this._addButton('image', 'Imagem', () => commands.addImage()),
				this._addButton('music', 'Áudio', () => commands.addAudio())
			),
			this.list
		);

		store.on('project', () => this.render());
		store.on('selection', () => this.render());
		this.render();
	}

	_addButton(icon, title, onClick) {
		return h('button', { class: 'icon-btn', title: `Adicionar ${title.toLowerCase()}`, onClick }, fa(icon));
	}

	render() {
		const { project, selection } = this.store;
		const scroll = this.list.scrollTop;

		const background = h(
			'div',
			{
				class: `layer-row${selection.kind === 'background' ? ' selected' : ''}`,
				onClick: () => this.store.select('background')
			},
			h('span', { class: 'type-icon' }, fa(TYPE_ICONS.background)),
			h('span', { class: 'name' }, 'Projeto e fundo')
		);

		const visual = [...project.layers].reverse().map(layer => this._layerRow(layer, selection));
		const audio = project.audio.map(clip => this._audioRow(clip, selection));

		this.list.replaceChildren(
			h('div', { class: 'layer-group-label' }, 'Cena'),
			background,
			h('div', { class: 'layer-group-label' }, fa('eye'), 'Visual'),
			...(visual.length ? visual : [h('div', { class: 'layer-empty' }, 'Nenhuma camada ainda')]),
			h('div', { class: 'layer-group-label' }, fa('volume-high'), 'Áudio'),
			...(audio.length ? audio : [h('div', { class: 'layer-empty' }, 'Nenhum som ainda')])
		);

		this.list.scrollTop = scroll;
	}

	_layerRow(layer, selection) {
		const selected = selection.kind === 'layer' && selection.id === layer.id;
		const icon = layer.type === 'icon' ? fa(layer.icon?.name || 'icons', layer.icon?.style || 'solid') : fa(TYPE_ICONS[layer.type]);

		const row = h(
			'div',
			{
				class: `layer-row${selected ? ' selected' : ''}${layer.visible ? '' : ' off'}`,
				draggable: true,
				onClick: () => this.store.select('layer', layer.id),
				onDragstart: event => {
					event.dataTransfer.effectAllowed = 'move';
					event.dataTransfer.setData('application/x-mechaintro-layer', layer.id);
				},
				onDragover: event => {
					if (!event.dataTransfer.types.includes('application/x-mechaintro-layer')) {
						return;
					}
					event.preventDefault();
					const after = this._dropAfter(event, row);
					row.classList.toggle('drop-before', !after);
					row.classList.toggle('drop-after', after);
				},
				onDragleave: () => row.classList.remove('drop-before', 'drop-after'),
				onDrop: event => {
					event.preventDefault();
					row.classList.remove('drop-before', 'drop-after');
					const id = event.dataTransfer.getData('application/x-mechaintro-layer');
					if (id && id !== layer.id) {
						// The list is drawn top-down, the array bottom-up: "after" in the list
						// means below, which is an index lower in the stack.
						this.commands.restackLayer(id, layer.id, this._dropAfter(event, row) ? 'below' : 'above');
					}
				}
			},
			h('span', { class: 'type-icon' }, icon),
			layer.color && layer.type !== 'image' ? h('span', { class: 'swatch-dot', style: { background: layer.color } }) : null,
			h('span', { class: 'name', title: layer.name }, layer.name || '(sem nome)'),
			h(
				'button',
				{
					class: 'row-btn',
					title: layer.visible ? 'Ocultar' : 'Mostrar',
					onClick: event => {
						event.stopPropagation();
						this.commands.toggleVisible(layer.id);
					}
				},
				fa(layer.visible ? 'eye' : 'eye-slash')
			),
			h(
				'button',
				{
					class: 'row-btn danger',
					title: 'Excluir',
					onClick: event => {
						event.stopPropagation();
						this.commands.remove({ kind: 'layer', id: layer.id });
					}
				},
				fa('trash-can')
			)
		);

		return row;
	}

	_audioRow(clip, selection) {
		const selected = selection.kind === 'audio' && selection.id === clip.id;

		return h(
			'div',
			{
				class: `layer-row${selected ? ' selected' : ''}${clip.muted ? ' off' : ''}`,
				onClick: () => this.store.select('audio', clip.id)
			},
			h('span', { class: 'type-icon' }, fa('music')),
			h('span', { class: 'name', title: clip.path }, clip.name || '(sem nome)'),
			h(
				'button',
				{
					class: 'row-btn',
					title: clip.muted ? 'Ativar som' : 'Silenciar',
					onClick: event => {
						event.stopPropagation();
						this.commands.toggleMute(clip.id);
					}
				},
				fa(clip.muted ? 'volume-xmark' : 'volume-high')
			),
			h(
				'button',
				{
					class: 'row-btn danger',
					title: 'Excluir',
					onClick: event => {
						event.stopPropagation();
						this.commands.remove({ kind: 'audio', id: clip.id });
					}
				},
				fa('trash-can')
			)
		);
	}

	_dropAfter(event, row) {
		const rect = row.getBoundingClientRect();
		return event.clientY > rect.top + rect.height / 2;
	}
}
