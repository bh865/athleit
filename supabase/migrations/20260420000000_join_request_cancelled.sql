-- Auth + onboarding (1/2): a requester can cancel their own pending join request.
-- Enum values cannot be used in the transaction that adds them, so the value gets its own
-- migration. household_join_requests.status is text with a check that already allows 'cancelled'.
alter type public.request_status add value if not exists 'cancelled';
