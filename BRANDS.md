# Brands Configuration Guide

This document explains how brands work in the Reels Automation system and how to add new brands.

## What is a Brand?

A **brand** is a distinct social media identity with its own:
- Visual identity (templates, colors, logos)
- Content style (prompts, tone, topics)
- Social media accounts (Instagram, Facebook)
- API credentials (Meta access tokens)

## Current Active Brands

| Brand | ID | Instagram Handle | Status |
|-------|-----|------------------|--------|
| Healthy College | `healthycollege` | @thehealthycollege | ✅ Active |
| Vitality College | `vitalitycollege` | @thevitalitycollege | ✅ Active |
| Longevity College | `longevitycollege` | @thelongevitycollege | ✅ Active |
| Holistic College | `holisticcollege` | @theholisticcollege | ✅ Active |
| Wellbeing College | `wellbeingcollege` | @thewellbeingcollege | ✅ Active |

### Removed Brands
- ~~Gym College~~ (removed January 2026)

---

## Brand Components

Each brand requires the following components:

### 1. Environment Variables (`.env` and Railway)

```env
# Required variables for each brand (replace BRANDNAME with uppercase brand name)
BRANDNAME_INSTAGRAM_ACCESS_TOKEN=<meta_access_token>
BRANDNAME_INSTAGRAM_BUSINESS_ACCOUNT_ID=<instagram_business_id>
BRANDNAME_FACEBOOK_PAGE_ID=<facebook_page_id>
BRANDNAME_FACEBOOK_ACCESS_TOKEN=<meta_access_token>
BRANDNAME_META_ACCESS_TOKEN=<meta_access_token>
```

**Example for a new brand "FITNESS ACADEMY":**
```env
FITNESSACADEMY_INSTAGRAM_ACCESS_TOKEN=EAAxxxxxx
FITNESSACADEMY_INSTAGRAM_BUSINESS_ACCOUNT_ID=17841xxxxxx
FITNESSACADEMY_FACEBOOK_PAGE_ID=123456789
FITNESSACADEMY_FACEBOOK_ACCESS_TOKEN=EAAxxxxxx
FITNESSACADEMY_META_ACCESS_TOKEN=EAAxxxxxx
```

### 2. Templates Directory

Location: `assets/templates/<brandname>/`

Structure:
```
assets/templates/brandname/
├── light mode/
│   ├── template1.png
│   ├── template2.png
│   └── ...
└── dark mode/        (optional)
    ├── template1.png
    └── ...
```

### 3. Examples Directory

Location: `assets/examples/<brandname>/`

Structure:
```
assets/examples/brandname/
├── lightmode/
│   ├── example1.png
│   └── ...
└── darkmode/
    ├── example1.png
    └── ...
```

### 4. Logo

Location: `assets/logos/<brandname>_logo.png`

### 5. Brand Colors Configuration

File: `app/core/brand_colors.py`

Add brand colors to the configuration:
```python
BRAND_COLORS = {
    "brandname": {
        "primary": "#HEXCOLOR",
        "secondary": "#HEXCOLOR",
        "accent": "#HEXCOLOR",
        "text": "#HEXCOLOR",
        "background": "#HEXCOLOR"
    }
}
```

### 6. Content Prompts

File: `app/core/constants.py` or brand-specific prompt files

Define content generation prompts for the brand's tone and topics.

---

## How to Add a New Brand

### Step 1: Gather Requirements

- [ ] Brand name (lowercase for IDs, proper case for display)
- [ ] Instagram Business Account ID
- [ ] Facebook Page ID
- [ ] Meta System User Access Token (never expires)
- [ ] Brand colors (hex codes)
- [ ] Logo file (PNG, transparent background)
- [ ] Template images (1080x1920 for Reels)
- [ ] Example content images

### Step 2: Get Meta Credentials

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to **Business Settings > System Users**
3. Create or select a System User
4. Generate a token with permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `business_management`
5. Get the Instagram Business Account ID from Instagram settings
6. Get the Facebook Page ID from page settings

