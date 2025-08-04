import { createClient } from '@supabase/supabase-js';
import { PoliceAlert } from '../types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Simple function to get all police alerts
export async function getPoliceAlerts(limit: number = 500): Promise<PoliceAlert[]> {
  const { data, error } = await supabase
    .from('police_alerts')
    .select('*')
    .eq('type', 'POLICE')
    .order('publish_datetime_utc', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching police alerts:', error);
    throw error;
  }

  return data || [];
}

// Function to get ALL police alerts without limit
export async function getAllPoliceAlerts(): Promise<PoliceAlert[]> {
  // Supabase has a default limit of 1000, so we need to fetch in batches
  let allAlerts: PoliceAlert[] = [];
  let offset = 0;
  const batchSize = 2000; // Increased from 1000 to handle larger datasets
  let hasMore = true;
  let batchCount = 0;

  console.log('Starting to fetch all police alerts...');

  while (hasMore) {
    batchCount++;
    console.log(`Fetching batch ${batchCount} (offset: ${offset})`);
    
    try {
      const { data, error } = await supabase
        .from('police_alerts')
        .select('*')
        .eq('type', 'POLICE')
        .order('publish_datetime_utc', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error(`Error fetching police alerts batch ${batchCount}:`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allAlerts.push(...data);
        offset += batchSize;
        console.log(`Batch ${batchCount}: Got ${data.length} alerts (total so far: ${allAlerts.length})`);
        
        // If we got less than batchSize, we've reached the end
        if (data.length < batchSize) {
          hasMore = false;
          console.log(`Reached end of data after ${batchCount} batches`);
        }
      } else {
        hasMore = false;
        console.log(`No more data after ${batchCount} batches`);
      }
    } catch (error) {
      console.error(`Failed to fetch batch ${batchCount}:`, error);
      // If we have some data, return what we have instead of failing completely
      if (allAlerts.length > 0) {
        console.log(`Returning ${allAlerts.length} alerts despite batch ${batchCount} failure`);
        return allAlerts;
      }
      throw error;
    }
  }

  console.log(`Successfully fetched ${allAlerts.length} total alerts in ${batchCount} batches`);
  return allAlerts;
}

// Debug function to check all records in the table
export async function debugAllRecords(): Promise<any> {
  const { data, error } = await supabase
    .from('police_alerts')
    .select('*')
    .order('publish_datetime_utc', { ascending: false });

  if (error) {
    console.error('Error fetching all records:', error);
    throw error;
  }

  return data || [];
}

// Debug function to check table info
export async function debugTableInfo(): Promise<any> {
  // Get count without any filters
  const { count, error: countError } = await supabase
    .from('police_alerts')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error getting count:', countError);
    throw countError;
  }

  // Get date range
  const { data: dateData, error: dateError } = await supabase
    .from('police_alerts')
    .select('publish_datetime_utc')
    .order('publish_datetime_utc', { ascending: false })
    .limit(1);

  const { data: oldestData, error: oldestError } = await supabase
    .from('police_alerts')
    .select('publish_datetime_utc')
    .order('publish_datetime_utc', { ascending: true })
    .limit(1);

  return {
    totalCount: count,
    newestRecord: dateData?.[0]?.publish_datetime_utc,
    oldestRecord: oldestData?.[0]?.publish_datetime_utc,
    countError: countError ? 'Error getting count' : null,
    dateError: dateError ? 'Error getting newest date' : null,
    oldestError: oldestError ? 'Error getting oldest date' : null
  };
}

// Debug function to check unique types in the table
export async function debugUniqueTypes(): Promise<any> {
  const { data, error } = await supabase
    .from('police_alerts')
    .select('type')
    .order('type');

  if (error) {
    console.error('Error fetching types:', error);
    throw error;
  }

  // Get unique types
  const uniqueTypes = [...new Set(data?.map(item => item.type) || [])];
  const typeCounts = uniqueTypes.map(type => ({
    type,
    count: data?.filter(item => item.type === type).length || 0
  }));

  return {
    totalRecords: data?.length || 0,
    uniqueTypes,
    typeCounts
  };
}

