#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Konva for Node.js (v9 uses lib/index-node.js as main entry)
const Konva = require('konva');

// ─── Constants: Cover Slide ───────────────────────────────────────────────────
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const DEFAULT_READ_CAPTION_BOTTOM = 45;
const DEFAULT_TITLE_GAP = 40;
const DEFAULT_LOGO_GAP = 36;
const DEFAULT_TITLE_PADDING_X = 45;

const AUTO_FIT_BASE = 80;  // Starting font size
const AUTO_FIT_MAX = 90;   // Max we'll try bumping to

// ─── Constants: Text Slide ────────────────────────────────────────────────────
const BG_COLOR = '#f8f5f0';
const TEXT_COLOR = '#1a1a1a';
const SUBTLE_COLOR = '#888888';
const PAD_X = 80;
const LOGO_SIZE = 56;
const TEXT_WIDTH = CANVAS_WIDTH - PAD_X * 2; // 920
const BOTTOM_BAR_Y = CANVAS_HEIGHT - 120;    // 1230
const ICON_SIZE = 30;
const HEADER_BLOCK_H = LOGO_SIZE + 20;       // 76
const HEADER_TEXT_GAP = 30;
const TEXT_FONT_SIZE = 38;
const TEXT_LINE_HEIGHT = 1.55;

// ─── Brand Configs ────────────────────────────────────────────────────────────
const BRAND_CONFIGS = {
  healthycollege:   { name: 'Healthy College',   color: '#22c55e', accentColor: '#16a34a' },
  longevitycollege: { name: 'Longevity College',  color: '#0ea5e9', accentColor: '#0284c7' },
  vitalitycollege:  { name: 'Vitality College',   color: '#14b8a6', accentColor: '#0d9488' },
  wellbeingcollege: { name: 'Wellbeing College',   color: '#eab308', accentColor: '#ca8a04' },
  holisticcollege:  { name: 'Holistic College',    color: '#f97316', accentColor: '#ea580c' },
};

const BRAND_ABBREVIATIONS = {
  healthycollege:   'HCO',
  holisticcollege:  'HCO',
  longevitycollege: 'LCO',
  vitalitycollege:  'VCO',
  wellbeingcollege: 'WCO',
};

const BRAND_DISPLAY_NAMES = {
  healthycollege:   'The Healthy College',
  longevitycollege: 'The Longevity College',
  wellbeingcollege: 'The Wellbeing College',
  vitalitycollege:  'The Vitality College',
  holisticcollege:  'The Holistic College',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBrandAbbr(brandId) {
  if (BRAND_ABBREVIATIONS[brandId]) return BRAND_ABBREVIATIONS[brandId];
  return (brandId.charAt(0).toUpperCase() + 'CO');
}

function getBrandLabel(brandId) {
  if (BRAND_CONFIGS[brandId]) return BRAND_CONFIGS[brandId].name;
  return brandId;
}

function getBrandColor(brandId) {
  if (BRAND_CONFIGS[brandId]) return BRAND_CONFIGS[brandId].color;
  return '#888888';
}

function getBrandDisplayName(brandId) {
  if (BRAND_DISPLAY_NAMES[brandId]) return BRAND_DISPLAY_NAMES[brandId];
  return brandId;
}

function getBrandHandle(brandId) {
  return `@the${brandId}`;
}

// ─── Auto-fit Font Size (exact copy from PostCanvas.tsx) ──────────────────────

function countLines(text, maxWidth, fontSize) {
  const avgCharWidth = fontSize * 0.48;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);
  const upperText = (text || '').toUpperCase().trim();
  const words = upperText.split(/\s+/).filter(Boolean);
  let lineCount = 1;
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      lineCount++;
      current = word;
    } else {
      current = test;
    }
  }
  return lineCount;
}

