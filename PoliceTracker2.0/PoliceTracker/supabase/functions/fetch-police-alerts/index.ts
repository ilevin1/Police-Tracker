import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WAZE_API_KEY = Deno.env.get('WAZE_API_KEY') || 'cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023';

// 50 regions covering the continental US - more granular coverage
const regions = [
  // Pacific Northwest (5 regions)
  { name: 'WA-North', bottom_left: '47.000000,-125.000000', top_right: '49.000000,-120.000000' },
  { name: 'WA-South', bottom_left: '45.000000,-125.000000', top_right: '47.000000,-120.000000' },
  { name: 'OR-North', bottom_left: '44.000000,-125.000000', top_right: '46.000000,-120.000000' },
  { name: 'OR-South', bottom_left: '42.000000,-125.000000', top_right: '44.000000,-120.000000' },
  { name: 'ID-West', bottom_left: '42.000000,-120.000000', top_right: '46.000000,-116.000000' },
  
  // California (8 regions)
  { name: 'CA-North', bottom_left: '40.000000,-125.000000', top_right: '42.000000,-120.000000' },
  { name: 'CA-BayArea', bottom_left: '37.000000,-123.000000', top_right: '39.000000,-120.000000' },
  { name: 'CA-Central', bottom_left: '35.000000,-122.000000', top_right: '37.000000,-118.000000' },
  { name: 'CA-South', bottom_left: '32.500000,-121.000000', top_right: '35.000000,-116.000000' },
  { name: 'CA-SanDiego', bottom_left: '32.500000,-118.000000', top_right: '34.000000,-114.000000' },
  { name: 'CA-Inland', bottom_left: '34.000000,-120.000000', top_right: '36.000000,-116.000000' },
  { name: 'CA-Desert', bottom_left: '32.500000,-116.000000', top_right: '35.000000,-114.000000' },
  { name: 'CA-Mountains', bottom_left: '36.000000,-120.000000', top_right: '38.000000,-116.000000' },
  
  // Southwest (6 regions)
  { name: 'AZ-North', bottom_left: '34.000000,-114.000000', top_right: '37.000000,-109.000000' },
  { name: 'AZ-South', bottom_left: '31.000000,-114.000000', top_right: '34.000000,-109.000000' },
  { name: 'NM-North', bottom_left: '34.000000,-109.000000', top_right: '37.000000,-103.000000' },
  { name: 'NM-South', bottom_left: '31.000000,-109.000000', top_right: '34.000000,-103.000000' },
  { name: 'NV-West', bottom_left: '35.000000,-120.000000', top_right: '38.000000,-114.000000' },
  { name: 'NV-East', bottom_left: '35.000000,-114.000000', top_right: '38.000000,-109.000000' },
  
  // Texas (8 regions)
  { name: 'TX-Panhandle', bottom_left: '34.000000,-107.000000', top_right: '37.000000,-100.000000' },
  { name: 'TX-North', bottom_left: '31.000000,-107.000000', top_right: '34.000000,-100.000000' },
  { name: 'TX-Central', bottom_left: '28.000000,-107.000000', top_right: '31.000000,-100.000000' },
  { name: 'TX-South', bottom_left: '26.000000,-107.000000', top_right: '29.000000,-100.000000' },
  { name: 'TX-East', bottom_left: '28.000000,-100.000000', top_right: '31.000000,-93.500000' },
  { name: 'TX-Southeast', bottom_left: '26.000000,-100.000000', top_right: '29.000000,-93.500000' },
  { name: 'TX-Gulf', bottom_left: '26.000000,-97.000000', top_right: '29.000000,-93.500000' },
  { name: 'TX-West', bottom_left: '29.000000,-105.000000', top_right: '32.000000,-100.000000' },
  
  // Great Plains (6 regions)
  { name: 'OK-North', bottom_left: '35.000000,-100.000000', top_right: '37.000000,-93.500000' },
  { name: 'OK-South', bottom_left: '33.000000,-100.000000', top_right: '35.000000,-93.500000' },
  { name: 'KS-North', bottom_left: '38.000000,-102.000000', top_right: '40.000000,-93.500000' },
  { name: 'KS-South', bottom_left: '36.000000,-102.000000', top_right: '38.000000,-93.500000' },
  { name: 'NE-West', bottom_left: '40.000000,-104.000000', top_right: '43.000000,-98.000000' },
  { name: 'NE-East', bottom_left: '40.000000,-98.000000', top_right: '43.000000,-93.500000' },
  
  // Upper Midwest (5 regions)
  { name: 'MN-North', bottom_left: '46.000000,-97.000000', top_right: '49.000000,-89.000000' },
  { name: 'MN-South', bottom_left: '43.000000,-97.000000', top_right: '46.000000,-89.000000' },
  { name: 'WI-North', bottom_left: '44.000000,-93.500000', top_right: '47.000000,-87.000000' },
  { name: 'WI-South', bottom_left: '42.000000,-93.500000', top_right: '45.000000,-87.000000' },
  { name: 'MI-Upper', bottom_left: '45.000000,-90.000000', top_right: '49.000000,-82.000000' },
  
  // Lower Midwest (4 regions)
  { name: 'IA-North', bottom_left: '42.000000,-96.000000', top_right: '44.000000,-90.000000' },
  { name: 'IA-South', bottom_left: '40.000000,-96.000000', top_right: '42.000000,-90.000000' },
  { name: 'IL-North', bottom_left: '40.000000,-90.000000', top_right: '42.000000,-87.000000' },
  { name: 'IL-South', bottom_left: '37.000000,-90.000000', top_right: '40.000000,-87.000000' },
  
  // Northeast (6 regions)
  { name: 'NY-North', bottom_left: '42.000000,-79.000000', top_right: '45.000000,-73.000000' },
  { name: 'NY-South', bottom_left: '40.000000,-79.000000', top_right: '43.000000,-73.000000' },
  { name: 'PA-West', bottom_left: '39.000000,-82.000000', top_right: '42.000000,-77.000000' },
  { name: 'PA-East', bottom_left: '39.000000,-77.000000', top_right: '42.000000,-73.000000' },
  { name: 'MA-East', bottom_left: '41.000000,-73.000000', top_right: '43.000000,-69.000000' },
  { name: 'ME-South', bottom_left: '43.000000,-71.000000', top_right: '45.000000,-66.000000' },
  
  // Mid-Atlantic (3 regions)
  { name: 'MD-North', bottom_left: '38.000000,-79.000000', top_right: '40.000000,-75.000000' },
  { name: 'MD-South', bottom_left: '37.000000,-79.000000', top_right: '39.000000,-75.000000' },
  { name: 'VA-North', bottom_left: '37.000000,-82.000000', top_right: '39.000000,-77.000000' },
  
  // Southeast (6 regions)
  { name: 'NC-North', bottom_left: '35.000000,-82.000000', top_right: '37.000000,-77.000000' },
  { name: 'NC-South', bottom_left: '33.000000,-82.000000', top_right: '35.000000,-77.000000' },
  { name: 'SC-North', bottom_left: '33.000000,-82.000000', top_right: '35.000000,-78.000000' },
  { name: 'SC-South', bottom_left: '31.000000,-82.000000', top_right: '33.000000,-78.000000' },
  { name: 'GA-North', bottom_left: '32.000000,-85.000000', top_right: '34.000000,-80.000000' },
  { name: 'GA-South', bottom_left: '30.000000,-85.000000', top_right: '32.000000,-80.000000' },
  
  // Florida (3 regions)
  { name: 'FL-North', bottom_left: '29.000000,-87.500000', top_right: '31.000000,-82.000000' },
  { name: 'FL-Central', bottom_left: '27.000000,-87.500000', top_right: '29.000000,-82.000000' },
  { name: 'FL-South', bottom_left: '24.500000,-87.500000', top_right: '27.000000,-82.000000' },
  
  // Mountain West (3 regions)
  { name: 'CO-North', bottom_left: '39.000000,-109.000000', top_right: '42.000000,-102.000000' },
  { name: 'CO-South', bottom_left: '37.000000,-109.000000', top_right: '40.000000,-102.000000' },
  { name: 'UT-West', bottom_left: '37.000000,-114.000000', top_right: '40.000000,-109.000000' },
  
  // Central Rockies (2 regions)
  { name: 'WY-South', bottom_left: '41.000000,-111.000000', top_right: '43.000000,-104.000000' },
  { name: 'MT-South', bottom_left: '44.000000,-116.000000', top_right: '47.000000,-109.000000' }
];

