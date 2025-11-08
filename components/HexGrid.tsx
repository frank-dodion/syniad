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
    const hexSize = 40;
    const hexWidth = hexSize * Math.sqrt(3);
    const hexHeight = hexSize * 2;

    // Calculate viewBox
    const maxX = columns * hexWidth * 0.75 + hexWidth * 0.375;
    const maxY = rows * hexHeight * 0.75;
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);

    // Render each hex
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const key = `${row},${col}`;
        const hex = hexMap.get(key) || { row, column: col, terrain: 'clear' };

        // Calculate position (offset rows for hex grid)
        const x = col * hexWidth * 0.75 + (row % 2 === 1 ? hexWidth * 0.375 : 0);
        const y = row * hexHeight * 0.75;

        // Create hexagon group
        const hexGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        hexGroup.setAttribute('class', 'hex-group');
        hexGroup.setAttribute('data-row', row.toString());
        hexGroup.setAttribute('data-column', col.toString());

        // Create hexagon polygon
        const points: string[] = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = x + hexSize + hexSize * Math.cos(angle);
          const py = y + hexSize + hexSize * Math.sin(angle);
          points.push(`${px},${py}`);
        }

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points.join(' '));
        polygon.setAttribute('fill', TERRAIN_COLORS[hex.terrain] || TERRAIN_COLORS.clear);
        polygon.setAttribute('stroke', '#333');
        polygon.setAttribute('stroke-width', '1');
        polygon.setAttribute('class', 'hex-polygon');
        polygon.style.cursor = 'pointer';

        // Add hover effect
        polygon.addEventListener('mouseenter', () => {
          polygon.setAttribute('stroke-width', '2');
          polygon.setAttribute('stroke', '#3498db');
        });
        polygon.addEventListener('mouseleave', () => {
          polygon.setAttribute('stroke-width', '1');
          polygon.setAttribute('stroke', '#333');
        });

        // Add click handler
        polygon.addEventListener('click', () => {
          setSelectedHex({ row, column: col });
          if (onHexClick) {
            onHexClick(row, col);
          }
        });

        // Highlight selected hex
        if (selectedHex && selectedHex.row === row && selectedHex.column === col) {
          polygon.setAttribute('stroke-width', '3');
          polygon.setAttribute('stroke', '#e74c3c');
        }

        hexGroup.appendChild(polygon);
        svg.appendChild(hexGroup);
      }
    }
  }, [columns, rows, hexes, selectedTerrain, selectedHex, onHexClick]);

  if (columns === 0 || rows === 0) {
    return (
      <div className="hex-grid-container">
        <p className="info-message">Set columns and rows to create a grid</p>
      </div>
    );
  }

  return (
    <div className="hex-grid-container">
      <svg ref={svgRef} className="hex-grid-svg" preserveAspectRatio="xMidYMid meet" />
    </div>
  );
}

