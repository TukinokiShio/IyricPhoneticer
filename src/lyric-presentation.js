export const lyricTransitionMs = 260;

const emphasisByDistance = [
  { opacity: 1, blurPx: 0 },
  { opacity: 0.62, blurPx: 0.2 },
  { opacity: 0.45, blurPx: 0.45 },
  { opacity: 0.32, blurPx: 0.8 },
  { opacity: 0.23, blurPx: 1.15 },
  { opacity: 0.16, blurPx: 1.5 },
];

export function lyricEmphasis(distance) {
  return emphasisByDistance[Math.min(distance, emphasisByDistance.length - 1)];
}
