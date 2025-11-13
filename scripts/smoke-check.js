const fs = require('fs');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const html = fs.readFileSync('index.html', 'utf8');
  assert(html.includes('status-panel'), 'Status panel markup missing in index.html');
  assert(html.includes('System Status'), 'System Status heading missing');
  assert(html.includes('provider-panel'), 'Station source provider panel missing in index.html');
  assert(html.includes('station-provider'), 'Station provider controls missing');

  const script = fs.readFileSync('app.js', 'utf8');
  assert(script.includes('setStatus('), 'Status helper not defined in app.js');
  assert(script.includes('appendStatus('), 'appendStatus helper not defined in app.js');
  assert(script.includes('queryRadioBrowser'), 'Radio Browser integration missing in app.js');

  const readme = fs.readFileSync('README.md', 'utf8');
  assert(/## Current limitations/i.test(readme), 'README is missing the Current limitations section');
  assert(/## Station sources/i.test(readme), 'README missing Station sources section');

  console.log('Smoke check passed: status messaging and documentation present.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
