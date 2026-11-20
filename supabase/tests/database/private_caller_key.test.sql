-- private.caller_key: the key the signed-out preview limiter uses
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values ('a1111111-1111-1111-1111-111111111111', 'user@example.test');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{}', true);
select is(private.caller_key(), 'unknown', 'no headers gives the shared fallback');

select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9"}', true);
select is(private.caller_key(), '203.0.113.9', 'a single forwarded address is used');

select set_config('request.headers', '{"x-forwarded-for":"6.6.6.6, 203.0.113.9"}', true);
select is(private.caller_key(), '203.0.113.9', 'the last hop is used, not the first one a client can write');

select set_config('request.headers', '{"x-forwarded-for":"1.1.1.1, 203.0.113.9"}', true);
select is(private.caller_key(), '203.0.113.9', 'changing the spoofed first hop does not change the key');

select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.4","x-forwarded-for":"6.6.6.6, 203.0.113.9"}', true);
select is(private.caller_key(), '198.51.100.4', 'cf-connecting-ip wins over x-forwarded-for');

select set_config('request.headers', '{"cf-connecting-ip":"  ","x-forwarded-for":"203.0.113.9"}', true);
select is(private.caller_key(), '203.0.113.9', 'a blank cf-connecting-ip is ignored');

select set_config('request.headers', '{"x-forwarded-for":""}', true);
select is(private.caller_key(), 'unknown', 'an empty x-forwarded-for gives the fallback');

select set_config('request.headers', concat('{"cf-connecting-ip":"', repeat('9', 200), '"}'), true);
select is(length(private.caller_key()), 64, 'the key is capped so it cannot overflow the bucket column');

select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.4"}', true);
select is(private.caller_key(), 'a1111111-1111-1111-1111-111111111111', 'a signed-in caller is keyed by user id');

select * from finish();
rollback;
