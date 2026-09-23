/**
 * ui/language.js
 *
 * Interface language picker. Each language is listed in its own name, so it can
 * be found by someone who cannot read the current one.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { h, fa } from './dom.js';
import { openModal } from './modal.js';
import { LOCALES, locale, t } from '../i18n/index.js';

/** @param {(code: string) => void} changeLocale */
export function openLanguageDialog(changeLocale) {
	const modal = openModal({
		icon: 'language',
		title: t('language.title'),
		body: h(
			'div',
			{ class: 'page language-list' },
			LOCALES.map(([code, name]) =>
				h(
					'button',
					{
						class: `language-option${code === locale() ? ' active' : ''}`,
						onClick: () => {
							modal.close();
							if (code !== locale()) {
								changeLocale(code);
							}
						}
					},
					h('span', null, name),
					code === locale() ? fa('check') : null
				)
			)
		)
	});
}
