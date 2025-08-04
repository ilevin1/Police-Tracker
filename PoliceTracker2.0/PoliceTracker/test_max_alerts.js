const WAZE_API_KEY = 'cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023';

async function testMaxAlerts(maxAlerts) {
  const params = new URLSearchParams({
    bottom_left: '24.396308,-125.000000', // Continental US
    top_right: '49.384358,-66.934570',
    max_alerts: maxAlerts.toString(),
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
    
    console.log(`Max alerts ${maxAlerts}: Found ${policeAlerts.length} police alerts`);
    
    if (policeAlerts.length > 0) {
      const states = [...new Set(policeAlerts.map(alert => {
        if (!alert.city) return 'Unknown';
        const parts = alert.city.split(', ');
        return parts.length > 1 ? parts[parts.length - 1] : 'Unknown';
      }))];
      console.log(`  States: ${states.join(', ')}`);
    }
    
    return policeAlerts.length;
  } catch (error) {
    console.log(`Max alerts ${maxAlerts}: Error - ${error.message}`);
    return 0;
  }
}

async function testDifferentLimits() {
  console.log('Testing different max_alerts limits...\n');
  
  const limits = [50, 100, 200, 300, 400, 500];
  
  for (const limit of limits) {
    const count = await testMaxAlerts(limit);
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Run the test
testDifferentLimits().catch(console.error); 