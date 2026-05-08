#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const LABELS = [
  { name: 'breaking',           color: 'b60205', description: 'Backwards-incompatible change' },
  { name: 'breaking-change',    color: 'b60205', description: 'Backwards-incompatible change' },
  { name: 'feat',               color: '0e8a16', description: 'New feature' },
  { name: 'feature',            color: '0e8a16', description: 'New feature' },
  { name: 'enhancement',        color: '0e8a16', description: 'Improvement to existing feature' },
  { name: 'fix',                color: 'd93f0b', description: 'Bug fix' },
  { name: 'bug',                color: 'd93f0b', description: 'Something broken' },
  { name: 'docs',               color: '0075ca', description: 'Documentation only' },
  { name: 'documentation',      color: '0075ca', description: 'Documentation only' },
  { name: 'deps',               color: 'fbca04', description: 'Dependency bump' },
  { name: 'dependencies',       color: 'fbca04', description: 'Dependency bump' },
  { name: 'ci',                 color: '1d76db', description: 'CI / workflow change' },
  { name: 'chore',              color: 'cfd3d7', description: 'Maintenance task' },
  { name: 'package: utils',     color: '5319e7', description: 'Touches @byelabel/utils' },
  { name: 'package: react',     color: '61dafb', description: 'Touches @byelabel/react' },
  { name: 'ignore-for-release', color: 'e4e8eb', description: 'Hide from auto-generated release notes' },
  { name: 'skip-changelog',     color: 'e4e8eb', description: 'Hide from auto-generated release notes' }
];

const dryRun = process.argv.includes('--dry-run');

if (!dryRun) {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  } catch {
    console.error('GitHub CLI not authenticated. Run `gh auth login` first.');
    process.exit(1);
  }
}

let created = 0;
let updated = 0;
let failed = 0;

for (const { name, color, description } of LABELS) {
  const args = ['label', 'create', name, '--color', color, '--description', description, '--force'];

  if (dryRun) {
    console.log(`[dry-run] gh ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
    continue;
  }

  try {
    const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (/already exists/i.test(out)) updated++;
    else created++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}: ${err.stderr?.toString().trim() || err.message}`);
  }
}

if (!dryRun) {
  console.log(`\nDone. created/updated: ${created + updated}, failed: ${failed}`);
  if (failed) process.exit(1);
}