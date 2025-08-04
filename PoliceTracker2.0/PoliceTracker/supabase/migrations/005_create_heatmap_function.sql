-- Migration: Create heatmap calculation function
-- This function calculates heatmap data for police alerts from the last 7 days
-- Groups alerts by geographic proximity and calculates percentile-based colors

-- Heatmap function to calculate police alert clusters with percentile-based colors
CREATE OR REPLACE FUNCTION calculate_police_heatmap(
  radius_meters INTEGER DEFAULT 15,  -- ~50 feet radius
  days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  lat NUMERIC,
  lng NUMERIC,
  intensity NUMERIC,
  color TEXT,
  alert_count INTEGER,
  percentile INTEGER
) AS $$
DECLARE
  start_date TIMESTAMP;
  alert_record RECORD;
  cluster_record RECORD;
  cluster_lat NUMERIC;
  cluster_lng NUMERIC;
  cluster_count INTEGER;
  total_clusters INTEGER;
  percentile_val INTEGER;
  clusters_counted INTEGER := 0;
BEGIN
  -- Calculate start date (7 days ago)
  start_date := NOW() - INTERVAL '1 day' * days_back;
  
  -- Create temporary table to store clustered alerts
  CREATE TEMP TABLE temp_clusters (
    cluster_id SERIAL PRIMARY KEY,
    center_lat NUMERIC,
    center_lng NUMERIC,
    alert_count INTEGER DEFAULT 0,
    total_reliability NUMERIC DEFAULT 0
  );
  
  -- Process each alert and group by proximity
  FOR alert_record IN 
    SELECT 
      latitude, 
      longitude, 
      alert_reliability,
      publish_datetime_utc
    FROM police_alerts 
    WHERE publish_datetime_utc >= start_date
      AND type = 'POLICE'
    ORDER BY publish_datetime_utc DESC
  LOOP
    -- Check if this alert is close to any existing cluster
    cluster_lat := NULL;
    cluster_lng := NULL;
    
    FOR cluster_record IN 
      SELECT center_lat, center_lng 
      FROM temp_clusters
    LOOP
      -- Calculate distance using simple approximation (1 degree ≈ 111km)
      IF (
        ABS(alert_record.latitude - cluster_record.center_lat) * 111000 < radius_meters AND
        ABS(alert_record.longitude - cluster_record.center_lng) * 111000 < radius_meters
      ) THEN
        cluster_lat := cluster_record.center_lat;
        cluster_lng := cluster_record.center_lng;
        EXIT;
      END IF;
    END LOOP;
    
    -- If no nearby cluster found, create new one
    IF cluster_lat IS NULL THEN
      INSERT INTO temp_clusters (center_lat, center_lng, alert_count, total_reliability)
      VALUES (alert_record.latitude, alert_record.longitude, 1, alert_record.alert_reliability);
    ELSE
      -- Update existing cluster - use table alias to avoid ambiguity
      UPDATE temp_clusters AS tc
      SET 
        alert_count = tc.alert_count + 1,
        total_reliability = tc.total_reliability + alert_record.alert_reliability
      WHERE tc.center_lat = cluster_lat AND tc.center_lng = cluster_lng;
    END IF;
  END LOOP;
  
  -- Get total number of clusters for percentile calculation
  SELECT COUNT(*) INTO total_clusters FROM temp_clusters;
  
  -- Return heatmap data with percentile-based colors
  FOR cluster_record IN 
    SELECT 
      tc.center_lat,
      tc.center_lng,
      tc.alert_count,
      tc.total_reliability / tc.alert_count as avg_reliability
    FROM temp_clusters tc
    ORDER BY tc.alert_count DESC
  LOOP
    clusters_counted := clusters_counted + 1;
    
    -- Calculate percentile (0-100)
    percentile_val := (clusters_counted * 100) / total_clusters;
    
    -- Determine color based on percentile
    IF percentile_val <= 20 THEN
      color := 'green';
      intensity := 0.2;
    ELSIF percentile_val <= 40 THEN
      color := 'lightyellow';
      intensity := 0.4;
    ELSIF percentile_val <= 60 THEN
      color := 'yellow';
      intensity := 0.6;
    ELSIF percentile_val <= 80 THEN
      color := 'orange';
      intensity := 0.8;
    ELSIF percentile_val <= 90 THEN
      color := 'red';
      intensity := 0.9;
    ELSE
      color := 'darkred';
      intensity := 1.0;
    END IF;
    
    -- Return the heatmap point
    lat := cluster_record.center_lat;
    lng := cluster_record.center_lng;
    alert_count := cluster_record.alert_count;
    percentile := percentile_val;
    
    RETURN NEXT;
  END LOOP;
  
  -- Clean up
  DROP TABLE temp_clusters;
END;
$$ LANGUAGE plpgsql;

-- Simple function that returns JSON for easy client consumption
CREATE OR REPLACE FUNCTION get_police_heatmap_data(
  radius_meters INTEGER DEFAULT 15,
  days_back INTEGER DEFAULT 7
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'heatmap_points', json_agg(
      json_build_object(
        'lat', lat,
        'lng', lng,
        'intensity', intensity,
        'color', color,
        'alert_count', alert_count,
        'percentile', percentile
      )
    ),
    'last_updated', NOW(),
    'total_points', COUNT(*),
    'radius_meters', radius_meters,
    'days_back', days_back
  ) INTO result
  FROM calculate_police_heatmap(radius_meters, days_back);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
