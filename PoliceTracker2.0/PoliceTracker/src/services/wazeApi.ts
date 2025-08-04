import { WazeApiResponse, WazeAlert } from '../types';

const WAZE_API_KEY = process.env.WAZE_API_KEY || 'cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023';

export class WazeApiService {
  private static baseUrl = 'https://waze.p.rapidapi.com/alerts-and-jams';
  private static headers = {
    'x-rapidapi-host': 'waze.p.rapidapi.com',
    'x-rapidapi-key': WAZE_API_KEY,
  };

  // US bounding box coordinates (approximate)
  private static usBoundingBoxes = [
    {
      name: 'Continental US',
      bottom_left: '24.396308,-125.000000',
      top_right: '49.384358,-66.934570',
    },
    {
      name: 'Alaska',
      bottom_left: '51.214183,-180.000000',
      top_right: '71.538800,-130.000000',
    },
    {
      name: 'Hawaii',
      bottom_left: '18.910361,-160.000000',
      top_right: '22.235000,-154.000000',
    },
  ];

  static async fetchPoliceAlerts(
    bottomLeft: string,
    topRight: string,
    maxAlerts: number = 100
  ): Promise<WazeAlert[]> {
    try {
      const params = new URLSearchParams({
        bottom_left: bottomLeft,
        top_right: topRight,
        max_alerts: maxAlerts.toString(),
        max_jams: '0', // We don't need traffic jams
        alert_types: 'POLICE',
      });

      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: WazeApiResponse = await response.json();
      
      if (data.status !== 'OK') {
        throw new Error(`API error: ${data.status}`);
      }

      return data.data.alerts.filter(alert => alert.type === 'POLICE');
    } catch (error) {
      console.error('Error fetching police alerts from Waze API:', error);
      throw error;
    }
  }

  static async fetchAllUSPoliceAlerts(): Promise<WazeAlert[]> {
    const allAlerts: WazeAlert[] = [];

    for (const box of this.usBoundingBoxes) {
      try {
        console.log(`Fetching alerts for ${box.name}...`);
        const alerts = await this.fetchPoliceAlerts(
          box.bottom_left,
          box.top_right,
          100
        );
        allAlerts.push(...alerts);
        
        // Add a small delay between requests to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error fetching alerts for ${box.name}:`, error);
        // Continue with other regions even if one fails
      }
    }

    return allAlerts;
  }

  static async fetchPoliceAlertsForRegion(
    latitude: number,
    longitude: number,
    radiusKm: number = 50
  ): Promise<WazeAlert[]> {
    // Convert radius to bounding box
    const latDelta = radiusKm / 111; // Approximate km to degrees
    const lngDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

    const bottomLeft = `${latitude - latDelta},${longitude - lngDelta}`;
    const topRight = `${latitude + latDelta},${longitude + lngDelta}`;

    return this.fetchPoliceAlerts(bottomLeft, topRight, 50);
  }
} 