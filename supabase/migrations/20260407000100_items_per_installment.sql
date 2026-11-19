-- Several installments of one request can be paid in one payment (pay the rest early): payment_items was unique on
-- (payment_id, payment_request_id). It is now unique per request for whole-request items and per installment for installment items.
alter table public.payment_items drop constraint payment_items_payment_id_payment_request_id_key;
create unique index payment_items_payment_request_uidx on public.payment_items (payment_id, payment_request_id) where installment_id is null;
create unique index payment_items_payment_installment_uidx on public.payment_items (payment_id, installment_id) where installment_id is not null;
