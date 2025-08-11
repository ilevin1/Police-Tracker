// Vercel serverless function for scheduling
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Trigger the GitHub workflow
    const response = await fetch('https://api.github.com/repos/ilevin1/Police-Tracker/dispatches', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'PoliceTracker-Vercel-Scheduler',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'fetch_alerts'
      })
    });

    if (response.status === 204) {
      console.log(`[${new Date().toISOString()}] ✅ Workflow triggered successfully`);
      return res.status(200).json({ 
        success: true, 
        message: 'Workflow triggered successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      const errorData = await response.text();
      console.error(`[${new Date().toISOString()}] ❌ Failed to trigger workflow: ${errorData}`);
      return res.status(response.status).json({ 
        success: false, 
        error: errorData,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error:`, error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 