#!/usr/bin/env node
/**
 * clean-urls.js
 *
 * Restructures a static site for clean URLs on GitHub Pages:
 *   ascended-heroes.html  ->  ascended-heroes/index.html
 * so the page becomes reachable at /ascended-heroes/ with no .html extension.
 *
 * It also rewrites internal references (href, src, fetch URLs, redirects,
 * etc.) across your .html, .css, .js, .json, and .xml files so links keep
 * working after the move.
 *
 * USAGE (run from the root of your repo, where index.html lives):
 *   node clean-urls.js --dry-run     Preview every change, no files touched
 *   node clean-urls.js               Apply the changes
 *
 * ALWAYS run --dry-run first and read the output before applying.
 * ALWAYS run this on a clean git working tree so you can review the diff
 * (`git diff`) and revert easily (`git checkout .`) if something looks wrong.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

// Never touch these
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.github']);
// Keep these at the root as-is (homepage + GitHub Pages 404 page)
const EXCLUDE_FILES = new Set(['index.html', '404.html']);
// File types to scan for internal link references
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.xml']);

function walk(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), fileList);
    } else {
      fileList.push(path.join(dir, entry.name));
    }
  }
  return fileList;
}

function main() {
  const allFilesBefore = walk(ROOT);

  // Only convert ROOT-LEVEL .html files (adjust the filter if you keep
  // pages in subfolders already, e.g. blog/post1.html).
  const htmlFiles = allFilesBefore.filter(f => {
    const rel = path.relative(ROOT, f);
    return (
      f.endsWith('.html') &&
      !EXCLUDE_FILES.has(path.basename(f)) &&
      !rel.includes(path.sep)
    );
  });

  if (htmlFiles.length === 0) {
    console.log('No root-level .html files found to convert (index.html/404.html are kept as-is).');
    return;
  }

  // Map "ascended-heroes.html" -> "ascended-heroes/"
  const renameMap = {};
  for (const f of htmlFiles) {
    const base = path.basename(f, '.html');
    renameMap[path.basename(f)] = `${base}/`;
  }

  console.log('Planned folder restructuring:');
  for (const [oldName, newPath] of Object.entries(renameMap)) {
    console.log(`  ${oldName}  ->  ${newPath}index.html`);
  }
  console.log('');

  // Step 1: move each file into its own folder as index.html
  for (const f of htmlFiles) {
    const base = path.basename(f, '.html');
    const newDir = path.join(ROOT, base);
    const newFile = path.join(newDir, 'index.html');

    if (DRY_RUN) {
      console.log(`[dry-run] would create ${base}/ and move ${path.basename(f)} -> ${base}/index.html`);
      continue;
    }

    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir);
    fs.renameSync(f, newFile);
    console.log(`Moved ${path.basename(f)} -> ${base}/index.html`);
  }

  // Step 2: rewrite references in every text file (run AFTER the move so
  // newly relocated files get scanned too)
  const filesToScan = walk(ROOT).filter(f => TEXT_EXTENSIONS.has(path.extname(f)));

  // Longest filenames first, so "ascended-heroes.html" doesn't get partially
  // matched by a shorter, unrelated name first
  const sortedNames = Object.keys(renameMap).sort((a, b) => b.length - a.length);

  for (const file of filesToScan) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    for (const oldName of sortedNames) {
      const newPath = renameMap[oldName];
      // Match the filename only when NOT preceded by another word char,
      // dot, or slash-char (avoids matching inside a longer unrelated name)
      const escaped = oldName.replace(/\./g, '\\.');
      const pattern = new RegExp(`(?<![\\w.-])${escaped}`, 'g');
      if (pattern.test(content)) {
        content = content.replace(pattern, newPath);
        changed = true;
      }
    }

    if (changed) {
      if (DRY_RUN) {
        console.log(`[dry-run] would update references in ${path.relative(ROOT, file)}`);
      } else {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated references in ${path.relative(ROOT, file)}`);
      }
    }
  }

  console.log('\nDone.' + (DRY_RUN ? ' (dry run — no files were changed)' : ''));
  console.log('\nNext steps:');
  console.log('  1. Run `git diff` (or `git status` + spot-check files) and review every change.');
  console.log('  2. Search your JS manually for DYNAMICALLY built URLs, e.g.:');
  console.log('       location.href = pageName + ".html"');
  console.log('     These are NOT caught by this script and need manual fixing.');
  console.log('  3. Test the site locally (or on a branch/preview) before pushing to main.');
  console.log('  4. If you use a sitemap.xml, double check its URLs were updated correctly.');
}

main();
