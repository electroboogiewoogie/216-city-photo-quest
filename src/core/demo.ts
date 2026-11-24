import { newId, PACKAGE_FORMAT, PACKAGE_VERSION, type Quest } from './quest-editor';

// Демо-квест по вымышленному кварталу. «Фотографии» нарисованы для проекта в SVG: реальных снимков
// и чужих изображений в репозитории нет.

const svg = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420">${body}</svg>`)}`;

const PLAQUE = svg(`<rect width="640" height="420" fill="#b9c7d3"/><rect x="40" y="40" width="560" height="380" fill="#d9b48f"/>
<path d="M230 420V250a90 90 0 0 1 180 0v170z" fill="#5b4636"/><rect x="250" y="270" width="140" height="150" fill="#2f2620"/>
<g fill="#f3e7d7" stroke="#8b6b4d" stroke-width="4"><rect x="80" y="90" width="90" height="120"/><rect x="470" y="90" width="90" height="120"/></g>
<rect x="430" y="250" width="120" height="70" rx="6" fill="#e9e2d0" stroke="#6e5a44" stroke-width="5"/>
<text x="490" y="298" font-family="Georgia,serif" font-size="38" text-anchor="middle" fill="#3b2f25">1907</text>
<rect x="40" y="225" width="560" height="10" fill="#c49a70"/>`);

const VANE = svg(`<rect width="640" height="420" fill="#9fc4e6"/><circle cx="540" cy="80" r="40" fill="#fff4c2"/>
<path d="M0 420V300l160-90 160 90v120z" fill="#7a3b2e"/><path d="M320 420V280l170-100 150 100v140z" fill="#8c4a39"/>
<rect x="484" y="70" width="8" height="120" fill="#3a3a3a"/><path d="M450 120h76" stroke="#3a3a3a" stroke-width="5"/>
<path d="M470 62c10-18 30-22 40-10 8-12 20-14 26-4-8 2-12 8-12 14 10 4 18 14 14 26-14 6-30 6-44 0-12-6-20-14-24-26z" fill="#262626"/>
<path d="M508 40l6-14 6 12 6-10 2 14" fill="#262626"/><path d="M536 56l14 4-12 6" fill="#262626"/>`);

const SIGN = svg(`<rect width="640" height="420" fill="#cfd8dc"/><rect x="0" y="0" width="640" height="420" fill="#e2c9a6"/>
<g stroke="#bfa27c" stroke-width="3">${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${50 + i * 50}h640"/>`).join('')}</g>
<rect x="110" y="140" width="420" height="140" rx="10" fill="#1d4f91" stroke="#f2f2f2" stroke-width="8"/>
<text x="320" y="205" font-family="Arial,sans-serif" font-size="42" font-weight="700" text-anchor="middle" fill="#fff">ул. Ёлочная</text>
<text x="320" y="255" font-family="Arial,sans-serif" font-size="36" text-anchor="middle" fill="#fff">12</text>`);

export function demoQuest(): Quest {
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    id: newId(),
    title: 'Детали Старого квартала',
    intro: 'Короткая прогулка по вымышленному кварталу: три детали на фасадах и крышах.',
    updatedAt: Date.now(),
    tasks: [
      {
        id: newId(),
        photo: { name: 'tablichka.svg', dataUrl: PLAQUE, width: 640, height: 420, alt: 'Фасад с аркой и табличкой справа от неё' },
        question: 'Какой год указан на табличке справа от арки?',
        hint: 'Четыре цифры, начинается на 19.',
        answers: ['1907', '1907 год'],
      },
      {
        id: newId(),
        photo: { name: 'flyuger.svg', dataUrl: VANE, width: 640, height: 420, alt: 'Крыши домов и флюгер на шпиле' },
        question: 'Какая птица на флюгере?',
        hint: 'Она кричит по утрам.',
        answers: ['Петух', 'петушок'],
      },
      {
        id: newId(),
        photo: { name: 'ulitsa.svg', dataUrl: SIGN, width: 640, height: 420, alt: 'Синяя табличка с названием улицы и номером дома' },
        question: 'Как называется улица на табличке?',
        hint: 'Подойдёт и с «ул.», и без. Букву «ё» можно писать как «е».',
        answers: ['Ёлочная', 'улица Ёлочная', 'ул. Ёлочная'],
      },
    ],
  };
}
