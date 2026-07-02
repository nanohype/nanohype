import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, errorMessage } from './logger.js';

function captureStreams() {
  const err: string[] = [];
  const out: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  const parse = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { err, out, parse };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('writes one JSON line with level, timestamp, and message', () => {
    const { err, parse } = captureStreams();
    createLogger().info('started');

    const [entry] = parse(err);
    expect(entry).toMatchObject({ level: 'info', message: 'started' });
    expect(typeof entry?.timestamp).toBe('string');
  });

  it('merges context-first fields into the line', () => {
    const { err, parse } = captureStreams();
    createLogger().warn({ incident_id: 'inc-1', attempt: 2 }, 'retrying');

    const [entry] = parse(err);
    expect(entry).toMatchObject({
      level: 'warn',
      message: 'retrying',
      incident_id: 'inc-1',
      attempt: 2,
    });
  });

  it('filters below the configured level and honors setLevel', () => {
    const { err } = captureStreams();
    const log = createLogger({ level: 'warn' });
    log.info('dropped');
    log.warn('kept');
    log.setLevel('debug');
    log.debug('kept after setLevel');

    expect(err).toHaveLength(2);
  });

  it('stamps child bindings on every line, and children nest', () => {
    const { err, parse } = captureStreams();
    const log = createLogger({ bindings: { service: 'svc' } });
    const child = log.child({ incident_id: 'inc-9' });
    child.child({ step: 'assemble' }).info('go');

    const [entry] = parse(err);
    expect(entry).toMatchObject({ service: 'svc', incident_id: 'inc-9', step: 'assemble' });
  });

  it('lets per-call context override bindings', () => {
    const { err, parse } = captureStreams();
    createLogger({ bindings: { source: 'default' } }).info({ source: 'override' }, 'x');

    const [entry] = parse(err);
    expect(entry?.source).toBe('override');
  });

  it('sends everything to stderr by default, keeping stdout clean', () => {
    const { err, out } = captureStreams();
    const log = createLogger();
    log.info('a');
    log.error('b');

    expect(err).toHaveLength(2);
    expect(out).toHaveLength(0);
  });

  it('splits info/debug to stdout and warn/error to stderr in split mode', () => {
    const { err, out } = captureStreams();
    const log = createLogger({ level: 'debug', stream: 'split' });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(out).toHaveLength(2);
    expect(err).toHaveLength(2);
  });

  it('omits trace fields when no OTel span is active', () => {
    const { err, parse } = captureStreams();
    createLogger().info('no span');

    const [entry] = parse(err);
    expect(entry).not.toHaveProperty('trace_id');
    expect(entry).not.toHaveProperty('span_id');
  });
});

describe('errorMessage', () => {
  it('unwraps Error instances and stringifies everything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('42');
  });
});
