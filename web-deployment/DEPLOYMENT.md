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

---

## 🌐 WordPress Integration

### Option A: Subdirectory Method (Recommended) ⭐

Upload the PWA files to a subdirectory on your WordPress hosting:

```
your-wordpress-site.com/prompt-generator/
├── index.html
├── app.js
├── manifest.json
├── sw.js
└── assets/
    └── icon.svg
```

**Steps:**
1. Connect to your hosting via **FTP/SFTP** or use your hosting's **File Manager**
2. Navigate to your WordPress root directory (same level as `wp-content`, `wp-admin`, etc.)
3. Create a new folder called `prompt-generator` (or any name you prefer)
4. Upload all files from this `web-deployment/` folder into that directory
5. Access your app at: `https://yoursite.com/prompt-generator/`

### Option B: Subdomain Method

Set up a subdomain like `app.yoursite.com`:

1. **Create subdomain** in your hosting control panel (cPanel, Plesk, etc.)
2. **Point to directory**: Set the document root to a new folder
3. **Upload files** to the subdomain's document root
4. Access at: `https://app.yoursite.com/`

### Option C: Embed in WordPress Page (iframe)

Create a WordPress page that loads the app via iframe:

1. Upload files to subdirectory (see Option A)
2. Create a new WordPress page
3. Switch to **HTML/Code** mode in the editor
4. Add this code:

```html
<div style="width: 100%; max-width: 1400px; margin: 0 auto;">
    <iframe 
        src="/prompt-generator/" 
        style="width: 100%; height: 90vh; border: none; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);"
        allow="clipboard-read; clipboard-write"
        title="AI Prompt Generator"
    ></iframe>
</div>
```

### WordPress Hosting-Specific Instructions

#### SiteGround
1. Go to **Site Tools** → **File Manager**
2. Navigate to `public_html/`
3. Create folder `prompt-generator`
4. Upload all files

#### Bluehost
1. Log into **cPanel**
2. Open **File Manager**
3. Navigate to `public_html/`
4. Create and upload to new folder

#### WP Engine
1. Use **SFTP** to connect
2. Navigate to your site's root
3. Create folder and upload files

#### Cloudways
1. Access **File Manager** from server management
2. Navigate to `public_html/`
3. Upload files to new subdirectory

---

## ⚠️ WordPress-Specific Considerations

### Caching Plugins

If you use caching plugins, you may need to **exclude** the PWA directory:

| Plugin | Exclusion Setting |
|--------|-------------------|
| **WP Super Cache** | Settings → Advanced → Don't cache pages that contain: `/prompt-generator/` |
| **W3 Total Cache** | Performance → Page Cache → Never cache the following pages |
| **WP Rocket** | Settings → Advanced Rules → Never Cache URL(s) |
| **LiteSpeed Cache** | Settings → Excludes → Do Not Cache URIs |

### SSL/HTTPS Requirements

**PWA features require HTTPS** for:
- Service worker registration
- "Install App" prompt
- Offline functionality

Most WordPress hosts provide free SSL via Let's Encrypt. Make sure your site uses HTTPS.

### CDN Considerations

If using **Cloudflare** or other CDNs:
- PWA files should pass through normally
- Ensure `sw.js` is not cached for too long (add page rule if needed)
- Service worker MIME type must be `application/javascript`

### .htaccess Rules (Apache)

Add to your WordPress `.htaccess` or create one in the PWA folder:

```apache
# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Set correct MIME types for PWA
AddType application/manifest+json .json
AddType application/javascript .js

# Enable GZIP compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
</IfModule>

# Cache static assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/html "access plus 1 hour"
    ExpiresByType text/css "access plus 1 week"
    ExpiresByType application/javascript "access plus 1 week"
    ExpiresByType image/svg+xml "access plus 1 month"
</IfModule>
```

---

## 📁 Required Files for Deployment

```
web-deployment/
├── index.html          # Main application file
├── app.js              # Application logic
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── assets/             # Icons and images
│   └── icon.svg
├── .htaccess           # Apache configuration (optional)
├── nginx.conf          # Nginx configuration (optional)
└── package.json        # Web version package info
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
- Custom dropdown options (add your own values)
- Local LLM integration (if accessible)
- Export/import functionality
- PWA installation
- Offline functionality
- Responsive design
- Dark mode support

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

| Issue | Solution |
|-------|----------|
| **App not loading** | Check file permissions and server configuration |
| **PWA not installing** | Ensure HTTPS is enabled |
| **Offline not working** | Check service worker registration in browser dev tools |
| **Styling issues** | Verify Bootstrap CDN is accessible |
| **WordPress caching** | Exclude PWA directory from cache plugins |
| **404 errors** | Check file paths and folder names |

## 📞 Support

For issues with the web deployment, check:
1. Browser console for errors (F12 → Console)
2. Network tab for failed requests
3. Application tab for service worker status
