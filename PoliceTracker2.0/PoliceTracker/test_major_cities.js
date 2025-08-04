const WAZE_API_KEY = 'cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023';

// Test major US cities
const majorCities = [
  { name: 'New York', lat: 40.7128, lng: -74.0060 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Houston', lat: 29.7604, lng: -95.3698 },
  { name: 'Phoenix', lat: 33.4484, lng: -112.0740 },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
  { name: 'San Antonio', lat: 29.4241, lng: -98.4936 },
  { name: 'San Diego', lat: 32.7157, lng: -117.1611 },
  { name: 'Dallas', lat: 32.7767, lng: -96.7970 },
  { name: 'San Jose', lat: 37.3382, lng: -121.8863 },
];

async function testCity(city) {
  // Create a small bounding box around the city (50km radius)
  const latDelta = 0.45; // ~50km
  const lngDelta = 0.45;
  
  const bottomLeft = `${city.lat - latDelta},${city.lng - lngDelta}`;
  const topRight = `${city.lat + latDelta},${city.lng + lngDelta}`;
  
  const params = new URLSearchParams({
    bottom_left: bottomLeft,
    top_right: topRight,
    max_alerts: '20',
    max_jams: '0',
    alert_types: 'POLICE',
  });

  try {
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
    const policeAlerts = data.data.alerts.filter(alert => alert.type === 'POLICE');
    
    console.log(`${city.name}: ${policeAlerts.length} alerts`);
    return policeAlerts.length;
  } catch (error) {
    console.log(`${city.name}: Error - ${error.message}`);
    return 0;
  }
}

async function testAllCities() {
  console.log('Testing Major US Cities Coverage...\n');
  
  let totalAlerts = 0;
  for (const city of majorCities) {
    const alerts = await testCity(city);
    totalAlerts += alerts;
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\nTotal alerts from major cities: ${totalAlerts}`);
}

// Run the test
testAllCities().catch(console.error); 