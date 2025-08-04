const WAZE_API_KEY = 'cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023';

// Our current bounding boxes
const usBoundingBoxes = [
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

async function testBoundingBox(box) {
  const params = new URLSearchParams({
    bottom_left: box.bottom_left,
    top_right: box.top_right,
    max_alerts: '500',
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
    
    console.log(`\n${box.name}:`);
    console.log(`  Alerts found: ${policeAlerts.length}`);
    
    if (policeAlerts.length > 0) {
      const states = [...new Set(policeAlerts.map(alert => {
        const parts = alert.city.split(', ');
        return parts.length > 1 ? parts[parts.length - 1] : 'Unknown';
      }))];
      console.log(`  States covered: ${states.join(', ')}`);
      
      // Show a few sample locations
      const samples = policeAlerts.slice(0, 3).map(alert => `${alert.city} (${alert.latitude}, ${alert.longitude})`);
      console.log(`  Sample locations: ${samples.join(', ')}`);
    }
    
    return policeAlerts;
  } catch (error) {
    console.error(`Error testing ${box.name}:`, error.message);
    return [];
  }
}

async function testAllBoxes() {
  console.log('Testing US Coverage with Waze API...\n');
  
  let totalAlerts = 0;
  for (const box of usBoundingBoxes) {
    const alerts = await testBoundingBox(box);
    totalAlerts += alerts.length;
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\nTotal police alerts found: ${totalAlerts}`);
}

// Run the test
testAllBoxes().catch(console.error); 