#!/usr/bin/env node
/**
 * Local test: Render carousel covers using render-slides.cjs to verify the fix.
 * Reads test_data.json (from get_test_data.py) and renders cover + slides for each.
 * Output goes to output/test_covers/
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'output', 'test_covers');
const RENDER_SCRIPT = path.join(ROOT, 'scripts', 'render-slides.cjs');
const FONT_ANTON = path.join(ROOT, 'assets', 'fonts', 'Anton-Regular.ttf');
const FONT_INTER = path.join(ROOT, 'assets', 'fonts', 'InterVariable.ttf');
const SHARE_ICON = path.join(ROOT, 'assets', 'icons', 'share.png');
const SAVE_ICON = path.join(ROOT, 'assets', 'icons', 'save.png');

// Read test data
const testDataPath = path.join(TEST_DIR, 'test_data.json');
if (!fs.existsSync(testDataPath)) {
  console.error('Run get_test_data.py first to generate test_data.json');
  process.exit(1);
}

const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
console.log(`Rendering ${testData.length} test covers...\n`);

for (const entry of testData) {
  const brand = entry.brand;
  const bgPath = entry.backgroundImage;

  if (!bgPath || !fs.existsSync(bgPath)) {
    console.log(`  SKIP ${brand}: no background image`);
    continue;
  }

  // Prepare output paths
  const coverOut = path.join(TEST_DIR, `cover_${brand}.png`);
  const slideOutputs = entry.slide_texts.map((_, i) =>
    path.join(TEST_DIR, `slide_${brand}_${i + 1}.png`)
  );

  const input = {
    brand,
    brandConfig: entry.brandConfig,
    title: entry.title,
    backgroundImage: bgPath,
    slideTexts: entry.slide_texts,
    coverOutput: coverOut,
    slideOutputs,
    logoPath: null,
    shareIconPath: fs.existsSync(SHARE_ICON) ? SHARE_ICON : null,
    saveIconPath: fs.existsSync(SAVE_ICON) ? SAVE_ICON : null,
    fontPaths: {
      anton: FONT_ANTON,
      inter: FONT_INTER,
    },
  };

  // Write input JSON
  const jsonPath = path.join(TEST_DIR, `input_${brand}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(input, null, 2));

  console.log(`Rendering ${brand}...`);
  console.log(`  Title: ${entry.title}`);
  console.log(`  Slides: ${entry.slide_texts.length}`);

  try {
    const result = execFileSync('node', [RENDER_SCRIPT, jsonPath], {
      timeout: 30000,
      encoding: 'utf-8',
    });
    const output = JSON.parse(result.trim());
    if (output.success) {
      console.log(`  ✅ Cover: ${output.coverPath}`);
      console.log(`  ✅ Slides: ${output.slidePaths.length}`);
    } else {
      console.log(`  ❌ Error: ${output.error}`);
    }
  } catch (err) {
    console.log(`  ❌ Exception: ${err.message}`);
    if (err.stderr) console.log(`  stderr: ${err.stderr.slice(0, 300)}`);
  }

  // Clean up input JSON
  try { fs.unlinkSync(jsonPath); } catch (_) {}

  console.log();
}

console.log(`\nDone! Check output/test_covers/ for rendered images.`);
console.log(`Open the cover_*.png files to verify text layout.`);
