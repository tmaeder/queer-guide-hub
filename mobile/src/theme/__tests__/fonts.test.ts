import { readFileSync } from 'node:fs';
import { FONT, fontStyle } from '../fonts';

it('display and headline use Anton, never faux-bolded', () => {
  expect(fontStyle('display')).toEqual({ fontFamily: FONT.display, fontWeight: 'normal', letterSpacing: 0 });
  expect(fontStyle('headline', '700').fontFamily).toBe(FONT.display);
});

it('weight picks a Space Grotesk family instead of asking the platform to synthesise one', () => {
  expect(fontStyle('body')).toEqual({ fontFamily: FONT.regular, fontWeight: 'normal' });
  expect(fontStyle('body', '700')).toEqual({ fontFamily: FONT.bold, fontWeight: 'normal' });
  expect(fontStyle('body', 'bold').fontFamily).toBe(FONT.bold);
  expect(fontStyle('title').fontFamily).toBe(FONT.bold);
  expect(fontStyle('title', '400').fontFamily).toBe(FONT.regular);
  expect(fontStyle('small', '500').fontFamily).toBe(FONT.regular);
});

it('matches the web pairing in src/index.css', () => {
  const css = readFileSync('../src/index.css', 'utf8');
  expect(css).toMatch(/--font-display:[^;]*Anton/);
  expect(css).toMatch(/Space Grotesk/);
});