function autoFitFontSize(text, maxWidth) {
  const baseLinesCount = countLines(text, maxWidth, AUTO_FIT_BASE);

  // If 3 lines at 80, try increasing font while still 3 lines
  if (baseLinesCount === 3) {
    let bestFs = AUTO_FIT_BASE;
    for (let fs = AUTO_FIT_BASE + 1; fs <= AUTO_FIT_MAX; fs++) {
      if (countLines(text, maxWidth, fs) === 3) bestFs = fs;
      else break;
    }
    return bestFs;
  }

  // If 2 lines at 80, try increasing font while still 2 lines
  if (baseLinesCount <= 2) {
    let bestFs = AUTO_FIT_BASE;
    for (let fs = AUTO_FIT_BASE + 1; fs <= AUTO_FIT_MAX; fs++) {
      if (countLines(text, maxWidth, fs) <= 2) bestFs = fs;
      else break;
    }
    return bestFs;
  }

  // If 4 lines at 80, try increasing slightly
  if (baseLinesCount === 4) {
    let bestFs = AUTO_FIT_BASE;
    for (let fs = AUTO_FIT_BASE + 1; fs <= AUTO_FIT_MAX; fs++) {
      if (countLines(text, maxWidth, fs) === 4) bestFs = fs;
      else break;
    }
    return bestFs;
  }

  // 5+ lines at 80 — reduce font to get 4 lines
  for (let fs = AUTO_FIT_BASE - 1; fs >= 40; fs--) {
    if (countLines(text, maxWidth, fs) <= 4) return fs;
  }

  return AUTO_FIT_BASE;
}

// ─── Balance Title Text (exact copy from PostCanvas.tsx) ──────────────────────

function balanceTitleText(title, maxWidth, fontSize) {
  const upperText = (title || '').toUpperCase().trim();
  const words = upperText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [''], fontSize };

  const avgCharWidth = fontSize * 0.48;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

  // Greedy wrap
  const greedyLines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      greedyLines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) greedyLines.push(current);
  const lineCount = greedyLines.length;

  if (lineCount <= 1) return { lines: greedyLines, fontSize };

  // Balance 2 lines
  if (lineCount === 2) {
    let bestLines = null;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine) continue;
      const diff = Math.abs(l1.length - l2.length);
      if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2]; }
    }
    if (bestLines) return { lines: bestLines, fontSize };
  }

  // Balance 3 lines
  if (lineCount === 3 && words.length >= 3) {
    let bestLines = null;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const l1 = words.slice(0, i).join(' ');
        const l2 = words.slice(i, j).join(' ');
        const l3 = words.slice(j).join(' ');
        if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine || l3.length > maxCharsPerLine) continue;
        const diff = Math.max(
          Math.abs(l1.length - l2.length),
          Math.abs(l2.length - l3.length),
          Math.abs(l1.length - l3.length)
        );
        if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3]; }
      }
    }
    if (bestLines) return { lines: bestLines, fontSize };
  }

  // Balance 4 lines
  if (lineCount === 4 && words.length >= 4) {
    let bestLines = null;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length - 2; i++) {
      for (let j = i + 1; j < words.length - 1; j++) {
        for (let k = j + 1; k < words.length; k++) {
          const l1 = words.slice(0, i).join(' ');
          const l2 = words.slice(i, j).join(' ');
          const l3 = words.slice(j, k).join(' ');
          const l4 = words.slice(k).join(' ');
          if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine ||
              l3.length > maxCharsPerLine || l4.length > maxCharsPerLine) continue;
          const diff = Math.max(
            Math.abs(l1.length - l2.length),
            Math.abs(l2.length - l3.length),
            Math.abs(l3.length - l4.length),
            Math.abs(l1.length - l4.length)
          );
          if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3, l4]; }
        }
      }
    }
    if (bestLines) return { lines: bestLines, fontSize };
  }

  // If 5+ lines, clamp to 4 by joining overflow
  if (lineCount > 4) {
    const clamped = greedyLines.slice(0, 3);
    clamped.push(greedyLines.slice(3).join(' '));
    const clampedWords = clamped.join(' ').split(/\s+/).filter(Boolean);
    let bestLines = null;
    let bestDiff = Infinity;
    for (let i = 1; i < clampedWords.length - 2; i++) {
      for (let j = i + 1; j < clampedWords.length - 1; j++) {
        for (let k = j + 1; k < clampedWords.length; k++) {
          const l1 = clampedWords.slice(0, i).join(' ');
          const l2 = clampedWords.slice(i, j).join(' ');
          const l3 = clampedWords.slice(j, k).join(' ');
          const l4 = clampedWords.slice(k).join(' ');
          if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine ||
              l3.length > maxCharsPerLine || l4.length > maxCharsPerLine) continue;
          const diff = Math.max(
            Math.abs(l1.length - l2.length),
            Math.abs(l2.length - l3.length),
            Math.abs(l3.length - l4.length),
            Math.abs(l1.length - l4.length)
          );
          if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3, l4]; }
        }
      }
    }
    if (bestLines) return { lines: bestLines, fontSize };
    return { lines: clamped, fontSize };
  }

  // Fallback: clamp to max 4 lines
  if (greedyLines.length > 4) {
    const clamped = greedyLines.slice(0, 3);
    clamped.push(greedyLines.slice(3).join(' '));
    return { lines: clamped, fontSize };
  }
  return { lines: greedyLines, fontSize };
}

