-- =============================================================================
-- Sprint 8 / R3 — search by risk (MET-01).
--
-- Sites are filtered by the active risks of their working data (type of the
-- catalogue, minimal severity), in the site list and on the map. The index
-- serves the "sites holding this type of risk" lookup; severity is checked on
-- the few rows found.
-- =============================================================================

create index risk_occurrence_type_site_idx on app.risk_occurrence (risk_type_id, site_id, severity)
  where status = 'active';
