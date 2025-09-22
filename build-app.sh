#!/bin/bash

# AI Prompt Generator - App Build Script
# This script helps you build the app for different platforms

echo "🚀 AI Prompt Generator v1.1.0 - App Builder"
echo "=============================================="
echo "✨ New Features: Style References (sref), 20+ AI Models, Advanced Parameters"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create assets directory if it doesn't exist
mkdir -p assets

# Generate simple app icons (you should replace these with proper icons)
echo "🎨 Generating app icons..."

# Create a simple SVG icon
cat > assets/icon.svg << 'EOF'
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="80" fill="url(#grad1)"/>
  <circle cx="256" cy="200" r="60" fill="white" opacity="0.9"/>
  <rect x="196" y="280" width="120" height="20" rx="10" fill="white" opacity="0.9"/>
  <rect x="176" y="320" width="160" height="15" rx="7" fill="white" opacity="0.7"/>
  <rect x="156" y="355" width="200" height="15" rx="7" fill="white" opacity="0.5"/>
  <text x="256" y="450" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="36" font-weight="bold">AI</text>
</svg>
EOF

echo "📱 Choose build option:"
echo "1. Build Electron desktop app (Windows/Mac/Linux)"
echo "2. Set up PWA (Progressive Web App)"
echo "3. Both"
echo "4. Development server"

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "🖥️  Building Electron desktop app..."
        npm run build
        echo "✅ Desktop app built successfully!"
        echo "📁 Check the 'dist' folder for your app installers"
        ;;
    2)
        echo "📱 PWA is ready!"
        echo "🌐 Serve the files using a web server and visit in Chrome/Edge/Safari"
        echo "💡 You can use: python3 -m http.server 8080"
        echo "📲 The install button will appear when served over HTTPS or localhost"
        ;;
    3)
        echo "🖥️  Building Electron desktop app..."
        npm run build
        echo "📱 PWA is also ready!"
        echo "✅ Both apps built successfully!"
        ;;
    4)
        echo "🚀 Starting development server..."
        python3 -m http.server 8080 &
        SERVER_PID=$!
        echo "🌐 Server running at http://localhost:8080"
        echo "📱 PWA install button will appear in supported browsers"
        echo "Press Ctrl+C to stop the server"
        wait $SERVER_PID
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Build complete!"
echo ""
echo "📖 Instructions:"
echo "   • Electron App: Install from files in 'dist' folder"
echo "   • PWA: Serve files over HTTPS or localhost"
echo "   • Development: Use 'npm run serve' for testing"
echo ""
echo "🔧 Customize:"
echo "   • Replace icons in 'assets' folder with your own"
echo "   • Modify app details in package.json and manifest.json"
echo "   • Update colors and branding in the CSS"
echo ""
echo "🎨 New in v1.1.0:"
echo "   • Style Reference (sref) library with URL, weight, and descriptions"
echo "   • 20+ AI models (Flux.1, Ideogram 2.0, Nano Banana, Sora, etc.)"
echo "   • Advanced parameters: mood, color schemes, lighting, art styles"
echo "   • Comprehensive prompt generation with --sref support"
echo "   • Enhanced PWA with sref shortcuts"
