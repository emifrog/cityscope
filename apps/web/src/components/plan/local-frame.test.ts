// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { geometryToFrame, geometryToLocal, planBounds, planCorners, toFrame, toLocal } from './local-frame';

describe('plan display frame', () => {
  it('keeps plan pixels exact through the display frame (origin top-left, y downwards)', () => {
    expect(toFrame([400, 250])).toEqual([0.004, -0.0025]);
    expect(toLocal(toFrame([412.3, 288.7]))).toEqual([412.3, 288.7]);
    const zone = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [380, 250],
          [460, 250],
          [460, 330],
          [380, 330],
          [380, 250],
        ] as [number, number][],
      ],
    };
    expect(geometryToLocal(geometryToFrame(zone))).toEqual(zone);
  });

  it('places the background by its four corners, top-left first', () => {
    expect(planCorners(1600, 1000)).toEqual([
      [0, -0],
      [0.016, -0],
      [0.016, -0.01],
      [0, -0.01],
    ]);
  });

  it('widens the bounds by a margin on every side', () => {
    const [[west, south], [east, north]] = planBounds(1000, 1000, 0.5);
    expect([west, south, east, north].map((value) => Math.round(value * 1e5))).toEqual([-500, -1500, 1500, 500]);
  });
});
