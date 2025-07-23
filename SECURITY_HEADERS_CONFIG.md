# Security Headers Configuration Guide

## 1. Content Security Policy (CSP) 
✅ **Implemented in index.html**

The CSP is configured to allow:
- **script-src**: Self, inline scripts (for React), Supabase, GetYourGuide, JSDelivr CDN
- **connect-src**: Self, Supabase APIs/WebSockets, Mapbox APIs, GetYourGuide
- **img-src**: Self, data URLs, blob URLs, Supabase storage, Mapbox tiles, GetYourGuide images
- **style-src**: Self, inline styles (for Tailwind), Google Fonts, Mapbox styles
- **font-src**: Self, Google Fonts
- **frame-src**: Self, GetYourGuide widgets
- **frame-ancestors**: Self only (prevents clickjacking)
- **object-src**: None (blocks plugins)
- **base-uri**: Self only
- **form-action**: Self and Supabase (for auth forms)

## 2. Referrer Policy
✅ **Implemented in index.html**

```html
<meta name="referrer" content="strict-origin-when-cross-origin">
```

This policy:
- Sends full URL to same-origin requests
- Sends only origin to cross-origin HTTPS requests
- Sends nothing to HTTP from HTTPS

## 3. Strict Transport Security (HSTS)
⚠️ **HTTP Header - Configure at hosting provider**

### For Vercel (vercel.json):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        }
      ]
    }
  ]
}
```

### For Netlify (_headers file):
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### For Cloudflare/Custom:
Add this header: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

**Explanation**:
- `max-age=31536000`: Forces HTTPS for 1 year
- `includeSubDomains`: Applies to all subdomains
- `preload`: Eligible for browser preload lists

## 4. Subresource Integrity (SRI)
⚠️ **Partially implemented - needs hash generation**

Current implementation in index.html:
```html
<script async defer 
  src="https://widget.getyourguide.com/dist/pa.umd.production.min.js" 
  data-gyg-partner-id="2PBDXWH" 
  integrity="sha384-REPLACE_WITH_ACTUAL_HASH" 
  crossorigin="anonymous">
</script>
```

**To generate actual hash**:
```bash
# Download the script and generate hash
curl -s https://widget.getyourguide.com/dist/pa.umd.production.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```

**Example for other external resources**:
```html
<link rel="stylesheet" 
  href="https://cdn.example.com/styles.css"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  crossorigin="anonymous">
```

## 5. X-Content-Type-Options
⚠️ **HTTP Header - Configure at hosting provider**

### For Vercel (vercel.json):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

### For Netlify (_headers file):
```
/*
  X-Content-Type-Options: nosniff
```

**Purpose**: Prevents browsers from MIME-sniffing responses, reducing XSS risks.

## 6. Additional Recommended Headers

### X-Frame-Options (backup for CSP frame-ancestors):
```
X-Frame-Options: SAMEORIGIN
```

### X-XSS-Protection (legacy browsers):
```
X-XSS-Protection: 1; mode=block
```

### Permissions Policy:
```
Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()
```

## Complete Vercel Configuration (vercel.json):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(self), payment=()"
        }
      ]
    }
  ]
}
```

## Testing Your Headers

Use these tools to verify implementation:
- **Security Headers**: https://securityheaders.com/
- **Mozilla Observatory**: https://observatory.mozilla.org/
- **CSP Evaluator**: https://csp-evaluator.withgoogle.com/

## Next Steps

1. ✅ CSP and Referrer Policy implemented in HTML
2. ⚠️ Generate actual SRI hash for GetYourGuide script
3. ⚠️ Configure HTTP headers at your hosting provider
4. ⚠️ Test all headers after deployment
5. ⚠️ Monitor CSP violations in browser console