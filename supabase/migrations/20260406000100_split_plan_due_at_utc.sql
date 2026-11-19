-- Fix: weekly and biweekly due instants were added as timestamptz + interval, which follows the SESSION time zone
-- across a daylight-saving change (a "7 days" step became 167 or 169 hours). Every cadence is now computed on the UTC
-- wall clock, so the result never depends on the session time zone. Caught by fn_split_payment_plans.test.sql.
create or replace function private.plan_due_at(p_start timestamptz, p_cadence text, p_k integer)
returns timestamptz language sql immutable set search_path = ''
as $$
  select (((p_start at time zone 'UTC') + case p_cadence
    when 'weekly' then p_k * interval '7 days'
    when 'biweekly' then p_k * interval '14 days'
    when 'monthly' then p_k * interval '1 month'
  end) at time zone 'UTC');
$$;
