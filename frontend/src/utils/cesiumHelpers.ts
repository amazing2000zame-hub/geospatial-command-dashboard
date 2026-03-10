import { Color } from 'cesium';

export function magnitudeToColor(mag: number): Color {
  if (mag >= 6.0) return Color.RED;
  if (mag >= 5.0) return Color.ORANGE;
  if (mag >= 4.0) return Color.YELLOW;
  if (mag >= 3.0) return Color.YELLOWGREEN;
  return Color.LIGHTGREEN;
}

export function magnitudeToSize(mag: number): number {
  return Math.max(5, mag * 3);
}

export function severityToColor(severity: string): Color {
  switch (severity?.toLowerCase()) {
    case 'extreme':
      return Color.RED.withAlpha(0.5);
    case 'severe':
      return Color.ORANGE.withAlpha(0.5);
    case 'moderate':
      return Color.YELLOW.withAlpha(0.5);
    case 'minor':
      return Color.LIGHTBLUE.withAlpha(0.4);
    default:
      return Color.GRAY.withAlpha(0.3);
  }
}
