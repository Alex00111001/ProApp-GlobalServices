import { COLORS, LAYOUT } from './theme';

const luminance = (hex: string) => {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
};

const contrast = (foreground: string, background: string) => {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
};

describe('mobile design-system accessibility', () => {
  it('keeps primary actions readable with white labels', () => {
    expect(contrast(COLORS.white, COLORS.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps primary text readable on the application background', () => {
    expect(contrast(COLORS.textPrimary, COLORS.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('defines an ergonomic minimum touch target', () => {
    expect(LAYOUT.touchTarget).toBeGreaterThanOrEqual(44);
  });
});
