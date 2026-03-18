# PromptForge Security Audit & Hardening Guide

**Date**: 2026-02-06  
**App Version**: PromptForge (based on prompt-app 2.0.0+)

## Executive Summary

PromptForge is a **static client-side web app** with no server backend. All data is stored in browser `localStorage`. The primary security concerns are:

1. **XSS (Cross-Site Scripting)** from untrusted library content rendering
2. **localStorage data exposure** if device is compromised
3. **External API calls** to CORS proxies and local LLMs
4. **File upload handling** and data URL generation
5. **Missing HTTP security headers** for deployment

---

## 🔴 Critical Issues (Fix Now)

### 1. XSS in Library Display (`innerHTML` injection)

**Risk**: User-controlled data (prompt names, descriptions, URLs, search queries) is rendered via `innerHTML` without sanitization.

**Affected code** (`app.js`):
- Line ~1586: `libraryContainer.innerHTML = libraryHTML;` (prompt library)
- Line ~2398: `libraryContainer.innerHTML = libraryHTML;` (sref library)
- Line ~2945: `libraryContainer.innerHTML = libraryHTML;` (search results)
- Line ~2993: `libraryContainer.innerHTML = libraryHTML;` (sref search)
- Line ~2087: `container.innerHTML = filesHTML;` (documents)
- Line ~3761: `resultsContainer.innerHTML = resultsHTML;` (unified search)

**Attack vector**: User saves a prompt with name like:
```
<img src=x onerror="alert('XSS')"> malicious prompt
```
When library renders, the script executes.

**Fix**:
Replace all library rendering with **DOM node creation** + `textContent`:

```javascript
// Instead of:
libraryContainer.innerHTML = libraryHTML;

// Use:
libraryContainer.replaceChildren();
prompts.forEach(prompt => {
  const card = document.createElement('div');
  card.className = 'library-item';
  
  const title = document.createElement('h6');
  title.textContent = prompt.name; // safe
  
  const loadBtn = document.createElement('button');
  loadBtn.className = 'btn btn-sm btn-outline-primary';
  loadBtn.onclick = () => this.loadPrompt(prompt.id);
  // ... build with DOM nodes only
  
  card.append(title, loadBtn);
  libraryContainer.appendChild(card);
});
```

---

### 2. XSS in Modal Dialogs

**Risk**: Several modals use `innerHTML` with template literals containing user data.

**Affected code**:
- Line ~535: `modal.innerHTML = ...` (validation modal with error messages)
- Line ~3006: `modal.innerHTML = ...` (save settings modal)
- Line ~3138: `modal.innerHTML = ...` (restore backups modal with backup data)
- Line ~3249: `modal.innerHTML = ...` (LLM settings modal)
- Line ~3830: `modal.innerHTML = ...` (export modal)
- Line ~3904: `modal.innerHTML = ...` (batch operations modal)
- Line ~4254: `modal.innerHTML = ...` (custom options modal)

**Fix**:
Same approach—build modals using DOM nodes, or sanitize user data before interpolation.

---

### 3. Unsafe HTML Extraction from Web Content

**Risk**: `extractTextFromHtml()` uses `innerHTML` to parse untrusted HTML from fetched URLs.

**Affected code** (`app.js` line ~1837):
```javascript
extractTextFromHtml(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html; // ← attacker-controlled HTML
    // ...
}
```

**Fix**:
Use **`DOMParser`** instead:

```javascript
extractTextFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove dangerous elements
    doc.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
    
    return doc.body.textContent || '';
}
```

---

### 4. Search Highlighting XSS

**Risk**: `highlightSearchTerm()` likely wraps matched text in `<mark>` tags using string manipulation.

**Fix**:
If you're using regex replace with `<mark>$1</mark>`, ensure the **matched text is escaped** before wrapping. Better: use `document.createTextNode()` and manually wrap segments.

---

## 🟡 Medium Priority Issues

### 5. localStorage Tampering

**Risk**: Malicious browser extensions or XSS attacks can read/modify localStorage.

**Current exposure**:
- Saved prompts
- LLM API URLs/keys (if users store keys)
- Uploaded document content
- Custom options

**Mitigation**:
- Add **integrity checks**: sign critical data with HMAC.
- Warn users **not to store API keys** in the app.
- Consider **sessionStorage** for sensitive temp data.

---

### 6. CORS Proxy Abuse

**Risk**: App uses public CORS proxies (`allorigins.win`, `cors-anywhere`) to fetch arbitrary URLs. Attackers could:
- Make the app fetch malicious content
- Use your app as a proxy bouncer

**Affected code** (`app.js` line ~1798):
```javascript
const proxies = ['https://api.allorigins.win/raw?url=', ...];
const response = await fetch(proxyUrl);
```

