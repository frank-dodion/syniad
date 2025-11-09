'use client';

import { useEffect, useRef, useState } from 'react';

const TERRAIN_COLORS: Record<string, string> = {
  clear: '#e8e8e8',
  mountain: '#8b7355',
  forest: '#2d5016',
  water: '#4a90e2',
  desert: '#f4a460',
  swamp: '#556b2f',
};

interface Hex {
  row: number;
  column: number;
  terrain: string;
}

interface HexGridProps {
  columns: number;
  rows: number;
  hexes?: Hex[];
  selectedTerrain?: string;
  onHexClick?: (row: number, column: number) => void;
}

export default function HexGrid({
  columns,
  rows,
  hexes = [],
  selectedTerrain = 'clear',
  onHexClick,
}: HexGridProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedHex, setSelectedHex] = useState<{ row: number; column: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!svgRef.current || columns === 0 || rows === 0) return;

    const svg = svgRef.current;
    svg.innerHTML = '';

    // Create a map of hexes for quick lookup
    const hexMap = new Map<string, Hex>();
    hexes.forEach((hex) => {
      const key = `${hex.row},${hex.column}`;
      hexMap.set(key, hex);
    });

    // Calculate hex size
    const hexSize = 28; // distance from center to left/right vertex
    const hexWidth = hexSize * 2;
    const hexHeight = Math.sqrt(3) * hexSize;
    const horizontalSpacing = hexSize * 1.5; // distance between column centers
    const verticalSpacing = hexHeight;

    // Calculate viewBox for flat-topped layout (even-q)
    const maxX = (columns - 1) * horizontalSpacing + hexWidth;
    const maxY =
      (rows - 1) * verticalSpacing +
      hexHeight +
      (columns > 1 ? hexHeight / 2 : 0);
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
    svg.setAttribute('width', `${maxX}`);
    svg.setAttribute('height', `${maxY}`);

    setSize((prev) =>
      prev.width === maxX && prev.height === maxY ? prev : { width: maxX, height: maxY }
    );

    const baseLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    baseLayer.setAttribute('id', 'hex-base-layer');
    const interactionLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    interactionLayer.setAttribute('id', 'hex-interaction-layer');

    const makeHexPoints = (cx: number, cy: number) => [
      `${cx + hexSize},${cy}`,
      `${cx + hexSize / 2},${cy + hexHeight / 2}`,
      `${cx - hexSize / 2},${cy + hexHeight / 2}`,
      `${cx - hexSize},${cy}`,
      `${cx - hexSize / 2},${cy - hexHeight / 2}`,
      `${cx + hexSize / 2},${cy - hexHeight / 2}`,
    ];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const key = `${row},${col}`;
        const hex = hexMap.get(key) || { row, column: col, terrain: 'clear' };

        const x = col * horizontalSpacing;
        const y = row * verticalSpacing + (col % 2 === 1 ? hexHeight / 2 : 0);

        const centerX = x + hexWidth / 2;
        const centerY = y + hexHeight / 2;
        const points = makeHexPoints(centerX, centerY);

        const basePolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        basePolygon.setAttribute('points', points.join(' '));
        basePolygon.setAttribute('fill', TERRAIN_COLORS[hex.terrain] || TERRAIN_COLORS.clear);
        basePolygon.setAttribute('stroke', '#333');
        basePolygon.setAttribute('stroke-width', '0.6');
        basePolygon.setAttribute('class', 'hex-base');
        basePolygon.setAttribute('pointer-events', 'none');

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const labelX = centerX;
        const labelY = centerY - hexHeight / 2; // Position at top vertex of hex
        label.setAttribute('x', labelX.toString());
        label.setAttribute('y', labelY.toString());
        label.setAttribute('fill', '#1f2937');
        label.setAttribute('font-size', (hexSize * 0.35).toString());
        label.setAttribute(
          'font-family',
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        );
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'hanging'); // Align text to top
        label.setAttribute('pointer-events', 'none');
        label.textContent = `${col + 1}-${row + 1}`;

        baseLayer.appendChild(basePolygon);
        baseLayer.appendChild(label);

        const interactionPolygon = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'polygon'
        );
        interactionPolygon.setAttribute('points', points.join(' '));
        interactionPolygon.setAttribute('fill', 'transparent');
        interactionPolygon.setAttribute('stroke', 'transparent');
        interactionPolygon.setAttribute('stroke-width', '0');
        interactionPolygon.setAttribute('class', 'hex-interaction');
        interactionPolygon.style.cursor = 'pointer';

        const applySelectionStyles = () => {
          if (selectedHex && selectedHex.row === row && selectedHex.column === col) {
            interactionPolygon.setAttribute('stroke', '#e74c3c');
            interactionPolygon.setAttribute('stroke-width', '2.5');
          } else {
            interactionPolygon.setAttribute('stroke', 'transparent');
            interactionPolygon.setAttribute('stroke-width', '0');
          }
        };

        interactionPolygon.addEventListener('mouseenter', () => {
          interactionPolygon.setAttribute('stroke', '#3498db');
          interactionPolygon.setAttribute('stroke-width', '2');
        });
        interactionPolygon.addEventListener('mouseleave', () => {
          applySelectionStyles();
        });
        interactionPolygon.addEventListener('click', () => {
          setSelectedHex({ row, column: col });
          if (onHexClick) {
            onHexClick(row, col);
          }
        });

        applySelectionStyles();

        interactionLayer.appendChild(interactionPolygon);
      }
    }

    svg.appendChild(baseLayer);
    svg.appendChild(interactionLayer);
  }, [columns, rows, hexes, selectedTerrain, selectedHex, onHexClick]);

  if (columns === 0 || rows === 0) {
    return (
      <div className="hex-grid-container">
        <p className="info-message">Set columns and rows to create a grid</p>
      </div>
    );
  }

  return (
    <div
      className="hex-grid-container"
      style={{
        width: size.width ? `${size.width}px` : undefined,
        height: size.height ? `${size.height}px` : undefined,
      }}
    >
      <svg
        ref={svgRef}
        className="hex-grid-svg"
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: size.width ? `${size.width}px` : undefined,
          height: size.height ? `${size.height}px` : undefined,
        }}
      />
    </div>
  );
}

