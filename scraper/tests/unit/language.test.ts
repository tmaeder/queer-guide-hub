import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../src/utils/language.js';

describe('detectLanguage', () => {
  it('returns null for text that is too short', () => {
    expect(detectLanguage('Berlin')).toBeNull();
    expect(detectLanguage('')).toBeNull();
    expect(detectLanguage(null)).toBeNull();
  });

  it('detects English on a stopword-rich sample', () => {
    const text = 'The Eagle is a popular gay bar in London with a friendly crowd and great music for the weekend crowd.';
    expect(detectLanguage(text)).toBe('en');
  });

  it('detects German', () => {
    const text = 'Der Berghain ist ein bekannter Technoclub in Berlin, der für seine anspruchsvolle Türpolitik und exzellente Musik berühmt ist.';
    expect(detectLanguage(text)).toBe('de');
  });

  it('detects French', () => {
    const text = 'Le Marais est le quartier gay de Paris, connu pour ses bars sympathiques et son ambiance accueillante pour toutes les communautés.';
    expect(detectLanguage(text)).toBe('fr');
  });

  it('detects Spanish', () => {
    const text = 'Chueca es el barrio gay de Madrid, conocido por sus bares animados y por ser un lugar muy acogedor para todas las personas del colectivo.';
    expect(detectLanguage(text)).toBe('es');
  });

  it('returns null when scores are ambiguous', () => {
    // Random ASCII characters with no stopwords → density below threshold.
    const text = 'aaaaaa bbbbbb cccccc dddddd eeeeee ffffff gggggg hhhhhh iiiiii jjjjjj kkkkkk llllll';
    expect(detectLanguage(text)).toBeNull();
  });
});
