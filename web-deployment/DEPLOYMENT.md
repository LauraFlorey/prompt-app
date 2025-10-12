# AI Prompt Generator - Web Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: Simple File Upload (Recommended for most users)

1. **Upload Files**: Upload all files from this directory to your web server's public folder
2. **Set Permissions**: Ensure files are readable (644 for files, 755 for directories)
3. **Access**: Visit your domain to use the app

### Option 2: GitHub Pages (Free hosting)

1. **Create Repository**: Create a new GitHub repository
2. **Upload Files**: Upload all files to the repository
3. **Enable Pages**: Go to Settings > Pages, select source branch
4. **Access**: Your app will be available at `https://yourusername.github.io/repository-name`

### Option 3: Netlify (Free hosting with custom domain)

1. **Drag & Drop**: Go to [netlify.com](https://netlify.com) and drag this folder
2. **Custom Domain**: Add your custom domain in site settings
3. **HTTPS**: Automatic SSL certificate

### Option 4: Vercel (Free hosting)

1. **Install Vercel CLI**: `npm i -g vercel`
2. **Deploy**: Run `vercel` in this directory
3. **Custom Domain**: Add in Vercel dashboard

## 📁 Required Files for Deployment

```
web-deployment/
├── index.html          # Main application file
├── app.js             # Application logic
├── manifest.json      # PWA manifest
├── sw.js             # Service worker
├── assets/           # Icons and images
│   └── icon.svg
├── .htaccess         # Apache configuration (optional)
├── nginx.conf        # Nginx configuration (optional)
└── package.json      # Web version package info
```

## ⚙️ Server Configuration

### Apache (.htaccess included)
- Compression enabled
- Cache headers set
- Security headers configured
- PWA support enabled

### Nginx (nginx.conf included)
- Gzip compression
- Cache configuration
- Security headers
- SSL ready (uncomment HTTPS section)

## 🔧 Features That Work in Web Version

✅ **All Core Features**:
- Prompt generation for 20+ AI models
- Style reference (sref) management
- Prompt library with search
- Document upload and management
- Local LLM integration (if accessible)
- Export/import functionality
- PWA installation
- Offline functionality
- Responsive design

✅ **Browser Compatibility**:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers

## 🔒 Security Considerations

1. **HTTPS Required**: PWA features require HTTPS in production
2. **CORS**: No server-side API calls, so no CORS issues
3. **Local Storage**: Data stored in browser (client-side only)
4. **No Backend**: Pure frontend app, no server vulnerabilities

## 📱 PWA Features

- **Installable**: Users can install as app on mobile/desktop
- **Offline**: Works without internet after first visit
- **App-like**: Full-screen experience
- **Fast**: Cached resources load instantly

## 🚨 Important Notes

1. **Local LLM**: The local LLM integration requires the LLM server to be accessible from the web (not recommended for security)
2. **File Uploads**: Document uploads work but files are stored in browser only
3. **Data Persistence**: All data is stored in browser's localStorage
4. **Updates**: Users need to refresh to get updates (service worker handles caching)

## 🔄 Updating the App

1. **Replace Files**: Upload new versions of changed files
2. **Clear Cache**: Users may need to hard refresh (Ctrl+F5)
3. **Service Worker**: Automatically updates on next visit

## 📊 Analytics (Optional)

Add Google Analytics or similar by including the tracking code in `index.html` before the closing `</head>` tag.

## 🆘 Troubleshooting

**App not loading**: Check file permissions and server configuration
**PWA not installing**: Ensure HTTPS is enabled
**Offline not working**: Check service worker registration in browser dev tools
**Styling issues**: Verify Bootstrap CDN is accessible

## 📞 Support

For issues with the web deployment, check:
1. Browser console for errors
2. Network tab for failed requests
3. Application tab for service worker status

