-- Phase 2 (3/9): a cancelled event must carry a non-blank reason. The first version of the check
-- passed when cancelled_reason was NULL (NULL is not false), so close that gap.
alter table public.events drop constraint events_cancel_consistency;
alter table public.events add constraint events_cancel_consistency check (
  (status = 'scheduled' and cancelled_reason is null)
  or (status = 'cancelled' and coalesce(char_length(btrim(cancelled_reason)), 0) >= 1));
