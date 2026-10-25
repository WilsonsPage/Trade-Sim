import type { ChartApi } from './ReplayChart';

/**
 * A JPEG of the chart including the drawings on top of it, which live in an SVG overlay
 * that the chart's own screenshot doesn't include.
 */
export async function captureChart(api: ChartApi): Promise<string | null> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = api.chart.takeScreenshot();
  } catch {
    return null;
  }
  const svg = api.chart.chartElement().closest('.chart')?.querySelector<SVGSVGElement>('svg.drawing-layer');
  if (svg) {
    try {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      await img.decode();
      const scale = canvas.width / api.chart.chartElement().clientWidth;
      canvas.getContext('2d')!.drawImage(img, 0, 0, svg.clientWidth * scale, svg.clientHeight * scale);
    } catch {
      // Drawings left out; the candles are still captured.
    }
  }
  return canvas.toDataURL('image/jpeg', 0.8);
}
