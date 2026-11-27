import { describe, expect, it } from 'vitest';
import { nearestInTime } from '../MilestoneDetail.meta';

const m = (id: string, date: string) => ({ id, date });

describe('nearestInTime', () => {
  it('keeps the closest milestones, shown in chronological order', () => {
    const list = [
      m('1871', '1871-05-15'),
      m('1994', '1994-06-11'),
      m('2001', '2001-08-01'),
      m('2017', '2017-10-01'),
      m('2018', '2018-12-22'),
      m('1935', '1935-06-28'),
    ];
    expect(nearestInTime(list, m('2017', '2017-10-01'), 3).map((x) => x.id)).toEqual([
      '1994',
      '2001',
      '2018',
    ]);
  });

  it('ignores the current milestone and unparseable dates', () => {
    expect(nearestInTime([m('a', 'bad'), m('b', '2000-01-01')], m('b', '2000-01-01'), 5)).toEqual(
      [],
    );
  });
});
