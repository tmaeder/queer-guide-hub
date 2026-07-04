import { describe, it, expect } from 'vitest';
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { weatherKind, weatherIconFor, weatherLabelKeyFor, roundCoord } from '../openMeteo';

describe('weatherKind (WMO code mapping)', () => {
  it.each([
    [0, 'clear'],
    [1, 'partly'],
    [2, 'partly'],
    [3, 'overcast'],
    [45, 'fog'],
    [48, 'fog'],
    [51, 'drizzle'],
    [57, 'drizzle'],
    [61, 'rain'],
    [67, 'rain'],
    [80, 'rain'],
    [82, 'rain'],
    [71, 'snow'],
    [77, 'snow'],
    [85, 'snow'],
    [86, 'snow'],
    [95, 'thunder'],
    [99, 'thunder'],
  ] as const)('maps code %i to %s', (code, kind) => {
    expect(weatherKind(code)).toBe(kind);
  });

  it('falls back to partly for unknown codes', () => {
    expect(weatherKind(42)).toBe('partly');
  });
});

describe('weatherIconFor', () => {
  it.each([
    [0, Sun],
    [2, CloudSun],
    [3, Cloud],
    [45, CloudFog],
    [55, CloudDrizzle],
    [63, CloudRain],
    [73, CloudSnow],
    [96, CloudLightning],
  ] as const)('code %i renders correct lucide icon', (code, icon) => {
    expect(weatherIconFor(code)).toBe(icon);
  });
});

describe('weatherLabelKeyFor', () => {
  it('returns an i18n key with default label', () => {
    expect(weatherLabelKeyFor(0)).toEqual({
      key: 'trips.weather.clear',
      defaultLabel: 'Clear',
    });
  });
});

describe('roundCoord', () => {
  it('rounds to a ~1km grid', () => {
    expect(roundCoord(52.52437)).toBe(52.52);
    expect(roundCoord(-13.163)).toBe(-13.16);
  });
});