// ─── Text Slide helpers ───────────────────────────────────────────────────────

function estimateTextHeight(text, fontSize, lineHeight, maxWidth) {
  const avgCharWidth = fontSize * 0.48;
  const words = text.split(/\s+/);
  let lines = 1;
  let lineWidth = 0;
  for (const word of words) {
    const wordWidth = word.length * avgCharWidth;
    if (lineWidth + wordWidth > maxWidth && lineWidth > 0) {
      lines++;
      lineWidth = wordWidth + avgCharWidth;
    } else {
      lineWidth += wordWidth + avgCharWidth;
    }
  }
  return lines * fontSize * lineHeight;
}

function computeStableContentY(allTexts) {
  const availableH = BOTTOM_BAR_Y - 40 - 60; // 1130
  let maxTotalH = 0;
  for (const t of allTexts) {
    const textH = estimateTextHeight(t, TEXT_FONT_SIZE, TEXT_LINE_HEIGHT, TEXT_WIDTH);
    const totalH = HEADER_BLOCK_H + HEADER_TEXT_GAP + textH;
    if (totalH > maxTotalH) maxTotalH = totalH;
  }
  const centered = 60 + (availableH - maxTotalH) / 2;
  return Math.max(60, Math.min(centered, 280));
}

function replaceHandles(text, handle) {
  return text
    .replace(/@\{\{brandhandle\}\}/g, handle)
    .replace(/\{\{brandhandle\}\}/g, handle)
    .replace(/@\{brandhandle\}/g, handle)
    .replace(/\{brandhandle\}/g, handle);
}

// ─── Stage export helper ─────────────────────────────────────────────────────

