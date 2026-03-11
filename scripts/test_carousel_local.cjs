#!/usr/bin/env node
/**
 * Render one full carousel (cover + all slides) to assets/temp_testing/
 * for visual verification before deploying.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'temp_testing');
const RENDER_SCRIPT = path.join(ROOT, 'scripts', 'render-slides.cjs');
const FONT_ANTON = path.join(ROOT, 'assets', 'fonts', 'Anton-Regular.ttf');
const FONT_INTER = path.join(ROOT, 'assets', 'fonts', 'InterVariable.ttf');
const SHARE_ICON = path.join(ROOT, 'assets', 'icons', 'share.png');
const SAVE_ICON = path.join(ROOT, 'assets', 'icons', 'save.png');

// Use real data from the DB test dump
const testDataPath = path.join(ROOT, 'output', 'test_covers', 'test_data.json');
if (!fs.existsSync(testDataPath)) {
  console.error('Run get_test_data.py first to generate test_data.json');
  process.exit(1);
}
const allEntries = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

// Clean output directory
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith('.png') || f.endsWith('.json')) {
    fs.unlinkSync(path.join(OUT_DIR, f));
  }
}

// Render all entries for comparison
for (const entry of allEntries) {
  const brand = entry.brand;
  const bgPath = entry.backgroundImage;

  if (!bgPath || !fs.existsSync(bgPath)) {
    console.log(`SKIP ${brand}: no background image`);
    continue;
  }

  const coverOut = path.join(OUT_DIR, `${brand}_00_cover.png`);
  const slideOutputs = entry.slide_texts.map((_, i) =>
    path.join(OUT_DIR, `${brand}_${String(i + 1).padStart(2, '0')}_slide.png`)
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
    fontPaths: { anton: FONT_ANTON, inter: FONT_INTER },
  };

  const jsonPath = path.join(OUT_DIR, `_input_${brand}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(input, null, 2));

  console.log(`\nRendering ${brand}...`);
  console.log(`  Title: ${entry.title}`);

  try {
    const result = execFileSync('node', [RENDER_SCRIPT, jsonPath], {
      timeout: 30000,
      encoding: 'utf-8',
    });
    const output = JSON.parse(result.trim());
    if (output.success) {
      console.log(`  Cover: ${path.basename(output.coverPath)}`);
      console.log(`  Slides: ${output.slidePaths.map(p => path.basename(p)).join(', ')}`);
    } else {
      console.log(`  ERROR: ${output.error}`);
    }
  } catch (err) {
    console.log(`  EXCEPTION: ${err.message}`);
    if (err.stderr) console.log(`  stderr: ${err.stderr.slice(0, 500)}`);
  }

  // Clean up input JSON
  try { fs.unlinkSync(jsonPath); } catch (_) {}
}

console.log(`\nDone! Files in: assets/temp_testing/`);
console.log(`Open them: open assets/temp_testing/`);
