import type { Category } from "../api";

// Inverse of sdoc-hackathon-bundle/supabase_sync.py's CATEGORY_TO_SUPABASE.
// Supabase's inbox_records.category uses the Edge Function's snake_case
// vocabulary (see supabase/migrations/202609190001_identify_document_request.sql);
// pipeline.py's own categories are the BL_COMPARISON-style constants used
// everywhere else in this app. Keep both maps in sync by hand - this mirrors
// the same duplication already accepted between supabase_sync.py and
// scripts/evaluate-classifier.mjs.
export const SUPABASE_TO_CATEGORY: Record<string, Category> = {
  comparison_request: "BL_COMPARISON",
  new_si_request: "SI_REQUEST",
  invoice_query: "INVOICE_QUERY",
  general_message: "GENERAL",
  spam: "SPAM",
};