function stageToBuffer(stage) {
  const dataURL = stage.toDataURL({ pixelRatio: 1 });
  const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// ─── Render Cover Slide ──────────────────────────────────────────────────────

async function renderCoverSlide(input) {
  const {
    brand,
    title,
    backgroundImage,
    coverOutput,
  } = input;

  const brandColor = getBrandColor(brand);
  const brandAbbr = getBrandAbbr(brand);
  const readCaptionBottom = DEFAULT_READ_CAPTION_BOTTOM;
  const titleGap = DEFAULT_TITLE_GAP;
  const logoGap = DEFAULT_LOGO_GAP;
  const titlePaddingX = DEFAULT_TITLE_PADDING_X;
  const titleMaxWidth = CANVAS_WIDTH - titlePaddingX * 2;

  // Auto-fit title
  const fontSize = autoFitFontSize(title, titleMaxWidth);
  const { lines } = balanceTitleText(title, titleMaxWidth, fontSize);
  const lineH = fontSize * 1.1;
  const titleHeight = (lines.length - 1) * lineH + fontSize;

  // Vertical positioning (bottom-up)
  const rcy = CANVAS_HEIGHT - readCaptionBottom - 24;
  const ty = rcy - titleGap - titleHeight;
  const logoHeight = 40;
  const ly = ty - logoGap - logoHeight;

  // Create stage
  const stage = new Konva.Stage({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const layer = new Konva.Layer();
  stage.add(layer);

  // 1. Background image
  const bgImg = await loadImage(backgroundImage);
  const bgKonva = new Konva.Image({
    image: bgImg,
    x: 0,
    y: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });
  layer.add(bgKonva);

  // 2. Gradient overlay
  const gradY = CANVAS_HEIGHT * 0.4;
  const gradH = CANVAS_HEIGHT * 0.6;
  const gradRect = new Konva.Rect({
    x: 0,
    y: gradY,
    width: CANVAS_WIDTH,
    height: gradH,
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: gradH },
    fillLinearGradientColorStops: [
      0, 'rgba(0,0,0,0)',
      0.3, 'rgba(0,0,0,0.5)',
      1, 'rgba(0,0,0,0.95)',
    ],
  });
  layer.add(gradRect);

  // 3. Logo bar with lines
  const gapWidth = 113;
  const barWidth = titleMaxWidth / 2 - gapWidth / 2;

  if (barWidth > 0) {
    // Left line
    layer.add(new Konva.Line({
      points: [titlePaddingX, ly + logoHeight / 2, titlePaddingX + barWidth, ly + logoHeight / 2],
      stroke: 'white',
      strokeWidth: 2,
    }));
    // Right line
    const rightLineStart = CANVAS_WIDTH - titlePaddingX - barWidth;
    layer.add(new Konva.Line({
      points: [rightLineStart, ly + logoHeight / 2, CANVAS_WIDTH - titlePaddingX, ly + logoHeight / 2],
      stroke: 'white',
      strokeWidth: 2,
    }));
  }

  // Brand abbreviation centered (matches LogoWithLines: x=(CANVAS_WIDTH-gapWidth)/2, width=gapWidth)
  const abbrText = new Konva.Text({
    text: brandAbbr,
    fontSize: 28,
    fontFamily: 'Inter',
    fontStyle: 'bold',
    fill: 'white',
    align: 'center',
    width: gapWidth,
    x: (CANVAS_WIDTH - gapWidth) / 2,
    y: ly + logoHeight / 2 - 14,
  });
  layer.add(abbrText);

  // 4. Title lines (matches TitleLayer: x=paddingX, width=CANVAS_WIDTH-paddingX*2)
  for (let i = 0; i < lines.length; i++) {
    const lineY = ty + i * lineH;
    const lineText = new Konva.Text({
      text: lines[i],
      fontSize,
      fontFamily: 'Anton',
      fontStyle: 'normal',
      fill: 'white',
      align: 'center',
      width: titleMaxWidth,
      x: titlePaddingX,
      y: lineY,
    });
    layer.add(lineText);
  }

  // 5. "Swipe" label
  const swipeLabel = new Konva.Text({
    text: 'Swipe',
    fontSize: 24,
    fontFamily: 'Inter',
    fill: 'white',
    opacity: 0.9,
    align: 'center',
    width: CANVAS_WIDTH,
    x: 0,
    y: rcy,
  });
  layer.add(swipeLabel);

  // Export
  layer.draw();
  ensureDir(coverOutput);
  const buf = stageToBuffer(stage);
  fs.writeFileSync(coverOutput, buf);
  stage.destroy();

  return coverOutput;
}

// ─── Render Text Slide ───────────────────────────────────────────────────────

async function renderTextSlide(input, slideText, outputPath, isLast, contentY, logoImg) {
  const { brand, shareIconPath, saveIconPath, logoPath } = input;

  const brandColor = getBrandColor(brand);
  const brandDisplayName = getBrandDisplayName(brand);
  const brandHandle = getBrandHandle(brand);
  const brandInitial = brandDisplayName.charAt(0).toUpperCase();

  const stage = new Konva.Stage({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const layer = new Konva.Layer();
  stage.add(layer);

  // 1. Background
  layer.add(new Konva.Rect({
    x: 0, y: 0,
    width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
    fill: BG_COLOR,
  }));

  // 2. Brand header
  const headerX = PAD_X;
  const headerY = contentY;
  const circleR = LOGO_SIZE / 2;

  if (logoImg) {
    // Clip logo to circle
    const logoGroup = new Konva.Group({
      x: headerX,
      y: headerY,
      clipFunc: (ctx) => {
        ctx.arc(circleR, circleR, circleR, 0, Math.PI * 2, false);
      },
    });
    logoGroup.add(new Konva.Image({
      image: logoImg,
      x: 0, y: 0,
      width: LOGO_SIZE, height: LOGO_SIZE,
    }));
    layer.add(logoGroup);
  } else {
    // Colored circle with initial
    layer.add(new Konva.Circle({
      x: headerX + circleR,
      y: headerY + circleR,
      radius: circleR,
      fill: brandColor,
    }));
    layer.add(new Konva.Text({
      text: brandInitial,
      fontSize: 28,
      fontFamily: 'Inter',
      fontStyle: 'bold',
      fill: 'white',
      x: headerX,
      y: headerY,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      align: 'center',
      verticalAlign: 'middle',
    }));
  }

  // Brand name
  layer.add(new Konva.Text({
    text: brandDisplayName,
    fontSize: 30,
    fontFamily: 'Inter',
    fontStyle: 'bold',
    fill: TEXT_COLOR,
    x: headerX + LOGO_SIZE + 16,
    y: headerY + 4,
  }));

  // Handle
  layer.add(new Konva.Text({
    text: brandHandle,
    fontSize: 24,
    fontFamily: 'Inter',
    fill: SUBTLE_COLOR,
    x: headerX + LOGO_SIZE + 16,
    y: headerY + 38,
  }));

  // 3. Body text
  const displayText = replaceHandles(slideText, brandHandle);
  layer.add(new Konva.Text({
    text: displayText,
    fontSize: TEXT_FONT_SIZE,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fill: TEXT_COLOR,
    x: PAD_X,
    y: contentY + HEADER_BLOCK_H + HEADER_TEXT_GAP,
    width: TEXT_WIDTH,
    lineHeight: TEXT_LINE_HEIGHT,
    wrap: 'word',
  }));

  // 4. Bottom bar
  // "SHARE" text
  layer.add(new Konva.Text({
    text: 'SHARE',
    fontSize: 24,
    fontFamily: 'Inter',
    fontStyle: 'bold',
    fill: TEXT_COLOR,
    x: PAD_X,
    y: BOTTOM_BAR_Y + 2,
    letterSpacing: 2,
  }));

  // Share icon
  if (shareIconPath && fs.existsSync(shareIconPath)) {
    const shareImg = await loadImage(shareIconPath);
    layer.add(new Konva.Image({
      image: shareImg,
      x: PAD_X + 110,
      y: BOTTOM_BAR_Y - 2,
      width: 30,
      height: 30,
    }));
  }

  // "SWIPE" text (hidden on last slide)
  if (!isLast) {
    layer.add(new Konva.Text({
      text: 'SWIPE',
      fontSize: 24,
      fontFamily: 'Inter',
      fontStyle: 'bold',
      fill: TEXT_COLOR,
      x: 0,
      y: BOTTOM_BAR_Y + 2,
      width: CANVAS_WIDTH,
      align: 'center',
      letterSpacing: 2,
    }));
  }

  // Save icon
  if (saveIconPath && fs.existsSync(saveIconPath)) {
    const saveImg = await loadImage(saveIconPath);
    layer.add(new Konva.Image({
      image: saveImg,
      x: CANVAS_WIDTH - PAD_X - 140,
      y: BOTTOM_BAR_Y - 1,
      width: 28,
      height: 28,
    }));
  }

  // "SAVE" text
  layer.add(new Konva.Text({
    text: 'SAVE',
    fontSize: 24,
    fontFamily: 'Inter',
    fontStyle: 'bold',
    fill: TEXT_COLOR,
    x: CANVAS_WIDTH - PAD_X - 98,
    y: BOTTOM_BAR_Y + 2,
    letterSpacing: 2,
  }));

  // Export
  layer.draw();
  ensureDir(outputPath);
  const buf = stageToBuffer(stage);
  fs.writeFileSync(outputPath, buf);
  stage.destroy();

  return outputPath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.log(JSON.stringify({ success: false, error: 'No input JSON path provided' }));
    process.exit(1);
  }

  let input;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    input = JSON.parse(raw);
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: `Failed to read input JSON: ${err.message}` }));
    process.exit(1);
  }

  const {
    brand,
    title,
    backgroundImage,
    slideTexts = [],
    coverOutput,
    slideOutputs = [],
    logoPath,
    shareIconPath,
    saveIconPath,
    fontPaths = {},
  } = input;

  // Register fonts
  if (fontPaths.anton && fs.existsSync(fontPaths.anton)) {
    registerFont(fontPaths.anton, { family: 'Anton' });
  }
  if (fontPaths.inter && fs.existsSync(fontPaths.inter)) {
    registerFont(fontPaths.inter, { family: 'Inter', weight: '400' });
    registerFont(fontPaths.inter, { family: 'Inter', weight: '700', style: 'normal' });
  }

  // Pre-load logo image if provided
  let logoImg = null;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      logoImg = await loadImage(logoPath);
    } catch (_) {
      // Fall back to circle with initial
    }
  }

  // Render cover slide
  const coverPath = await renderCoverSlide(input);

  // Compute stable contentY across all text slides
  const contentY = computeStableContentY(slideTexts);

  // Render text slides
  const slidePaths = [];
  for (let i = 0; i < slideTexts.length; i++) {
    const outputPath = slideOutputs[i];
    if (!outputPath) continue;
    const isLast = i === slideTexts.length - 1;
    const sp = await renderTextSlide(input, slideTexts[i], outputPath, isLast, contentY, logoImg);
    slidePaths.push(sp);
  }

  console.log(JSON.stringify({ success: true, coverPath, slidePaths }));
}

main().catch((err) => {
  console.log(JSON.stringify({ success: false, error: err.message || String(err) }));
  process.exit(1);
});
