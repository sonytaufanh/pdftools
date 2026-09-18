export interface WatermarkAnchor {
  x: number;
  y: number;
}

export function getWatermarkAnchor(
  width: number,
  height: number,
  position = 'center'
): WatermarkAnchor {
  const insetX = width * 0.16;
  const insetY = height * 0.16;
  const [vertical, horizontal] = position === 'center' ? ['middle', 'center'] : position.split('-');

  const x = horizontal === 'left' ? insetX : horizontal === 'right' ? width - insetX : width / 2;
  // y is measured from the TOP (screen/canvas coordinates). The PDF path flips it.
  const y = vertical === 'top' ? insetY : vertical === 'bottom' ? height - insetY : height / 2;

  return { x, y };
}

export function rotatePoint(x: number, y: number, degreesValue: number): WatermarkAnchor {
  const radians = degreesValue * (Math.PI / 180);
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians)
  };
}

export function getWatermarkTextAngle(width: number, height: number): number {
  return width > height ? 0 : -45;
}

export function getPdfWatermarkTextAngle(width: number, height: number): number {
  const canvasAngle = getWatermarkTextAngle(width, height);
  return canvasAngle === 0 ? 0 : Math.abs(canvasAngle);
}
