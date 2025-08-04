-- Optimize heatmap function to prevent timeouts
-- Replace the complex clustering function with a simpler, more efficient version

-- Drop the old functions
DROP FUNCTION IF EXISTS calculate_police_heatmap(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_police_heatmap_data(INTEGER, INTEGER);

-- Create a simpler, more efficient heatmap function
CREATE OR REPLACE FUNCTION get_police_heatmap_data(
  radius_meters INTEGER DEFAULT 15,
  days_back INTEGER DEFAULT 7
)
RETURNS JSON AS $$
DECLARE
  start_date TIMESTAMP;
  result JSON;
BEGIN
  -- Calculate start date
  start_date := NOW() - INTERVAL '1 day' * days_back;
  
  -- Simple aggregation by grid cells (much faster than clustering)
  SELECT json_build_object(
    'heatmap_points', json_agg(
      json_build_object(
        'lat', ROUND(latitude::NUMERIC, 3),
        'lng', ROUND(longitude::NUMERIC, 3),
        'intensity', CASE 
          WHEN alert_count <= 1 THEN 0.2
          WHEN alert_count <= 3 THEN 0.4
          WHEN alert_count <= 5 THEN 0.6
          WHEN alert_count <= 10 THEN 0.8
          ELSE 1.0
        END,
        'alert_count', alert_count,
        'avg_reliability', ROUND(avg_reliability::NUMERIC, 2)
      )
    ),
    'last_updated', NOW(),
    'total_points', COUNT(*),
    'radius_meters', radius_meters,
    'days_back', days_back
  ) INTO result
  FROM (
    SELECT 
      ROUND(latitude::NUMERIC, 3) as latitude,
      ROUND(longitude::NUMERIC, 3) as longitude,
      COUNT(*) as alert_count,
      AVG(alert_reliability) as avg_reliability
    FROM police_alerts 
    WHERE publish_datetime_utc >= start_date
      AND type = 'POLICE'
    GROUP BY ROUND(latitude::NUMERIC, 3), ROUND(longitude::NUMERIC, 3)
    ORDER BY alert_count DESC
    LIMIT 1000  -- Limit to prevent timeout
  ) grid_data;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create a fast function to get recent alerts count
CREATE OR REPLACE FUNCTION get_recent_police_alerts_count(days_back INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  start_date TIMESTAMP;
  alert_count INTEGER;
BEGIN
  start_date := NOW() - INTERVAL '1 day' * days_back;
  
  SELECT COUNT(*) INTO alert_count
  FROM police_alerts 
  WHERE publish_datetime_utc >= start_date
    AND type = 'POLICE';
    
  RETURN alert_count;
END;
$$ LANGUAGE plpgsql; 