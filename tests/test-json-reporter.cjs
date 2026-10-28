// Native node:test event data keeps case names and source locations alongside JUnit/TAP.
module.exports = async function* (events) {
  for await (const { type, data } of events) {
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    yield JSON.stringify({ name: data.name, file: data.file, line: data.line,
      nesting: data.nesting, status: data.skip ? 'SKIPPED' : data.todo ? 'TODO' : type === 'test:pass' ? 'PASS' : 'FAIL',
      durationMs: data.details?.duration_ms, error: data.details?.error?.message }) + '\n';
  }
};
