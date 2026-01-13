# Fonts Directory

## Required Fonts

### Title Font (Poppins)
- **Poppins-Bold.ttf** ✅ (included)
- **Poppins-Regular.ttf** ✅ (included)
- **Poppins-SemiBold.ttf** ✅ (included)

### Content Font (Browallia New Bold)
- **BrowalliaNew-Bold.ttf** ❌ (needs to be added manually)

## How to Install Browallia New Bold

Browallia New Bold is a Thai font that comes bundled with Microsoft Windows. To get it:

### Option 1: Copy from Windows
1. On a Windows computer, go to `C:\Windows\Fonts`
2. Find `BrowalliaNew Bold` or `browab.ttf`
3. Copy it to this directory as `BrowalliaNew-Bold.ttf`

### Option 2: Download from font websites
1. Search for "Browallia New Bold TTF download"
2. Download the Bold variant
3. Rename to `BrowalliaNew-Bold.ttf` and place in this directory

### Option 3: Use Canva Export
1. If you have Canva Pro, create a design with Browallia New Bold
2. Check your browser's developer tools (Network tab) for the font URL
3. Download and rename to `BrowalliaNew-Bold.ttf`

## Current Fallback
Until Browallia New Bold is installed, the system will use **Poppins-Bold.ttf** as a fallback for content text.

To switch to Browallia New Bold once installed, edit `app/core/constants.py`:
```python
FONT_CONTENT = "BrowalliaNew-Bold.ttf"  # Change from "Poppins-Bold.ttf"
```
