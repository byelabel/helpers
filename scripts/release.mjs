#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));
const [pkgName, bump = 'patch'] = positional;

const PACKAGES = ['utils', 'react'];

if (!pkgName || !PACKAGES.includes(pkgName)) {
  console.error('Usage: pnpm release:<utils|react> [patch|minor|major|<x.y.z>] [--dry-run]');
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

if (out('git status --porcelain')) {
  console.error('Working tree is not clean. Commit or stash changes first.');
  process.exit(1);
}

const branch = out('git rev-parse --abbrev-ref HEAD');
if (branch !== 'master' && branch !== 'main') {
  console.error(`Refusing to release from "${branch}". Switch to master/main first.`);
  process.exit(1);
}

const pkgPath = resolve(`packages/${pkgName}/package.json`);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const semverRe = /^\d+\.\d+\.\d+$/;
let newVersion;
if (semverRe.test(bump)) {
  newVersion = bump;
} else {
  const [maj, min, pat] = pkg.version.split('.').map(Number);
  if (bump === 'major') newVersion = `${maj + 1}.0.0`;
  else if (bump === 'minor') newVersion = `${maj}.${min + 1}.0`;
  else if (bump === 'patch') newVersion = `${maj}.${min}.${pat + 1}`;
  else {
    console.error(`Unknown bump: ${bump}`);
    process.exit(1);
  }
}

const tag = `${pkgName}-v${newVersion}`;
console.log(`Releasing @byelabel/${pkgName}: ${pkg.version} -> ${newVersion} (tag: ${tag})`);

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

sh(`git add ${pkgPath}`);
sh(`git commit -m "chore(${pkgName}): release ${newVersion}"`);
sh(`git tag ${tag}`);

if (dryRun) {
  console.log(`\nDry run. Push when ready:\n  git push origin ${branch} ${tag}\n`);
} else {
  sh(`git push origin ${branch} ${tag}`);
  console.log(`\nPushed. Watch the publish job: https://github.com/byelabel/helpers/actions`);
}
