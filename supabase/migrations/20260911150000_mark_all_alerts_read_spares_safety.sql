-- A bulk "mark all read" must not clear a distress signal.
--
-- Design contract ("Header and Footer.dc.html", panel 05, "The safety notice
-- never mixes"): safety pins above the read/unread list and "cannot be marked
-- read". In this product the safety-class notification is `sos` — a distress
-- signal raised by another rider, not the mock's standing venue advisory. One
-- tap on "Mark all read" while glancing at the bell silently cleared it, and
-- because the row is indistinguishable from a group invite once read, nothing
-- brought it back.
--
-- The rule is enforced HERE and not in the client on purpose: SignalPanel
-- lifting `sos` out of the list is a rendering decision, and a rendering
-- decision is not a guarantee. Every caller of this RPC — the panel today, the
-- inbox page or a future keyboard shortcut tomorrow — gets the same behaviour
-- without having to know about it.
--
-- Deliberately NOT changed: `get_inbox_unread_count`. The mock also says the
-- safety notice does not count toward the badge, which is right for a venue
-- advisory and wrong for an SOS — a distress signal that does not raise the
-- badge is a silent one. It stays counted; it just cannot be swept.
--
-- An `sos` is still clearable individually: opening it marks it read through
-- the per-notification path, which this function does not touch.

CREATE OR REPLACE FUNCTION public.mark_all_alerts_read()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET read = true
   WHERE user_id = auth.uid()
     AND read = false
     AND type <> 'sos';
  UPDATE public.group_notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL;
  UPDATE public.profiles SET post_engagement_seen_at = now() WHERE user_id = auth.uid();
END $$;

REVOKE EXECUTE ON FUNCTION public.mark_all_alerts_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_alerts_read() TO authenticated;