async function fetchAlerts(bottomLeft: string, topRight: string) {
  const params = new URLSearchParams({
    bottom_left: bottomLeft,
    top_right: topRight,
    max_alerts: '200',
    max_jams: '0',
    alert_types: 'POLICE',
  });

  const response = await fetch(`https://waze.p.rapidapi.com/alerts-and-jams?${params}`, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': 'waze.p.rapidapi.com',
      'x-rapidapi-key': WAZE_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.status !== 'OK') {
    throw new Error(`API error: ${data.status}`);
  }

  return data.data.alerts || [];
}

function getState(city: string): string {
  if (!city) return '';
  const parts = city.split(', ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Starting police alerts fetch for 50 regions');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    console.log('Supabase client created');

    const allAlerts = [];
    let successfulRegions = 0;
    let failedRegions = 0;

    console.log(`Fetching from ${regions.length} regions across continental US`);
    
    for (const region of regions) {
      try {
        console.log(`Fetching ${region.name}`);
        const alerts = await fetchAlerts(region.bottom_left, region.top_right);
        allAlerts.push(...alerts);
        successfulRegions++;
        console.log(`${region.name}: ${alerts.length} alerts`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error in ${region.name}:`, error);
        failedRegions++;
      }
    }

    console.log(`Fetch complete: ${allAlerts.length} total alerts from ${successfulRegions}/50 regions`);

    // Remove duplicates based on alert_id before processing
    const uniqueAlerts = allAlerts.filter((alert, index, self) => 
      index === self.findIndex(a => a.alert_id === alert.alert_id)
    );
    
    console.log(`After deduplication: ${uniqueAlerts.length} unique alerts`);

    const alertsToInsert = uniqueAlerts
      .filter(alert => alert.city && alert.city.trim() !== '')
      .map(alert => {
        const utcDate = new Date(alert.publish_datetime_utc);
        const estDate = new Date(utcDate.getTime() - (5 * 60 * 60 * 1000));
        
        return {
          alert_id: alert.alert_id,
          type: alert.type,
          subtype: alert.subtype,
          reported_by: alert.reported_by,
          description: alert.description,
          publish_datetime_utc: estDate.toISOString(),
          country: alert.country,
          city: alert.city,
          state: getState(alert.city),
          street: alert.street,
          latitude: alert.latitude,
          longitude: alert.longitude,
          num_thumbs_up: alert.num_thumbs_up,
          alert_reliability: alert.alert_reliability,
          alert_confidence: alert.alert_confidence,
        };
      });

    if (alertsToInsert.length > 0) {
      console.log(`Inserting ${alertsToInsert.length} alerts`);
      
      // Insert alerts in smaller batches to avoid constraint violations
      const batchSize = 50;
      let insertedCount = 0;
      
      for (let i = 0; i < alertsToInsert.length; i += batchSize) {
        const batch = alertsToInsert.slice(i, i + batchSize);
        console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(alertsToInsert.length / batchSize)} (${batch.length} alerts)`);
        
        const { error } = await supabase
          .from('police_alerts')
          .upsert(batch, { onConflict: 'alert_id' });

        if (error) {
          console.error('Error inserting batch:', error);
          throw error;
        }
        
        insertedCount += batch.length;
        console.log(`Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`Successfully inserted ${insertedCount} alerts in ${Math.ceil(alertsToInsert.length / batchSize)} batches`);
    }

    const now = new Date();
    const estNow = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    
    console.log('Function completed successfully');
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${alertsToInsert.length} alerts from ${successfulRegions}/50 regions`,
        timestamp: estNow.toISOString(),
        stats: {
          totalAlerts: alertsToInsert.length,
          successfulRegions,
          failedRegions,
          totalRegions: regions.length,
          regionsCovered: successfulRegions
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
}) 