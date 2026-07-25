import { describe, expect, it } from 'vitest';
import {
  validateColorValue,
  validateGlobalToken,
  validateMetaField,
  validateManifestField,
  validateEmailField,
  validateFontSlot,
  collectDraftErrors,
} from '../valueValidation';

describe('validateColorValue', () => {
  it('accepts HSL channel triples', () => {
    expect(validateColorValue('0 0% 96%')).toBeNull();
    expect(validateColorValue('210 40.5% 12.1%')).toBeNull();
  });
  it('rejects other formats', () => {
    expect(validateColorValue('#ffffff')).not.toBeNull();
    expect(validateColorValue('0,0%,96%')).not.toBeNull();
    expect(validateColorValue('0 0% 96%;}body{')).not.toBeNull();
  });
});

describe('validateGlobalToken', () => {
  it('sizes need rem/px', () => {
    expect(validateGlobalToken('radius-element', '0.5rem')).toBeNull();
    expect(validateGlobalToken('radius-element', '8px')).toBeNull();
    expect(validateGlobalToken('radius-element', '50vw')).not.toBeNull();
    expect(validateGlobalToken('text-title', '1.5em')).not.toBeNull();
  });
  it('line-heights are unitless or rem', () => {
    expect(validateGlobalToken('text-title--line-height', '1.4')).toBeNull();
    expect(validateGlobalToken('text-title--line-height', '1.4rem')).toBeNull();
    expect(validateGlobalToken('text-title--line-height', '1.4px')).not.toBeNull();
  });
  it('tracking is em; transition is a safe charset', () => {
    expect(validateGlobalToken('tracking-label', '0.04em')).toBeNull();
    expect(validateGlobalToken('tracking-label', '0.04')).not.toBeNull();
    expect(validateGlobalToken('transition-smooth', 'all 0.18s cubic-bezier(0.22, 1, 0.36, 1)')).toBeNull();
    expect(validateGlobalToken('transition-smooth', 'all 1s url(javascript:x)')).not.toBeNull();
  });
});

describe('meta / manifest / email', () => {
  it('twitter handle + urls + hex', () => {
    expect(validateMetaField('twitter_handle', '@queerguide')).toBeNull();
    expect(validateMetaField('twitter_handle', 'queerguide')).not.toBeNull();
    expect(validateMetaField('og_image_url', 'https://x/y.png')).toBeNull();
    expect(validateMetaField('og_image_url', 'http://x/y.png')).not.toBeNull();
    expect(validateMetaField('theme_color_dark', '#0a0a0a')).toBeNull();
    expect(validateMetaField('theme_color_dark', '#0a0')).not.toBeNull();
  });
  it('org_sameas requires https', () => {
    expect(validateMetaField('org_sameas', ['https://a.co'])).toBeNull();
    expect(validateMetaField('org_sameas', ['javascript:alert(1)'])).not.toBeNull();
  });
  it('manifest names + colors', () => {
    expect(validateManifestField('name', 'Queer Guide')).toBeNull();
    expect(validateManifestField('name', '')).not.toBeNull();
    expect(validateManifestField('theme_color', '#0a0a0a')).toBeNull();
  });
  it('email from + logo + wrapper', () => {
    expect(validateEmailField('from_name', 'The Queer Guide')).toBeNull();
    expect(validateEmailField('from_name', 'Evil <x@y.com>')).not.toBeNull();
    expect(validateEmailField('from_address', 'noreply@queer.guide')).toBeNull();
    expect(validateEmailField('from_address', 'nope')).not.toBeNull();
    expect(validateEmailField('logo_url', 'https://x/l.png')).toBeNull();
    expect(validateEmailField('logo_url', '/l.png')).not.toBeNull();
  });
});

describe('validateFontSlot', () => {
  const good = 'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/brand/fonts/x.woff2';
  it('accepts a valid slot', () => {
    expect(validateFontSlot({ family: 'Clash Display', files: [{ url: good, weight: '400' }] })).toBeNull();
    expect(validateFontSlot({ family: 'X', files: [{ url: '/fonts/x.woff2', weight: '100 900' }] })).toBeNull();
  });
  it('rejects bad family / files / url / weight', () => {
    expect(validateFontSlot({ family: 'bad;family', files: [{ url: good, weight: '400' }] })).not.toBeNull();
    expect(validateFontSlot({ family: 'X', files: [] })).not.toBeNull();
    expect(validateFontSlot({ family: 'X', files: [{ url: 'https://evil.example/x.woff2', weight: '400' }] })).not.toBeNull();
    expect(validateFontSlot({ family: 'X', files: [{ url: good, weight: '450' }] })).not.toBeNull();
  });
});

describe('collectDraftErrors', () => {
  it('keys errors by dot-path and is empty for a clean doc', () => {
    expect(collectDraftErrors({})).toEqual({});
    const errs = collectDraftErrors({
      tokens: { light: { muted: 'bad' }, global: { 'radius-element': '9x' } },
      meta: { twitter_handle: 'nope' },
    });
    expect(errs['tokens.light.muted']).toBeTruthy();
    expect(errs['tokens.global.radius-element']).toBeTruthy();
    expect(errs['meta.twitter_handle']).toBeTruthy();
  });
});
