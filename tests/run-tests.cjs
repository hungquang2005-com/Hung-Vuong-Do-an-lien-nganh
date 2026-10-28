// Run only isolated suites; never import AppModule, .env, or database verification scripts.
const { spawnSync } = require('node:child_process');
const { mkdirSync, readdirSync, writeFileSync } = require('node:fs');
const { basename, join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const root = resolve(__dirname, '..');
if (process.argv[2] && !['backend', 'frontend'].includes(process.argv[2])) {
  throw new Error('Usage: node tests/run-tests.cjs [backend|frontend] [group]');
}
const output = join(root, 'docs', 'test-results');
mkdirSync(output, { recursive: true });
const backend = readdirSync(join(__dirname, 'backend'))
  .filter(file => file.endsWith('.spec.ts')).sort().map(file => join(__dirname, 'backend', file));
const frontend = readdirSync(join(__dirname, 'frontend'))
  .filter(file => file.endsWith('.test.mjs')).sort().map(file => join(__dirname, 'frontend', file));
const group = process.argv[3];
const select = file => !group || (group === 'chat'
  ? /(?:chat\.spec|shopping\.spec|user-actions\.spec|chat-stream\.test)\./.test(file)
  : basename(file).startsWith(group + '.') || basename(file).startsWith(group + '-'));
const runs = [];
for (const [name, files, extra] of [
  ['backend', backend, ['-r', 'ts-node/register']],
  ['frontend', frontend, ['--experimental-strip-types']],
]) {
  if (process.argv[2] && process.argv[2] !== name) continue;
  const selected = files.filter(select);
  if (!selected.length) throw new Error('No tests found for group: ' + group);
  const label = group ? name + '-' + group : name;
  const args = ['--test', '--test-concurrency=1', '--test-reporter=tap',
    '--test-reporter-destination=stdout', '--test-reporter=junit',
    `--test-reporter-destination=${join(output, label + '.xml')}`,
    `--test-reporter=${pathToFileURL(join(__dirname, 'test-json-reporter.cjs')).href}`,
    `--test-reporter-destination=${join(output, label + '.jsonl')}`, ...extra, ...selected];
  const result = spawnSync(process.execPath, args, { cwd: join(root, name),
    env: { ...process.env, NODE_PATH: join(root, 'backend', 'node_modules'),
      TS_NODE_PROJECT: join(__dirname, 'tsconfig.backend.json') },
    encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  const tap = result.stdout ?? '';
  writeFileSync(join(output, label + '.tap'), tap);
  writeFileSync(join(output, label + '-stderr.txt'), result.stderr ?? '');
  const count = key => Number(tap.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0);
  const summary = { name, command: ['node', ...args].join(' '), exitCode: result.status,
    error: result.error?.code, tests: count('tests'), pass: count('pass'), fail: count('fail'),
    skipped: count('skipped'), cancelled: count('cancelled') };
  runs.push(summary);
  console.log(JSON.stringify(summary));
}
const builds = [];
if (!process.argv[2]) for (const name of ['backend', 'frontend']) {
  const result = spawnSync(process.platform === 'win32' ? process.env.ComSpec : 'npm',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build'],
    { cwd: join(root, name), encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(output, name + '-build.txt'), (result.stdout ?? '') + (result.stderr ?? ''));
  const build = { name, command: 'npm run build', exitCode: result.status, error: result.error?.code };
  builds.push(build); console.log(JSON.stringify(build));
}
const npm = spawnSync(process.platform === 'win32' ? process.env.ComSpec : 'npm',
  process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd --version'] : ['--version'], { encoding: 'utf8' });
writeFileSync(join(output, process.argv[2] ? [process.argv[2], group, 'summary.json'].filter(Boolean).join('-') : 'summary.json'), JSON.stringify({ node: process.version,
  npm: npm.stdout?.trim(), executedAt: new Date().toISOString(), runs, builds }, null, 2) + '\n');
if (runs.some(run => run.exitCode !== 0 || run.tests === 0)) process.exitCode = 1;
if (builds.some(build => build.exitCode !== 0)) process.exitCode = 1;
