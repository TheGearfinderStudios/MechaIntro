/**
 * ui/form.js
 *
 * Field builders for the inspector and dialogs. Each takes its current value and
 * a callback, and reports every change as it happens (the store coalesces the
 * stream into one undo step).
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa } from './dom.js';

export function section(icon, title, ...children) {
	return h('div', { class: 'section' }, h('div', { class: 'section-title' }, fa(icon), title), ...children);
}

export function row(...fields) {
	return h('div', { class: `field-row${fields.length === 3 ? ' three' : ''}` }, ...fields);
}

function field(label, control, value = null) {
	return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label, value), control);
}

export function numberField(label, value, onChange, { min, max, step = 1, unit = '', precision = 2, commitOnly = false } = {}) {
	const read = () => {
		const parsed = parseFloat(input.value);
		return Number.isFinite(parsed) ? clamp(parsed, min, max) : null;
	};

	const input = h('input', {
		type: 'number',
		value: round(value, precision),
		min,
		max,
		step,
		onInput: () => {
			const parsed = read();
			if (parsed !== null && !commitOnly) {
				onChange(parsed);
			}
		},
		onChange: () => {
			const parsed = read();
			if (parsed !== null && commitOnly) {
				onChange(parsed);
			}
			// On commit, show the value that was actually kept.
			input.value = round(parsed ?? value, precision);
		}
	});

	return field(label, h('div', { class: 'number-wrap' }, input, unit ? h('span', { class: 'unit' }, unit) : null));
}

export function rangeField(label, value, onChange, { min = 0, max = 1, step = 0.01, format = v => v } = {}) {
	const readout = h('span', { class: 'value' }, format(value));
	const input = h('input', {
		type: 'range',
		min,
		max,
		step,
		value,
		onInput: () => {
			const parsed = parseFloat(input.value);
			readout.textContent = format(parsed);
			onChange(parsed);
		}
	});

	return field(label, input, readout);
}

export function colorField(label, value, onChange) {
	const text = h('input', {
		type: 'text',
		value,
		maxLength: 7,
		spellcheck: false,
		onInput: () => {
			if (/^#[0-9a-f]{6}$/i.test(text.value)) {
				picker.value = text.value;
				onChange(text.value.toLowerCase());
			}
		}
	});
	const picker = h('input', {
		type: 'color',
		value,
		onInput: () => {
			text.value = picker.value;
			onChange(picker.value);
		}
	});

	return field(label, h('div', { class: 'color-wrap' }, picker, text));
}

export function selectField(label, value, options, onChange) {
	const select = h(
		'select',
		{ onChange: () => onChange(select.value) },
		options.map(([optionValue, optionLabel]) => h('option', { value: optionValue, selected: String(optionValue) === String(value) }, optionLabel))
	);

	return field(label, select);
}

export function textField(label, value, onChange, { placeholder = '' } = {}) {
	const input = h('input', { type: 'text', value: value ?? '', placeholder, spellcheck: false, onInput: () => onChange(input.value) });
	return field(label, input);
}

export function textareaField(label, value, onChange) {
	const input = h('textarea', { value: value ?? '', rows: 3, spellcheck: false, onInput: () => onChange(input.value) });
	return field(label, input);
}

export function checkField(label, checked, onChange) {
	const input = h('input', { type: 'checkbox', checked, onChange: () => onChange(input.checked) });
	return h('label', { class: 'check' }, input, label);
}

export function hint(text, error = false) {
	return h('p', { class: `hint${error ? ' error' : ''}` }, text);
}

function clamp(value, min, max) {
	if (min != null && value < min) {
		return Number(min);
	}
	if (max != null && value > max) {
		return Number(max);
	}
	return value;
}

function round(value, precision) {
	const factor = 10 ** precision;
	return Math.round((Number(value) || 0) * factor) / factor;
}
