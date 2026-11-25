const paths = {
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eraser: '<path d="M4 15.5l8.5-8.5a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8L12 20.5H8.5z"/><path d="M9 10.5l5.5 5.5"/><path d="M13 20.5h7"/>',
  bucket: '<path d="M5 11.5l6.5-6.5 7 7-6.5 6.5a1.5 1.5 0 0 1-2 0l-5-5a1.5 1.5 0 0 1 0-2z"/><path d="M5 12h13.5"/><path d="M20.5 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z" fill="currentColor"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  send: '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pencil: '<path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z"/><path d="M14 6.5l3.5 3.5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function pencilSvg(color: string): string {
  return `<svg viewBox="0 0 44 96" width="44" height="96" aria-hidden="true"><path d="M10 22 L22 3 L34 22 Z" fill="#efd3a6"/><path d="M18.2 9 L22 3 L25.8 9 Z" fill="${color}"/><rect x="10" y="22" width="24" height="74" rx="1" fill="${color}"/><rect x="10" y="22" width="7" height="74" fill="rgba(255,255,255,.3)"/><rect x="27" y="22" width="7" height="74" fill="rgba(0,0,0,.15)"/></svg>`;
}
