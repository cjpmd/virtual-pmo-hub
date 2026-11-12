// Explicit import of every block definition so the registrations survive tree-shaking.
// With "sideEffects": false in package.json, Rollup removes side-effect-only imports.
// Exporting named constants from each file and referencing them here via ALL_BLOCKS
// creates a live value chain that the bundler cannot remove.
import {
  _report_cover,
  _executive_summary,
  _free_text,
  _section_heading,
  _highlight_report_summary,
} from "./narrative";
import { _overall_status, _health_by_dimension, _project_status_grid } from "./status";
import {
  _project_summary,
  _milestone_slippage,
  _budget_summary,
  _decisions_required,
  _top_raid,
  _change_requests,
} from "./delivery";
import {
  _rating_distribution,
  _divergence_list,
  _milestone_timeline,
  _roadmap,
  _burnup_forecast,
  _stage_gates,
  _spend_profile,
  _budget_movers,
  _resource_summary,
  _decisions_taken,
  _risk_heatmap,
  _escalations,
  _dependencies,
  _benefits_summary,
  _requests_pipeline,
  _actions_log,
  _data_quality,
  _approvals_status,
} from "./phase2";
import { _changes_since_last, _raid_movement } from "./phase3";
import { _lessons_learned, _linked_records } from "./phase4";
import { _project_overview } from "./project-overview";
import { _programme_coverage, _benefits_value } from "./funding";

/** Every registered block definition. Importing this ensures all blocks are in the registry. */
export const ALL_BLOCKS = [
  _report_cover,
  _executive_summary,
  _free_text,
  _section_heading,
  _highlight_report_summary,
  _overall_status,
  _health_by_dimension,
  _project_status_grid,
  _project_summary,
  _milestone_slippage,
  _budget_summary,
  _decisions_required,
  _top_raid,
  _change_requests,
  _rating_distribution,
  _divergence_list,
  _milestone_timeline,
  _roadmap,
  _burnup_forecast,
  _stage_gates,
  _spend_profile,
  _budget_movers,
  _resource_summary,
  _decisions_taken,
  _risk_heatmap,
  _escalations,
  _dependencies,
  _benefits_summary,
  _requests_pipeline,
  _actions_log,
  _data_quality,
  _approvals_status,
  _changes_since_last,
  _raid_movement,
  _lessons_learned,
  _linked_records,
  _project_overview,
  _programme_coverage,
  _benefits_value,
]; // 39 total
