#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipChangelog = args.includes('--no-changelog');
const skipEditor = args.includes('--no-edit');
const positional = args.filter((a) => !a.startsWith('--'));
const [pkgName, bump = 'patch'] = positional;

const PACKAGES = ['utils', 'react'];

if (!pkgName || !PACKAGES.includes(pkgName)) {
  console.error('Usage: pnpm release:<utils|react> [patch|minor|major|<x.y.z>] [--dry-run] [--no-changelog] [--no-edit]');
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

const changelogPath = resolve(`packages/${pkgName}/CHANGELOG.md`);
let stageChangelog = false;
if (!skipChangelog) {
  const prevTag = findPrevTag(pkgName);
  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
  const draft = buildEntry({
    pkgName,
    version: newVersion,
    range,
    prevTag,
  });

  const today = new Date().toISOString().slice(0, 10);
  const heading = `## [${newVersion}] - ${today}`;
  let entry = `${heading}\n\n${draft}\n`;

  if (!skipEditor) {
    entry = openInEditor(pkgName, newVersion, entry);
    if (!entry || !entry.trim()) {
      console.error('Empty changelog entry. Aborting (use --no-changelog to skip).');
      process.exit(1);
    }
  }

  prependChangelog(changelogPath, pkgName, entry);
  stageChangelog = true;
}

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

sh(`git add ${pkgPath}`);
if (stageChangelog) sh(`git add ${changelogPath}`);
sh(`git commit -m "chore(${pkgName}): release ${newVersion}"`);
sh(`git tag ${tag}`);

if (dryRun) {
  console.log(`\nDry run. Push when ready:\n  git push origin ${branch} ${tag}\n`);
} else {
  sh(`git push origin ${branch} ${tag}`);
  console.log(`\nPushed. Watch the publish job: https://github.com/byelabel/helpers/actions`);
}

function findPrevTag(name) {
  const tags = execSync(`git tag -l "${name}-v*"`, { encoding: 'utf8' })
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ tag: t, version: t.slice(name.length + 2) }))
    .filter((t) => semverRe.test(t.version))
    .sort((a, b) => semverCompare(a.version, b.version));
  return tags.length ? tags[tags.length - 1].tag : null;
}

function semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function buildEntry({ range }) {
  const lines = execSync(`git log --no-merges --pretty=format:"%H%x09%s" ${range}`, {
    encoding: 'utf8',
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const groups = {
    Features: [],
    Fixes: [],
    Performance: [],
    Refactors: [],
    Documentation: [],
    Tests: [],
    Build: [],
    CI: [],
    Chores: [],
    Other: [],
  };

  const typeMap = {
    feat: 'Features',
    feature: 'Features',
    fix: 'Fixes',
    bug: 'Fixes',
    bugfix: 'Fixes',
    perf: 'Performance',
    refactor: 'Refactors',
    docs: 'Documentation',
    doc: 'Documentation',
    test: 'Tests',
    tests: 'Tests',
    build: 'Build',
    ci: 'CI',
    chore: 'Chores',
    style: 'Chores',
    revert: 'Other',
  };

  for (const line of lines) {
    const [hash, subject] = line.split('\t');
    if (!subject) continue;
    if (/^chore\([^)]+\):\s*release\s/i.test(subject)) continue;

    const short = hash.slice(0, 7);
    const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
    if (m) {
      const [, type, scope, breaking, msg] = m;
      const bucket = typeMap[type.toLowerCase()] ?? 'Other';
      const scopeStr = scope ? `**${scope}**: ` : '';
      const breakingStr = breaking ? '**BREAKING** ' : '';
      groups[bucket].push(`- ${breakingStr}${scopeStr}${msg} (${short})`);
    } else {
      groups.Other.push(`- ${subject} (${short})`);
    }
  }

  const sections = [];
  for (const [name, items] of Object.entries(groups)) {
    if (!items.length) continue;
    sections.push(`### ${name}\n\n${items.join('\n')}`);
  }

  if (!sections.length) {
    return '_No noteworthy changes._\n';
  }
  return sections.join('\n\n') + '\n';
}

function openInEditor(name, version, initial) {
  const tmp = resolve(`.changelog-${name}-${version}.md`);
  const banner = [
    `# Editing CHANGELOG entry for @byelabel/${name} v${version}`,
    `# Lines starting with '#' are ignored. Save and close to continue, or empty the file to abort.`,
    '',
  ].join('\n');
  writeFileSync(tmp, banner + initial);

  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  const result = spawnSync(editor, [tmp], { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`Editor exited with status ${result.status}.`);
    process.exit(1);
  }

  const edited = readFileSync(tmp, 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();

  try {
    execSync(`rm -f ${tmp}`);
  } catch {}

  return edited ? edited + '\n' : '';
}

function prependChangelog(path, name, entry) {
  const header = `# Changelog\n\nAll notable changes to \`@byelabel/${name}\` are documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n`;

  if (!existsSync(path)) {
    writeFileSync(path, header + entry + '\n');
    return;
  }

  const existing = readFileSync(path, 'utf8');
  const headerMatch = existing.match(/^([\s\S]*?)(\n## \[)/);
  if (headerMatch) {
    const head = headerMatch[1];
    const rest = existing.slice(head.length);
    writeFileSync(path, `${head}\n${entry}${rest.replace(/^\n+/, '\n')}`);
  } else {
    // No prior version sections — keep existing content as a header block.
    const trimmed = existing.replace(/\s+$/, '');
    writeFileSync(path, `${trimmed}\n\n${entry}\n`);
  }
}