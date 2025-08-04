-- Function to fetch Waze alerts directly from the database
CREATE OR REPLACE FUNCTION fetch_waze_alerts_cron()
RETURNS TEXT AS $$
DECLARE
  waze_api_key TEXT := 'YOUR_WAZE_API_KEY'; -- Replace with your actual Waze API key
  response TEXT;
  alert_data JSONB;
  alert_record RECORD;
  alerts_processed INTEGER := 0;
BEGIN
  -- Define US bounding boxes (3 regions)
  DECLARE
    us_bounding_boxes TEXT[] := ARRAY[
      '24.396308,-125.000000,49.384358,-104.000000', -- West Coast
      '24.396308,-104.000000,49.384358,-83.000000',  -- Mid US
      '24.396308,-83.000000,49.384358,-66.934570'    -- East Coast
    ];
    box TEXT;
  BEGIN
    -- Loop through each bounding box
    FOREACH box IN ARRAY us_bounding_boxes
    LOOP
      -- Make HTTP request to Waze API
      SELECT content INTO response
      FROM http((
        'GET',
        'https://waze-live-map.p.rapidapi.com/alerts?' ||
        'bottom_left=' || split_part(box, ',', 1) || ',' || split_part(box, ',', 2) ||
        '&top_right=' || split_part(box, ',', 3) || ',' || split_part(box, ',', 4) ||
        '&max_alerts=500',
        ARRAY[
          ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')::http_header,
          ('X-RapidAPI-Key', waze_api_key)::http_header,
          ('X-RapidAPI-Host', 'waze-live-map.p.rapidapi.com')::http_header
        ],
        NULL,
        NULL
      ));
      
      -- Parse the response
      IF response IS NOT NULL AND response != '' THEN
        alert_data := response::JSONB;
        
        -- Process police alerts
        IF alert_data ? 'alerts' THEN
          FOR alert_record IN SELECT * FROM jsonb_array_elements(alert_data->'alerts')
          LOOP
            -- Only process police alerts
            IF alert_record.value->>'type' = 'POLICE' THEN
              -- Insert or update the alert
              INSERT INTO police_alerts (
                alert_id,
                type,
                subtype,
                reported_by,
                description,
                publish_datetime_utc,
                country,
                city,
                state,
                street,
                latitude,
                longitude,
                num_thumbs_up,
                alert_reliability,
                alert_confidence
              ) VALUES (
                (alert_record.value->>'id')::BIGINT,
                alert_record.value->>'type',
                alert_record.value->>'subtype',
                alert_record.value->>'reported_by',
                alert_record.value->>'description',
                (alert_record.value->>'publish_datetime_utc')::TIMESTAMPTZ,
                alert_record.value->>'country',
                alert_record.value->>'city',
                alert_record.value->>'state',
                alert_record.value->>'street',
                (alert_record.value->>'latitude')::NUMERIC,
                (alert_record.value->>'longitude')::NUMERIC,
                COALESCE((alert_record.value->>'num_thumbs_up')::INTEGER, 0),
                COALESCE((alert_record.value->>'alert_reliability')::INTEGER, 5),
                COALESCE((alert_record.value->>'alert_confidence')::INTEGER, 0)
              )
              ON CONFLICT (alert_id) DO NOTHING;
              
              alerts_processed := alerts_processed + 1;
            END IF;
          END LOOP;
        END IF;
      END IF;
      
      -- Small delay between requests
      PERFORM pg_sleep(1);
    END LOOP;
  END;
  
  RETURN 'Successfully processed ' || alerts_processed || ' police alerts';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql; 