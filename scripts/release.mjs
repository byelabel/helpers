#!/usr/bin/env node
/**
 * One-command release.
 *
 *   pnpm release                 # every package with unreleased commits, bump inferred
 *   pnpm release utils           # just utils, bump inferred
 *   pnpm release utils minor     # force the bump
 *   pnpm release utils 3.2.0     # force the exact version
 *
 * The script picks the version, writes the CHANGELOG, builds, tests, commits,
 * tags and pushes. The `publish.yml` workflow takes the tag from there and
 * publishes to npmjs.com with provenance (OIDC trusted publishing).
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';

const PACKAGES = ['utils', 'react'];
const BUMPS = ['auto', 'patch', 'minor', 'major'];
const semverRe = /^\d+\.\d+\.\d+$/;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

const dryRun = flags.has('--dry-run');
const skipChangelog = flags.has('--no-changelog');
const editChangelog = flags.has('--edit');
const skipChecks = flags.has('--skip-checks');
const noPush = flags.has('--no-push');
const assumeYes = flags.has('--yes') || flags.has('-y') || !process.stdin.isTTY;

const unknownFlags = [...flags].filter(
  (f) => !['--dry-run', '--no-changelog', '--edit', '--skip-checks', '--no-push', '--yes', '-y', '--help'].includes(f)
);

if (flags.has('--help') || unknownFlags.length) {
  if (unknownFlags.length) console.error(`Unknown flag: ${unknownFlags.join(', ')}\n`);
  usage();
  process.exit(unknownFlags.length ? 1 : 0);
}

// Both argument orders work: `release utils minor` and `release minor utils`.
const targets = [];
let bump = 'auto';

for (const arg of positional) {
  if (arg === 'all') targets.push(...PACKAGES);
  else if (PACKAGES.includes(arg)) targets.push(arg);
  else if (BUMPS.includes(arg) || semverRe.test(arg)) bump = arg;
  else {
    console.error(`Unknown argument: ${arg}\n`);
    usage();
    process.exit(1);
  }
}

const selected = targets.length ? [...new Set(targets)] : PACKAGES;

if (semverRe.test(bump) && selected.length > 1) {
  console.error('An explicit version can only be given with a single package.');
  process.exit(1);
}

const sh = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (out('git status --porcelain')) {
  console.error('Working tree is not clean. Commit or stash changes first.');
  process.exit(1);
}

const branch = out('git rev-parse --abbrev-ref HEAD');
if (branch !== 'master' && branch !== 'main') {
  console.error(`Refusing to release from "${branch}". Switch to master/main first.`);
  process.exit(1);
}

// ---------------------------------------------------------------- plan

const plans = [];

for (const name of selected) {
  const pkgPath = resolve(`packages/${name}/package.json`);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const prevTag = findPrevTag(name);
  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
  const commits = readCommits(name, range);

  // A version bumped by hand but never tagged is released as-is.
  const untagged = prevTag && semverCompare(pkg.version, prevTag.slice(name.length + 2)) > 0;

  let version;
  let reason;

  if (semverRe.test(bump)) {
    version = bump;
    reason = 'explicit version';
  } else if (bump !== 'auto') {
    version = applyBump(pkg.version, bump);
    reason = `${bump} (requested)`;
  } else if (untagged) {
    version = pkg.version;
    reason = `package.json is ahead of ${prevTag} — releasing as-is`;
  } else {
    const level = inferBump(commits, pkg.version);
    version = applyBump(pkg.version, level);
    reason = `${level} (from ${commits.length} commit${commits.length === 1 ? '' : 's'})`;
  }

  if (!commits.length && !untagged && !semverRe.test(bump) && bump === 'auto') {
    console.log(`• @byelabel/${name}: no commits since ${prevTag ?? 'the beginning'} — skipping.`);
    continue;
  }

  if (semverCompare(version, pkg.version) < 0) {
    console.error(`@byelabel/${name}: ${version} is older than the current ${pkg.version}.`);
    process.exit(1);
  }

  const tag = `${name}-v${version}`;
  if (git('tag', '-l', tag)) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
  }

  plans.push({ name, pkg, pkgPath, prevTag, commits, version, reason, tag, unchanged: version === pkg.version });
}

if (!plans.length) {
  console.log('Nothing to release.');
  process.exit(0);
}

console.log('\nRelease plan:\n');
for (const plan of plans) {
  console.log(`  @byelabel/${plan.name}  ${plan.pkg.version} -> ${plan.version}   (${plan.reason})`);
  console.log(`  tag: ${plan.tag}`);
  for (const c of plan.commits.slice(0, 10)) console.log(`    - ${c.subject}`);
  if (plan.commits.length > 10) console.log(`    … ${plan.commits.length - 10} more`);
  console.log('');
}

if (!assumeYes && !dryRun) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Publish to npm? [y/N] ')).trim().toLowerCase();
  rl.close();

  if (answer !== 'y' && answer !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
}

// ---------------------------------------------------------------- verify

if (!skipChecks && !dryRun) {
  for (const plan of plans) {
    const cwd = resolve(`packages/${plan.name}`);
    console.log(`\nBuilding @byelabel/${plan.name}…`);
    sh('pnpm run build', cwd);
    console.log(`Testing @byelabel/${plan.name}…`);
    sh('pnpm run test', cwd);
  }
}

// ---------------------------------------------------------------- apply

const staged = [];

for (const plan of plans) {
  if (!skipChangelog) {
    const today = new Date().toISOString().slice(0, 10);
    let entry = `## [${plan.version}] - ${today}\n\n${buildEntry(plan.commits)}\n`;

    if (editChangelog) {
      entry = openInEditor(plan.name, plan.version, entry);
      if (!entry.trim()) {
        console.error('Empty changelog entry. Aborting (use --no-changelog to skip).');
        process.exit(1);
      }
    }

    const changelogPath = resolve(`packages/${plan.name}/CHANGELOG.md`);

    if (!dryRun) prependChangelog(changelogPath, plan.name, entry);
    staged.push(changelogPath);
  }

  if (!plan.unchanged) {
    plan.pkg.version = plan.version;
    if (!dryRun) writeFileSync(plan.pkgPath, JSON.stringify(plan.pkg, null, 2) + '\n');
  }

  staged.push(plan.pkgPath);
}

if (dryRun) {
  console.log('Dry run — nothing written, committed or pushed.');
  process.exit(0);
}

const subject =
  plans.length === 1
    ? `chore(${plans[0].name}): release ${plans[0].version}`
    : `chore: release ${plans.map((p) => `${p.name}@${p.version}`).join(', ')}`;

git('add', ...staged);

// package.json may already carry the version (manually bumped, untagged).
if (out('git status --porcelain')) {
  git('commit', '-m', subject);
}

for (const plan of plans) {
  git('tag', plan.tag);
}

const tags = plans.map((p) => p.tag);

if (noPush) {
  console.log(`\nNot pushed. Run when ready:\n  git push origin ${branch} ${tags.join(' ')}\n`);
} else {
  sh(`git push origin ${branch} ${tags.join(' ')}`);
  console.log(`\nPushed ${tags.join(', ')}.`);
  console.log('npm publish runs in CI: https://github.com/byelabel/helpers/actions/workflows/publish.yml');
}

// ---------------------------------------------------------------- helpers

function usage() {
  console.log(`Usage: pnpm release [utils|react|all] [auto|patch|minor|major|<x.y.z>] [flags]

  (no arguments)   release every package that has unreleased commits

Flags:
  --dry-run        print the plan, change nothing
  --edit           open $EDITOR to hand-edit the changelog entry
  --no-changelog   skip the changelog entirely
  --skip-checks    do not build/test before tagging
  --no-push        commit and tag locally, push by hand
  -y, --yes        skip the confirmation prompt`);
}

function findPrevTag(name) {
  const tags = git('tag', '-l', `${name}-v*`)
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

function applyBump(current, level) {
  const [maj, min, pat] = current.split('.').map(Number);

  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${min + 1}.0`;

  return `${maj}.${min}.${pat + 1}`;
}

/** Commits touching this package since its last tag, newest first. */
function readCommits(name, range) {
  const raw = execFileSync(
    'git',
    ['log', '--no-merges', '--pretty=format:%H%x1f%s%x1f%b%x1e', range, '--', `packages/${name}`],
    { encoding: 'utf8' }
  );

  return raw
    .split('\x1e')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash, subject, body = ''] = chunk.split('\x1f');
      return { hash, subject, body };
    })
    .filter(({ subject }) => subject && !/^chore(\([^)]+\))?:\s*release\s/i.test(subject));
}