### Step 3: Add Environment Variables

**Local `.env` file:**
```env
# =============================================================================
# NEW BRAND NAME - Instagram & Facebook
# System User Token (never expires, full access)
# =============================================================================
NEWBRAND_INSTAGRAM_ACCESS_TOKEN=<token>
NEWBRAND_INSTAGRAM_BUSINESS_ACCOUNT_ID=<id>
NEWBRAND_FACEBOOK_PAGE_ID=<id>
NEWBRAND_FACEBOOK_ACCESS_TOKEN=<token>
NEWBRAND_META_ACCESS_TOKEN=<token>
```

**Railway (production):**
```bash
cd /path/to/reels-automation
railway link --service scheduler
grep -v '^\s*#' .env | grep -v '^\s*$' | xargs railway variables set
```

### Step 4: Add Asset Files

1. Create template directory: `assets/templates/newbrand/light mode/`
2. Add template PNGs (1080x1920)
3. Create examples directory: `assets/examples/newbrand/lightmode/`
4. Add example images
5. Add logo: `assets/logos/newbrand_logo.png`

### Step 5: Configure Brand in Code

1. Add brand colors in `app/core/brand_colors.py`
2. Add brand prompts if needed
3. Register brand in the brand configuration

### Step 6: Deploy

```bash
git add .
git commit -m "Add new brand: Brand Name"
git push
# Railway auto-deploys from GitHub
```

---

## Environment Variable Naming Convention

| Variable | Pattern | Example |
|----------|---------|---------|
| Instagram Token | `{BRAND}_INSTAGRAM_ACCESS_TOKEN` | `HEALTHYCOLLEGE_INSTAGRAM_ACCESS_TOKEN` |
| Instagram ID | `{BRAND}_INSTAGRAM_BUSINESS_ACCOUNT_ID` | `HEALTHYCOLLEGE_INSTAGRAM_BUSINESS_ACCOUNT_ID` |
| Facebook Page ID | `{BRAND}_FACEBOOK_PAGE_ID` | `HEALTHYCOLLEGE_FACEBOOK_PAGE_ID` |
| Facebook Token | `{BRAND}_FACEBOOK_ACCESS_TOKEN` | `HEALTHYCOLLEGE_FACEBOOK_ACCESS_TOKEN` |
| Meta Token | `{BRAND}_META_ACCESS_TOKEN` | `HEALTHYCOLLEGE_META_ACCESS_TOKEN` |

**Rules:**
- Brand name in UPPERCASE
- No spaces or special characters
- Underscore separators
- All tokens are the same (Meta System User token works for both IG and FB)

---

## Removing a Brand

1. Remove environment variables from `.env`
2. Remove from Railway: `railway variables delete BRANDNAME_*`
3. Optionally archive (don't delete) asset folders
4. Update this document
5. Commit and deploy

---

## Troubleshooting

### Token Expired
System User tokens should never expire. If you see auth errors:
1. Check token in Meta Business Suite
2. Regenerate if needed
3. Update in `.env` and Railway

### Brand Not Showing
1. Check environment variables are set
2. Verify brand ID matches folder names (lowercase)
3. Check logs for credential errors

### Publishing Failed
1. Verify Instagram Business Account is connected to Facebook Page
2. Check token has correct permissions
3. Ensure content meets Meta's requirements (aspect ratio, duration, etc.)

---

## Quick Reference: Railway Commands

```bash
# Link to project
railway link --service scheduler

# View current variables
railway variables

# Set single variable
railway variables set VARNAME=value

# Set from .env file (without comments)
grep -v '^\s*#' .env | grep -v '^\s*$' | xargs railway variables set

# Delete variable
railway variables delete VARNAME

# Check service status
railway status

# View logs
railway logs
```

---

*Last updated: January 2026*
*Removed: Gym College*
*Active brands: Healthy College, Vitality College, Longevity College, Holistic College, Wellbeing College*
