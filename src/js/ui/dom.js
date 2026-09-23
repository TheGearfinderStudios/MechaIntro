/**
 * ui/dom.js
 *
 * A tiny element builder, so views read as the markup they produce.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

/**
 * h('button', { class: 'btn', onClick }, fa('play'), 'Play')
 * Props: `class`, `style` (object), `dataset`, `on<Event>` listeners, and anything
 * else as a DOM property when the element has one, an attribute otherwise.
 */
export function h(tag, props, ...children) {
	const el = tag.includes(':') || tag === 'svg' ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);

	for (const [key, value] of Object.entries(props || {})) {
		if (value == null || value === false) {
			continue;
		}

		if (key === 'class') {
			el.setAttribute('class', value);
		} else if (key === 'style' && typeof value === 'object') {
			Object.assign(el.style, value);
		} else if (key === 'dataset') {
			Object.assign(el.dataset, value);
		} else if (key.startsWith('on') && typeof value === 'function') {
			el.addEventListener(key.slice(2).toLowerCase(), value);
		} else if (key in el && !(el instanceof SVGElement)) {
			el[key] = value;
		} else {
			el.setAttribute(key, value === true ? '' : value);
		}
	}

	append(el, children);
	return el;
}

function append(el, children) {
	for (const child of children) {
		if (child == null || child === false) {
			continue;
		}
		if (Array.isArray(child)) {
			append(el, child);
		} else {
			el.append(child instanceof Node ? child : document.createTextNode(String(child)));
		}
	}
}

/** SVG child elements need the SVG namespace. */
export function svg(tag, attrs = {}) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);

	for (const [key, value] of Object.entries(attrs)) {
		el.setAttribute(key, value);
	}
	return el;
}

/** A Font Awesome glyph. */
export function fa(name, style = 'solid', extra = '') {
	return h('i', { class: `fa-${style} fa-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });
}

export function iconButton(icon, title, onClick, extra = {}) {
	return h('button', { class: 'icon-btn', title, 'aria-label': title, onClick, ...extra }, fa(icon));
}

/** A panel's glass titlebar, as the Inventory draws it. */
export function panelTitle(icon, text, ...extra) {
	return h('div', { class: 'panel-titlebar' }, fa(icon, 'solid', 'titlebar-icon'), h('span', { class: 'text' }, text), ...extra);
}

/** Is the user typing somewhere, so single-key shortcuts must stay out of the way? */
export function isEditingText(target = document.activeElement) {
	if (!target) {
		return false;
	}

	const tag = target.tagName;
	if (tag === 'TEXTAREA' || target.isContentEditable) {
		return true;
	}
	if (tag === 'INPUT') {
		return !['checkbox', 'radio', 'range', 'color', 'button'].includes(target.type);
	}
	return tag === 'SELECT';
}

/**
 * Follow a pointer drag with listeners on the window, so the drag survives the
 * element under it being re-rendered mid-gesture.
 */
export function dragGesture(event, { onMove, onEnd }) {
	const startX = event.clientX;
	const startY = event.clientY;

	const move = e => onMove?.(e, e.clientX - startX, e.clientY - startY);
	const up = e => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', up);
		onEnd?.(e, e.clientX - startX, e.clientY - startY);
	};

	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', up);
	window.addEventListener('pointercancel', up);
}
