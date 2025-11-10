"use client";

import { useEffect, useRef, useState } from "react";

const TERRAIN_COLORS: Record<string, string> = {
  clear: "#d2b48c",
  mountain: "#8b7355",
  forest: "#5a8c5a",
  water: "#4a90e2",
  desert: "#f4a460",
  swamp: "#5a9a9a",
  town: "#808080",
};

interface Hex {
  row: number;
  column: number;
  terrain: string;
  rivers?: number; // Bitmask for river sides
  roads?: number; // Bitmask for road sides
}

interface HexGridProps {
  columns: number;
  rows: number;
  hexes?: Hex[];
  selectedTerrain?: string;
  onHexClick?: (row: number, column: number) => void;
  onHexHover?: (row: number | null, column: number | null) => void;
  onHexSelect?: (row: number | null, column: number | null) => void;
}

export default function HexGrid({
  columns,
  rows,
  hexes = [],
  selectedTerrain = "clear",
  onHexClick,
  onHexHover,
  onHexSelect,
}: HexGridProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedHex, setSelectedHex] = useState<{
    row: number;
    column: number;
  } | null>(null);
  const selectedHexRef = useRef<{ row: number; column: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Refs for callbacks to avoid dependency issues
  const onHexClickRef = useRef(onHexClick);
  const onHexHoverRef = useRef(onHexHover);
  const onHexSelectRef = useRef(onHexSelect);

  // Keep refs in sync
  useEffect(() => {
    selectedHexRef.current = selectedHex;
    onHexClickRef.current = onHexClick;
    onHexHoverRef.current = onHexHover;
    onHexSelectRef.current = onHexSelect;
  }, [selectedHex, onHexClick, onHexHover, onHexSelect]);

  useEffect(() => {
    if (!svgRef.current || columns === 0 || rows === 0) return;

    const svg = svgRef.current;
    svg.innerHTML = "";

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
    // Add padding to account for stroke width (selection outline is 2.5px, so add 3px padding)
    const padding = 3;
    const baseMaxX = (columns - 1) * horizontalSpacing + hexWidth;
    const baseMaxY =
      (rows - 1) * verticalSpacing +
      hexHeight +
      (columns > 1 ? hexHeight / 2 : 0);
    const maxX = baseMaxX + padding * 2;
    const maxY = baseMaxY + padding * 2;
    svg.setAttribute("viewBox", `${-padding} ${-padding} ${maxX} ${maxY}`);
    svg.setAttribute("width", `${maxX}`);
    svg.setAttribute("height", `${maxY}`);

    setSize((prev) =>
      prev.width === maxX && prev.height === maxY
        ? prev
        : { width: maxX, height: maxY }
    );

    const baseLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    baseLayer.setAttribute("id", "hex-base-layer");
    const riverLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    riverLayer.setAttribute("id", "hex-river-layer");
    const roadLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    roadLayer.setAttribute("id", "hex-road-layer");
    const selectionLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    selectionLayer.setAttribute("id", "hex-selection-layer");
    const hoverLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    hoverLayer.setAttribute("id", "hex-hover-layer");
    const detectionLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    detectionLayer.setAttribute("id", "hex-detection-layer");

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
        const hex = hexMap.get(key) || { row, column: col, terrain: "clear", rivers: 0, roads: 0 };

        const x = col * horizontalSpacing;
        const y = row * verticalSpacing + (col % 2 === 1 ? hexHeight / 2 : 0);

        const centerX = x + hexWidth / 2;
        const centerY = y + hexHeight / 2;
        const points = makeHexPoints(centerX, centerY);

        const basePolygon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon"
        );
        basePolygon.setAttribute("points", points.join(" "));
        basePolygon.setAttribute(
          "fill",
          TERRAIN_COLORS[hex.terrain] || TERRAIN_COLORS.clear
        );
        basePolygon.setAttribute("stroke", "#333");
        basePolygon.setAttribute("stroke-width", "0.6");
        basePolygon.setAttribute("class", "hex-base");
        basePolygon.setAttribute("pointer-events", "none");

        const label = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        const labelX = centerX;
        const labelY = centerY - hexHeight / 2 + 4; // Position slightly below top vertex to avoid border
        label.setAttribute("x", labelX.toString());
        label.setAttribute("y", labelY.toString());
        label.setAttribute("fill", "#1f2937");
        label.setAttribute("font-size", (hexSize * 0.35).toString());
        label.setAttribute(
          "font-family",
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        );
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "hanging"); // Align text to top
        label.setAttribute("pointer-events", "none");
        label.textContent = `${col + 1}-${row + 1}`;

        baseLayer.appendChild(basePolygon);
        baseLayer.appendChild(label);

        // Draw rivers if any
        const rivers = hex.rivers ?? 0;
        if (rivers > 0) {
          // Parse points to get numeric coordinates
          const pointCoords = points.map((p) => {
            const [x, y] = p.split(",").map(Number);
            return { x, y };
          });

          // Define river sides for flat-top hex (clockwise from top/North):
          // Point 0: rightmost (east)
          // Point 1: bottom right corner (southeast)
          // Point 2: bottom left corner (southwest)
          // Point 3: leftmost (west)
          // Point 4: top left corner (northwest)
          // Point 5: top right corner (northeast)
          // Side 0 (top/North): point 5 to point 4
          // Side 1 (top right/Northeast): point 0 to point 5
          // Side 2 (bottom right/Southeast): point 1 to point 0
          // Side 3 (bottom/South): point 2 to point 1
          // Side 4 (bottom left/Southwest): point 3 to point 2
          // Side 5 (top left/Northwest): point 4 to point 3
          const sideConnections = [
            [5, 4], // top/North (bit 0)
            [0, 5], // top right/Northeast (bit 1)
            [1, 0], // bottom right/Southeast (bit 2)
            [2, 1], // bottom/South (bit 3)
            [3, 2], // bottom left/Southwest (bit 4)
            [4, 3], // top left/Northwest (bit 5)
          ];

          for (let bit = 0; bit < 6; bit++) {
            if ((rivers & (1 << bit)) !== 0) {
              const [startIdx, endIdx] = sideConnections[bit];
              const start = pointCoords[startIdx];
              const end = pointCoords[endIdx];

              const riverLine = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line"
              );
              riverLine.setAttribute("x1", start.x.toString());
              riverLine.setAttribute("y1", start.y.toString());
              riverLine.setAttribute("x2", end.x.toString());
              riverLine.setAttribute("y2", end.y.toString());
              riverLine.setAttribute("stroke", "#87CEEB"); // Light blue
              riverLine.setAttribute("stroke-width", "6"); // Thick line
              riverLine.setAttribute("stroke-linecap", "round");
              riverLine.setAttribute("pointer-events", "none");
              riverLayer.appendChild(riverLine);
            }
          }
        }

        // Draw roads if any
        const roads = hex.roads ?? 0;
        if (roads > 0) {
          // Parse points to get numeric coordinates
          const pointCoords = points.map((p) => {
            const [x, y] = p.split(",").map(Number);
            return { x, y };
          });

          // Define road sides (same as rivers) - roads go from center to midpoint of side
          // Side 0 (top/North): midpoint of point 5 to point 4
          // Side 1 (top right/Northeast): midpoint of point 0 to point 5
          // Side 2 (bottom right/Southeast): midpoint of point 1 to point 0
          // Side 3 (bottom/South): midpoint of point 2 to point 1
          // Side 4 (bottom left/Southwest): midpoint of point 3 to point 2
          // Side 5 (top left/Northwest): midpoint of point 4 to point 3
          const sideConnections = [
            [5, 4], // top/North (bit 0)
            [0, 5], // top right/Northeast (bit 1)
            [1, 0], // bottom right/Southeast (bit 2)
            [2, 1], // bottom/South (bit 3)
            [3, 2], // bottom left/Southwest (bit 4)
            [4, 3], // top left/Northwest (bit 5)
          ];

          for (let bit = 0; bit < 6; bit++) {
            if ((roads & (1 << bit)) !== 0) {
              const [startIdx, endIdx] = sideConnections[bit];
              const start = pointCoords[startIdx];
              const end = pointCoords[endIdx];
              
              // Calculate midpoint of the side
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;

              const roadLine = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line"
              );
              roadLine.setAttribute("x1", centerX.toString());
              roadLine.setAttribute("y1", centerY.toString());
              roadLine.setAttribute("x2", midX.toString());
              roadLine.setAttribute("y2", midY.toString());
              roadLine.setAttribute("stroke", "#8B0000"); // Dark red
              roadLine.setAttribute("stroke-width", "6"); // Thick line
              roadLine.setAttribute("stroke-linecap", "round");
              roadLine.setAttribute("pointer-events", "none");
              roadLayer.appendChild(roadLine);
            }
          }
        }

        // Selection polygon - yellow solid outline (always visible when selected)
        const selectionPolygon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon"
        );
        selectionPolygon.setAttribute("points", points.join(" "));
        selectionPolygon.setAttribute("fill", "transparent");
        selectionPolygon.setAttribute("id", `selection-${row}-${col}`);
        const isSelected =
          selectedHex && selectedHex.row === row && selectedHex.column === col;
        if (isSelected) {
          selectionPolygon.setAttribute("stroke", "#FFEB3B"); // Bright yellow for selected
          selectionPolygon.setAttribute("stroke-width", "2.5");
          selectionPolygon.setAttribute("opacity", "1");
        } else {
          selectionPolygon.setAttribute("stroke", "#FFEB3B"); // Keep stroke color but make invisible
          selectionPolygon.setAttribute("stroke-width", "2.5");
          selectionPolygon.setAttribute("opacity", "0"); // Use opacity instead of transparent
        }
        selectionPolygon.setAttribute("pointer-events", "none"); // Don't interfere with hover/click

        // Hover polygon - white dashed outline (only visible on hover)
        const hoverPolygon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon"
        );
        hoverPolygon.setAttribute("points", points.join(" "));
        hoverPolygon.setAttribute("fill", "transparent");
        hoverPolygon.setAttribute("stroke", "transparent");
        hoverPolygon.setAttribute("stroke-width", "0");
        hoverPolygon.setAttribute("id", `hover-${row}-${col}`);
        hoverPolygon.setAttribute("pointer-events", "none"); // Don't interfere with detection

        // Detection polygon - completely transparent, handles all events
        const detectionPolygon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon"
        );
        detectionPolygon.setAttribute("points", points.join(" "));
        detectionPolygon.setAttribute("fill", "transparent");
        detectionPolygon.setAttribute("stroke", "transparent");
        detectionPolygon.setAttribute("stroke-width", "0");
        detectionPolygon.setAttribute("id", `detection-${row}-${col}`);
        detectionPolygon.style.cursor = "pointer";

        // Event handlers on detection layer - update visual layers below
        detectionPolygon.addEventListener("mouseenter", () => {
          const hoverEl = svg.querySelector(
            `#hover-${row}-${col}`
          ) as SVGPolygonElement;
          if (hoverEl) {
            hoverEl.setAttribute("stroke", "#ffffff"); // White for hover
            hoverEl.setAttribute("stroke-width", "2");
            hoverEl.setAttribute("stroke-dasharray", "5,5"); // Dashed line for hover
          }
          if (onHexHoverRef.current) {
            onHexHoverRef.current(row, col);
          }
        });

        detectionPolygon.addEventListener("mouseleave", () => {
          const hoverEl = svg.querySelector(
            `#hover-${row}-${col}`
          ) as SVGPolygonElement;
          if (hoverEl) {
            hoverEl.setAttribute("stroke", "transparent");
            hoverEl.setAttribute("stroke-width", "0");
          }
          if (onHexHoverRef.current) {
            onHexHoverRef.current(null, null);
          }
        });

        detectionPolygon.addEventListener("click", (e) => {
          e.stopPropagation();

          // Always allow terrain changes (onHexClick) - controlled by activeTab in parent
          if (onHexClickRef.current) {
            onHexClickRef.current(row, col);
          }

          // Always allow selection (hover and selection work regardless of tab)
          const currentSelected = selectedHexRef.current;
          const isCurrentlySelected =
            currentSelected &&
            currentSelected.row === row &&
            currentSelected.column === col;
          const newSelectedHex = isCurrentlySelected
            ? null
            : { row, column: col };

          // Immediately update the ref so callbacks have correct value
          selectedHexRef.current = newSelectedHex;

          // Update state
          setSelectedHex(newSelectedHex);

          // Immediately update visual selection for all hexes
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
              const selEl = svg.querySelector(
                `#selection-${r}-${c}`
              ) as SVGPolygonElement;
              if (selEl) {
                if (
                  newSelectedHex &&
                  newSelectedHex.row === r &&
                  newSelectedHex.column === c
                ) {
                  selEl.setAttribute("stroke", "#FFEB3B");
                  selEl.setAttribute("stroke-width", "2.5");
                  selEl.setAttribute("opacity", "1");
                } else {
                  selEl.setAttribute("stroke", "#FFEB3B");
                  selEl.setAttribute("stroke-width", "2.5");
                  selEl.setAttribute("opacity", "0");
                }
              }
            }
          }

          // Call selection callback
          if (onHexSelectRef.current) {
            const rowVal = newSelectedHex?.row ?? null;
            const colVal = newSelectedHex?.column ?? null;
            onHexSelectRef.current(rowVal, colVal);
          }
        });

        // Add to layers in order (bottom to top)
        selectionLayer.appendChild(selectionPolygon);
        hoverLayer.appendChild(hoverPolygon);
        detectionLayer.appendChild(detectionPolygon);
      }
    }

    // Append layers in order (bottom to top)
    svg.appendChild(baseLayer);
    svg.appendChild(riverLayer);
    svg.appendChild(roadLayer);
    svg.appendChild(selectionLayer);
    svg.appendChild(hoverLayer);
    svg.appendChild(detectionLayer);
  }, [columns, rows, hexes, selectedTerrain, selectedHex]);

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
