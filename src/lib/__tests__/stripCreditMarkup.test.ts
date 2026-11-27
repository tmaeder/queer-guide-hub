import { describe, expect, it } from 'vitest';
import {
  commonsFileUrl,
  formatImageCredit,
  splitImageCredit,
  stripCreditMarkup,
} from '@/lib/imageCredit';

// Real stored milestones.image_metadata.photographer values (prod, 2026-11-27).
describe('Commons author residue and notices', () => {
  it('reduces bdi/span residue to the name', () => {
    expect(
      stripCreditMarkup(
        'bdia href="https://www.wikidata.org/wiki/Q104713920" class="extiw" title="d:Q104713920"span title="photographer"Elvert Barnes/span/a/bdi',
      ),
    ).toBe('Elvert Barnes');
    expect(
      stripCreditMarkup(
        'a rel="nofollow" class="external text" href="https://www.flickr.com/people/56619626@N05"InSapphoWeTrust/a from Los Angeles, California, USA',
      ),
    ).toBe('InSapphoWeTrust from Los Angeles, California, USA');
  });

  it('splits a first-person licensing notice into a name plus the notice', () => {
    const notice =
      'This image is a work by Wikipedia and Wikimedia Commons user C.Suthorn. When reusing, credit me as described in the Licensing information below.  I would appreciate being notified if you use my work outside Wikimedia.\nDo not copy this image illegally by ignoring the terms of the license below.';
    expect(splitImageCredit(notice)).toEqual({ author: 'C.Suthorn', notice });
  });

  it('keeps a short credit whole', () => {
    expect(splitImageCredit('Jane Doe')).toEqual({ author: 'Jane Doe', notice: null });
    expect(splitImageCredit(null)).toEqual({ author: null, notice: null });
  });

  it('builds the Commons file URL from stored ids', () => {
    expect(
      commonsFileUrl({
        source_id: 'File:Erste_gleichgeschlechtliche_Eheschließung_am_1._Oktober_2017_31.jpg',
      }),
    ).toBe(
      'https://commons.wikimedia.org/wiki/File:Erste_gleichgeschlechtliche_Eheschlie%C3%9Fung_am_1._Oktober_2017_31.jpg',
    );
    expect(
      commonsFileUrl({ photographer_url: 'https://commons.wikimedia.org/wiki/File:A.jpg' }),
    ).toBe('https://commons.wikimedia.org/wiki/File:A.jpg');
    expect(commonsFileUrl({ photographer_url: '', source_id: 'unsplash:123' })).toBeNull();
  });
});

describe('stripCreditMarkup', () => {
  it('reduces Commons artist HTML to the name', () => {
    expect(
      stripCreditMarkup('<a href="//commons.wikimedia.org/wiki/User:X" title="User:X">Lucas</a>'),
    ).toBe('Lucas');
  });
  it('reduces bracket-stripped markup to the name', () => {
    expect(
      formatImageCredit({
        attribution:
          'a href="//commons.wikimedia.org/wiki/User:Lucas_Werkmeister" title="User:Lucas Werkmeister"Lucas Werkmeister/a',
        license: 'CC BY 4.0',
      }),
    ).toBe('Lucas Werkmeister · CC BY 4.0');
  });
  it('leaves plain names alone', () => {
    expect(stripCreditMarkup('Jane Doe')).toBe('Jane Doe');
  });
});
