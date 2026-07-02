import { describe, expect, it } from 'vitest';
import { applyContentConditionals, evalCondition } from '../src/conditions.js';

describe('evalCondition', () => {
  const r = { IncludeVpc: 'false', IncludeRds: 'true', IncludeMonitoring: 'true' };

  it('evaluates a bare variable', () => {
    expect(evalCondition('IncludeRds', r)).toBe(true);
    expect(evalCondition('IncludeVpc', r)).toBe(false);
  });

  it('treats unset / empty / 0 as false, anything else as true', () => {
    expect(evalCondition('Missing', r)).toBe(false);
    expect(evalCondition('Blank', { Blank: '' })).toBe(false);
    expect(evalCondition('Zero', { Zero: '0' })).toBe(false);
    expect(evalCondition('Name', { Name: 'lambda' })).toBe(true);
  });

  it('evaluates || (RDS-needs-VPC dependency)', () => {
    expect(evalCondition('IncludeVpc || IncludeRds', r)).toBe(true);
    expect(
      evalCondition('IncludeVpc || IncludeRds', { IncludeVpc: 'false', IncludeRds: 'false' }),
    ).toBe(false);
  });

  it('evaluates &&, !, and parentheses with precedence', () => {
    expect(evalCondition('IncludeRds && IncludeMonitoring', r)).toBe(true);
    expect(evalCondition('IncludeRds && IncludeVpc', r)).toBe(false);
    expect(evalCondition('!IncludeVpc', r)).toBe(true);
    expect(evalCondition('!IncludeRds', r)).toBe(false);
    expect(evalCondition('(IncludeVpc || IncludeRds) && IncludeMonitoring', r)).toBe(true);
    expect(evalCondition('IncludeVpc || IncludeRds && IncludeVpc', r)).toBe(false); // && binds tighter
  });
});

describe('applyContentConditionals', () => {
  const resolved = { IncludeVpc: 'false', IncludeRds: 'true' };

  it('passes content through untouched when there are no markers', () => {
    const src = 'line a\nline b\n';
    expect(applyContentConditionals(src, resolved)).toBe(src);
  });

  it('keeps a block (dropping markers) when the condition is true', () => {
    const src = [
      'before',
      '// #if IncludeRds',
      'import { Db } from "./db";',
      '// #endif',
      'after',
    ].join('\n');
    expect(applyContentConditionals(src, resolved)).toBe(
      ['before', 'import { Db } from "./db";', 'after'].join('\n'),
    );
  });

  it('drops a block entirely when the condition is false', () => {
    const src = [
      'before',
      '// #if IncludeVpc',
      'import { Vpc } from "./vpc";',
      '// #endif',
      'after',
    ].join('\n');
    expect(applyContentConditionals(src, resolved)).toBe(['before', 'after'].join('\n'));
  });

  it('evaluates expression conditions (RDS keeps a VPC import)', () => {
    const src = [
      '// #if IncludeVpc || IncludeRds',
      'import { Vpc } from "./vpc";',
      '// #endif',
    ].join('\n');
    expect(applyContentConditionals(src, resolved)).toBe('import { Vpc } from "./vpc";');
  });

  it('supports nesting — inner block dropped when outer kept', () => {
    const src = [
      '// #if IncludeRds',
      'outer',
      '// #if IncludeVpc',
      'inner',
      '// #endif',
      'tail',
      '// #endif',
    ].join('\n');
    expect(applyContentConditionals(src, resolved)).toBe(['outer', 'tail'].join('\n'));
  });

  it('drops a whole nested region when the outer condition is false', () => {
    const src = [
      '// #if IncludeVpc',
      'outer',
      '// #if IncludeRds',
      'inner',
      '// #endif',
      '// #endif',
      'kept',
    ].join('\n');
    expect(applyContentConditionals(src, resolved)).toBe('kept');
  });

  it('recognizes hash-comment markers too', () => {
    const src = [
      '# #if IncludeRds',
      'rds: true',
      '# #endif',
      '# #if IncludeVpc',
      'vpc: true',
      '# #endif',
    ].join('\n');
    expect(applyContentConditionals(src, resolved)).toBe('rds: true');
  });

  it('leaves #ifdef-style tokens inert', () => {
    const src = ['// #ifdef FOO', 'kept', '// #endifx'].join('\n');
    // Neither line is a real marker, so both pass through untouched.
    expect(applyContentConditionals(src, {})).toBe(src);
  });
});

describe('applyContentConditionals — malformed markers fail loud', () => {
  it('throws on an empty #if condition (instead of leaking the block)', () => {
    const src = ['// #if', 'body', '// #endif', 'tail'].join('\n');
    expect(() => applyContentConditionals(src, {})).toThrow("Empty '#if' condition");
  });

  it('throws on an #endif with no open #if', () => {
    const src = ['a', '// #endif', 'b'].join('\n');
    expect(() => applyContentConditionals(src, {})).toThrow("'#endif' without matching '#if'");
  });

  it('throws on an unclosed #if', () => {
    const src = ['// #if Flag', 'body'].join('\n');
    expect(() => applyContentConditionals(src, { Flag: 'true' })).toThrow("Unclosed '#if'");
  });
});
