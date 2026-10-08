export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      actuals_import_rows: {
        Row: {
          amount: number
          cost_line_id: string
          id: string
          import_id: string
          organisation_id: string
          period_month: string
          project_id: string
          reference: string | null
          row_number: number
          workspace_id: string
        }
        Insert: {
          amount: number
          cost_line_id: string
          id?: string
          import_id: string
          organisation_id: string
          period_month: string
          project_id: string
          reference?: string | null
          row_number: number
          workspace_id: string
        }
        Update: {
          amount?: number
          cost_line_id?: string
          id?: string
          import_id?: string
          organisation_id?: string
          period_month?: string
          project_id?: string
          reference?: string | null
          row_number?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actuals_import_rows_cost_line_id_project_id_fkey"
            columns: ["cost_line_id", "project_id"]
            isOneToOne: false
            referencedRelation: "cost_lines"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_import_id_workspace_id_fkey"
            columns: ["import_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "actuals_imports"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "actuals_import_rows_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      actuals_imports: {
        Row: {
          file_name: string
          id: string
          imported_at: string
          imported_by: string | null
          mode: Database["public"]["Enums"]["actuals_import_mode"]
          organisation_id: string
          row_count: number
          total: number
          workspace_id: string
        }
        Insert: {
          file_name: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          mode: Database["public"]["Enums"]["actuals_import_mode"]
          organisation_id: string
          row_count: number
          total: number
          workspace_id: string
        }
        Update: {
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          mode?: Database["public"]["Enums"]["actuals_import_mode"]
          organisation_id?: string
          row_count?: number
          total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actuals_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_imports_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      assumptions: {
        Row: {
          assumption: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organisation_id: string
          owner_id: string | null
          portfolio_id: string | null
          programme_id: string | null
          project_id: string | null
          raised_issue_id: string | null
          rationale: string | null
          ref: string
          status: Database["public"]["Enums"]["assumption_status"]
          updated_at: string
          validation_date: string | null
          workspace_id: string
        }
        Insert: {
          assumption: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organisation_id: string
          owner_id?: string | null
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          raised_issue_id?: string | null
          rationale?: string | null
          ref: string
          status?: Database["public"]["Enums"]["assumption_status"]
          updated_at?: string
          validation_date?: string | null
          workspace_id: string
        }
        Update: {
          assumption?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organisation_id?: string
          owner_id?: string | null
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          raised_issue_id?: string | null
          rationale?: string | null
          ref?: string
          status?: Database["public"]["Enums"]["assumption_status"]
          updated_at?: string
          validation_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assumptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assumptions_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assumptions_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_raised_issue_id_workspace_id_fkey"
            columns: ["raised_issue_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "assumptions_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_table: string
          id: string
          organisation_id: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_table: string
          id?: string
          organisation_id: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_table?: string
          id?: string
          organisation_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_handovers: {
        Row: {
          bau_owner_id: string | null
          bau_service: string | null
          benefit_id: string
          confirmed_by_id: string | null
          confirmed_date: string | null
          created_at: string
          created_by: string | null
          frequency: Database["public"]["Enums"]["measure_frequency"]
          next_review_date: string | null
          organisation_id: string
          post_implementation_review_date: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bau_owner_id?: string | null
          bau_service?: string | null
          benefit_id: string
          confirmed_by_id?: string | null
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["measure_frequency"]
          next_review_date?: string | null
          organisation_id: string
          post_implementation_review_date?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bau_owner_id?: string | null
          bau_service?: string | null
          benefit_id?: string
          confirmed_by_id?: string | null
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["measure_frequency"]
          next_review_date?: string | null
          organisation_id?: string
          post_implementation_review_date?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_handovers_bau_owner_id_organisation_id_fkey"
            columns: ["bau_owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_handovers_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_handovers_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_handovers_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_handovers_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_handovers_confirmed_by_id_organisation_id_fkey"
            columns: ["confirmed_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_handovers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_handovers_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_maps: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          layout: Json
          name: string
          organisation_id: string
          programme_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          layout?: Json
          name: string
          organisation_id: string
          programme_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          layout?: Json
          name?: string
          organisation_id?: string
          programme_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_maps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_maps_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_maps_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_maps_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_maps_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_measure_targets: {
        Row: {
          measure_id: string
          organisation_id: string
          period_id: string
          value: number
          workspace_id: string
        }
        Insert: {
          measure_id: string
          organisation_id: string
          period_id: string
          value: number
          workspace_id: string
        }
        Update: {
          measure_id?: string
          organisation_id?: string
          period_id?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_measure_targets_measure_id_workspace_id_fkey"
            columns: ["measure_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefit_measures"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_measure_targets_period_id_organisation_id_fkey"
            columns: ["period_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "benefit_periods"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_measure_targets_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_measurements: {
        Row: {
          actual_value: number
          created_at: string
          created_by: string | null
          evidence: string | null
          evidence_path: string | null
          id: string
          measure_id: string
          notes: string | null
          organisation_id: string
          period_id: string
          query_note: string | null
          status: Database["public"]["Enums"]["measurement_status"]
          submitted_by_id: string | null
          submitted_date: string | null
          updated_at: string
          validated_by_id: string | null
          validated_date: string | null
          workspace_id: string
        }
        Insert: {
          actual_value: number
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          evidence_path?: string | null
          id?: string
          measure_id: string
          notes?: string | null
          organisation_id: string
          period_id: string
          query_note?: string | null
          status?: Database["public"]["Enums"]["measurement_status"]
          submitted_by_id?: string | null
          submitted_date?: string | null
          updated_at?: string
          validated_by_id?: string | null
          validated_date?: string | null
          workspace_id: string
        }
        Update: {
          actual_value?: number
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          evidence_path?: string | null
          id?: string
          measure_id?: string
          notes?: string | null
          organisation_id?: string
          period_id?: string
          query_note?: string | null
          status?: Database["public"]["Enums"]["measurement_status"]
          submitted_by_id?: string | null
          submitted_date?: string | null
          updated_at?: string
          validated_by_id?: string | null
          validated_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_measurements_measure_id_workspace_id_fkey"
            columns: ["measure_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefit_measures"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_measurements_period_id_organisation_id_fkey"
            columns: ["period_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "benefit_periods"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_measurements_submitted_by_id_organisation_id_fkey"
            columns: ["submitted_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_measurements_validated_by_id_organisation_id_fkey"
            columns: ["validated_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_measurements_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_measures: {
        Row: {
          baseline_date: string | null
          baseline_value: number
          benefit_id: string
          created_at: string
          created_by: string | null
          data_provider: string | null
          data_source: string | null
          frequency: Database["public"]["Enums"]["measure_frequency"]
          id: string
          measurement_method: string | null
          name: string
          next_due_date: string | null
          organisation_id: string
          sort_order: number
          unit: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          baseline_date?: string | null
          baseline_value?: number
          benefit_id: string
          created_at?: string
          created_by?: string | null
          data_provider?: string | null
          data_source?: string | null
          frequency?: Database["public"]["Enums"]["measure_frequency"]
          id?: string
          measurement_method?: string | null
          name: string
          next_due_date?: string | null
          organisation_id: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          baseline_date?: string | null
          baseline_value?: number
          benefit_id?: string
          created_at?: string
          created_by?: string | null
          data_provider?: string | null
          data_source?: string | null
          frequency?: Database["public"]["Enums"]["measure_frequency"]
          id?: string
          measurement_method?: string | null
          name?: string
          next_due_date?: string | null
          organisation_id?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_measures_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_measures_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_measures_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_measures_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_measures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_measures_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_objectives: {
        Row: {
          benefit_id: string
          organisation_id: string
          strategic_objective_id: string
          workspace_id: string
        }
        Insert: {
          benefit_id: string
          organisation_id: string
          strategic_objective_id: string
          workspace_id: string
        }
        Update: {
          benefit_id?: string
          organisation_id?: string
          strategic_objective_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_objectives_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_objectives_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_objectives_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_objectives_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_objectives_strategic_objective_id_workspace_id_fkey"
            columns: ["strategic_objective_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "strategic_objectives"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_objectives_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_periods: {
        Row: {
          created_at: string
          created_by: string | null
          finish_date: string
          id: string
          label: string
          organisation_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finish_date: string
          id?: string
          label: string
          organisation_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finish_date?: string
          id?: string
          label?: string
          organisation_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_periods_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_projects: {
        Row: {
          attribution_percent: number
          benefit_id: string
          organisation_id: string
          project_id: string
          workspace_id: string
        }
        Insert: {
          attribution_percent?: number
          benefit_id: string
          organisation_id: string
          project_id: string
          workspace_id: string
        }
        Update: {
          attribution_percent?: number
          benefit_id?: string
          organisation_id?: string
          project_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_projects_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefit_reviews: {
        Row: {
          benefit_id: string
          created_at: string
          created_by: string | null
          findings: string | null
          id: string
          lessons_learned: string | null
          organisation_id: string
          review_date: string
          reviewer_id: string | null
          type: Database["public"]["Enums"]["benefit_review_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          benefit_id: string
          created_at?: string
          created_by?: string | null
          findings?: string | null
          id?: string
          lessons_learned?: string | null
          organisation_id: string
          review_date: string
          reviewer_id?: string | null
          type?: Database["public"]["Enums"]["benefit_review_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          benefit_id?: string
          created_at?: string
          created_by?: string | null
          findings?: string | null
          id?: string
          lessons_learned?: string | null
          organisation_id?: string
          review_date?: string
          reviewer_id?: string | null
          type?: Database["public"]["Enums"]["benefit_review_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_reviews_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_reviews_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_reviews_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_reviews_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefit_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_reviews_reviewer_id_organisation_id_fkey"
            columns: ["reviewer_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefit_reviews_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      benefits: {
        Row: {
          beneficiaries: string[]
          category_id: string
          category_list: string
          classification: Database["public"]["Enums"]["benefit_classification"]
          confidence: Database["public"]["Enums"]["confidence"]
          created_at: string
          created_by: string | null
          dependency_notes: string[]
          description: string | null
          eligibility_confirmed: boolean
          eligibility_confirmed_by_id: string | null
          eligibility_confirmed_date: string | null
          id: string
          organisation_id: string
          owner_id: string | null
          planned_total_value: number
          portfolio_id: string
          programme_id: string | null
          realisation_start_date: string | null
          ref: string
          sro_id: string | null
          status: Database["public"]["Enums"]["benefit_status"]
          title: string
          type: Database["public"]["Enums"]["benefit_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          beneficiaries?: string[]
          category_id: string
          category_list?: string
          classification: Database["public"]["Enums"]["benefit_classification"]
          confidence?: Database["public"]["Enums"]["confidence"]
          created_at?: string
          created_by?: string | null
          dependency_notes?: string[]
          description?: string | null
          eligibility_confirmed?: boolean
          eligibility_confirmed_by_id?: string | null
          eligibility_confirmed_date?: string | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          planned_total_value?: number
          portfolio_id: string
          programme_id?: string | null
          realisation_start_date?: string | null
          ref: string
          sro_id?: string | null
          status?: Database["public"]["Enums"]["benefit_status"]
          title: string
          type?: Database["public"]["Enums"]["benefit_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          beneficiaries?: string[]
          category_id?: string
          category_list?: string
          classification?: Database["public"]["Enums"]["benefit_classification"]
          confidence?: Database["public"]["Enums"]["confidence"]
          created_at?: string
          created_by?: string | null
          dependency_notes?: string[]
          description?: string | null
          eligibility_confirmed?: boolean
          eligibility_confirmed_by_id?: string | null
          eligibility_confirmed_date?: string | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          planned_total_value?: number
          portfolio_id?: string
          programme_id?: string | null
          realisation_start_date?: string | null
          ref?: string
          sro_id?: string | null
          status?: Database["public"]["Enums"]["benefit_status"]
          title?: string
          type?: Database["public"]["Enums"]["benefit_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefits_category_id_organisation_id_category_list_fkey"
            columns: ["category_id", "organisation_id", "category_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "benefits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefits_eligibility_confirmed_by_id_organisation_id_fkey"
            columns: ["eligibility_confirmed_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefits_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_sro_id_organisation_id_fkey"
            columns: ["sro_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      budget_baselines: {
        Row: {
          approved_at: string
          approved_by: string | null
          business_case_version_id: string | null
          change_request_id: string | null
          created_at: string
          id: string
          organisation_id: string
          project_id: string
          reason: string | null
          source: Database["public"]["Enums"]["baseline_source"]
          total: number
          version: number
          workspace_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          business_case_version_id?: string | null
          change_request_id?: string | null
          created_at?: string
          id?: string
          organisation_id: string
          project_id: string
          reason?: string | null
          source: Database["public"]["Enums"]["baseline_source"]
          total: number
          version: number
          workspace_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          business_case_version_id?: string | null
          change_request_id?: string | null
          created_at?: string
          id?: string
          organisation_id?: string
          project_id?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["baseline_source"]
          total?: number
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_baselines_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_baselines_change_request_id_workspace_id_fkey"
            columns: ["change_request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "budget_baselines_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      business_case_benefits: {
        Row: {
          annual_value: number
          baseline: string | null
          category_id: string
          category_list: string
          classification: Database["public"]["Enums"]["benefit_classification"]
          created_at: string
          created_by: string | null
          id: string
          measure: string | null
          organisation_id: string
          owner_id: string | null
          sort_order: number
          strategic_objective_id: string | null
          target: string | null
          title: string
          updated_at: string
          version_id: string
          workspace_id: string
          years_counted: number
        }
        Insert: {
          annual_value?: number
          baseline?: string | null
          category_id: string
          category_list?: string
          classification: Database["public"]["Enums"]["benefit_classification"]
          created_at?: string
          created_by?: string | null
          id?: string
          measure?: string | null
          organisation_id: string
          owner_id?: string | null
          sort_order?: number
          strategic_objective_id?: string | null
          target?: string | null
          title: string
          updated_at?: string
          version_id: string
          workspace_id: string
          years_counted?: number
        }
        Update: {
          annual_value?: number
          baseline?: string | null
          category_id?: string
          category_list?: string
          classification?: Database["public"]["Enums"]["benefit_classification"]
          created_at?: string
          created_by?: string | null
          id?: string
          measure?: string | null
          organisation_id?: string
          owner_id?: string | null
          sort_order?: number
          strategic_objective_id?: string | null
          target?: string | null
          title?: string
          updated_at?: string
          version_id?: string
          workspace_id?: string
          years_counted?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_case_benefits_category_id_organisation_id_categor_fkey"
            columns: ["category_id", "organisation_id", "category_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "business_case_benefits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_benefits_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "business_case_benefits_strategic_objective_id_workspace_id_fkey"
            columns: ["strategic_objective_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "strategic_objectives"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_case_benefits_version_id_workspace_id_fkey"
            columns: ["version_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "business_case_versions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_case_benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      business_case_options: {
        Row: {
          benefits_summary: string | null
          created_at: string
          created_by: string | null
          delivery_cost: number | null
          description: string | null
          id: string
          is_preferred: boolean
          name: string
          organisation_id: string
          risk_summary: string | null
          sort_order: number
          updated_at: string
          version_id: string
          whole_life_cost: number | null
          workspace_id: string
        }
        Insert: {
          benefits_summary?: string | null
          created_at?: string
          created_by?: string | null
          delivery_cost?: number | null
          description?: string | null
          id?: string
          is_preferred?: boolean
          name: string
          organisation_id: string
          risk_summary?: string | null
          sort_order?: number
          updated_at?: string
          version_id: string
          whole_life_cost?: number | null
          workspace_id: string
        }
        Update: {
          benefits_summary?: string | null
          created_at?: string
          created_by?: string | null
          delivery_cost?: number | null
          description?: string | null
          id?: string
          is_preferred?: boolean
          name?: string
          organisation_id?: string
          risk_summary?: string | null
          sort_order?: number
          updated_at?: string
          version_id?: string
          whole_life_cost?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_case_options_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_options_version_id_workspace_id_fkey"
            columns: ["version_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "business_case_versions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_case_options_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      business_case_sections: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_required: boolean
          key: string
          organisation_id: string
          sort_order: number
          template_id: string | null
          title: string
          updated_at: string
          version_id: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_required?: boolean
          key: string
          organisation_id: string
          sort_order?: number
          template_id?: string | null
          title: string
          updated_at?: string
          version_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_required?: boolean
          key?: string
          organisation_id?: string
          sort_order?: number
          template_id?: string | null
          title?: string
          updated_at?: string
          version_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_case_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "business_case_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_sections_version_id_workspace_id_fkey"
            columns: ["version_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "business_case_versions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_case_sections_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      business_case_templates: {
        Row: {
          created_at: string
          created_by: string | null
          guidance: string | null
          id: string
          is_active: boolean
          is_required: boolean
          key: string
          organisation_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          key: string
          organisation_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          key?: string
          organisation_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_case_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_templates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_case_versions: {
        Row: {
          business_case_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decision_id: string | null
          funding_requested: number | null
          id: string
          organisation_id: string
          preferred_option_id: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["business_case_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          version: number
          whole_life_cost: number | null
          workspace_id: string
        }
        Insert: {
          business_case_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decision_id?: string | null
          funding_requested?: number | null
          id?: string
          organisation_id: string
          preferred_option_id?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["business_case_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          version: number
          whole_life_cost?: number | null
          workspace_id: string
        }
        Update: {
          business_case_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decision_id?: string | null
          funding_requested?: number | null
          id?: string
          organisation_id?: string
          preferred_option_id?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["business_case_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          version?: number
          whole_life_cost?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_case_versions_business_case_id_workspace_id_fkey"
            columns: ["business_case_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "business_cases"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_case_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_versions_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_case_versions_preferred_option_id_id_fkey"
            columns: ["preferred_option_id", "id"]
            isOneToOne: false
            referencedRelation: "business_case_options"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "business_case_versions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_versions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_case_versions_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      business_cases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          project_id: string | null
          request_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          project_id?: string | null
          request_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          project_id?: string | null
          request_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_cases_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_request_id_workspace_id_fkey"
            columns: ["request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "project_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "business_cases_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      capabilities: {
        Row: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by_id: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          delivered_date: string | null
          description: string | null
          forecast_date: string | null
          id: string
          organisation_id: string
          owner_id: string | null
          programme_id: string
          status: Database["public"]["Enums"]["capability_status"]
          target_date: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acceptance_note?: string | null
          accepted_at?: string | null
          accepted_by_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_date?: string | null
          description?: string | null
          forecast_date?: string | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          programme_id: string
          status?: Database["public"]["Enums"]["capability_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acceptance_note?: string | null
          accepted_at?: string | null
          accepted_by_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_date?: string | null
          description?: string | null
          forecast_date?: string | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          programme_id?: string
          status?: Database["public"]["Enums"]["capability_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_accepted_by_fkey"
            columns: ["accepted_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "capabilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capabilities_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "capabilities_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "capabilities_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "capabilities_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "capabilities_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      capability_forecast_history: {
        Row: {
          capability_id: string
          created_at: string
          created_by: string | null
          forecast_date: string
          id: string
          organisation_id: string
          reporting_date: string
          workspace_id: string
        }
        Insert: {
          capability_id: string
          created_at?: string
          created_by?: string | null
          forecast_date: string
          id?: string
          organisation_id: string
          reporting_date: string
          workspace_id: string
        }
        Update: {
          capability_id?: string
          created_at?: string
          created_by?: string | null
          forecast_date?: string
          id?: string
          organisation_id?: string
          reporting_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_forecast_history_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_forecast_history_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_capability_health"
            referencedColumns: ["capability_id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_forecast_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_forecast_history_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      capability_projects: {
        Row: {
          capability_id: string
          organisation_id: string
          project_id: string
          workspace_id: string
        }
        Insert: {
          capability_id: string
          organisation_id: string
          project_id: string
          workspace_id: string
        }
        Update: {
          capability_id?: string
          organisation_id?: string
          project_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_projects_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_capability_health"
            referencedColumns: ["capability_id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "capability_projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      change_requests: {
        Row: {
          cost_impact: number
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          portfolio_id: string | null
          programme_id: string | null
          project_id: string | null
          ref: string
          requested_by_id: string | null
          schedule_impact_days: number
          status: Database["public"]["Enums"]["change_status"]
          title: string
          type_id: string
          type_list: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cost_impact?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          ref: string
          requested_by_id?: string | null
          schedule_impact_days?: number
          status?: Database["public"]["Enums"]["change_status"]
          title: string
          type_id: string
          type_list?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cost_impact?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          ref?: string
          requested_by_id?: string | null
          schedule_impact_days?: number
          status?: Database["public"]["Enums"]["change_status"]
          title?: string
          type_id?: string
          type_list?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "change_requests_requested_by_id_organisation_id_fkey"
            columns: ["requested_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "change_requests_type_id_organisation_id_type_list_fkey"
            columns: ["type_id", "organisation_id", "type_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "change_requests_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      collection_projects: {
        Row: {
          award_amount: number | null
          collection_id: string
          organisation_id: string
          project_id: string
          workspace_id: string
        }
        Insert: {
          award_amount?: number | null
          collection_id: string
          organisation_id: string
          project_id: string
          workspace_id: string
        }
        Update: {
          award_amount?: number | null
          collection_id?: string
          organisation_id?: string
          project_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_projects_collection_id_workspace_id_fkey"
            columns: ["collection_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "collection_projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organisation_id: string
          pot_amount: number | null
          type_id: string
          type_list: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organisation_id: string
          pot_amount?: number | null
          type_id: string
          type_list?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organisation_id?: string
          pot_amount?: number | null
          type_id?: string
          type_list?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_type_id_organisation_id_type_list_fkey"
            columns: ["type_id", "organisation_id", "type_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "collections_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      committee_packs: {
        Row: {
          collection_id: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          meeting_date: string
          organisation_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          collection_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          meeting_date: string
          organisation_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          collection_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          meeting_date?: string
          organisation_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_packs_collection_id_workspace_id_fkey"
            columns: ["collection_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "committee_packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_packs_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_packs_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      cost_lines: {
        Row: {
          archived_at: string | null
          category_id: string
          category_list: string
          created_at: string
          created_by: string | null
          funding_source_id: string | null
          funding_source_list: string
          id: string
          name: string
          organisation_id: string
          project_id: string
          sort_order: number
          spend_type: Database["public"]["Enums"]["spend_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          category_id: string
          category_list?: string
          created_at?: string
          created_by?: string | null
          funding_source_id?: string | null
          funding_source_list?: string
          id?: string
          name: string
          organisation_id: string
          project_id: string
          sort_order?: number
          spend_type?: Database["public"]["Enums"]["spend_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string
          category_list?: string
          created_at?: string
          created_by?: string | null
          funding_source_id?: string | null
          funding_source_list?: string
          id?: string
          name?: string
          organisation_id?: string
          project_id?: string
          sort_order?: number
          spend_type?: Database["public"]["Enums"]["spend_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_lines_category_id_organisation_id_category_list_fkey"
            columns: ["category_id", "organisation_id", "category_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "cost_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_lines_funding_source_id_organisation_id_funding_sourc_fkey"
            columns: [
              "funding_source_id",
              "organisation_id",
              "funding_source_list",
            ]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "cost_lines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "cost_lines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "cost_lines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "cost_lines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "cost_lines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "cost_lines_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "cost_lines_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_actions: {
        Row: {
          created_at: string
          created_by: string | null
          decision_id: string
          description: string
          due_date: string | null
          id: string
          organisation_id: string
          owner_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["action_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision_id: string
          description: string
          due_date?: string | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision_id?: string
          description?: string
          due_date?: string | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_actions_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "decision_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_actions_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_benefits: {
        Row: {
          benefit_id: string
          decision_id: string
          organisation_id: string
          project_id: string | null
          workspace_id: string
        }
        Insert: {
          benefit_id: string
          decision_id: string
          organisation_id: string
          project_id?: string | null
          workspace_id: string
        }
        Update: {
          benefit_id?: string
          decision_id?: string
          organisation_id?: string
          project_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_change_requests: {
        Row: {
          change_request_id: string
          decision_id: string
          organisation_id: string
          project_id: string | null
          workspace_id: string
        }
        Insert: {
          change_request_id: string
          decision_id: string
          organisation_id: string
          project_id?: string | null
          workspace_id: string
        }
        Update: {
          change_request_id?: string
          decision_id?: string
          organisation_id?: string
          project_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_change_requests_change_request_id_workspace_id_fkey"
            columns: ["change_request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_change_requests_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_dependencies: {
        Row: {
          decision_id: string
          dependency_id: string
          organisation_id: string
          project_id: string | null
          workspace_id: string
        }
        Insert: {
          decision_id: string
          dependency_id: string
          organisation_id: string
          project_id?: string | null
          workspace_id: string
        }
        Update: {
          decision_id?: string
          dependency_id?: string
          organisation_id?: string
          project_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_dependencies_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_dependency_id_workspace_id_fkey"
            columns: ["dependency_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "dependencies"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_dependency_id_workspace_id_fkey"
            columns: ["dependency_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dependency_health"
            referencedColumns: ["dependency_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_dependencies_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_issues: {
        Row: {
          decision_id: string
          issue_id: string
          organisation_id: string
          project_id: string | null
          workspace_id: string
        }
        Insert: {
          decision_id: string
          issue_id: string
          organisation_id: string
          project_id?: string | null
          workspace_id: string
        }
        Update: {
          decision_id?: string
          issue_id?: string
          organisation_id?: string
          project_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_issues_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_issue_id_workspace_id_fkey"
            columns: ["issue_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_issues_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_options: {
        Row: {
          cons: string[]
          created_at: string
          created_by: string | null
          decision_id: string
          id: string
          organisation_id: string
          project_id: string | null
          pros: string[]
          sort_order: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cons?: string[]
          created_at?: string
          created_by?: string | null
          decision_id: string
          id?: string
          organisation_id: string
          project_id?: string | null
          pros?: string[]
          sort_order?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cons?: string[]
          created_at?: string
          created_by?: string | null
          decision_id?: string
          id?: string
          organisation_id?: string
          project_id?: string | null
          pros?: string[]
          sort_order?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_options_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_options_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decision_risks: {
        Row: {
          decision_id: string
          organisation_id: string
          project_id: string | null
          risk_id: string
          workspace_id: string
        }
        Insert: {
          decision_id: string
          organisation_id: string
          project_id?: string | null
          risk_id: string
          workspace_id: string
        }
        Update: {
          decision_id?: string
          organisation_id?: string
          project_id?: string | null
          risk_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_risks_decision_id_workspace_id_fkey"
            columns: ["decision_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_risk_id_workspace_id_fkey"
            columns: ["risk_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decision_risks_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      decisions: {
        Row: {
          chosen_option_id: string | null
          context: string | null
          created_at: string
          created_by: string | null
          decision_date: string | null
          decision_maker_id: string | null
          evidence_link: string | null
          forum_id: string | null
          forum_list: string
          id: string
          impact_benefits: boolean
          impact_benefits_note: string | null
          impact_cost: boolean
          impact_cost_note: string | null
          impact_scope: boolean
          impact_scope_note: string | null
          impact_time: boolean
          impact_time_note: string | null
          needed_by_date: string | null
          organisation_id: string
          portfolio_id: string | null
          programme_id: string | null
          project_id: string | null
          rationale: string | null
          ref: string
          status: Database["public"]["Enums"]["decision_status"]
          supersedes_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          chosen_option_id?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          decision_date?: string | null
          decision_maker_id?: string | null
          evidence_link?: string | null
          forum_id?: string | null
          forum_list?: string
          id?: string
          impact_benefits?: boolean
          impact_benefits_note?: string | null
          impact_cost?: boolean
          impact_cost_note?: string | null
          impact_scope?: boolean
          impact_scope_note?: string | null
          impact_time?: boolean
          impact_time_note?: string | null
          needed_by_date?: string | null
          organisation_id: string
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          rationale?: string | null
          ref: string
          status?: Database["public"]["Enums"]["decision_status"]
          supersedes_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          chosen_option_id?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          decision_date?: string | null
          decision_maker_id?: string | null
          evidence_link?: string | null
          forum_id?: string | null
          forum_list?: string
          id?: string
          impact_benefits?: boolean
          impact_benefits_note?: string | null
          impact_cost?: boolean
          impact_cost_note?: string | null
          impact_scope?: boolean
          impact_scope_note?: string | null
          impact_time?: boolean
          impact_time_note?: string | null
          needed_by_date?: string | null
          organisation_id?: string
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          rationale?: string | null
          ref?: string
          status?: Database["public"]["Enums"]["decision_status"]
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_chosen_option_fkey"
            columns: ["chosen_option_id", "id"]
            isOneToOne: false
            referencedRelation: "decision_options"
            referencedColumns: ["id", "decision_id"]
          },
          {
            foreignKeyName: "decisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_decision_maker_id_organisation_id_fkey"
            columns: ["decision_maker_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "decisions_forum_id_organisation_id_forum_list_fkey"
            columns: ["forum_id", "organisation_id", "forum_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "decisions_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_supersedes_id_workspace_id_fkey"
            columns: ["supersedes_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "decisions_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          criticality: Database["public"]["Enums"]["criticality"]
          description: string
          giver_accepted: boolean
          giver_external_name: string | null
          giver_milestone_id: string | null
          giver_owner_id: string | null
          giver_programme_id: string | null
          giver_project_id: string | null
          health_override: Database["public"]["Enums"]["health"] | null
          health_override_reason: string | null
          id: string
          organisation_id: string
          raised_by_id: string | null
          raised_date: string
          receiver_accepted: boolean
          receiver_external_name: string | null
          receiver_milestone_id: string | null
          receiver_owner_id: string | null
          receiver_programme_id: string | null
          receiver_project_id: string | null
          ref: string
          required_by_date: string
          type: Database["public"]["Enums"]["dependency_type"]
          updated_at: string
          validation: Database["public"]["Enums"]["dependency_validation"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality"]
          description: string
          giver_accepted?: boolean
          giver_external_name?: string | null
          giver_milestone_id?: string | null
          giver_owner_id?: string | null
          giver_programme_id?: string | null
          giver_project_id?: string | null
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          organisation_id: string
          raised_by_id?: string | null
          raised_date?: string
          receiver_accepted?: boolean
          receiver_external_name?: string | null
          receiver_milestone_id?: string | null
          receiver_owner_id?: string | null
          receiver_programme_id?: string | null
          receiver_project_id?: string | null
          ref: string
          required_by_date: string
          type?: Database["public"]["Enums"]["dependency_type"]
          updated_at?: string
          validation?: Database["public"]["Enums"]["dependency_validation"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality"]
          description?: string
          giver_accepted?: boolean
          giver_external_name?: string | null
          giver_milestone_id?: string | null
          giver_owner_id?: string | null
          giver_programme_id?: string | null
          giver_project_id?: string | null
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          organisation_id?: string
          raised_by_id?: string | null
          raised_date?: string
          receiver_accepted?: boolean
          receiver_external_name?: string | null
          receiver_milestone_id?: string | null
          receiver_owner_id?: string | null
          receiver_programme_id?: string | null
          receiver_project_id?: string | null
          ref?: string
          required_by_date?: string
          type?: Database["public"]["Enums"]["dependency_type"]
          updated_at?: string
          validation?: Database["public"]["Enums"]["dependency_validation"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_giver_milestone_id_workspace_id_fkey"
            columns: ["giver_milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_milestone_id_workspace_id_fkey"
            columns: ["giver_milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_owner_id_organisation_id_fkey"
            columns: ["giver_owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "dependencies_giver_programme_id_workspace_id_fkey"
            columns: ["giver_programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_programme_id_workspace_id_fkey"
            columns: ["giver_programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_programme_id_workspace_id_fkey"
            columns: ["giver_programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_project_id_workspace_id_fkey"
            columns: ["giver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_project_id_workspace_id_fkey"
            columns: ["giver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_project_id_workspace_id_fkey"
            columns: ["giver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_project_id_workspace_id_fkey"
            columns: ["giver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_project_id_workspace_id_fkey"
            columns: ["giver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_giver_project_id_workspace_id_fkey"
            columns: ["giver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_raised_by_id_organisation_id_fkey"
            columns: ["raised_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_milestone_id_workspace_id_fkey"
            columns: ["receiver_milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_milestone_id_workspace_id_fkey"
            columns: ["receiver_milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_owner_id_organisation_id_fkey"
            columns: ["receiver_owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_programme_id_workspace_id_fkey"
            columns: ["receiver_programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_programme_id_workspace_id_fkey"
            columns: ["receiver_programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_programme_id_workspace_id_fkey"
            columns: ["receiver_programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_project_id_workspace_id_fkey"
            columns: ["receiver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_project_id_workspace_id_fkey"
            columns: ["receiver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_project_id_workspace_id_fkey"
            columns: ["receiver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_project_id_workspace_id_fkey"
            columns: ["receiver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_project_id_workspace_id_fkey"
            columns: ["receiver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_receiver_project_id_workspace_id_fkey"
            columns: ["receiver_project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependencies_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      dependency_issues: {
        Row: {
          dependency_id: string
          issue_id: string
          organisation_id: string
          workspace_id: string
        }
        Insert: {
          dependency_id: string
          issue_id: string
          organisation_id: string
          workspace_id: string
        }
        Update: {
          dependency_id?: string
          issue_id?: string
          organisation_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependency_issues_dependency_id_workspace_id_fkey"
            columns: ["dependency_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "dependencies"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependency_issues_dependency_id_workspace_id_fkey"
            columns: ["dependency_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dependency_health"
            referencedColumns: ["dependency_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependency_issues_issue_id_workspace_id_fkey"
            columns: ["issue_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependency_issues_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      dependency_risks: {
        Row: {
          dependency_id: string
          organisation_id: string
          risk_id: string
          workspace_id: string
        }
        Insert: {
          dependency_id: string
          organisation_id: string
          risk_id: string
          workspace_id: string
        }
        Update: {
          dependency_id?: string
          organisation_id?: string
          risk_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependency_risks_dependency_id_workspace_id_fkey"
            columns: ["dependency_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "dependencies"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependency_risks_dependency_id_workspace_id_fkey"
            columns: ["dependency_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_dependency_health"
            referencedColumns: ["dependency_id", "workspace_id"]
          },
          {
            foreignKeyName: "dependency_risks_risk_id_workspace_id_fkey"
            columns: ["risk_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "dependency_risks_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          business_case_id: string | null
          capability_id: string | null
          created_at: string
          file_name: string
          id: string
          mime_type: string
          organisation_id: string
          programme_id: string | null
          project_id: string | null
          scope: Database["public"]["Enums"]["document_scope"]
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          business_case_id?: string | null
          capability_id?: string | null
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          organisation_id: string
          programme_id?: string | null
          project_id?: string | null
          scope: Database["public"]["Enums"]["document_scope"]
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          business_case_id?: string | null
          capability_id?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          organisation_id?: string
          programme_id?: string | null
          project_id?: string | null
          scope?: Database["public"]["Enums"]["document_scope"]
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_case_fk"
            columns: ["business_case_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "business_cases"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_capability_health"
            referencedColumns: ["capability_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          effective_date: string
          id: string
          organisation_id: string
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: string
          effective_date: string
          id?: string
          organisation_id: string
          rate: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_date?: string
          id?: string
          organisation_id?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_rates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_forecast_history: {
        Row: {
          actual_to_date: number
          budget: number
          captured_at: string
          eac: number
          forecast_remaining: number
          has_baseline: boolean
          organisation_id: string
          project_id: string
          reporting_month: string
          source: Database["public"]["Enums"]["forecast_capture_source"]
          workspace_id: string
        }
        Insert: {
          actual_to_date: number
          budget: number
          captured_at?: string
          eac: number
          forecast_remaining: number
          has_baseline: boolean
          organisation_id: string
          project_id: string
          reporting_month: string
          source: Database["public"]["Enums"]["forecast_capture_source"]
          workspace_id: string
        }
        Update: {
          actual_to_date?: number
          budget?: number
          captured_at?: string
          eac?: number
          forecast_remaining?: number
          has_baseline?: boolean
          organisation_id?: string
          project_id?: string
          reporting_month?: string
          source?: Database["public"]["Enums"]["forecast_capture_source"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_forecast_history_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          organisation_id: string
          period_month: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          organisation_id: string
          period_month: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          organisation_id?: string
          period_month?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_periods_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_periods_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_values: {
        Row: {
          amount: number
          cost_line_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["financial_kind"]
          organisation_id: string
          period_month: string
          project_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          cost_line_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["financial_kind"]
          organisation_id: string
          period_month: string
          project_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          cost_line_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["financial_kind"]
          organisation_id?: string
          period_month?: string
          project_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_values_cost_line_id_project_id_fkey"
            columns: ["cost_line_id", "project_id"]
            isOneToOne: false
            referencedRelation: "cost_lines"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "financial_values_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_values_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_values_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_values_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_values_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_values_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_values_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "financial_values_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      gate_criteria: {
        Row: {
          check_key: Database["public"]["Enums"]["gate_check_key"] | null
          created_at: string
          created_by: string | null
          document: string | null
          id: string
          label: string
          organisation_id: string
          phase_id: string
          sort_order: number
          tiers: Database["public"]["Enums"]["project_tier"][]
          updated_at: string
        }
        Insert: {
          check_key?: Database["public"]["Enums"]["gate_check_key"] | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          id?: string
          label: string
          organisation_id: string
          phase_id: string
          sort_order?: number
          tiers?: Database["public"]["Enums"]["project_tier"][]
          updated_at?: string
        }
        Update: {
          check_key?: Database["public"]["Enums"]["gate_check_key"] | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          id?: string
          label?: string
          organisation_id?: string
          phase_id?: string
          sort_order?: number
          tiers?: Database["public"]["Enums"]["project_tier"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_criteria_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_criteria_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_criteria_phase_id_organisation_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      health_snapshots: {
        Row: {
          benefit: Database["public"]["Enums"]["health"] | null
          created_at: string
          effort: Database["public"]["Enums"]["health"] | null
          financial: Database["public"]["Enums"]["health"] | null
          forecast_basis: string
          forecast_finish_date: string | null
          id: string
          is_synthetic: boolean
          issue: Database["public"]["Enums"]["health"] | null
          metrics: Json
          organisation_id: string
          overall: Database["public"]["Enums"]["health"]
          portfolio_id: string | null
          programme_id: string | null
          project_id: string | null
          schedule: Database["public"]["Enums"]["health"] | null
          snapshot_date: string
          source: string
          workspace_id: string
        }
        Insert: {
          benefit?: Database["public"]["Enums"]["health"] | null
          created_at?: string
          effort?: Database["public"]["Enums"]["health"] | null
          financial?: Database["public"]["Enums"]["health"] | null
          forecast_basis?: string
          forecast_finish_date?: string | null
          id?: string
          is_synthetic?: boolean
          issue?: Database["public"]["Enums"]["health"] | null
          metrics?: Json
          organisation_id: string
          overall: Database["public"]["Enums"]["health"]
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          schedule?: Database["public"]["Enums"]["health"] | null
          snapshot_date: string
          source?: string
          workspace_id: string
        }
        Update: {
          benefit?: Database["public"]["Enums"]["health"] | null
          created_at?: string
          effort?: Database["public"]["Enums"]["health"] | null
          financial?: Database["public"]["Enums"]["health"] | null
          forecast_basis?: string
          forecast_finish_date?: string | null
          id?: string
          is_synthetic?: boolean
          issue?: Database["public"]["Enums"]["health"] | null
          metrics?: Json
          organisation_id?: string
          overall?: Database["public"]["Enums"]["health"]
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          schedule?: Database["public"]["Enums"]["health"] | null
          snapshot_date?: string
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_snapshots_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "health_snapshots_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      holiday_calendars: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organisation_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organisation_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_calendars_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_calendars_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_dates: {
        Row: {
          calendar_id: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          name: string
          organisation_id: string
          updated_at: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          name: string
          organisation_id: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          name?: string
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_dates_calendar_id_organisation_id_fkey"
            columns: ["calendar_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "holiday_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_dates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_actions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          embedded_in: string | null
          id: string
          lesson_id: string
          organisation_id: string
          owner_id: string | null
          project_id: string
          ref: string
          status: Database["public"]["Enums"]["action_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          embedded_in?: string | null
          id?: string
          lesson_id: string
          organisation_id: string
          owner_id?: string | null
          project_id: string
          ref: string
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          embedded_in?: string | null
          id?: string
          lesson_id?: string
          organisation_id?: string
          owner_id?: string | null
          project_id?: string
          ref?: string
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvement_actions_lesson_id_workspace_id_fkey"
            columns: ["lesson_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "improvement_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "improvement_actions_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      issues: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          organisation_id: string
          owner_id: string | null
          portfolio_id: string | null
          programme_id: string | null
          project_id: string | null
          ref: string
          severity: Database["public"]["Enums"]["issue_severity"]
          status: Database["public"]["Enums"]["open_closed"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          ref: string
          severity?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["open_closed"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          portfolio_id?: string | null
          programme_id?: string | null
          project_id?: string | null
          ref?: string
          severity?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["open_closed"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "issues_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "issues_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      lesson_project_types: {
        Row: {
          lesson_id: string
          organisation_id: string
          project_id: string
          project_type_id: string
          project_type_list: string
          workspace_id: string
        }
        Insert: {
          lesson_id: string
          organisation_id: string
          project_id: string
          project_type_id: string
          project_type_list?: string
          workspace_id: string
        }
        Update: {
          lesson_id?: string
          organisation_id?: string
          project_id?: string
          project_type_id?: string
          project_type_list?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_project_types_lesson_id_workspace_id_fkey"
            columns: ["lesson_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "lesson_project_types_project_type_id_organisation_id_proje_fkey"
            columns: ["project_type_id", "organisation_id", "project_type_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "lesson_project_types_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      lessons: {
        Row: {
          applicability: Database["public"]["Enums"]["lesson_applicability"]
          category_id: string
          category_list: string
          created_at: string
          created_by: string | null
          id: string
          impact: string | null
          organisation_id: string
          phase_id: string | null
          project_id: string
          raised_by_id: string | null
          raised_date: string
          recommendation: string | null
          ref: string
          root_cause: string | null
          sprint_name: string | null
          status: Database["public"]["Enums"]["lesson_status"]
          summary: string
          type: Database["public"]["Enums"]["lesson_type"]
          updated_at: string
          what_happened: string | null
          workspace_id: string
        }
        Insert: {
          applicability?: Database["public"]["Enums"]["lesson_applicability"]
          category_id: string
          category_list?: string
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string | null
          organisation_id: string
          phase_id?: string | null
          project_id: string
          raised_by_id?: string | null
          raised_date?: string
          recommendation?: string | null
          ref: string
          root_cause?: string | null
          sprint_name?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          summary: string
          type: Database["public"]["Enums"]["lesson_type"]
          updated_at?: string
          what_happened?: string | null
          workspace_id: string
        }
        Update: {
          applicability?: Database["public"]["Enums"]["lesson_applicability"]
          category_id?: string
          category_list?: string
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string | null
          organisation_id?: string
          phase_id?: string | null
          project_id?: string
          raised_by_id?: string | null
          raised_date?: string
          recommendation?: string | null
          ref?: string
          root_cause?: string | null
          sprint_name?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          summary?: string
          type?: Database["public"]["Enums"]["lesson_type"]
          updated_at?: string
          what_happened?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_category_id_organisation_id_category_list_fkey"
            columns: ["category_id", "organisation_id", "category_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_phase_id_organisation_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "lessons_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "lessons_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lessons_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lessons_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lessons_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "lessons_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "lessons_raised_by_id_organisation_id_fkey"
            columns: ["raised_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "lessons_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      lifecycle_phases: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          gate_name: string | null
          id: string
          name: string
          organisation_id: string
          short_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          gate_name?: string | null
          id?: string
          name: string
          organisation_id: string
          short_name: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          gate_name?: string | null
          id?: string
          name?: string
          organisation_id?: string
          short_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_phases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_phases_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_values: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          list_key: string
          organisation_id: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          list_key: string
          organisation_id: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          list_key?: string
          organisation_id?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "lookup_values_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lookup_values_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_forecast_history: {
        Row: {
          created_at: string
          created_by: string | null
          forecast_date: string
          id: string
          milestone_id: string
          organisation_id: string
          project_id: string
          reporting_date: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          forecast_date: string
          id?: string
          milestone_id: string
          organisation_id: string
          project_id: string
          reporting_date: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          forecast_date?: string
          id?: string
          milestone_id?: string
          organisation_id?: string
          project_id?: string
          reporting_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_forecast_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "milestone_forecast_history_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      milestones: {
        Row: {
          actual_date: string | null
          baseline_date: string
          created_at: string
          created_by: string | null
          forecast_date: string
          id: string
          organisation_id: string
          owner_id: string | null
          phase_id: string | null
          project_id: string
          ref: string
          report_to_committee: boolean
          title: string
          type: Database["public"]["Enums"]["milestone_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_date?: string | null
          baseline_date: string
          created_at?: string
          created_by?: string | null
          forecast_date: string
          id?: string
          organisation_id: string
          owner_id?: string | null
          phase_id?: string | null
          project_id: string
          ref: string
          report_to_committee?: boolean
          title: string
          type?: Database["public"]["Enums"]["milestone_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_date?: string | null
          baseline_date?: string
          created_at?: string
          created_by?: string | null
          forecast_date?: string
          id?: string
          organisation_id?: string
          owner_id?: string | null
          phase_id?: string | null
          project_id?: string
          ref?: string
          report_to_committee?: boolean
          title?: string
          type?: Database["public"]["Enums"]["milestone_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "milestones_phase_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      ms_connections: {
        Row: {
          admin_request_sent_to: string | null
          connected_by_id: string | null
          connected_on: string | null
          created_at: string
          created_by: string | null
          directory_people: number
          directory_synced_at: string | null
          environments: string[]
          organisation_id: string
          status: Database["public"]["Enums"]["ms_connection_status"]
          tenant_domain: string | null
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          admin_request_sent_to?: string | null
          connected_by_id?: string | null
          connected_on?: string | null
          created_at?: string
          created_by?: string | null
          directory_people?: number
          directory_synced_at?: string | null
          environments?: string[]
          organisation_id: string
          status?: Database["public"]["Enums"]["ms_connection_status"]
          tenant_domain?: string | null
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          admin_request_sent_to?: string | null
          connected_by_id?: string | null
          connected_on?: string | null
          created_at?: string
          created_by?: string | null
          directory_people?: number
          directory_synced_at?: string | null
          environments?: string[]
          organisation_id?: string
          status?: Database["public"]["Enums"]["ms_connection_status"]
          tenant_domain?: string | null
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ms_connections_connected_by_id_fkey"
            columns: ["connected_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ms_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ms_connections_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          created_at: string
          created_by: string | null
          organisation_id: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          organisation_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          organisation_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_subscriptions: {
        Row: {
          billing_contact: string | null
          created_at: string
          organisation_id: string
          plan: string
          renewal_date: string | null
          seats_total: number
          updated_at: string
        }
        Insert: {
          billing_contact?: string | null
          created_at?: string
          organisation_id: string
          plan?: string
          renewal_date?: string | null
          seats_total?: number
          updated_at?: string
        }
        Update: {
          billing_contact?: string | null
          created_at?: string
          organisation_id?: string
          plan?: string
          renewal_date?: string | null
          seats_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_subscriptions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          brand_colour: string | null
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          logo_path: string | null
          name: string
          region: string
          settings: Json
          short_name: string | null
          slug: string
          support_contact: string | null
          updated_at: string
        }
        Insert: {
          brand_colour?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          logo_path?: string | null
          name: string
          region?: string
          settings?: Json
          short_name?: string | null
          slug: string
          support_contact?: string | null
          updated_at?: string
        }
        Update: {
          brand_colour?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          logo_path?: string | null
          name?: string
          region?: string
          settings?: Json
          short_name?: string | null
          slug?: string
          support_contact?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_benefits: {
        Row: {
          benefit_id: string
          organisation_id: string
          outcome_id: string
          workspace_id: string
        }
        Insert: {
          benefit_id: string
          organisation_id: string
          outcome_id: string
          workspace_id: string
        }
        Update: {
          benefit_id?: string
          organisation_id?: string
          outcome_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_benefits_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_benefits_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_benefits_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_outcome_health"
            referencedColumns: ["outcome_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      outcome_capabilities: {
        Row: {
          capability_id: string
          organisation_id: string
          outcome_id: string
          workspace_id: string
        }
        Insert: {
          capability_id: string
          organisation_id: string
          outcome_id: string
          workspace_id: string
        }
        Update: {
          capability_id?: string
          organisation_id?: string
          outcome_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_capabilities_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_capabilities_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_capability_health"
            referencedColumns: ["capability_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_capabilities_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_capabilities_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_outcome_health"
            referencedColumns: ["outcome_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_capabilities_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      outcome_indicator_measurements: {
        Row: {
          actual_value: number
          created_at: string
          created_by: string | null
          evidence: string | null
          evidence_path: string | null
          id: string
          indicator_id: string
          measured_on: string
          notes: string | null
          organisation_id: string
          query_note: string | null
          status: Database["public"]["Enums"]["measurement_status"]
          submitted_by_id: string | null
          submitted_date: string | null
          updated_at: string
          validated_by_id: string | null
          validated_date: string | null
          workspace_id: string
        }
        Insert: {
          actual_value: number
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          evidence_path?: string | null
          id?: string
          indicator_id: string
          measured_on: string
          notes?: string | null
          organisation_id: string
          query_note?: string | null
          status?: Database["public"]["Enums"]["measurement_status"]
          submitted_by_id?: string | null
          submitted_date?: string | null
          updated_at?: string
          validated_by_id?: string | null
          validated_date?: string | null
          workspace_id: string
        }
        Update: {
          actual_value?: number
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          evidence_path?: string | null
          id?: string
          indicator_id?: string
          measured_on?: string
          notes?: string | null
          organisation_id?: string
          query_note?: string | null
          status?: Database["public"]["Enums"]["measurement_status"]
          submitted_by_id?: string | null
          submitted_date?: string | null
          updated_at?: string
          validated_by_id?: string | null
          validated_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_indicator_measurement_submitted_by_id_organisation_fkey"
            columns: ["submitted_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "outcome_indicator_measurement_validated_by_id_organisation_fkey"
            columns: ["validated_by_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "outcome_indicator_measurement_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "outcome_indicator_measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_indicator_measurements_indicator_id_workspace_id_fkey"
            columns: ["indicator_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "outcome_indicators"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_indicator_measurements_indicator_id_workspace_id_fkey"
            columns: ["indicator_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_outcome_indicator_health"
            referencedColumns: ["indicator_id", "workspace_id"]
          },
        ]
      }
      outcome_indicators: {
        Row: {
          baseline_date: string
          baseline_value: number
          created_at: string
          created_by: string | null
          data_source: string | null
          frequency: Database["public"]["Enums"]["measure_frequency"]
          id: string
          measurement_method: string | null
          name: string
          next_due_date: string | null
          organisation_id: string
          outcome_id: string
          sort_order: number
          target_date: string
          target_value: number
          unit: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          baseline_date: string
          baseline_value: number
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          frequency?: Database["public"]["Enums"]["measure_frequency"]
          id?: string
          measurement_method?: string | null
          name: string
          next_due_date?: string | null
          organisation_id: string
          outcome_id: string
          sort_order?: number
          target_date: string
          target_value: number
          unit?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          baseline_date?: string
          baseline_value?: number
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          frequency?: Database["public"]["Enums"]["measure_frequency"]
          id?: string
          measurement_method?: string | null
          name?: string
          next_due_date?: string | null
          organisation_id?: string
          outcome_id?: string
          sort_order?: number
          target_date?: string
          target_value?: number
          unit?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_indicators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_indicators_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_indicators_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_outcome_health"
            referencedColumns: ["outcome_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_indicators_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      outcomes: {
        Row: {
          achieved_date: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          organisation_id: string
          owner_id: string | null
          programme_id: string
          status: Database["public"]["Enums"]["outcome_status"]
          target_date: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          achieved_date?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          programme_id: string
          status?: Database["public"]["Enums"]["outcome_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          achieved_date?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          programme_id?: string
          status?: Database["public"]["Enums"]["outcome_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcomes_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "outcomes_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcomes_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcomes_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcomes_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      pathway_snapshots: {
        Row: {
          benefit_id: string | null
          capability_id: string | null
          created_at: string
          due_in_fy: boolean
          fy_profile_value: number | null
          id: string
          is_complete: boolean
          is_synthetic: boolean
          organisation_id: string
          outcome_id: string | null
          phase: string | null
          programme_id: string | null
          rag: Database["public"]["Enums"]["health"]
          realised_value: number | null
          snapshot_date: string
          workspace_id: string
        }
        Insert: {
          benefit_id?: string | null
          capability_id?: string | null
          created_at?: string
          due_in_fy?: boolean
          fy_profile_value?: number | null
          id?: string
          is_complete?: boolean
          is_synthetic?: boolean
          organisation_id: string
          outcome_id?: string | null
          phase?: string | null
          programme_id?: string | null
          rag: Database["public"]["Enums"]["health"]
          realised_value?: number | null
          snapshot_date: string
          workspace_id: string
        }
        Update: {
          benefit_id?: string | null
          capability_id?: string | null
          created_at?: string
          due_in_fy?: boolean
          fy_profile_value?: number | null
          id?: string
          is_complete?: boolean
          is_synthetic?: boolean
          organisation_id?: string
          outcome_id?: string | null
          phase?: string | null
          programme_id?: string | null
          rag?: Database["public"]["Enums"]["health"]
          realised_value?: number | null
          snapshot_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathway_snapshots_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_period_values"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_readiness"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_benefit_id_workspace_id_fkey"
            columns: ["benefit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_benefit_realisation"
            referencedColumns: ["benefit_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_capability_id_workspace_id_fkey"
            columns: ["capability_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_capability_health"
            referencedColumns: ["capability_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_outcome_health"
            referencedColumns: ["outcome_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "pathway_snapshots_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      phase_lessons_review_attendees: {
        Row: {
          organisation_id: string
          project_id: string
          resource_id: string
          review_id: string
          workspace_id: string
        }
        Insert: {
          organisation_id: string
          project_id: string
          resource_id: string
          review_id: string
          workspace_id: string
        }
        Update: {
          organisation_id?: string
          project_id?: string
          resource_id?: string
          review_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_lessons_review_attendee_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_resource_id_organisation_id_fkey"
            columns: ["resource_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "phase_lessons_review_attendees_review_id_workspace_id_fkey"
            columns: ["review_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "phase_lessons_reviews"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      phase_lessons_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          facilitator_id: string | null
          id: string
          organisation_id: string
          phase_id: string
          project_id: string
          review_date: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          facilitator_id?: string | null
          id?: string
          organisation_id: string
          phase_id: string
          project_id: string
          review_date: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          facilitator_id?: string | null
          id?: string
          organisation_id?: string
          phase_id?: string
          project_id?: string
          review_date?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_lessons_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_facilitator_id_organisation_id_fkey"
            columns: ["facilitator_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_phase_id_organisation_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "phase_lessons_reviews_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      portfolios: {
        Row: {
          archived_at: string | null
          budget: number
          closed_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          health_override: Database["public"]["Enums"]["health"] | null
          health_override_reason: string | null
          id: string
          name: string
          organisation_id: string
          owner_id: string | null
          state: Database["public"]["Enums"]["entity_state"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          budget?: number
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          name: string
          organisation_id: string
          owner_id?: string | null
          state?: Database["public"]["Enums"]["entity_state"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          budget?: number
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          name?: string
          organisation_id?: string
          owner_id?: string | null
          state?: Database["public"]["Enums"]["entity_state"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "portfolios_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          last_organisation_id: string | null
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          last_organisation_id?: string | null
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          last_organisation_id?: string | null
          preferences?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_organisation_id_fkey"
            columns: ["last_organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      programmes: {
        Row: {
          archived_at: string | null
          budget: number
          closed_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          finish_date: string | null
          health_override: Database["public"]["Enums"]["health"] | null
          health_override_reason: string | null
          id: string
          manager_id: string | null
          name: string
          organisation_id: string
          portfolio_id: string
          project_manager_id: string | null
          project_officer_id: string | null
          sponsor_id: string | null
          start_date: string | null
          state: Database["public"]["Enums"]["entity_state"]
          updated_at: string
          value_statement: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          budget?: number
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          finish_date?: string | null
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          manager_id?: string | null
          name: string
          organisation_id: string
          portfolio_id: string
          project_manager_id?: string | null
          project_officer_id?: string | null
          sponsor_id?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["entity_state"]
          updated_at?: string
          value_statement?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          budget?: number
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          finish_date?: string | null
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          organisation_id?: string
          portfolio_id?: string
          project_manager_id?: string | null
          project_officer_id?: string | null
          sponsor_id?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["entity_state"]
          updated_at?: string
          value_statement?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programmes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programmes_manager_id_organisation_id_fkey"
            columns: ["manager_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_project_manager_id_organisation_id_fkey"
            columns: ["project_manager_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "programmes_project_officer_id_organisation_id_fkey"
            columns: ["project_officer_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "programmes_sponsor_id_organisation_id_fkey"
            columns: ["sponsor_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "programmes_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      project_buckets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organisation_id: string
          project_id: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organisation_id: string
          project_id: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organisation_id?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_buckets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_buckets_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_buckets_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_buckets_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_buckets_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_buckets_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_buckets_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_buckets_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      project_plan_links: {
        Row: {
          created_at: string
          created_by: string | null
          health: Database["public"]["Enums"]["sync_health"]
          kind: Database["public"]["Enums"]["plan_kind"]
          last_sync_at: string | null
          mode: Database["public"]["Enums"]["sync_mode"]
          organisation_id: string
          plan_id: string
          project_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["sync_health"]
          kind: Database["public"]["Enums"]["plan_kind"]
          last_sync_at?: string | null
          mode?: Database["public"]["Enums"]["sync_mode"]
          organisation_id: string
          plan_id: string
          project_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["sync_health"]
          kind?: Database["public"]["Enums"]["plan_kind"]
          last_sync_at?: string | null
          mode?: Database["public"]["Enums"]["sync_mode"]
          organisation_id?: string
          plan_id?: string
          project_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_plan_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_plan_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_plan_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_plan_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_plan_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_plan_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_plan_links_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      project_requests: {
        Row: {
          alignment: number | null
          appraisal_years: number | null
          created_at: string
          created_by: string | null
          estimated_benefit: number
          estimated_cost: number
          id: string
          organisation_id: string
          portfolio_id: string
          priority: Database["public"]["Enums"]["priority"]
          ref: string
          requester_id: string | null
          sponsor_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          themes: string[]
          title: string
          updated_at: string
          whole_life_cost: number | null
          workspace_id: string
        }
        Insert: {
          alignment?: number | null
          appraisal_years?: number | null
          created_at?: string
          created_by?: string | null
          estimated_benefit?: number
          estimated_cost?: number
          id?: string
          organisation_id: string
          portfolio_id: string
          priority?: Database["public"]["Enums"]["priority"]
          ref: string
          requester_id?: string | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          themes?: string[]
          title: string
          updated_at?: string
          whole_life_cost?: number | null
          workspace_id: string
        }
        Update: {
          alignment?: number | null
          appraisal_years?: number | null
          created_at?: string
          created_by?: string | null
          estimated_benefit?: number
          estimated_cost?: number
          id?: string
          organisation_id?: string
          portfolio_id?: string
          priority?: Database["public"]["Enums"]["priority"]
          ref?: string
          requester_id?: string | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          themes?: string[]
          title?: string
          updated_at?: string
          whole_life_cost?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_requests_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_requests_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_requests_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_requests_requester_id_organisation_id_fkey"
            columns: ["requester_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "project_requests_sponsor_id_organisation_id_fkey"
            columns: ["sponsor_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "project_requests_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      project_team_members: {
        Row: {
          allocated_effort_hours: number
          created_at: string
          created_by: string | null
          finish_date: string | null
          id: string
          organisation_id: string
          project_id: string
          resource_id: string
          role: Database["public"]["Enums"]["project_role"]
          start_date: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_effort_hours?: number
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          id?: string
          organisation_id: string
          project_id: string
          resource_id: string
          role: Database["public"]["Enums"]["project_role"]
          start_date?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_effort_hours?: number
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          id?: string
          organisation_id?: string
          project_id?: string
          resource_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          start_date?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "project_team_members_resource_id_organisation_id_fkey"
            columns: ["resource_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "project_team_members_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      project_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organisation_id: string
          task_buckets: string[]
          tier: Database["public"]["Enums"]["project_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organisation_id: string
          task_buckets?: string[]
          tier: Database["public"]["Enums"]["project_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organisation_id?: string
          task_buckets?: string[]
          tier?: Database["public"]["Enums"]["project_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_templates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual: number
          archived_at: string | null
          baseline_finish_date: string | null
          benefits_summary: string | null
          budget: number
          business_case: string | null
          closed_reason: string | null
          code: string
          converted_from_request_id: string | null
          created_at: string
          created_by: string | null
          finish_date: string | null
          forecast: number
          health_override: Database["public"]["Enums"]["health"] | null
          health_override_reason: string | null
          id: string
          manager_id: string | null
          name: string
          organisation_id: string
          phase_id: string | null
          portfolio_id: string | null
          priority: Database["public"]["Enums"]["priority"]
          programme_id: string | null
          project_officer_id: string | null
          reporting_cadence: Database["public"]["Enums"]["reporting_cadence"]
          sponsor_id: string | null
          start_date: string | null
          state: Database["public"]["Enums"]["project_state"]
          task_source: Database["public"]["Enums"]["task_source"]
          tier: Database["public"]["Enums"]["project_tier"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual?: number
          archived_at?: string | null
          baseline_finish_date?: string | null
          benefits_summary?: string | null
          budget?: number
          business_case?: string | null
          closed_reason?: string | null
          code: string
          converted_from_request_id?: string | null
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          forecast?: number
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          manager_id?: string | null
          name: string
          organisation_id: string
          phase_id?: string | null
          portfolio_id?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          programme_id?: string | null
          project_officer_id?: string | null
          reporting_cadence?: Database["public"]["Enums"]["reporting_cadence"]
          sponsor_id?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["project_state"]
          task_source?: Database["public"]["Enums"]["task_source"]
          tier?: Database["public"]["Enums"]["project_tier"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual?: number
          archived_at?: string | null
          baseline_finish_date?: string | null
          benefits_summary?: string | null
          budget?: number
          business_case?: string | null
          closed_reason?: string | null
          code?: string
          converted_from_request_id?: string | null
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          forecast?: number
          health_override?: Database["public"]["Enums"]["health"] | null
          health_override_reason?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          organisation_id?: string
          phase_id?: string | null
          portfolio_id?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          programme_id?: string | null
          project_officer_id?: string | null
          reporting_cadence?: Database["public"]["Enums"]["reporting_cadence"]
          sponsor_id?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["project_state"]
          task_source?: Database["public"]["Enums"]["task_source"]
          tier?: Database["public"]["Enums"]["project_tier"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_converted_from_request_fkey"
            columns: ["converted_from_request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "project_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_id_organisation_id_fkey"
            columns: ["manager_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_phase_id_organisation_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_project_officer_id_organisation_id_fkey"
            columns: ["project_officer_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_sponsor_id_organisation_id_fkey"
            columns: ["sponsor_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      request_benefit_drafts: {
        Row: {
          annual_value: number
          baseline: string | null
          category_id: string
          category_list: string
          classification: Database["public"]["Enums"]["benefit_classification"]
          created_at: string
          created_by: string | null
          id: string
          measure: string | null
          organisation_id: string
          owner_id: string | null
          request_id: string
          sort_order: number
          strategic_objective_id: string | null
          target: string | null
          title: string
          updated_at: string
          workspace_id: string
          years_counted: number
        }
        Insert: {
          annual_value?: number
          baseline?: string | null
          category_id: string
          category_list?: string
          classification: Database["public"]["Enums"]["benefit_classification"]
          created_at?: string
          created_by?: string | null
          id?: string
          measure?: string | null
          organisation_id: string
          owner_id?: string | null
          request_id: string
          sort_order?: number
          strategic_objective_id?: string | null
          target?: string | null
          title: string
          updated_at?: string
          workspace_id: string
          years_counted?: number
        }
        Update: {
          annual_value?: number
          baseline?: string | null
          category_id?: string
          category_list?: string
          classification?: Database["public"]["Enums"]["benefit_classification"]
          created_at?: string
          created_by?: string | null
          id?: string
          measure?: string | null
          organisation_id?: string
          owner_id?: string | null
          request_id?: string
          sort_order?: number
          strategic_objective_id?: string | null
          target?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
          years_counted?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_benefit_drafts_category_id_organisation_id_categor_fkey"
            columns: ["category_id", "organisation_id", "category_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
          {
            foreignKeyName: "request_benefit_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_benefit_drafts_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "request_benefit_drafts_request_id_workspace_id_fkey"
            columns: ["request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "project_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "request_benefit_drafts_strategic_objective_id_workspace_id_fkey"
            columns: ["strategic_objective_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "strategic_objectives"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "request_benefit_drafts_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      resource_assignments: {
        Row: {
          booking_type: Database["public"]["Enums"]["booking_type"]
          created_at: string
          created_by: string | null
          finish_date: string
          hours_per_week: number
          id: string
          organisation_id: string
          project_id: string
          resource_id: string
          role: string | null
          start_date: string
          updated_at: string
          work_item_id: string | null
          workspace_id: string
        }
        Insert: {
          booking_type?: Database["public"]["Enums"]["booking_type"]
          created_at?: string
          created_by?: string | null
          finish_date: string
          hours_per_week: number
          id?: string
          organisation_id: string
          project_id: string
          resource_id: string
          role?: string | null
          start_date: string
          updated_at?: string
          work_item_id?: string | null
          workspace_id: string
        }
        Update: {
          booking_type?: Database["public"]["Enums"]["booking_type"]
          created_at?: string
          created_by?: string | null
          finish_date?: string
          hours_per_week?: number
          id?: string
          organisation_id?: string
          project_id?: string
          resource_id?: string
          role?: string | null
          start_date?: string
          updated_at?: string
          work_item_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_assignments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "resource_assignments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "resource_assignments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "resource_assignments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "resource_assignments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "resource_assignments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "resource_assignments_resource_id_organisation_id_fkey"
            columns: ["resource_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "resource_assignments_work_item_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "resource_assignments_work_item_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "resource_assignments_work_item_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "resource_assignments_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      resource_leave: {
        Row: {
          created_at: string
          created_by: string | null
          finish_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          organisation_id: string
          resource_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finish_date: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          organisation_id: string
          resource_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finish_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          organisation_id?: string
          resource_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_leave_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_leave_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_leave_resource_id_organisation_id_fkey"
            columns: ["resource_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      resource_skills: {
        Row: {
          level: number
          organisation_id: string
          resource_id: string
          skill_id: string
          skill_list: string
        }
        Insert: {
          level: number
          organisation_id: string
          resource_id: string
          skill_id: string
          skill_list?: string
        }
        Update: {
          level?: number
          organisation_id?: string
          resource_id?: string
          skill_id?: string
          skill_list?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_skills_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_skills_resource_id_organisation_id_fkey"
            columns: ["resource_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "resource_skills_skill_id_organisation_id_skill_list_fkey"
            columns: ["skill_id", "organisation_id", "skill_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
        ]
      }
      resources: {
        Row: {
          bau_percentage: number | null
          contracted_hours_per_week: number | null
          created_at: string
          created_by: string | null
          email: string | null
          fte: number | null
          id: string
          is_active: boolean
          is_bookable: boolean
          is_placeholder: boolean
          job_title: string | null
          line_manager_id: string | null
          name: string
          needs_staffing: boolean
          organisation_id: string
          placeholder_role: string | null
          profile_id: string | null
          team_id: string | null
          team_list: string
          updated_at: string
        }
        Insert: {
          bau_percentage?: number | null
          contracted_hours_per_week?: number | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          fte?: number | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean
          is_placeholder?: boolean
          job_title?: string | null
          line_manager_id?: string | null
          name: string
          needs_staffing?: boolean
          organisation_id: string
          placeholder_role?: string | null
          profile_id?: string | null
          team_id?: string | null
          team_list?: string
          updated_at?: string
        }
        Update: {
          bau_percentage?: number | null
          contracted_hours_per_week?: number | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          fte?: number | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean
          is_placeholder?: boolean
          job_title?: string | null
          line_manager_id?: string | null
          name?: string
          needs_staffing?: boolean
          organisation_id?: string
          placeholder_role?: string | null
          profile_id?: string | null
          team_id?: string | null
          team_list?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_line_manager_id_organisation_id_fkey"
            columns: ["line_manager_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "resources_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_organisation_id_profile_id_fkey"
            columns: ["organisation_id", "profile_id"]
            isOneToOne: true
            referencedRelation: "organisation_members"
            referencedColumns: ["organisation_id", "profile_id"]
          },
          {
            foreignKeyName: "resources_team_id_organisation_id_team_list_fkey"
            columns: ["team_id", "organisation_id", "team_list"]
            isOneToOne: false
            referencedRelation: "lookup_values"
            referencedColumns: ["id", "organisation_id", "list_key"]
          },
        ]
      }
      risks: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          impact: number
          organisation_id: string
          owner_id: string | null
          portfolio_id: string | null
          probability: number
          programme_id: string | null
          project_id: string | null
          ref: string
          response: Database["public"]["Enums"]["risk_response"]
          review_date: string | null
          score: number | null
          status: Database["public"]["Enums"]["open_closed"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          impact: number
          organisation_id: string
          owner_id?: string | null
          portfolio_id?: string | null
          probability: number
          programme_id?: string | null
          project_id?: string | null
          ref: string
          response?: Database["public"]["Enums"]["risk_response"]
          review_date?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["open_closed"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          impact?: number
          organisation_id?: string
          owner_id?: string | null
          portfolio_id?: string | null
          probability?: number
          programme_id?: string | null
          project_id?: string | null
          ref?: string
          response?: Database["public"]["Enums"]["risk_response"]
          review_date?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["open_closed"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risks_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "risks_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "risks_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      roadmap_item_collections: {
        Row: {
          collection_id: string
          organisation_id: string
          roadmap_item_id: string
          workspace_id: string
        }
        Insert: {
          collection_id: string
          organisation_id: string
          roadmap_item_id: string
          workspace_id: string
        }
        Update: {
          collection_id?: string
          organisation_id?: string
          roadmap_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_item_collections_collection_id_workspace_id_fkey"
            columns: ["collection_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_item_collections_roadmap_item_id_workspace_id_fkey"
            columns: ["roadmap_item_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_item_collections_roadmap_item_id_workspace_id_fkey"
            columns: ["roadmap_item_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_roadmap_items"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_item_collections_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          created_at: string
          created_by: string | null
          finish_date: string | null
          health: Database["public"]["Enums"]["health"] | null
          id: string
          organisation_id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["priority"] | null
          progress: number | null
          project_id: string | null
          roadmap_id: string
          row_id: string
          sort_order: number
          start_date: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          health?: Database["public"]["Enums"]["health"] | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["priority"] | null
          progress?: number | null
          project_id?: string | null
          roadmap_id: string
          row_id: string
          sort_order?: number
          start_date?: string | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          health?: Database["public"]["Enums"]["health"] | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["priority"] | null
          progress?: number | null
          project_id?: string | null
          roadmap_id?: string
          row_id?: string
          sort_order?: number
          start_date?: string | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_roadmap_id_workspace_id_fkey"
            columns: ["roadmap_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_row_id_roadmap_id_fkey"
            columns: ["row_id", "roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmap_rows"
            referencedColumns: ["id", "roadmap_id"]
          },
          {
            foreignKeyName: "roadmap_items_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      roadmap_key_dates: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          milestone_id: string | null
          organisation_id: string
          owner_id: string | null
          roadmap_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          milestone_id?: string | null
          organisation_id: string
          owner_id?: string | null
          roadmap_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          milestone_id?: string | null
          organisation_id?: string
          owner_id?: string | null
          roadmap_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_key_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_milestone_fkey"
            columns: ["milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_milestone_fkey"
            columns: ["milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_roadmap_id_workspace_id_fkey"
            columns: ["roadmap_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      roadmap_rows: {
        Row: {
          collection_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organisation_id: string
          programme_id: string | null
          roadmap_id: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organisation_id: string
          programme_id?: string | null
          roadmap_id: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organisation_id?: string
          programme_id?: string | null
          roadmap_id?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_rows_collection_id_workspace_id_fkey"
            columns: ["collection_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_rows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_rows_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_rows_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_rows_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_rows_roadmap_id_workspace_id_fkey"
            columns: ["roadmap_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_rows_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      roadmaps: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organisation_id: string
          owner_id: string | null
          portfolio_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organisation_id: string
          owner_id?: string | null
          portfolio_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organisation_id?: string
          owner_id?: string | null
          portfolio_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmaps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmaps_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "roadmaps_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmaps_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmaps_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmaps_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      status_reports: {
        Row: {
          accomplished: string | null
          ai_draft: Json | null
          comments: string | null
          created_at: string
          created_by: string | null
          decisions_needed: string | null
          declared_benefit: Database["public"]["Enums"]["health"]
          effort: Database["public"]["Enums"]["health"]
          evidenced_benefit: Database["public"]["Enums"]["health"] | null
          evidenced_effort: Database["public"]["Enums"]["health"] | null
          evidenced_financial: Database["public"]["Enums"]["health"] | null
          evidenced_issue: Database["public"]["Enums"]["health"] | null
          evidenced_overall: Database["public"]["Enums"]["health"] | null
          evidenced_schedule: Database["public"]["Enums"]["health"] | null
          financial: Database["public"]["Enums"]["health"]
          id: string
          issue: Database["public"]["Enums"]["health"]
          organisation_id: string
          overall: Database["public"]["Enums"]["health"]
          override_reasons: Json
          planned: string | null
          project_id: string
          ref: string
          reporting_date: string
          schedule: Database["public"]["Enums"]["health"]
          status: Database["public"]["Enums"]["status_report_status"]
          submitted_at: string | null
          submitter_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accomplished?: string | null
          ai_draft?: Json | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          decisions_needed?: string | null
          declared_benefit?: Database["public"]["Enums"]["health"]
          effort?: Database["public"]["Enums"]["health"]
          evidenced_benefit?: Database["public"]["Enums"]["health"] | null
          evidenced_effort?: Database["public"]["Enums"]["health"] | null
          evidenced_financial?: Database["public"]["Enums"]["health"] | null
          evidenced_issue?: Database["public"]["Enums"]["health"] | null
          evidenced_overall?: Database["public"]["Enums"]["health"] | null
          evidenced_schedule?: Database["public"]["Enums"]["health"] | null
          financial?: Database["public"]["Enums"]["health"]
          id?: string
          issue?: Database["public"]["Enums"]["health"]
          organisation_id: string
          overall?: Database["public"]["Enums"]["health"]
          override_reasons?: Json
          planned?: string | null
          project_id: string
          ref: string
          reporting_date: string
          schedule?: Database["public"]["Enums"]["health"]
          status?: Database["public"]["Enums"]["status_report_status"]
          submitted_at?: string | null
          submitter_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accomplished?: string | null
          ai_draft?: Json | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          decisions_needed?: string | null
          declared_benefit?: Database["public"]["Enums"]["health"]
          effort?: Database["public"]["Enums"]["health"]
          evidenced_benefit?: Database["public"]["Enums"]["health"] | null
          evidenced_effort?: Database["public"]["Enums"]["health"] | null
          evidenced_financial?: Database["public"]["Enums"]["health"] | null
          evidenced_issue?: Database["public"]["Enums"]["health"] | null
          evidenced_overall?: Database["public"]["Enums"]["health"] | null
          evidenced_schedule?: Database["public"]["Enums"]["health"] | null
          financial?: Database["public"]["Enums"]["health"]
          id?: string
          issue?: Database["public"]["Enums"]["health"]
          organisation_id?: string
          overall?: Database["public"]["Enums"]["health"]
          override_reasons?: Json
          planned?: string | null
          project_id?: string
          ref?: string
          reporting_date?: string
          schedule?: Database["public"]["Enums"]["health"]
          status?: Database["public"]["Enums"]["status_report_status"]
          submitted_at?: string | null
          submitter_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_reports_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "status_reports_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "status_reports_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "status_reports_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "status_reports_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "status_reports_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "status_reports_submitter_id_organisation_id_fkey"
            columns: ["submitter_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "status_reports_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      strategic_objectives: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          organisation_id: string
          owner_id: string | null
          portfolio_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organisation_id: string
          owner_id?: string | null
          portfolio_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organisation_id?: string
          owner_id?: string | null
          portfolio_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_objectives_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "strategic_objectives_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "strategic_objectives_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "strategic_objectives_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "strategic_objectives_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          changed_in_planner_by: string | null
          created_at: string
          created_by: string | null
          field: string
          id: string
          occurred_at: string
          organisation_id: string
          our_value: string | null
          planner_value: string | null
          project_id: string
          resolution: Database["public"]["Enums"]["conflict_resolution"] | null
          task: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          changed_in_planner_by?: string | null
          created_at?: string
          created_by?: string | null
          field: string
          id?: string
          occurred_at?: string
          organisation_id: string
          our_value?: string | null
          planner_value?: string | null
          project_id: string
          resolution?: Database["public"]["Enums"]["conflict_resolution"] | null
          task: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          changed_in_planner_by?: string | null
          created_at?: string
          created_by?: string | null
          field?: string
          id?: string
          occurred_at?: string
          organisation_id?: string
          our_value?: string | null
          planner_value?: string | null
          project_id?: string
          resolution?: Database["public"]["Enums"]["conflict_resolution"] | null
          task?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_conflicts_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      sync_log: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["sync_log_kind"]
          message: string
          occurred_at: string
          organisation_id: string
          project_id: string | null
          workspace_id: string
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["sync_log_kind"]
          message: string
          occurred_at?: string
          organisation_id: string
          project_id?: string | null
          workspace_id: string
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["sync_log_kind"]
          message?: string
          occurred_at?: string
          organisation_id?: string
          project_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_log_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_log_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_log_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_log_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_log_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_log_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      sync_outbox: {
        Row: {
          attempts: number
          change: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          organisation_id: string
          project_id: string
          queued_at: string
          queued_by_id: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          change: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          organisation_id: string
          project_id: string
          queued_at?: string
          queued_by_id?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          change?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          organisation_id?: string
          project_id?: string
          queued_at?: string
          queued_by_id?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_outbox_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_outbox_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_outbox_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_outbox_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_outbox_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_outbox_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_outbox_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sync_outbox_queued_by_id_fkey"
            columns: ["queued_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_outbox_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      user_favourites: {
        Row: {
          created_at: string
          id: string
          organisation_id: string
          profile_id: string
          programme_id: string | null
          project_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id: string
          profile_id?: string
          programme_id?: string | null
          project_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string
          profile_id?: string
          programme_id?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_favourites_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favourites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favourites_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favourites_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id"]
          },
          {
            foreignKeyName: "user_favourites_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id"]
          },
          {
            foreignKeyName: "user_favourites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favourites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_favourites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_favourites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_favourites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_favourites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_assignees: {
        Row: {
          organisation_id: string
          project_id: string
          resource_id: string
          work_item_id: string
          workspace_id: string
        }
        Insert: {
          organisation_id: string
          project_id: string
          resource_id: string
          work_item_id: string
          workspace_id: string
        }
        Update: {
          organisation_id?: string
          project_id?: string
          resource_id?: string
          work_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_assignees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_assignees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_assignees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_assignees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_assignees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_assignees_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_assignees_resource_id_organisation_id_fkey"
            columns: ["resource_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "work_item_assignees_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_assignees_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_assignees_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_assignees_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      work_item_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          organisation_id: string
          project_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          work_item_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          organisation_id: string
          project_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          work_item_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          organisation_id?: string
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          work_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_attachments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_attachments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_attachments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_attachments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_attachments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_attachments_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_attachments_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_attachments_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_attachments_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_attachments_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      work_item_checklist_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_done: boolean
          label: string
          organisation_id: string
          project_id: string
          sort_order: number
          updated_at: string
          work_item_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          label: string
          organisation_id: string
          project_id: string
          sort_order?: number
          updated_at?: string
          work_item_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          label?: string
          organisation_id?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
          work_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_checklist_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_checklist_items_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      work_item_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          organisation_id: string
          project_id: string
          work_item_id: string
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          organisation_id: string
          project_id: string
          work_item_id: string
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          organisation_id?: string
          project_id?: string
          work_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_events_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_events_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_events_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_events_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_events_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_events_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_events_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_events_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_events_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_events_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      work_item_links: {
        Row: {
          created_at: string
          link_type: string
          organisation_id: string
          predecessor_id: string
          project_id: string
          successor_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          link_type?: string
          organisation_id: string
          predecessor_id: string
          project_id: string
          successor_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          link_type?: string
          organisation_id?: string
          predecessor_id?: string
          project_id?: string
          successor_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_links_predecessor_id_project_id_fkey"
            columns: ["predecessor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_links_predecessor_id_project_id_fkey"
            columns: ["predecessor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_links_predecessor_id_project_id_fkey"
            columns: ["predecessor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_links_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_links_successor_id_project_id_fkey"
            columns: ["successor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_links_successor_id_project_id_fkey"
            columns: ["successor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_links_successor_id_project_id_fkey"
            columns: ["successor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_links_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      work_item_offers: {
        Row: {
          acknowledgement_due_date: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          issued_at: string
          issued_by: string
          issued_to: string
          organisation_id: string
          project_id: string
          proposed_date: string | null
          reminder_sent_at: string | null
          responded_at: string | null
          responded_by: string | null
          response: Database["public"]["Enums"]["offer_response"] | null
          work_item_id: string
          workspace_id: string
        }
        Insert: {
          acknowledgement_due_date?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string
          issued_by: string
          issued_to: string
          organisation_id: string
          project_id: string
          proposed_date?: string | null
          reminder_sent_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: Database["public"]["Enums"]["offer_response"] | null
          work_item_id: string
          workspace_id: string
        }
        Update: {
          acknowledgement_due_date?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string
          issued_by?: string
          issued_to?: string
          organisation_id?: string
          project_id?: string
          proposed_date?: string | null
          reminder_sent_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: Database["public"]["Enums"]["offer_response"] | null
          work_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_offers_issued_by_organisation_id_fkey"
            columns: ["issued_by", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "work_item_offers_issued_to_organisation_id_fkey"
            columns: ["issued_to", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "work_item_offers_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_offers_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_offers_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_offers_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_offers_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_offers_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_item_offers_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_offers_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_offers_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_offers_work_item_id_project_id_fkey"
            columns: ["work_item_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_item_offers_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      work_items: {
        Row: {
          backlog_rank: number
          baseline_finish_date: string | null
          bucket_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          done_at: string | null
          effort_completed_hours: number | null
          estimated_effort_hours: number | null
          external_etag: string | null
          external_id: string | null
          external_source: Database["public"]["Enums"]["external_source"] | null
          finish_date: string | null
          id: string
          item_type: Database["public"]["Enums"]["work_item_type"]
          labels: string[]
          milestone_id: string | null
          organisation_id: string
          parent_id: string | null
          percent_complete: number | null
          priority: Database["public"]["Enums"]["priority"]
          project_id: string
          ref: string
          start_date: string | null
          status: Database["public"]["Enums"]["work_item_status"]
          status_category: Database["public"]["Enums"]["status_category"]
          story_points: number | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          backlog_rank?: number
          baseline_finish_date?: string | null
          bucket_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          done_at?: string | null
          effort_completed_hours?: number | null
          estimated_effort_hours?: number | null
          external_etag?: string | null
          external_id?: string | null
          external_source?:
            | Database["public"]["Enums"]["external_source"]
            | null
          finish_date?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["work_item_type"]
          labels?: string[]
          milestone_id?: string | null
          organisation_id: string
          parent_id?: string | null
          percent_complete?: number | null
          priority?: Database["public"]["Enums"]["priority"]
          project_id: string
          ref: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["work_item_status"]
          status_category?: Database["public"]["Enums"]["status_category"]
          story_points?: number | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          backlog_rank?: number
          baseline_finish_date?: string | null
          bucket_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          done_at?: string | null
          effort_completed_hours?: number | null
          estimated_effort_hours?: number | null
          external_etag?: string | null
          external_id?: string | null
          external_source?:
            | Database["public"]["Enums"]["external_source"]
            | null
          finish_date?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["work_item_type"]
          labels?: string[]
          milestone_id?: string | null
          organisation_id?: string
          parent_id?: string | null
          percent_complete?: number | null
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string
          ref?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["work_item_status"]
          status_category?: Database["public"]["Enums"]["status_category"]
          story_points?: number | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_bucket_id_project_id_fkey"
            columns: ["bucket_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_buckets"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          created_by: string | null
          organisation_id: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          organisation_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          organisation_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_organisation_id_profile_id_fkey"
            columns: ["organisation_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "organisation_members"
            referencedColumns: ["organisation_id", "profile_id"]
          },
          {
            foreignKeyName: "workspace_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organisation_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organisation_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_benefit_period_values: {
        Row: {
          actual_fraction: number | null
          actual_value: number | null
          benefit_id: string | null
          finish_date: string | null
          idx: number | null
          n: number | null
          organisation_id: string | null
          period_id: string | null
          period_label: string | null
          planned_fraction: number | null
          start_date: string | null
          target_value: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_benefit_readiness: {
        Row: {
          benefit_id: string | null
          has_pathway: boolean | null
          needs_realisation_start: boolean | null
          organisation_id: string | null
          phase: string | null
          portfolio_id: string | null
          programme_id: string | null
          rag: Database["public"]["Enums"]["health"] | null
          realisation_start_date: string | null
          reason: string | null
          ref: string | null
          title: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_benefit_realisation: {
        Row: {
          achieved_fraction: number | null
          attribution_total: number | null
          attribution_warning: boolean | null
          behind_profile: boolean | null
          benefit_id: string | null
          expected_fraction: number | null
          health: Database["public"]["Enums"]["health"] | null
          lifecycle_valid: boolean | null
          measurement_overdue: boolean | null
          next_measurement_due: string | null
          organisation_id: string | null
          portfolio_id: string | null
          programme_id: string | null
          realised_percent: number | null
          realised_value: number | null
          variance_percent: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_programme_id_portfolio_id_fkey"
            columns: ["programme_id", "portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "portfolio_id"]
          },
          {
            foreignKeyName: "benefits_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_capability_health: {
        Row: {
          awaiting_acceptance_past_target: boolean | null
          capability_id: string | null
          forecast_date: string | null
          is_complete: boolean | null
          organisation_id: string | null
          programme_id: string | null
          rag: Database["public"]["Enums"]["health"] | null
          reason: string | null
          slip_days: number | null
          status: Database["public"]["Enums"]["capability_status"] | null
          target_date: string | null
          title: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "capabilities_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "capabilities_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "capabilities_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_dependency_health: {
        Row: {
          acceptance_state: string | null
          boundary: string | null
          dependency_id: string | null
          giver_end_programme_id: string | null
          health: Database["public"]["Enums"]["health"] | null
          organisation_id: string | null
          receiver_end_programme_id: string | null
          slip_working_days: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_issued_work_items: {
        Row: {
          acknowledgement_due_date: string | null
          backlog_rank: number | null
          baseline_finish_date: string | null
          bucket_id: string | null
          checklist_count: number | null
          checklist_done_count: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          description: string | null
          done_at: string | null
          effort_completed_hours: number | null
          estimated_effort_hours: number | null
          external_etag: string | null
          external_id: string | null
          external_source: Database["public"]["Enums"]["external_source"] | null
          finish_date: string | null
          id: string | null
          issued_at: string | null
          issued_by: string | null
          issued_status: string | null
          issued_to: string | null
          item_type: Database["public"]["Enums"]["work_item_type"] | null
          labels: string[] | null
          milestone_id: string | null
          offer_id: string | null
          organisation_id: string | null
          parent_id: string | null
          percent_complete: number | null
          planner_sync: string | null
          priority: Database["public"]["Enums"]["priority"] | null
          project_id: string | null
          proposed_date: string | null
          ref: string | null
          reminder_sent_at: string | null
          responded_at: string | null
          response: Database["public"]["Enums"]["offer_response"] | null
          response_comment: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["work_item_status"] | null
          status_category: Database["public"]["Enums"]["status_category"] | null
          story_points: number | null
          title: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_bucket_id_project_id_fkey"
            columns: ["bucket_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_buckets"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_milestones: {
        Row: {
          actual_date: string | null
          baseline_date: string | null
          created_at: string | null
          created_by: string | null
          forecast_date: string | null
          id: string | null
          organisation_id: string | null
          owner_id: string | null
          past_baseline: boolean | null
          phase_id: string | null
          project_id: string | null
          ref: string | null
          report_to_committee: boolean | null
          slip_band: string | null
          slip_days: number | null
          status: Database["public"]["Enums"]["delivery_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["milestone_type"] | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          actual_date?: string | null
          baseline_date?: string | null
          created_at?: string | null
          created_by?: string | null
          forecast_date?: string | null
          id?: string | null
          organisation_id?: string | null
          owner_id?: string | null
          past_baseline?: never
          phase_id?: string | null
          project_id?: string | null
          ref?: string | null
          report_to_committee?: boolean | null
          slip_band?: never
          slip_days?: never
          status?: never
          title?: string | null
          type?: Database["public"]["Enums"]["milestone_type"] | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          actual_date?: string | null
          baseline_date?: string | null
          created_at?: string | null
          created_by?: string | null
          forecast_date?: string | null
          id?: string | null
          organisation_id?: string | null
          owner_id?: string | null
          past_baseline?: never
          phase_id?: string | null
          project_id?: string | null
          ref?: string | null
          report_to_committee?: boolean | null
          slip_band?: never
          slip_days?: never
          status?: never
          title?: string | null
          type?: Database["public"]["Enums"]["milestone_type"] | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "milestones_phase_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "milestones_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_outcome_health: {
        Row: {
          indicator_driven: boolean | null
          is_complete: boolean | null
          organisation_id: string | null
          outcome_id: string | null
          programme_id: string | null
          rag: Database["public"]["Enums"]["health"] | null
          reason: string | null
          status: Database["public"]["Enums"]["outcome_status"] | null
          target_date: string | null
          title: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcomes_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcomes_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcomes_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_outcome_indicator_health: {
        Row: {
          actual_value: number | null
          baseline_date: string | null
          baseline_value: number | null
          expected_value: number | null
          indicator_id: string | null
          measured_on: string | null
          measurement_id: string | null
          measurement_overdue: boolean | null
          measurement_status:
            | Database["public"]["Enums"]["measurement_status"]
            | null
          name: string | null
          organisation_id: string | null
          outcome_id: string | null
          rag: Database["public"]["Enums"]["health"] | null
          reason: string | null
          shortfall_percent: number | null
          target_date: string | null
          target_value: number | null
          unit: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_indicators_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_indicators_outcome_id_workspace_id_fkey"
            columns: ["outcome_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_outcome_health"
            referencedColumns: ["outcome_id", "workspace_id"]
          },
          {
            foreignKeyName: "outcome_indicators_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_portfolio_financials: {
        Row: {
          actual_open_months: number | null
          actual_to_date: number | null
          allocated: number | null
          baselined_count: number | null
          budget: number | null
          eac: number | null
          forecast_remaining: number | null
          open_month_overrun: boolean | null
          organisation_id: string | null
          portfolio_id: string | null
          project_count: number | null
          variance: number | null
          variance_percent: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_portfolio_health: {
        Row: {
          computed_overall: Database["public"]["Enums"]["health"] | null
          forecast_basis: string | null
          forecast_finish_date: string | null
          is_overridden: boolean | null
          organisation_id: string | null
          overall: Database["public"]["Enums"]["health"] | null
          portfolio_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_programme_financials: {
        Row: {
          actual_open_months: number | null
          actual_to_date: number | null
          allocated: number | null
          baselined_count: number | null
          budget: number | null
          eac: number | null
          forecast_remaining: number | null
          open_month_overrun: boolean | null
          organisation_id: string | null
          portfolio_id: string | null
          programme_id: string | null
          project_count: number | null
          variance: number | null
          variance_percent: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_programme_health: {
        Row: {
          benefit: Database["public"]["Enums"]["health"] | null
          benefit_reason: string | null
          computed_overall: Database["public"]["Enums"]["health"] | null
          forecast_basis: string | null
          forecast_finish_date: string | null
          is_overridden: boolean | null
          organisation_id: string | null
          overall: Database["public"]["Enums"]["health"] | null
          portfolio_id: string | null
          programme_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "programmes_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_project_delivery_health: {
        Row: {
          baseline_finish_date: string | null
          code: string | null
          delivery: Database["public"]["Enums"]["health"] | null
          effective_portfolio_id: string | null
          effort: Database["public"]["Enums"]["health"] | null
          financial: Database["public"]["Enums"]["health"] | null
          finish_date: string | null
          health_override: Database["public"]["Enums"]["health"] | null
          issue: Database["public"]["Enums"]["health"] | null
          milestone_forecast_finish: string | null
          milestones_after_baseline_finish: number | null
          organisation_id: string | null
          phase_index: number | null
          programme_id: string | null
          project_id: string | null
          schedule: Database["public"]["Enums"]["health"] | null
          state: Database["public"]["Enums"]["project_state"] | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_project_financials: {
        Row: {
          actual_open_months: number | null
          actual_to_date: number | null
          actuals_through: string | null
          baseline_version: number | null
          budget: number | null
          budget_phased: number | null
          eac: number | null
          effective_portfolio_id: string | null
          forecast_remaining: number | null
          has_baseline: boolean | null
          open_month_overrun: boolean | null
          organisation_id: string | null
          overrun_month: string | null
          phasing_gap: number | null
          programme_id: string | null
          project_id: string | null
          variance: number | null
          variance_percent: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_project_health: {
        Row: {
          benefit: Database["public"]["Enums"]["health"] | null
          benefit_reason: string | null
          computed_overall: Database["public"]["Enums"]["health"] | null
          effective_portfolio_id: string | null
          effort: Database["public"]["Enums"]["health"] | null
          financial: Database["public"]["Enums"]["health"] | null
          forecast_basis: string | null
          forecast_finish_date: string | null
          is_overridden: boolean | null
          issue: Database["public"]["Enums"]["health"] | null
          organisation_id: string | null
          overall: Database["public"]["Enums"]["health"] | null
          programme_id: string | null
          project_id: string | null
          schedule: Database["public"]["Enums"]["health"] | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_project_task_stats: {
        Row: {
          avg_percent_complete: number | null
          done_count: number | null
          organisation_id: string | null
          overdue_count: number | null
          project_id: string | null
          task_count: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_projects: {
        Row: {
          actual: number | null
          archived_at: string | null
          baseline_finish_date: string | null
          benefits_summary: string | null
          budget: number | null
          business_case: string | null
          closed_reason: string | null
          code: string | null
          converted_from_request_id: string | null
          created_at: string | null
          created_by: string | null
          effective_portfolio_id: string | null
          finish_date: string | null
          forecast: number | null
          has_baseline: boolean | null
          health_override: Database["public"]["Enums"]["health"] | null
          health_override_reason: string | null
          id: string | null
          manager_id: string | null
          name: string | null
          organisation_id: string | null
          phase_count: number | null
          phase_id: string | null
          phase_index: number | null
          portfolio_id: string | null
          priority: Database["public"]["Enums"]["priority"] | null
          programme_id: string | null
          project_officer_id: string | null
          sponsor_id: string | null
          start_date: string | null
          state: Database["public"]["Enums"]["project_state"] | null
          task_source: Database["public"]["Enums"]["task_source"] | null
          tier: Database["public"]["Enums"]["project_tier"] | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_converted_from_request_fkey"
            columns: ["converted_from_request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "project_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_id_organisation_id_fkey"
            columns: ["manager_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_phase_id_organisation_id_fkey"
            columns: ["phase_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_phases"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_financials"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_workspace_id_fkey"
            columns: ["portfolio_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_health"
            referencedColumns: ["portfolio_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_financials"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_programme_id_workspace_id_fkey"
            columns: ["programme_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_programme_health"
            referencedColumns: ["programme_id", "workspace_id"]
          },
          {
            foreignKeyName: "projects_project_officer_id_organisation_id_fkey"
            columns: ["project_officer_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_sponsor_id_organisation_id_fkey"
            columns: ["sponsor_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "projects_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_roadmap_items: {
        Row: {
          finish_date: string | null
          health: Database["public"]["Enums"]["health"] | null
          id: string | null
          is_done: boolean | null
          is_linked: boolean | null
          organisation_id: string | null
          owner_id: string | null
          priority: Database["public"]["Enums"]["priority"] | null
          programme_id: string | null
          progress: number | null
          project_id: string | null
          roadmap_id: string | null
          row_id: string | null
          sort_order: number | null
          start_date: string | null
          title: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_roadmap_id_workspace_id_fkey"
            columns: ["roadmap_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_items_row_id_roadmap_id_fkey"
            columns: ["row_id", "roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmap_rows"
            referencedColumns: ["id", "roadmap_id"]
          },
          {
            foreignKeyName: "roadmap_items_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_roadmap_key_dates: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string | null
          id: string | null
          milestone_id: string | null
          organisation_id: string | null
          owner_id: string | null
          roadmap_id: string | null
          status: Database["public"]["Enums"]["delivery_status"] | null
          title: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          id?: string | null
          milestone_id?: string | null
          organisation_id?: string | null
          owner_id?: string | null
          roadmap_id?: string | null
          status?: never
          title?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          id?: string | null
          milestone_id?: string | null
          organisation_id?: string | null
          owner_id?: string | null
          roadmap_id?: string | null
          status?: never
          title?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_key_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_milestone_fkey"
            columns: ["milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_milestone_fkey"
            columns: ["milestone_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_owner_id_organisation_id_fkey"
            columns: ["owner_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_roadmap_id_workspace_id_fkey"
            columns: ["roadmap_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "roadmap_key_dates_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      v_work_items: {
        Row: {
          backlog_rank: number | null
          baseline_finish_date: string | null
          bucket_id: string | null
          checklist_count: number | null
          checklist_done_count: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          description: string | null
          done_at: string | null
          effort_completed_hours: number | null
          estimated_effort_hours: number | null
          external_etag: string | null
          external_id: string | null
          external_source: Database["public"]["Enums"]["external_source"] | null
          finish_date: string | null
          id: string | null
          item_type: Database["public"]["Enums"]["work_item_type"] | null
          labels: string[] | null
          milestone_id: string | null
          organisation_id: string | null
          parent_id: string | null
          percent_complete: number | null
          priority: Database["public"]["Enums"]["priority"] | null
          project_id: string | null
          ref: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["work_item_status"] | null
          status_category: Database["public"]["Enums"]["status_category"] | null
          story_points: number | null
          title: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_bucket_id_project_id_fkey"
            columns: ["bucket_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_buckets"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_issued_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_project_id_fkey"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_delivery_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_financials"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_health"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_project_task_stats"
            referencedColumns: ["project_id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "v_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_items_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
    }
    Functions: {
      close_financial_period: {
        Args: { p_month: string; p_organisation_id: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          organisation_id: string
          period_month: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commit_actuals_import: {
        Args: {
          p_file_name: string
          p_mode: Database["public"]["Enums"]["actuals_import_mode"]
          p_rows: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      create_organisation: {
        Args: {
          p_currency?: string
          p_fy_start_month?: number
          p_name: string
          p_region?: string
          p_slug?: string
          p_workspace_name?: string
        }
        Returns: string
      }
      get_portfolio_overview: {
        Args: {
          p_portfolio?: string
          p_programme?: string
          p_range?: string
          p_workspace: string
        }
        Returns: Json
      }
      join_demo_organisation: { Args: never; Returns: string }
      my_workspace_roles: {
        Args: never
        Returns: {
          organisation_id: string
          role: Database["public"]["Enums"]["app_role"]
          workspace_id: string
        }[]
      }
      project_permissions: {
        Args: { p_project: string }
        Returns: {
          can_delete: boolean
          can_edit: boolean
          can_manage_project: boolean
        }[]
      }
      project_permissions_4b: {
        Args: { p_project: string }
        Returns: {
          can_delete_records: boolean
          can_edit: boolean
          can_manage_project: boolean
        }[]
      }
      reopen_financial_period: {
        Args: { p_month: string; p_organisation_id: string; p_reason: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          organisation_id: string
          period_month: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_business_case_version: {
        Args: { p_business_case_id: string }
        Returns: string
      }
      submit_business_case: {
        Args: { p_version_id: string }
        Returns: {
          business_case_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decision_id: string | null
          funding_requested: number | null
          id: string
          organisation_id: string
          preferred_option_id: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["business_case_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          version: number
          whole_life_cost: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "business_case_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      action_status: "open" | "in_progress" | "done"
      actuals_import_mode: "replace" | "add"
      app_role: "viewer" | "contributor" | "manager" | "pmo" | "admin"
      assumption_status: "open" | "validated" | "invalidated"
      baseline_source:
        | "initial"
        | "business_case"
        | "change_request"
        | "pmo_adjustment"
        | "migration"
      benefit_classification:
        | "cash_releasing"
        | "non_cash_releasing"
        | "qualitative"
        | "societal"
      benefit_review_type: "scheduled" | "post_implementation"
      benefit_status:
        | "identified"
        | "validated"
        | "planned"
        | "in_realisation"
        | "realised"
        | "partially_realised"
        | "not_realised"
        | "closed"
      benefit_type: "benefit" | "disbenefit"
      booking_type: "soft" | "hard"
      business_case_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "superseded"
      capability_status: "planned" | "in_progress" | "delivered" | "accepted"
      change_status: "proposed" | "approved" | "rejected"
      confidence: "low" | "medium" | "high"
      conflict_resolution: "kept_planner" | "reapplied"
      criticality: "low" | "medium" | "high"
      decision_status: "pending" | "made" | "superseded" | "reversed"
      delivery_status: "on_track" | "future" | "late" | "overdue" | "completed"
      dependency_type:
        | "sequencing"
        | "alignment"
        | "information"
        | "resource"
        | "external"
      dependency_validation:
        | "inferred"
        | "proposed"
        | "confirmed"
        | "closed"
        | "broken"
      document_scope: "project" | "programme" | "capability" | "business_case"
      entity_state: "active" | "closed"
      external_source: "planner_basic" | "planner_premium" | "import"
      financial_kind: "budget" | "actual" | "forecast"
      forecast_capture_source: "close" | "scheduled"
      gate_check_key:
        | "benefit_profiles_owned"
        | "benefit_baselines"
        | "benefits_handover"
        | "lessons_reviewed"
        | "phase_lessons_review"
      health: "not_set" | "green" | "amber" | "red"
      issue_severity: "low" | "medium" | "high"
      leave_type: "annual_leave" | "training" | "other"
      lesson_applicability: "this_project" | "similar_projects" | "all_projects"
      lesson_status: "identified" | "action_agreed" | "embedded" | "closed"
      lesson_type: "success" | "problem"
      measure_frequency: "monthly" | "quarterly" | "annually"
      measurement_status: "submitted" | "validated" | "queried"
      milestone_type: "delivery" | "gate" | "key_date" | "external_dependency"
      ms_connection_status:
        | "not_connected"
        | "pending_approval"
        | "connected"
        | "needs_reconnect"
      offer_response: "accepted" | "declined" | "proposed_date"
      open_closed: "open" | "closed"
      outbox_status: "queued" | "sending" | "retrying" | "failed"
      outcome_status: "planned" | "emerging" | "achieved" | "not_achieved"
      plan_kind: "basic" | "premium"
      priority: "low" | "moderate" | "high" | "critical"
      project_role:
        | "project_manager"
        | "project_officer"
        | "programme_manager"
        | "team_member"
        | "sponsor"
      project_state: "proposed" | "active" | "on_hold" | "closed"
      project_tier: "small" | "medium" | "large"
      reporting_cadence: "weekly" | "fortnightly" | "monthly"
      request_status: "new" | "in_review" | "on_hold" | "approved" | "rejected"
      risk_response: "avoid" | "reduce" | "transfer" | "accept"
      spend_type: "capital" | "operating"
      status_category: "todo" | "in_progress" | "done"
      status_report_status: "draft" | "submitted"
      sync_health: "healthy" | "warning" | "failing"
      sync_log_kind:
        | "read"
        | "write"
        | "throttled"
        | "failed"
        | "deleted"
        | "directory"
      sync_mode: "polling" | "live_updates" | "change_tracking"
      task_source: "native" | "planner_basic" | "planner_premium"
      work_item_status:
        | "issued"
        | "not_started"
        | "in_progress"
        | "blocked"
        | "done"
        | "cancelled"
      work_item_type: "task" | "story" | "bug" | "spike" | "milestone_task"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_status: ["open", "in_progress", "done"],
      actuals_import_mode: ["replace", "add"],
      app_role: ["viewer", "contributor", "manager", "pmo", "admin"],
      assumption_status: ["open", "validated", "invalidated"],
      baseline_source: [
        "initial",
        "business_case",
        "change_request",
        "pmo_adjustment",
        "migration",
      ],
      benefit_classification: [
        "cash_releasing",
        "non_cash_releasing",
        "qualitative",
        "societal",
      ],
      benefit_review_type: ["scheduled", "post_implementation"],
      benefit_status: [
        "identified",
        "validated",
        "planned",
        "in_realisation",
        "realised",
        "partially_realised",
        "not_realised",
        "closed",
      ],
      benefit_type: ["benefit", "disbenefit"],
      booking_type: ["soft", "hard"],
      business_case_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "superseded",
      ],
      capability_status: ["planned", "in_progress", "delivered", "accepted"],
      change_status: ["proposed", "approved", "rejected"],
      confidence: ["low", "medium", "high"],
      conflict_resolution: ["kept_planner", "reapplied"],
      criticality: ["low", "medium", "high"],
      decision_status: ["pending", "made", "superseded", "reversed"],
      delivery_status: ["on_track", "future", "late", "overdue", "completed"],
      dependency_type: [
        "sequencing",
        "alignment",
        "information",
        "resource",
        "external",
      ],
      dependency_validation: [
        "inferred",
        "proposed",
        "confirmed",
        "closed",
        "broken",
      ],
      document_scope: ["project", "programme", "capability", "business_case"],
      entity_state: ["active", "closed"],
      external_source: ["planner_basic", "planner_premium", "import"],
      financial_kind: ["budget", "actual", "forecast"],
      forecast_capture_source: ["close", "scheduled"],
      gate_check_key: [
        "benefit_profiles_owned",
        "benefit_baselines",
        "benefits_handover",
        "lessons_reviewed",
        "phase_lessons_review",
      ],
      health: ["not_set", "green", "amber", "red"],
      issue_severity: ["low", "medium", "high"],
      leave_type: ["annual_leave", "training", "other"],
      lesson_applicability: [
        "this_project",
        "similar_projects",
        "all_projects",
      ],
      lesson_status: ["identified", "action_agreed", "embedded", "closed"],
      lesson_type: ["success", "problem"],
      measure_frequency: ["monthly", "quarterly", "annually"],
      measurement_status: ["submitted", "validated", "queried"],
      milestone_type: ["delivery", "gate", "key_date", "external_dependency"],
      ms_connection_status: [
        "not_connected",
        "pending_approval",
        "connected",
        "needs_reconnect",
      ],
      offer_response: ["accepted", "declined", "proposed_date"],
      open_closed: ["open", "closed"],
      outbox_status: ["queued", "sending", "retrying", "failed"],
      outcome_status: ["planned", "emerging", "achieved", "not_achieved"],
      plan_kind: ["basic", "premium"],
      priority: ["low", "moderate", "high", "critical"],
      project_role: [
        "project_manager",
        "project_officer",
        "programme_manager",
        "team_member",
        "sponsor",
      ],
      project_state: ["proposed", "active", "on_hold", "closed"],
      project_tier: ["small", "medium", "large"],
      reporting_cadence: ["weekly", "fortnightly", "monthly"],
      request_status: ["new", "in_review", "on_hold", "approved", "rejected"],
      risk_response: ["avoid", "reduce", "transfer", "accept"],
      spend_type: ["capital", "operating"],
      status_category: ["todo", "in_progress", "done"],
      status_report_status: ["draft", "submitted"],
      sync_health: ["healthy", "warning", "failing"],
      sync_log_kind: [
        "read",
        "write",
        "throttled",
        "failed",
        "deleted",
        "directory",
      ],
      sync_mode: ["polling", "live_updates", "change_tracking"],
      task_source: ["native", "planner_basic", "planner_premium"],
      work_item_status: [
        "issued",
        "not_started",
        "in_progress",
        "blocked",
        "done",
        "cancelled",
      ],
      work_item_type: ["task", "story", "bug", "spike", "milestone_task"],
    },
  },
} as const
