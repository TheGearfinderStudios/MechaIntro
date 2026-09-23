/**
 * ui/modal.js
 *
 * Dialog shell and toasts. A modal is a panel over a dimmed backdrop; Escape and a
 * click outside dismiss it unless it says otherwise (the exporter, mid-render).
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa, panelTitle } from './dom.js';

const modalRoot = () => document.getElementById('modal-root');

/**
 * @returns {{ element: HTMLElement, close: () => void }}
 */
export function openModal({ icon, title, body, footer = [], wide = false, dismissible = () => true, onClose = () => {} }) {
	let closed = false;

	const close = () => {
		if (closed) {
			return;
		}
		closed = true;
		window.removeEventListener('keydown', onKey, true);
		backdrop.remove();
		onClose();
	};

	const tryDismiss = () => {
		if (dismissible()) {
			close();
		}
	};

	const onKey = event => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			tryDismiss();
		}
	};

	const closeButton = h('button', { class: 'row-btn', title: 'Fechar', style: { color: 'var(--brass-dim)' }, onClick: tryDismiss }, fa('xmark'));

	const element = h(
		'div',
		{ class: `panel modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
		panelTitle(icon, title, closeButton),
		body,
		footer.length ? h('div', { class: 'modal-footer' }, ...footer) : null
	);

	const backdrop = h(
		'div',
		{
			class: 'modal-backdrop',
			onPointerDown: event => {
				if (event.target === backdrop) {
					tryDismiss();
				}
			}
		},
		element
	);

	window.addEventListener('keydown', onKey, true);
	modalRoot().append(backdrop);

	return { element, close };
}

/** Ask a yes/no question. Resolves true when the confirm button is used. */
export function confirmDialog({ title, message, confirm = 'Confirmar', cancel = 'Cancelar', danger = false, icon = 'circle-question' }) {
	return new Promise(resolve => {
		let answer = false;

		const modal = openModal({
			icon,
			title,
			body: h('div', { class: 'page' }, h('p', { class: 'modal-message' }, message)),
			footer: [
				h('button', { class: 'btn', onClick: () => modal.close() }, cancel),
				h(
					'button',
					{
						class: `btn ${danger ? 'danger' : 'primary'}`,
						onClick: () => {
							answer = true;
							modal.close();
						}
					},
					confirm
				)
			],
			onClose: () => resolve(answer)
		});

		modal.element.querySelector('.modal-footer .btn:last-child').focus();
	});
}

export function toast(message, kind = 'info', timeout = 3200) {
	const icon = { info: 'circle-info', success: 'circle-check', error: 'triangle-exclamation' }[kind] || 'circle-info';
	const element = h('div', { class: `toast ${kind}` }, fa(icon), h('span', null, message));

	document.getElementById('toast-root').append(element);
	setTimeout(() => {
		element.classList.add('leaving');
		setTimeout(() => element.remove(), 300);
	}, timeout);
}
