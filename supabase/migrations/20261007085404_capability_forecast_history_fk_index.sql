-- Covering index for capability_forecast_history's composite foreign key (advisor:
-- unindexed_foreign_keys after 20261007083935_benefits_pathway).
create index capability_forecast_history_capability_idx on public.capability_forecast_history (capability_id, workspace_id);
