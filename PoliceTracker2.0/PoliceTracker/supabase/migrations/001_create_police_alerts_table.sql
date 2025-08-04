-- Create police_alerts table
CREATE TABLE IF NOT EXISTS police_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  reported_by TEXT,
  description TEXT,
  publish_datetime_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  street TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  num_thumbs_up INTEGER DEFAULT 0,
  alert_reliability INTEGER DEFAULT 0,
  alert_confidence INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_police_alerts_type ON police_alerts(type);
CREATE INDEX IF NOT EXISTS idx_police_alerts_location ON police_alerts(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_police_alerts_datetime ON police_alerts(publish_datetime_utc);
CREATE INDEX IF NOT EXISTS idx_police_alerts_state ON police_alerts(state);
CREATE INDEX IF NOT EXISTS idx_police_alerts_city ON police_alerts(city);

-- Note: Spatial index requires PostGIS extension which may not be enabled
-- CREATE INDEX IF NOT EXISTS idx_police_alerts_spatial ON police_alerts USING GIST (
--   ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
-- );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_police_alerts_updated_at 
    BEFORE UPDATE ON police_alerts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to get police alerts by state
CREATE OR REPLACE FUNCTION get_police_alerts_by_state()
RETURNS TABLE(state TEXT, alert_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.state,
    COUNT(*) as alert_count
  FROM police_alerts pa
  WHERE pa.type = 'POLICE'
  GROUP BY pa.state
  ORDER BY alert_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get police alerts by city
CREATE OR REPLACE FUNCTION get_police_alerts_by_city(state_param TEXT DEFAULT NULL)
RETURNS TABLE(city TEXT, state TEXT, alert_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.city,
    pa.state,
    COUNT(*) as alert_count
  FROM police_alerts pa
  WHERE pa.type = 'POLICE'
    AND (state_param IS NULL OR pa.state = state_param)
  GROUP BY pa.city, pa.state
  ORDER BY alert_count DESC;
END;
$$ LANGUAGE plpgsql; 