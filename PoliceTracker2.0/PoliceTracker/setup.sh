#!/bin/bash

echo "🚔 Police Tracker 2.0 Setup"
echo "=========================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
WAZE_API_KEY=cac49e506cmshca87db8d041fef6p1a8300jsn241ae3472023
EOF
    echo "✅ .env file created. Please update it with your actual API keys."
else
    echo "✅ .env file already exists."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update the .env file with your Supabase credentials"
echo "2. Set up your Supabase project and run the migration"
echo "3. Deploy the Edge Function"
echo "4. Configure Google Maps API key"
echo "5. Run 'npm start' to launch the app"
echo ""
echo "📚 See README.md for detailed instructions." 