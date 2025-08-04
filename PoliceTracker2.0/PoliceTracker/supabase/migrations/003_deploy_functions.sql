-- Function to get police alerts aggregated by state
CREATE OR REPLACE FUNCTION get_police_alerts_by_state()
RETURNS TABLE (
  state TEXT,
  alert_count BIGINT,
  avg_reliability NUMERIC,
  avg_confidence NUMERIC,
  total_thumbs_up BIGINT,
  center_lat NUMERIC,
  center_lng NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.state,
    COUNT(*) as alert_count,
    ROUND(AVG(p.alert_reliability), 2) as avg_reliability,
    ROUND(AVG(p.alert_confidence), 2) as avg_confidence,
    SUM(p.num_thumbs_up) as total_thumbs_up,
    ROUND(AVG(p.latitude), 6) as center_lat,
    ROUND(AVG(p.longitude), 6) as center_lng
  FROM police_alerts p
  WHERE p.state IS NOT NULL AND p.state != ''
  GROUP BY p.state
  ORDER BY alert_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get police alerts aggregated by city within a state
CREATE OR REPLACE FUNCTION get_police_alerts_by_city(state_param TEXT)
RETURNS TABLE (
  city TEXT,
  alert_count BIGINT,
  avg_reliability NUMERIC,
  avg_confidence NUMERIC,
  total_thumbs_up BIGINT,
  center_lat NUMERIC,
  center_lng NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.city,
    COUNT(*) as alert_count,
    ROUND(AVG(p.alert_reliability), 2) as avg_reliability,
    ROUND(AVG(p.alert_confidence), 2) as avg_confidence,
    SUM(p.num_thumbs_up) as total_thumbs_up,
    ROUND(AVG(p.latitude), 6) as center_lat,
    ROUND(AVG(p.longitude), 6) as center_lng
  FROM police_alerts p
  WHERE p.state = state_param 
    AND p.city IS NOT NULL 
    AND p.city != ''
  GROUP BY p.city
  ORDER BY alert_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent police alerts (last 24 hours)
CREATE OR REPLACE FUNCTION get_recent_police_alerts(hours_back INTEGER DEFAULT 24)
RETURNS TABLE (
  id BIGINT,
  alert_id BIGINT,
  type TEXT,
  subtype TEXT,
  reported_by TEXT,
  description TEXT,
  publish_datetime_utc TIMESTAMPTZ,
  country TEXT,
  city TEXT,
  state TEXT,
  street TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  num_thumbs_up INTEGER,
  alert_reliability INTEGER,
  alert_confidence INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.alert_id,
    p.type,
    p.subtype,
    p.reported_by,
    p.description,
    p.publish_datetime_utc,
    p.country,
    p.city,
    p.state,
    p.street,
    p.latitude,
    p.longitude,
    p.num_thumbs_up,
    p.alert_reliability,
    p.alert_confidence,
    p.created_at,
    p.updated_at
  FROM police_alerts p
  WHERE p.publish_datetime_utc >= NOW() - INTERVAL '1 hour' * hours_back
  ORDER BY p.publish_datetime_utc DESC;
END;
$$ LANGUAGE plpgsql; 