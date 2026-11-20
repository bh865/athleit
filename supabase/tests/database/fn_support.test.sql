-- Support center: requester ownership, staff roles, aal2 and reasons on sensitive actions, status rules, first_reply_at once,
-- merge, redact, internal notes hidden from requesters, notification category, sweep.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid, p_aal text default 'aal2') returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true); end $f$;

insert into auth.users (id, email) values
  ('d5000000-0000-0000-0000-000000000001', 'parent1@example.test'),
  ('d5000000-0000-0000-0000-000000000002', 'parent2@example.test'),
  ('d5000000-0000-0000-0000-000000000003', 'agent@example.test'),
  ('d5000000-0000-0000-0000-000000000004', 'adm@example.test'),
  ('d5000000-0000-0000-0000-000000000005', 'own@example.test');
delete from public.platform_admins;
insert into public.platform_admins (profile_id, role) values
  ('d5000000-0000-0000-0000-000000000003', 'support'),
  ('d5000000-0000-0000-0000-000000000004', 'admin'),
  ('d5000000-0000-0000-0000-000000000005', 'owner');

-- Requester creates a request ---------------------------------------------------------------------------------------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
create temp table made as select public.create_support_request('billing', 'Charged twice', 'I was charged twice', null, null, 'pay-a-request', '/pay', '{"platform":"web"}'::jsonb) j;
grant select on made to authenticated;
select matches((select j ->> 'ref' from made), '^SUP-[0-9]{6}$', 'reference is SUP-######');
select throws_ok($$ select public.create_support_request('nope', 's', 'b', null, null, null, null, '{}') $$, '22023', 'invalid_type', 'bad type rejected');
select throws_ok($$ select public.create_support_request('question', repeat('x', 121), 'b', null, null, null, null, '{}') $$, '22023', 'invalid_subject', 'subject over 120 rejected');
select throws_ok($$ select public.create_support_request('question', 's', 'b', null, null, null, null, '{"message_text":"x"}') $$, '23514', null, 'diagnostics accept only the listed keys');
select is((select count(*)::int from public.support_requests), 1, 'requester sees their own request');
select is((select count(*)::int from public.support_messages), 1, 'and its message');
select throws_ok($$ insert into public.support_requests (type, subject, requester_profile_id) values ('question', 'x', 'd5000000-0000-0000-0000-000000000001') $$, '42501', null, 'no direct table writes');

-- Another user cannot see or touch it ---------------------------------------------------------------------------------
select pg_temp.login('d5000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.support_requests), 0, 'another user sees nothing');
select throws_ok(format($$ select public.get_my_support_request(%L) $$, (select j ->> 'ref' from made)), 'P0002', 'unknown_request', 'cannot read by reference');
select throws_ok(format($$ select public.reply_to_support_request(%L, 'hi') $$, (select j ->> 'ref' from made)), 'P0002', 'unknown_request', 'cannot reply');
reset role;

-- anon has nothing -------------------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select count(*) from public.support_requests $$, '42501', null, 'anon cannot select requests');
select throws_ok($$ select public.get_my_support_requests() $$, '42501', null, 'anon cannot call requester functions');
reset role;
select lives_ok($$ select public.get_public_help_values() $$, 'public help values are readable without sign in');

-- Staff: roles ----------------------------------------------------------------------------------------------------------------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select throws_ok(format($$ select public.admin_get_support_request(%L) $$, (select j ->> 'id' from made)), '42501', 'not_authorized', 'ordinary user cannot use admin reads');
reset role;
select pg_temp.login('d5000000-0000-0000-0000-000000000003', 'aal1');
select lives_ok(format($$ select public.admin_get_support_request(%L) $$, (select j ->> 'id' from made)), 'support reads at aal1');
create temp table staffmsg as select public.admin_reply_support_request((select (j ->> 'id')::uuid from made), 'Thanks, looking now', false, null) id;
select is((select status from public.support_requests where id = (select (j ->> 'id')::uuid from made)), 'waiting_on_requester', 'staff reply waits on requester');
select isnt((select first_reply_at from public.support_requests where id = (select (j ->> 'id')::uuid from made)), null, 'first_reply_at set');
reset role;
select pg_temp.login('d5000000-0000-0000-0000-000000000003', 'aal1');
create temp table fr as select first_reply_at t from public.support_requests where id = (select (j ->> 'id')::uuid from made);
select public.admin_reply_support_request((select (j ->> 'id')::uuid from made), 'Second reply', false, null);
select is((select first_reply_at from public.support_requests where id = (select (j ->> 'id')::uuid from made)), (select t from fr), 'first_reply_at is set once');
select public.admin_reply_support_request((select (j ->> 'id')::uuid from made), 'Private note', true, null);
reset role;

