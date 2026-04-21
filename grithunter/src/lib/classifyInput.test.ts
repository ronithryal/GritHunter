import { describe, it, expect } from 'vitest';
import { classifyInput } from './classifyInput';

describe('classifyInput', () => {
  it('identifies bare handles as natural language (not supporting bare handles yet)', () => {
    expect(classifyInput("username")).toBe('nl');
  });

  it('identifies github.com/username as profile', () => {
    expect(classifyInput('github.com/username')).toBe('profile');
    expect(classifyInput('https://github.com/username')).toBe('profile');
    expect(classifyInput('https://github.com/username/')).toBe('profile');
  });

  it('identifies github.com/org/repo as repo', () => {
    expect(classifyInput('github.com/org/repo')).toBe('repo');
    expect(classifyInput('https://github.com/org/repo')).toBe('repo');
    expect(classifyInput('https://github.com/org/repo/')).toBe('repo');
  });

  it('identifies deep github paths as natural language', () => {
    expect(classifyInput('https://github.com/org/repo/tree/main/src')).toBe('nl');
  });

  it('identifies pure natural language queries as nl', () => {
    expect(classifyInput('React Native engineers in SF')).toBe('nl');
  });

  it('identifies empty or malformed strings as nl', () => {
    expect(classifyInput('')).toBe('nl');
    expect(classifyInput('   ')).toBe('nl');
    expect(classifyInput('github.com')).toBe('nl');
    expect(classifyInput('https://github.com')).toBe('nl');
  });
});
