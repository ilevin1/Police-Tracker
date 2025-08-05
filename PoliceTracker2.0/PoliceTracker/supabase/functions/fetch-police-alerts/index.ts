import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WAZE_API_KEY = Deno.env.get('WAZE_API_KEY') || 'cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023';

// 5 broad regions covering the entire continental US
const broadRegions = [
  { name: 'West-Coast', bottom_left: '24.500000,-125.000000', top_right: '49.000000,-114.000000' },
  { name: 'Central-West', bottom_left: '24.500000,-114.000000', top_right: '49.000000,-93.500000' },
  { name: 'Central-East', bottom_left: '24.500000,-93.500000', top_right: '49.000000,-82.000000' },
  { name: 'Northeast', bottom_left: '39.000000,-82.000000', top_right: '49.000000,-66.000000' },
  { name: 'Southeast', bottom_left: '24.500000,-87.500000', top_right: '39.000000,-75.000000' }
];

// Top 20 major cities with focused coverage
const majorCities = [
  // California
  { name: 'Los-Angeles', bottom_left: '33.700000,-118.500000', top_right: '34.300000,-118.000000' },
  { name: 'San-Francisco', bottom_left: '37.700000,-122.500000', top_right: '37.800000,-122.400000' },
  
  // Texas
  { name: 'Houston', bottom_left: '29.600000,-95.600000', top_right: '29.800000,-95.200000' },
  { name: 'Dallas', bottom_left: '32.700000,-97.000000', top_right: '32.900000,-96.600000' },
  
  // New York
  { name: 'New-York-City', bottom_left: '40.600000,-74.200000', top_right: '40.800000,-73.700000' },
  
  // Florida
  { name: 'Miami', bottom_left: '25.700000,-80.400000', top_right: '25.900000,-80.100000' },
  
  // Illinois
  { name: 'Chicago', bottom_left: '41.700000,-87.800000', top_right: '42.000000,-87.500000' },
  
  // Pennsylvania
  { name: 'Philadelphia', bottom_left: '39.900000,-75.300000', top_right: '40.100000,-75.000000' },
  
  // Michigan
  { name: 'Detroit', bottom_left: '42.300000,-83.200000', top_right: '42.500000,-82.900000' },
  
  // Georgia
  { name: 'Atlanta', bottom_left: '33.600000,-84.600000', top_right: '33.800000,-84.300000' },
  
  // North Carolina
  { name: 'Charlotte', bottom_left: '35.100000,-80.900000', top_right: '35.300000,-80.700000' },
  
  // Louisiana
  { name: 'New-Orleans', bottom_left: '29.900000,-90.200000', top_right: '30.100000,-89.900000' },
  
  // Missouri
  { name: 'St-Louis', bottom_left: '38.500000,-90.400000', top_right: '38.700000,-90.100000' },
  
  // Colorado
  { name: 'Denver', bottom_left: '39.600000,-105.200000', top_right: '39.800000,-104.800000' },
  
  // Arizona
  { name: 'Phoenix', bottom_left: '33.300000,-112.200000', top_right: '33.500000,-111.900000' },
  
  // Nevada
  { name: 'Las-Vegas', bottom_left: '36.100000,-115.300000', top_right: '36.300000,-115.000000' },
  
  // Washington
  { name: 'Seattle', bottom_left: '47.500000,-122.500000', top_right: '47.700000,-122.200000' },
  
  // Massachusetts
  { name: 'Boston', bottom_left: '42.300000,-71.200000', top_right: '42.500000,-70.900000' },
  
  // Maryland
  { name: 'Baltimore', bottom_left: '39.200000,-76.800000', top_right: '39.400000,-76.500000' },
  
  // Virginia
  { name: 'Richmond', bottom_left: '37.400000,-77.600000', top_right: '37.600000,-77.300000' }
];

// Combine both arrays
const regions = [...broadRegions, ...majorCities];

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
    console.log(`Starting police alerts fetch for ${regions.length} regions (5 broad + ${majorCities.length} major cities)`);
    
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

    console.log(`Fetch complete: ${allAlerts.length} total alerts from ${successfulRegions}/${regions.length} regions`);

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
        message: `Processed ${alertsToInsert.length} alerts from ${successfulRegions}/${regions.length} regions (5 broad + ${majorCities.length} cities)`,
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