/** feat -> minor, breaking -> major (minor while 0.x), everything else -> patch. */
function inferBump(commits, currentVersion) {
  const preMajor = currentVersion.startsWith('0.');
  let level = 'patch';

  for (const { subject, body } of commits) {
    const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:/);

    if (m?.[3] || /^BREAKING[ -]CHANGE:/m.test(body)) return preMajor ? 'minor' : 'major';
    if (m && ['feat', 'feature'].includes(m[1].toLowerCase())) level = 'minor';
  }

  return level;
}

function buildEntry(commits) {
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
    Other: []
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
    revert: 'Other'
  };

  for (const { hash, subject } of commits) {
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
    if (items.length) sections.push(`### ${name}\n\n${items.join('\n')}`);
  }

  return sections.length ? sections.join('\n\n') + '\n' : '_No noteworthy changes._\n';
}

function openInEditor(name, version, initial) {
  const tmp = resolve(`.changelog-${name}-${version}.md`);
  const banner = [
    `# Editing CHANGELOG entry for @byelabel/${name} v${version}`,
    `# Lines starting with '#' are ignored. Save and close to continue, or empty the file to abort.`,
    ''
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

  const lines = readFileSync(path, 'utf8').split('\n');

  // Newest entry goes on top: before the first release heading, or — for the
  // older hand-written logs that have no headings — before the first bullet.
  let at = lines.findIndex((l) => l.startsWith('## ') || l.startsWith('- '));
  if (at < 0) at = lines.length;

  const head = lines.slice(0, at).join('\n').replace(/\s+$/, '');
  const rest = lines.slice(at).join('\n').replace(/^\n+/, '');

  writeFileSync(path, `${head}\n\n${entry}\n${rest}`);
}
