'use client';

import { RISK_ICON_KEYS, type RiskIconKey } from '@etare/domain';
import { cn } from '@etare/ui';
import {
  Accessibility,
  Atom,
  BatteryWarning,
  Biohazard,
  Bomb,
  BrickWall,
  Cylinder,
  FlaskConical,
  Flame,
  Landmark,
  Radiation,
  Skull,
  Sun,
  TriangleAlert,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/** Pictogram of each risk icon key (national and SIS entries share the keys). */
const RISK_ICONS: Readonly<Record<RiskIconKey, LucideIcon>> = {
  'risk-flammable': Flame,
  'risk-explosive': Bomb,
  'risk-toxic': Skull,
  'risk-corrosive': FlaskConical,
  'risk-oxidizing': Atom,
  'risk-pressurized-gas': Cylinder,
  'risk-high-voltage': Zap,
  'risk-lithium': BatteryWarning,
  'risk-photovoltaic': Sun,
  'risk-radioactive': Radiation,
  'risk-biological': Biohazard,
  'risk-oxygen': Wind,
  'risk-fragile-structure': BrickWall,
  'risk-vulnerable-public': Accessibility,
  'risk-heritage': Landmark,
  'risk-generic': TriangleAlert,
};

export const RISK_COLOR = '#b91c1c';

const iconOf = (key: string): LucideIcon => RISK_ICONS[key as RiskIconKey] ?? TriangleAlert;

/** Hazard diamond with the pictogram of the risk type (decorative: the name is always written next to it). */
export function RiskPictogram({ iconKey, className }: { iconKey: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex size-7 shrink-0 items-center justify-center', className)}
    >
      <span className="absolute inset-[3px] rotate-45 rounded-[3px] border-2 border-critical bg-surface" />
      {createElement(iconOf(iconKey), { className: 'relative size-3.5 text-foreground', strokeWidth: 2.25 })}
    </span>
  );
}

/** Image name of a risk pictogram in the MapLibre style. */
export const riskImageName = (key: string) => (RISK_ICONS[key as RiskIconKey] ? key : 'risk-generic');

const IMAGE_SIZE = 36;
const PIXEL_RATIO = 2;

/**
 * SVG markup of every pictogram, rendered in a detached root. Called from a
 * macrotask: React cannot render synchronously during its own render/commit.
 */
async function pictogramMarkup(): Promise<ReadonlyMap<RiskIconKey, string>> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      RISK_ICON_KEYS.map((key) =>
        createElement(
          'div',
          { key, 'data-key': key },
          createElement(RISK_ICONS[key], { size: 24, color: '#111827', strokeWidth: 2.25 }),
        ),
      ),
    ),
  );
  const markup = new Map(
    [...container.querySelectorAll<HTMLElement>('[data-key]')].map(
      (element) => [element.dataset['key'] as RiskIconKey, element.innerHTML] as const,
    ),
  );
  root.unmount();
  return markup;
}

async function diamondImage(svg: string): Promise<ImageData> {
  const side = IMAGE_SIZE * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable.');
  context.translate(side / 2, side / 2);
  context.rotate(Math.PI / 4);
  const half = side * 0.33;
  context.fillStyle = '#ffffff';
  context.strokeStyle = RISK_COLOR;
  context.lineWidth = 3 * PIXEL_RATIO;
  context.beginPath();
  context.roundRect(-half, -half, half * 2, half * 2, 3 * PIXEL_RATIO);
  context.fill();
  context.stroke();
  context.setTransform(1, 0, 0, 1, 0, 0);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const iconSide = side * 0.42;
  context.drawImage(image, (side - iconSide) / 2, (side - iconSide) / 2, iconSide, iconSide);
  return context.getImageData(0, 0, side, side);
}

/** Adds the risk pictograms to a map style (once per map). */
export async function addRiskImages(map: MapLibreMap): Promise<void> {
  const markup = await pictogramMarkup();
  await Promise.all(
    RISK_ICON_KEYS.map(async (key) => {
      const svg = markup.get(key);
      if (!svg || map.hasImage(key)) return;
      const image = await diamondImage(svg);
      if (!map.hasImage(key)) map.addImage(key, image, { pixelRatio: PIXEL_RATIO });
    }),
  );
}
