const https = require('https');

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Set this in environment
const REPO_OWNER = 'ilevin1';
const REPO_NAME = 'Police-Tracker';

function triggerWorkflow() {
  const data = JSON.stringify({
    event_type: 'fetch_alerts'
  });

  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'PoliceTracker-Scheduler',
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    console.log(`[${new Date().toISOString()}] Status: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 204) {
        console.log(`[${new Date().toISOString()}] ✅ Workflow triggered successfully`);
      } else {
        console.log(`[${new Date().toISOString()}] ❌ Failed to trigger workflow: ${responseData}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] ❌ Error triggering workflow:`, error.message);
  });

  req.write(data);
  req.end();
}

// Run every 5 minutes
console.log(`[${new Date().toISOString()}] 🚀 Starting Police Tracker Scheduler`);
console.log(`[${new Date().toISOString()}] 📅 Will trigger workflow every 5 minutes`);

// Trigger immediately
triggerWorkflow();

// Schedule every 5 minutes
setInterval(triggerWorkflow, 5 * 60 * 1000);

// Keep the process alive
process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] 🛑 Scheduler stopped`);
  process.exit(0);
}); 