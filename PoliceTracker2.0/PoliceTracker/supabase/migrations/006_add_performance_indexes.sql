-- Add performance indexes to prevent query timeouts
-- This migration adds indexes to speed up common queries

-- Index for type filtering (most common query)
CREATE INDEX IF NOT EXISTS idx_police_alerts_type ON police_alerts(type);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_police_alerts_publish_datetime ON police_alerts(publish_datetime_utc DESC);

-- Composite index for location-based queries
CREATE INDEX IF NOT EXISTS idx_police_alerts_location ON police_alerts(latitude, longitude);

-- Index for state-based queries
CREATE INDEX IF NOT EXISTS idx_police_alerts_state ON police_alerts(state);

-- Composite index for type + date (most common combination)
CREATE INDEX IF NOT EXISTS idx_police_alerts_type_date ON police_alerts(type, publish_datetime_utc DESC);

-- Index for alert_id (for upsert operations)
CREATE INDEX IF NOT EXISTS idx_police_alerts_alert_id ON police_alerts(alert_id);

-- Partial index for POLICE type alerts only (most efficient)
CREATE INDEX IF NOT EXISTS idx_police_alerts_police_only ON police_alerts(publish_datetime_utc DESC) 
WHERE type = 'POLICE';

-- Index for reliability and confidence (for heatmap calculations)
CREATE INDEX IF NOT EXISTS idx_police_alerts_reliability ON police_alerts(alert_reliability, alert_confidence); 