// Simple function to get police alerts by state
export async function getPoliceAlertsByState(): Promise<any[]> {
  const { data, error } = await supabase
    .rpc('get_police_alerts_by_state');

  if (error) {
    console.error('Error fetching police alerts by state:', error);
    throw error;
  }

  return data || [];
}

export async function getPoliceHeatmapData(radiusMeters: number = 15, daysBack: number = 7): Promise<any> {
  // Use the simple approach instead of the complex RPC function that times out
  return await getSimpleHeatmapData();
}

// Simple fallback heatmap function that won't timeout
export async function getSimpleHeatmapData(): Promise<any> {
  try {
    // Get a simple count of recent alerts by state
    const { data, error } = await supabase
      .from('police_alerts')
      .select('state, latitude, longitude, alert_reliability')
      .eq('type', 'POLICE')
      .gte('publish_datetime_utc', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);

    if (error) throw error;

    // Create simple heatmap points from the data
    const heatmapPoints = data?.map((alert, index) => ({
      lat: alert.latitude,
      lng: alert.longitude,
      intensity: Math.min((alert.alert_reliability || 50) / 100, 1),
      alert_count: 1,
      avg_reliability: alert.alert_reliability || 50
    })) || [];

    return {
      heatmap_points: heatmapPoints,
      last_updated: new Date().toISOString(),
      total_points: heatmapPoints.length,
      radius_meters: 15,
      days_back: 7
    };
  } catch (error) {
    console.error('Error in simple heatmap:', error);
    return {
      heatmap_points: [],
      last_updated: new Date().toISOString(),
      total_points: 0,
      radius_meters: 15,
      days_back: 7
    };
  }
}

// Function to get the exact count of police alerts in the database
export async function getPoliceAlertsCount(): Promise<number> {
  const { count, error } = await supabase
    .from('police_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'POLICE');

  if (error) {
    console.error('Error getting police alerts count:', error);
    throw error;
  }

  return count || 0;
}

export class PoliceAlertService {
  // Get police alerts within a region
  static async getPoliceAlerts(
    region: {
      latitude: number;
      longitude: number;
      latitudeDelta: number;
      longitudeDelta: number;
    },
    limit: number = 100
  ): Promise<PoliceAlert[]> {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    
    const latMin = latitude - latitudeDelta / 2;
    const latMax = latitude + latitudeDelta / 2;
    const lngMin = longitude - longitudeDelta / 2;
    const lngMax = longitude + longitudeDelta / 2;

    const { data, error } = await supabase
      .from('police_alerts')
      .select('*')
      .gte('latitude', latMin)
      .lte('latitude', latMax)
      .gte('longitude', lngMin)
      .lte('longitude', lngMax)
      .eq('type', 'POLICE')
      .order('publish_datetime_utc', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching police alerts:', error);
      throw error;
    }

    return data || [];
  }

  // Get aggregated police alerts by state
  static async getPoliceAlertsByState(): Promise<any[]> {
    const { data, error } = await supabase
      .rpc('get_police_alerts_by_state');

    if (error) {
      console.error('Error fetching police alerts by state:', error);
      throw error;
    }

    return data || [];
  }

  // Get aggregated police alerts by city
  static async getPoliceAlertsByCity(state?: string): Promise<any[]> {
    const { data, error } = await supabase
      .rpc('get_police_alerts_by_city', { state_param: state });

    if (error) {
      console.error('Error fetching police alerts by city:', error);
      throw error;
    }

    return data || [];
  }

  // Get recent police alerts (last 24 hours)
  static async getRecentPoliceAlerts(limit: number = 50): Promise<PoliceAlert[]> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data, error } = await supabase
      .from('police_alerts')
      .select('*')
      .eq('type', 'POLICE')
      .gte('publish_datetime_utc', twentyFourHoursAgo.toISOString())
      .order('publish_datetime_utc', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent police alerts:', error);
      throw error;
    }

    return data || [];
  }
} 