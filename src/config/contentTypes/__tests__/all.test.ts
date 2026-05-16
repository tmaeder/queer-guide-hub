import { describe, it, expect } from 'vitest';
import { cityContentType, cityFields } from '../city';
import { countryContentType, countryFields } from '../country';
import { eventContentType, eventFields } from '../event';
import { feedbackContentType } from '../feedback';
import { communityGroupsContentType, groupFields } from '../group';
import { hotelContentType, hotelFields } from '../hotel';
import { marketplaceContentType, marketplaceFields } from '../marketplace';
import { newsArticleContentType, newsArticleFields } from '../news';
import { cmsPagesContentType, pageFields } from '../page';
import { personalityContentType, personalityFields } from '../personality';
import { unifiedTagsContentType, tagFields } from '../tag';
import { venueContentType, venueFields } from '../venue';
import { queerVillageFields } from '../village';
import {
  contentTypeRegistry,
  getContentTypeIds,
  getContentType,
  getFieldsByGroup,
  getFieldGroups,
  fieldGroupLabels,
} from '../index';

describe('contentType modules', () => {
  it.each([
    ['city', cityContentType, cityFields],
    ['country', countryContentType, countryFields],
    ['event', eventContentType, eventFields],
    ['group', communityGroupsContentType, groupFields],
    ['hotel', hotelContentType, hotelFields],
    ['marketplace', marketplaceContentType, marketplaceFields],
    ['news', newsArticleContentType, newsArticleFields],
    ['page', cmsPagesContentType, pageFields],
    ['personality', personalityContentType, personalityFields],
    ['tag', unifiedTagsContentType, tagFields],
    ['venue', venueContentType, venueFields],
  ])('%s has id and non-empty fields', (_, ct, fields) => {
    expect(ct.id).toBeTruthy();
    expect(Array.isArray(fields)).toBe(true);
    expect(fields.length).toBeGreaterThan(0);
  });

  it('feedback has id', () => {
    expect(feedbackContentType.id).toBeTruthy();
  });

  it('village fields exported', () => {
    expect(Array.isArray(queerVillageFields)).toBe(true);
  });
});

describe('contentTypes index', () => {
  it('registry has known types', () => {
    expect(Object.keys(contentTypeRegistry).length).toBeGreaterThan(0);
  });
  it('getContentTypeIds returns ids', () => {
    const ids = getContentTypeIds();
    expect(ids.length).toBeGreaterThan(0);
  });
  it('getContentType returns known and undefined for unknown', () => {
    const ids = getContentTypeIds();
    expect(getContentType(ids[0])).toBeDefined();
    expect(getContentType('does-not-exist')).toBeUndefined();
  });
  it('getFieldsByGroup and getFieldGroups return arrays', () => {
    const ids = getContentTypeIds();
    expect(Array.isArray(getFieldsByGroup(ids[0]))).toBe(true);
    expect(Array.isArray(getFieldGroups(ids[0]))).toBe(true);
  });
  it('fieldGroupLabels is an object', () => {
    expect(typeof fieldGroupLabels).toBe('object');
  });
});
