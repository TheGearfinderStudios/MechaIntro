/**
 * core/easing.js
 *
 * Easing curves, t in [0, 1] -> progress. Some overshoot 1 on purpose (back,
 * elastic); whoever consumes them clamps what cannot go past it, like opacity.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

function bounceOut(t) {
	const n = 7.5625;
	const d = 2.75;

	if (t < 1 / d) {
		return n * t * t;
	}
	if (t < 2 / d) {
		return n * (t -= 1.5 / d) * t + 0.75;
	}
	if (t < 2.5 / d) {
		return n * (t -= 2.25 / d) * t + 0.9375;
	}
	return n * (t -= 2.625 / d) * t + 0.984375;
}

export const EASINGS = {
	linear: t => t,
	'ease-in': t => t * t * t,
	'ease-out': t => 1 - (1 - t) ** 3,
	'ease-in-out': t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
	'back-out': t => {
		const c1 = 1.70158;
		return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
	},
	'back-in': t => {
		const c1 = 1.70158;
		return (c1 + 1) * t * t * t - c1 * t * t;
	},
	'elastic-out': t => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1),
	'bounce-out': bounceOut
};

export const EASING_OPTIONS = [
	['linear', 'Linear'],
	['ease-in', 'Acelerar'],
	['ease-out', 'Desacelerar'],
	['ease-in-out', 'Suave'],
	['back-out', 'Recuo (saída)'],
	['back-in', 'Recuo (entrada)'],
	['elastic-out', 'Elástico'],
	['bounce-out', 'Quicar']
];

export function ease(name, t) {
	const fn = EASINGS[name] || EASINGS.linear;
	return fn(Math.min(1, Math.max(0, t)));
}
