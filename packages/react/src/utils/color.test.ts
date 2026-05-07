import { describe, expect, it } from 'vitest';
import { hexToRGBA, shader, stringToColor } from './color';

describe('stringToColor', () => {
  it('returns a 7-character hex string starting with #', () => {
    const color = stringToColor('hello');
    expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('is deterministic for the same input', () => {
    expect(stringToColor('byelabel')).toBe(stringToColor('byelabel'));
  });

  it('produces different colors for different inputs', () => {
    expect(stringToColor('foo')).not.toBe(stringToColor('bar'));
  });

  it('handles empty strings', () => {
    expect(stringToColor('')).toBe('#000000');
  });
});

describe('hexToRGBA', () => {
  it('converts a 6-digit hex to rgba', () => {
    expect(hexToRGBA('#FF8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)');
  });

  it('accepts hex without leading #', () => {
    expect(hexToRGBA('00FF00', 1)).toBe('rgba(0, 255, 0, 1)');
  });

  it('expands 3-digit shorthand hex', () => {
    expect(hexToRGBA('#0F0', 0.25)).toBe('rgba(0, 255, 0, 0.25)');
  });

  it('handles black and white correctly', () => {
    expect(hexToRGBA('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRGBA('#FFFFFF', 0)).toBe('rgba(255, 255, 255, 0)');
  });
});

describe('shader', () => {
  it('returns the same color when percent is 0', () => {
    expect(shader('#336699', 0)).toBe('#336699');
  });

  it('lightens the color with a positive percent', () => {
    const lighter = shader('#336699', 50);
    expect(lighter).toBe('#4c99e5');
  });

  it('darkens the color with a negative percent', () => {
    const darker = shader('#336699', -50);
    expect(darker).toBe('#19334c');
  });

  it('clamps channels at 255 (no overflow)', () => {
    expect(shader('#FFFFFF', 50)).toBe('#ffffff');
  });

  it('pads single-digit hex channels with a leading zero', () => {
    expect(shader('#010203', 0)).toBe('#010203');
  });

  it('defaults percent to 0', () => {
    expect(shader('#ABCDEF')).toBe('#abcdef');
  });
});