**Mitigation**:
- **Whitelist allowed domains** (e.g., only fetch from known AI doc sites like `docs.midjourney.com`, `platform.openai.com`, etc.).
- Add **URL validation** before fetching:

```javascript
const ALLOWED_DOMAINS = ['docs.midjourney.com', 'platform.openai.com', 'huggingface.co'];

function isAllowedUrl(url) {
    try {
        const parsed = new URL(url);
        return ALLOWED_DOMAINS.some(domain => parsed.hostname.endsWith(domain));
    } catch {
        return false;
    }
}

// In fetchFromUrl():
if (!isAllowedUrl(url)) {
    throw new Error('Only AI documentation sites are allowed');
}
```

---

### 7. Local LLM API Exposure

**Risk**: App makes unauthenticated requests to `localhost` LLM APIs. If user runs a compromised LLM or the API is exposed to the network, attackers could:
- Send malicious prompts to LLM
- Exfiltrate data via LLM responses

**Mitigation**:
- Warn users to **only run trusted LLM software**.
- Add a **"trusted mode" checkbox** that users must explicitly enable.
- Never send PII/secrets to LLM analysis.

---

### 8. File Upload Size Limits

**Risk**: Users can upload very large files, causing browser OOM.

**Current limit**: 5MB for sref images (line ~2491), but document uploads have no explicit limit.

**Fix**:
Add size validation for document uploads:

```javascript
if (file.size > 10 * 1024 * 1024) { // 10MB limit
    this.showToast('File too large. Max 10MB.', 'warning');
    return;
}
```

---

## 🟢 Low Priority / Best Practices

### 9. Missing HTTP Security Headers

**Risk**: When deployed to HostGator, the site lacks security headers.

**Recommended `.htaccess`** (create/update in `public/prompt-helper/`):

```apache
# Security Headers
<IfModule mod_headers.c>
    # Prevent clickjacking
    Header always set X-Frame-Options "SAMEORIGIN"
    
    # XSS protection (legacy browsers)
    Header always set X-XSS-Protection "1; mode=block"
    
    # Prevent MIME sniffing
    Header always set X-Content-Type-Options "nosniff"
    
    # Referrer policy
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # Content Security Policy (adjust as needed)
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://cdn.jsdelivr.net; connect-src 'self' http://localhost:* https://api.allorigins.win https://corsproxy.io; frame-src 'self';"
    
    # Force HTTPS (if SSL is enabled)
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
</IfModule>

# Force HTTPS redirect (if SSL is available)
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
</IfModule>
```

---

### 10. Service Worker Cache Poisoning

**Risk**: `sw.js` caches resources. If an attacker injects malicious content, it persists.

**Mitigation**:
- Use **versioned cache names** in `sw.js`.
- Implement **cache invalidation** on app updates.
- Only cache same-origin resources.

---

### 11. Subresource Integrity (SRI)

**Risk**: CDN compromise (Bootstrap, Bootstrap Icons from `cdn.jsdelivr.net`).

**Fix**:
Add SRI hashes to CDN links in `index.html`:

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" 
      integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN"
      crossorigin="anonymous" rel="stylesheet">
```

(Use [SRI Hash Generator](https://www.srihash.org/))

---

## 🛡️ Hardening Priority List

### Immediate (before public launch)
1. **Replace all library `innerHTML` rendering with DOM nodes + `textContent`** (prevents stored XSS)
2. **Fix `extractTextFromHtml()` to use `DOMParser`** (prevents XSS from fetched content)
3. **Add `.htaccess` security headers** (CSP, X-Frame-Options, etc.)
4. **Whitelist allowed fetch domains** (prevent CORS proxy abuse)

### Soon
5. Add **file upload size limits** for documents
6. Add **SRI hashes** to CDN resources
7. Sanitize/escape **search highlighting** output
8. Review modal `innerHTML` usage

### Later
9. Implement localStorage **integrity checks**
10. Add **"trusted mode" for LLM** with explicit user consent
11. Review service worker caching strategy

---

## Testing Checklist

Before deploying hardening fixes, test:

- [ ] Prompt library with `<script>` in name doesn't execute
- [ ] Sref library with `<img onerror>` in URL doesn't execute
- [ ] Search with XSS payload doesn't execute
- [ ] File upload with 50MB file is rejected
- [ ] Fetching from `evil.com` is blocked (if whitelist implemented)
- [ ] App still functions normally in Chrome/Firefox/Safari
- [ ] Dark mode toggle still works
- [ ] Export/import doesn't break

---

## Notes

- **Good**: Output rendering (`displayOutput()`) was already hardened (uses `textContent` + sandboxed iframe).
- **Good**: No server backend means no SQL injection, CSRF, or auth bypass risks.
- **Risk**: App's **biggest attack surface is localStorage → library display**. Fix that first.

---

**Prepared by**: AI Security Review  
**Next Review**: After implementing critical fixes
