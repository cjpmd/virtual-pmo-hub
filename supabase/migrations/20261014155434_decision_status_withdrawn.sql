-- D1 (approved 14/10/2026): a Pending decision can be withdrawn (withdraw_decision, in the D1
-- decision log migration). Added on its own because a new enum value can't be used in the
-- transaction that adds it.
alter type public.decision_status add value if not exists 'withdrawn';
