# Police Tracker Scheduler Setup

## Problem
GitHub Actions scheduled workflows can be unreliable and may not run consistently every 5 minutes.

## Solutions

### Option 1: Vercel Cron Jobs (Recommended - Free)
1. **Deploy to Vercel**:
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Set Environment Variable**:
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add: `GITHUB_TOKEN` = your GitHub personal access token

3. **Enable Cron Jobs**:
   - Vercel will automatically schedule the function every 5 minutes
   - Runs 24/7 on Vercel's servers

### Option 2: GitHub Personal Access Token
1. **Create Token**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Generate new token with `repo` permissions
   - Copy the token

2. **Set Environment Variable**:
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```

### Option 3: External Scheduler Services (Free)
- **Cron-job.org**: Free web-based cron job service
- **EasyCron**: Free tier with 5-minute intervals
- **SetCronJob**: Free tier available

### Option 4: Manual Trigger (For Testing)
1. Go to: https://github.com/ilevin1/Police-Tracker/actions
2. Click "Fetch Police Alerts"
3. Click "Run workflow"
4. Select "main" branch and run

## Current Status
- ✅ Supabase function deployed with 50 API calls
- ✅ GitHub workflow configured
- ⚠️ Need reliable external scheduler for 24/7 operation

## Monitoring
- Check GitHub Actions: https://github.com/ilevin1/Police-Tracker/actions
- Check Supabase logs: https://supabase.com/dashboard/project/atlmbgnawococyysdtpr/functions 