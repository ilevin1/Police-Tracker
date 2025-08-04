export interface WazeAlert {
  alert_id: string;
  type: string;
  subtype: string | null;
  reported_by: string | null;
  description: string | null;
  image: string | null;
  publish_datetime_utc: string;
  country: string;
  city: string;
  street: string;
  latitude: number;
  longitude: number;
  num_thumbs_up: number;
  alert_reliability: number;
  alert_confidence: number;
  near_by: any | null;
  comments: any[];
  num_comments: number;
}

export interface WazeJam {
  jam_id: string;
  type: string;
  level: number;
  severity: number;
  line_coordinates: Array<{
    lat: number;
    lon: number;
  }>;
  start_location: any | null;
  end_location: any | null;
  speed_kmh: number;
  length_meters: number;
  delay_seconds: number;
  block_alert_id: string | null;
  block_alert_type: string | null;
  block_alert_description: string | null;
  block_alert_update_datetime_utc: string | null;
  block_start_datetime_utc: string | null;
  publish_datetime_utc: string;
  update_datetime_utc: string;
  country: string;
  city: string;
  street: string;
}

export interface WazeApiResponse {
  status: string;
  request_id: string;
  parameters: {
    bottom_left: [string, string];
    top_right: [string, string];
    max_alerts: number;
    max_jams: number;
  };
  data: {
    alerts: WazeAlert[];
    jams: WazeJam[];
  };
}

export interface PoliceAlert {
  id: string;
  alert_id: string;
  type: string;
  subtype: string | null;
  reported_by: string | null;
  description: string | null;
  publish_datetime_utc: string;
  country: string;
  city: string;
  state: string;
  street: string;
  latitude: number;
  longitude: number;
  num_thumbs_up: number;
  alert_reliability: number;
  alert_confidence: number;
  created_at: string;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  weight: number;
} 