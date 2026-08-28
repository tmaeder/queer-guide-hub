/**
 * `EVENT_SELECT_FIELDS` is sent to PostgREST verbatim as the `select`
 * parameter, and a malformed embed there does not degrade one section -- it
 * 400s the whole event query, so `/events/:slug` renders no `<h1>` at all.
 *
 * That is exactly what happened when the programme work first shipped: the
 * parent was embedded as `events!events_parent_event_id_fkey`, which PostgREST
 * rejects (PGRST200) because it registers that self-referential FK as
 * one-to-many only. Eight `singles.spec.ts` specs timed out waiting for a
 * masthead that could never appear, and the fault was invisible to typecheck,
 * to lint and to every unit test -- it lives in a string.
 *
 * These are cheap string assertions on purpose. The behavioural proof is the
 * e2e suite; this is the guard that fails in milliseconds instead of at 30s
 * timeouts times three retries.
 */
import { describe, it, expect } from 'vitest';
import { EVENT_SELECT_FIELDS } from '../EventDetail.parts';

describe('EVENT_SELECT_FIELDS', () => {
  it('carries no comment syntax — the string is sent to PostgREST as-is', () => {
    // A `//` or `/* */` inside the template literal is not a comment, it is
    // query text. Easy to add while documenting the very trap below.
    expect(EVENT_SELECT_FIELDS).not.toMatch(/\/\//);
    expect(EVENT_SELECT_FIELDS).not.toMatch(/\/\*/);
  });

  it('embeds the parent through the FK column, never the constraint name', () => {
    // `parent:parent_event_id(...)` resolves to-one (the parent).
    expect(EVENT_SELECT_FIELDS).toMatch(/parent:parent_event_id\(/);

    // `!events_parent_event_id_fkey` 400s; `!parent_event_id` silently returns
    // the CHILDREN as an array, which would make `event.parent?.id` always
    // falsy and quietly drop the "Part of" backlink instead of erroring.
    expect(EVENT_SELECT_FIELDS).not.toMatch(/events!events_parent_event_id_fkey/);
    expect(EVENT_SELECT_FIELDS).not.toMatch(/parent:events!/);
  });

  it('names no other self-referential embed by constraint name', () => {
    // `events` has a second self-FK (`events_duplicate_of_id_fkey`) with the
    // same one-to-many-only registration, so the trap generalises.
    expect(EVENT_SELECT_FIELDS).not.toMatch(/events!events_\w+_fkey/);
  });
});
