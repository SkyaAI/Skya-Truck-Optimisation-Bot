#!/bin/bash

# Skya Truck Optimization Bot - Start Script
echo "🚛 Starting Skya Truck Optimization Bot..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Please run ./install.sh first."
    exit 1
fi

# Stop any existing instances
echo "🛑 Stopping any existing instances..."
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 delete ecosystem.config.js 2>/dev/null || true

# Start the applications
echo "🚀 Starting applications with PM2..."
pm2 start ecosystem.config.js

# Display status
echo ""
echo "📊 Application Status:"
pm2 status

# Show logs for a few seconds
echo ""
echo "📋 Recent logs (last 10 lines):"
pm2 logs --nostream --lines 10

echo ""
echo "✅ Skya Truck Optimization Bot is running!"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:5000/api"
echo ""
echo "📊 Monitor with: pm2 status"
echo "📋 View logs with: pm2 logs --nostream"
echo "🔄 Restart with: pm2 restart all"
echo "🛑 Stop with: pm2 stop all"
echo ""