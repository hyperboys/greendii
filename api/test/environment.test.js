const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const dotenv = require('dotenv');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');

function runStartup(t, fileContents, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'greendii-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const apiDir = path.join(root, 'api');
  fs.mkdirSync(apiDir);
  if (fileContents !== null) fs.writeFileSync(path.join(apiDir, '.env'), fileContents);
  const startupComplete = new Error('Environment loaded before Express');
  let startupError;
  try {
    vm.runInNewContext(source, {
      __dirname: path.join(apiDir, 'src'),
      process: { env },
      require(name) {
        if (name === 'path') return path;
        if (name === 'dotenv') {
          return { config: options => dotenv.config({ ...options, processEnv: env }) };
        }
        if (name === 'express') throw startupComplete;
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
  } catch (error) {
    startupError = error;
  }
  return { env, startupError, startupComplete };
}

test('startup loads api/.env independently of the working directory', t => {
  const result = runStartup(t, 'DATABASE_URL=postgresql://test:test@localhost/test\n');
  assert.equal(result.startupError, result.startupComplete);
  assert.equal(result.env.DATABASE_URL, 'postgresql://test:test@localhost/test');
});

test('startup preserves environment supplied by deployment', t => {
  const result = runStartup(t, 'DATABASE_URL=postgresql://file/test\n', {
    DATABASE_URL: 'postgresql://deployment/test',
  });
  assert.equal(result.startupError, result.startupComplete);
  assert.equal(result.env.DATABASE_URL, 'postgresql://deployment/test');
});

test('startup accepts a process DATABASE_URL without an env file', t => {
  const result = runStartup(t, null, { DATABASE_URL: 'postgresql://deployment/test' });
  assert.equal(result.startupError, result.startupComplete);
});

for (const contents of [null, 'DATABASE_URL=\n', 'DATABASE_URL="   "\n']) {
  test(`startup fails before Express when DATABASE_URL is missing or blank (${JSON.stringify(contents)})`, t => {
    const result = runStartup(t, contents);
    assert.notEqual(result.startupError, result.startupComplete);
    assert.match(result.startupError.message, /DATABASE_URL is required.*api\/\.env/);
  });
}
