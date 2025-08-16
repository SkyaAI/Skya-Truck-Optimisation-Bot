#!/bin/bash

# Skya Truck Optimization Bot - Installation Script
echo "🚛 Installing Skya Truck Optimization Bot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install PM2. Please check your permissions."
        exit 1
    fi
fi

# Create logs directory
mkdir -p logs
echo "📁 Created logs directory"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies."
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd client
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies."
    exit 1
fi
cd ..

# Build the client for production
echo "🔨 Building React frontend..."
cd client
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build frontend."
    exit 1
fi
cd ..

# Set up PM2 startup script
echo "⚡ Setting up PM2 startup script..."
pm2 startup
echo "💡 Note: You may need to run the command provided by pm2 startup with sudo"

echo ""
echo "✅ Installation completed successfully!"
echo ""
echo "🚀 To start the application:"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "📊 To view application status:"
echo "   pm2 status"
echo ""
echo "📋 To view logs:"
echo "   pm2 logs --nostream"
echo ""
echo "🔄 To restart the application:"
echo "   pm2 restart all"
echo ""
echo "🛑 To stop the application:"
echo "   pm2 stop all"
echo ""
echo "🗑️ To remove the application from PM2:"
echo "   pm2 delete all"
echo ""