-- Internal notes never reach the requester -----------------------------------------------------------------------------------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.support_messages where body = 'Private note'), 0, 'internal note hidden by RLS');
select is((select jsonb_array_length(public.get_my_support_request((select j ->> 'ref' from made)) -> 'messages')), 3, 'thread shows requester message and two staff replies, no note');
select is((select (public.get_my_support_requests() -> 'items' -> 0 ->> 'unread')::boolean), true, 'staff reply is unread');
select public.mark_support_read((select j ->> 'ref' from made));
select is((select (public.get_my_support_requests() -> 'items' -> 0 ->> 'unread')::boolean), false, 'read clears unread');
select public.reply_to_support_request((select j ->> 'ref' from made), 'Here is the receipt');
select is((select status from public.support_requests where requester_profile_id = 'd5000000-0000-0000-0000-000000000001'), 'open', 'requester reply reopens a waiting ticket');
reset role;
select is((select count(*)::int from public.notification_outbox where category = 'support' and channel = 'in_app'), 2, 'two staff replies queued in-app rows');

-- Sensitive actions: aal2 and a reason ---------------------------------------------------------------------------------------
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
select throws_ok(format($$ select public.admin_mark_support_spam(%L, 'a long enough reason') $$, (select j ->> 'id' from made)), '42501', 'not_authorized', 'support cannot mark spam');
reset role;
select pg_temp.login('d5000000-0000-0000-0000-000000000004', 'aal1');
select throws_ok(format($$ select public.admin_mark_support_spam(%L, 'a long enough reason') $$, (select j ->> 'id' from made)), '42501', 'mfa_required', 'aal1 rejected');
reset role;
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select throws_ok(format($$ select public.admin_mark_support_spam(%L, 'short') $$, (select j ->> 'id' from made)), '22023', null, 'short reason rejected');
create temp table msgs as select id from public.support_messages where body = 'Thanks, looking now';
select lives_ok(format($$ select public.admin_redact_support_message(%L, 'removed a phone number') $$, (select id from msgs)), 'admin redacts with reason at aal2');
select is((select body from public.support_messages where id = (select id from msgs)), '[removed by Athleit Support]', 'text replaced');
select is((select count(*)::int from public.platform_audit_log where action = 'support.redact' and before::text not like '%looking now%' and after is null), 1, 'audit row written without the removed text');
select throws_ok(format($$ select public.admin_redact_support_message(%L, 'removed a phone number') $$, (select id from msgs)), '22023', 'already_redacted', 'cannot redact twice');

-- Merge --------------------------------------------------------------------------------------------------------------------------------
reset role;
insert into public.support_requests (id, type, subject, requester_email) values ('d6000000-0000-0000-0000-000000000001', 'question', 'Duplicate', 'x@example.test');
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select lives_ok(format($$ select public.admin_merge_support_requests('d6000000-0000-0000-0000-000000000001', %L, 'duplicate of the same issue') $$, (select j ->> 'id' from made)), 'merge with reason');
select is((select status from public.support_requests where id = 'd6000000-0000-0000-0000-000000000001'), 'closed', 'merged source closes');
select is((select merged_into from public.support_requests where id = 'd6000000-0000-0000-0000-000000000001'), (select (j ->> 'id')::uuid from made), 'merged_into set');
select throws_ok(format($$ select public.admin_merge_support_requests(%L, %L, 'a long enough reason') $$, (select j ->> 'id' from made), (select j ->> 'id' from made)), '22023', 'same_request', 'cannot merge into itself');

-- Solved, reopen window, satisfaction ----------------------------------------------------------------------------------------------------
reset role;
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select public.mark_support_request_solved((select j ->> 'ref' from made));
select public.rate_support_request((select j ->> 'ref' from made), 'yes', 'thanks');
select is((select satisfaction from public.support_requests where requester_profile_id = 'd5000000-0000-0000-0000-000000000001'), 'yes', 'satisfaction recorded on a solved ticket');
select lives_ok(format($$ select public.reopen_support_request(%L) $$, (select j ->> 'ref' from made)), 'reopen inside the window');
reset role;

-- Sweep -----------------------------------------------------------------------------------------------------------------------------------------------
update public.support_requests set status = 'waiting_on_requester', last_activity_at = now() - interval '30 days' where id = (select (j ->> 'id')::uuid from made);
select is((private.support_sweep() ->> 'solved')::int, 1, 'sweep auto-solves a stale waiting ticket');
update public.support_requests set solved_at = now() - interval '60 days' where id = (select (j ->> 'id')::uuid from made);
select is((private.support_sweep() ->> 'closed')::int, 1, 'sweep closes after the reopen window');
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select throws_ok(format($$ select public.reply_to_support_request(%L, 'hello again') $$, (select j ->> 'ref' from made)), '22023', 'request_closed', 'closed tickets cannot be replied to');
reset role;

-- Notification category keeps earlier values -------------------------------------------------------------------------------------------------------------
select lives_ok($$ insert into public.notification_outbox (profile_id, category, channel, dedupe_key) values ('d5000000-0000-0000-0000-000000000001', 'billing', 'in_app', 'test:billing') $$, 'billing still allowed');
select lives_ok($$ insert into public.notification_outbox (profile_id, category, channel, dedupe_key) values ('d5000000-0000-0000-0000-000000000001', 'payments_reserved', 'in_app', 'test:reserved') $$, 'payments_reserved still allowed');

-- lookup recognises SUP- references ------------------------------------------------------------------------------------------------------------------------------
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
select is((public.admin_lookup((select j ->> 'ref' from made)) ->> 'kind'), 'support_request', 'admin_lookup recognises a SUP reference');
reset role;

select * from finish();
rollback;
