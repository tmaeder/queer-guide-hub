import { cn } from '@/lib/utils';
import { Roster, type RosterPerson } from './Roster';

/**
 * Module 11 — "Riders and moderators who checked this. Names, not stars. No
 * five-point scale." Required on Venues, Countries, Personalities, Milestones,
 * News and Tags.
 *
 * The spec is unambiguous and the venue single says it in prose too: "Vouches
 * are names, not stars. Nobody is scored out of five, and no venue is ranked
 * above another." So this module takes people and nothing else — there is no
 * score prop, no aggregate, and no sort. Attaching a rating later would mean
 * changing this signature, which is the point: the type system should make the
 * wrong thing awkward.
 *
 * NOTE: there is no vouch data in the product today. Per the spec's rule 2
 * ("a module with no data does not render") this renders null until a source
 * exists — it is wiring ahead of a pipeline, not a live feature.
 */
export function Vouches({
  people,
  caption,
  className,
}: {
  people: RosterPerson[];
  caption?: string;
  className?: string;
}) {
  if (people.length === 0) return null;
  return (
    <div className={className}>
      <Roster people={people} />
      {caption && (
        <p className={cn('mt-4 max-w-xl text-13 leading-relaxed text-muted-foreground')}>
          {caption}
        </p>
      )}
    </div>
  );
}
