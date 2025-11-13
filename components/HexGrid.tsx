"use client";

import { useEffect, useRef, useState } from "react";
import type { ScenarioUnit, ArmType, TerrainType } from "@/shared/types";
import { TerrainType as TerrainTypeEnum } from "@/shared/types";
import type { MovementRange } from "@/lib/hex-pathfinding";

const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainTypeEnum.Clear]: "#d2b48c",
  [TerrainTypeEnum.Mountain]: "#8b7355",
  [TerrainTypeEnum.Forest]: "#5a8c5a",
  [TerrainTypeEnum.Water]: "#4a90e2",
  [TerrainTypeEnum.Desert]: "#f4a460",
  [TerrainTypeEnum.Swamp]: "#5a9a9a",
  [TerrainTypeEnum.Town]: "#808080",
};

interface Hex {
  row: number;
  column: number;
  terrain: TerrainType;
  rivers?: number; // Bitmask for river sides
  roads?: number; // Bitmask for road sides
}

interface HexGridProps {
  columns: number;
  rows: number;
  hexes?: Hex[];
  units?: ScenarioUnit[];
  selectedTerrain?: TerrainType;
  selectedHex?: { column: number; row: number } | null; // External selected hex (from game state)
  movementRange?: MovementRange; // Map of reachable hexes with movement costs
  onHexClick?: (column: number, row: number) => void;
  onHexHover?: (column: number | null, row: number | null) => void;
  onHexSelect?: (column: number | null, row: number | null) => void;
}

export default function HexGrid({
  columns,
  rows,
  hexes = [],
  units = [],
  selectedTerrain = TerrainTypeEnum.Clear,
  selectedHex: externalSelectedHex = null, // External selected hex prop
  movementRange,
  onHexClick,
  onHexHover,
  onHexSelect,
}: HexGridProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Internal selected hex state (for local clicks when no external prop is provided)
  const [internalSelectedHex, setInternalSelectedHex] = useState<{
    column: number;
    row: number;
  } | null>(null);
  // Use external selected hex if provided, otherwise use internal state
  const selectedHex = externalSelectedHex !== undefined ? externalSelectedHex : internalSelectedHex;
  const selectedHexRef = useRef<{ column: number; row: number } | null>(null);
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

  // Sync internal state when external prop changes (for re-rendering)
  useEffect(() => {
    if (externalSelectedHex !== undefined) {
      // External prop is provided, don't use internal state
      // But we still need to trigger a re-render when it changes
      // The useEffect below that renders hexes will handle this
    }
  }, [externalSelectedHex]);

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
    const movementRangeLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    movementRangeLayer.setAttribute("id", "hex-movement-range-layer");
    const unitLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    unitLayer.setAttribute("id", "hex-unit-layer");

    // Create a map of units by position for quick lookup (supporting stacking)
    const unitMap = new Map<string, ScenarioUnit[]>();
    units.forEach((unit) => {
      const key = `${unit.row},${unit.column}`;
      const existing = unitMap.get(key) || [];
      existing.push(unit);
      unitMap.set(key, existing);
    });

    // Helper function to render unit symbol
    const renderNATOSymbol = (
      unit: ScenarioUnit,
      centerX: number,
      centerY: number,
      size: number
    ) => {
      const baseUnitSize = size * 0.72; // 72% of hex width
      const unitSize = baseUnitSize * 0.85; // Square size
      const unitWidth = unitSize; // Square width
      const unitHeight = unitSize; // Square height
      const color = unit.player === 1 ? "#3b82f6" : "#dc2626"; // Blue for player 1, red for player 2
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("transform", `translate(${centerX}, ${centerY})`);

      // Determine border, text, and arm symbol color based on status
      const status = unit.status || 'available';
      let borderColor = "#fff"; // available - white border
      let textColor = "#fff"; // available - white text
      let armSymbolColor = "#fff"; // available - white arm symbol
      if (status === 'selected') {
        borderColor = "#FFEB3B"; // yellow border
        textColor = "#FFEB3B"; // yellow text
        armSymbolColor = "#FFEB3B"; // yellow arm symbol
      } else if (status === 'moved' || status === 'unavailable') {
        borderColor = "#404040"; // dark gray border
        textColor = "#404040"; // dark gray text
        armSymbolColor = "#404040"; // dark gray arm symbol
      }

      // All units are square with rounded corners
      const cornerRadius = unitSize * 0.15; // 15% of unit size for rounded corners
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", (-unitWidth / 2).toString());
      rect.setAttribute("y", (-unitHeight / 2).toString());
      rect.setAttribute("width", unitWidth.toString());
      rect.setAttribute("height", unitHeight.toString());
      rect.setAttribute("rx", cornerRadius.toString());
      rect.setAttribute("ry", cornerRadius.toString());
      rect.setAttribute("fill", color);
      rect.setAttribute("stroke", borderColor);
      rect.setAttribute("stroke-width", status === 'selected' ? "2" : "1"); // Thicker border for selected
      group.appendChild(rect);

      // Arm symbol: rectangle centered horizontally, positioned above the text
      const baseArmSymbolWidth = unitWidth * 0.4; // Base width of rectangle
      const baseArmSymbolHeight = unitHeight * 0.25; // Base height to avoid fonts
      // Grow by 50% while keeping bottom position fixed
      const armSymbolWidth = baseArmSymbolWidth * 1.5; // 50% larger
      const armSymbolHeight = baseArmSymbolHeight * 1.5; // 50% larger
      const fontSize = unitHeight * 0.4; // Calculate font size first
      const textY = unitHeight / 2 - fontSize * 0.4 - unitHeight * 0.05; // Text position at bottom, moved up slightly
      const marginFromBorder = unitHeight * 0.05; // Margin from unit border
      const marginFromText = unitHeight * 0.15; // Increased margin from text to avoid touching
      // Calculate original bottom position, then adjust Y to keep bottom fixed
      const originalBottomY = textY - baseArmSymbolHeight - marginFromText - (baseArmSymbolHeight / 2) + baseArmSymbolHeight;
      const armSymbolX = -armSymbolWidth / 2; // Centered horizontally
      const armSymbolY = originalBottomY - armSymbolHeight - unitHeight * 0.05; // Keep bottom position fixed, moved up slightly
      
      const armSymbolRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      armSymbolRect.setAttribute("x", armSymbolX.toString());
      armSymbolRect.setAttribute("y", armSymbolY.toString());
      armSymbolRect.setAttribute("width", armSymbolWidth.toString());
      armSymbolRect.setAttribute("height", armSymbolHeight.toString());
      armSymbolRect.setAttribute("fill", "none");
      armSymbolRect.setAttribute("stroke", armSymbolColor);
      armSymbolRect.setAttribute("stroke-width", "1.5");
      group.appendChild(armSymbolRect);

      // Add arm-specific symbols inside the rectangle
      const symbolInset = Math.min(armSymbolWidth, armSymbolHeight) * 0.2; // Slight inset from rectangle edges
      const symbolTop = armSymbolY + symbolInset;
      const symbolBottom = armSymbolY + armSymbolHeight - symbolInset;
      const symbolLeft = armSymbolX + symbolInset;
      const symbolRight = armSymbolX + armSymbolWidth - symbolInset;

      if (unit.arm === "Infantry") {
        // Infantry: lines crossing from opposite corners (X pattern)
        const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line1.setAttribute("x1", symbolLeft.toString());
        line1.setAttribute("y1", symbolTop.toString());
        line1.setAttribute("x2", symbolRight.toString());
        line1.setAttribute("y2", symbolBottom.toString());
        line1.setAttribute("stroke", armSymbolColor);
        line1.setAttribute("stroke-width", "2");
        group.appendChild(line1);

        const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line2.setAttribute("x1", symbolRight.toString());
        line2.setAttribute("y1", symbolTop.toString());
        line2.setAttribute("x2", symbolLeft.toString());
        line2.setAttribute("y2", symbolBottom.toString());
        line2.setAttribute("stroke", armSymbolColor);
        line2.setAttribute("stroke-width", "2");
        group.appendChild(line2);
      } else if (unit.arm === "Cavalry") {
        // Cavalry: one line from one set of opposite corners
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", symbolLeft.toString());
        line.setAttribute("y1", symbolTop.toString());
        line.setAttribute("x2", symbolRight.toString());
        line.setAttribute("y2", symbolBottom.toString());
        line.setAttribute("stroke", armSymbolColor);
        line.setAttribute("stroke-width", "2");
        group.appendChild(line);
      } else {
        // Artillery: smaller solid circle in the centre of the rectangle
        const circleCenterX = armSymbolX + armSymbolWidth / 2;
        const circleCenterY = armSymbolY + armSymbolHeight / 2;
        const circleRadius = Math.min(armSymbolWidth, armSymbolHeight) * 0.25; // Smaller radius
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", circleCenterX.toString());
        circle.setAttribute("cy", circleCenterY.toString());
        circle.setAttribute("r", circleRadius.toString());
        circle.setAttribute("fill", armSymbolColor); // Solid (filled) circle
        circle.setAttribute("stroke", armSymbolColor);
        circle.setAttribute("stroke-width", "1");
        group.appendChild(circle);
      }

      // Add combat strength and movement allowance text at bottom, on same line
      // (fontSize and textY already calculated above for arm symbol positioning)

      const statsText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      statsText.setAttribute("x", "0");
      statsText.setAttribute("y", textY.toString());
      statsText.setAttribute("fill", textColor);
      statsText.setAttribute("font-size", fontSize.toString());
      statsText.setAttribute("font-weight", "bold");
      statsText.setAttribute("text-anchor", "middle");
      statsText.setAttribute("dominant-baseline", "middle");
      statsText.textContent = `${unit.combatStrength}-${unit.movementAllowance}`;
      group.appendChild(statsText);

      return group;
    };

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
        label.textContent = `${col}-${row}`;

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
              riverLine.setAttribute("stroke", "#0066CC"); // Darker blue for better contrast
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

        // Render movement range overlay if this hex is in the movement range
        if (movementRange) {
          const rangeKey = `${col},${row}`; // Format: "column,row" to match pathfinding
          const movementCost = movementRange[rangeKey];
          if (movementCost !== undefined) {
            // Draw a bright green outline to highlight eligible hexes (no fill/shading)
            const rangeOverlay = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "polygon"
            );
            rangeOverlay.setAttribute("points", points.join(" "));
            rangeOverlay.setAttribute("fill", "none"); // No fill
            rangeOverlay.setAttribute("stroke", "#00FF00"); // Bright green border
            rangeOverlay.setAttribute("stroke-width", "2");
            rangeOverlay.setAttribute("pointer-events", "none");
            movementRangeLayer.appendChild(rangeOverlay);

            // Display movement cost as text
            const costText = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "text"
            );
            const costX = centerX;
            const costY = centerY + hexHeight / 2 - 4; // Position near bottom vertex
            costText.setAttribute("x", costX.toString());
            costText.setAttribute("y", costY.toString());
            costText.setAttribute("fill", "#00AA00"); // Darker green for text
            costText.setAttribute("font-size", (hexSize * 0.4).toString());
            costText.setAttribute("font-weight", "bold");
            costText.setAttribute("text-anchor", "middle");
            costText.setAttribute("dominant-baseline", "middle");
            costText.setAttribute("pointer-events", "none");
            costText.textContent = movementCost.toString();
            movementRangeLayer.appendChild(costText);
          }
        }

        // Render units if present at this hex (supporting stacking)
        const unitKey = `${row},${col}`;
        const hexUnits = unitMap.get(unitKey);
        if (hexUnits && hexUnits.length > 0) {
          const totalUnits = hexUnits.length;
          
          hexUnits.forEach((unit, index) => {
            // Distribute units evenly between bottom (0%) and top (12%)
            // For 1 unit: 0% offset
            // For 2 units: 0% and 12%
            // For 3+ units: evenly distributed between 0% and 12%
            const offsetPercent = totalUnits === 1 ? 0 : (index / (totalUnits - 1)) * 0.12;
            const stackOffset = hexWidth * offsetPercent;
            
            // Offset: up (negative Y) and to the right (positive X)
            const offsetX = centerX + stackOffset;
            const offsetY = centerY - stackOffset;
            const unitSymbol = renderNATOSymbol(unit, offsetX, offsetY, hexWidth);
            unitLayer.appendChild(unitSymbol);
          });
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
            onHexHoverRef.current(col, row);
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

          // If external selectedHex is provided, the parent component controls selection
          // Only call the callback - don't update internal state or visual selection
          if (externalSelectedHex !== undefined) {
            if (onHexClickRef.current) {
              onHexClickRef.current(col, row);
            }
            // Parent component will handle selection state via the external prop
            return;
          }

          // Internal selection mode (no external prop) - update selection locally
          // Always allow terrain changes (onHexClick) - controlled by activeTab in parent
          if (onHexClickRef.current) {
            onHexClickRef.current(col, row);
          }

          // Always allow selection (hover and selection work regardless of tab)
          const currentSelected = selectedHexRef.current;
          const isCurrentlySelected =
            currentSelected &&
            currentSelected.column === col &&
            currentSelected.row === row;
          const newSelectedHex = isCurrentlySelected
            ? null
            : { column: col, row };

          // Immediately update the ref so callbacks have correct value
          selectedHexRef.current = newSelectedHex;

          // Update internal state (only used when no external prop)
          setInternalSelectedHex(newSelectedHex);

          // Immediately update visual selection for all hexes
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
              const selEl = svg.querySelector(
                `#selection-${r}-${c}`
              ) as SVGPolygonElement;
              if (selEl) {
                if (
                  newSelectedHex &&
                  newSelectedHex.column === c &&
                  newSelectedHex.row === r
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
            const colVal = newSelectedHex?.column ?? null;
            const rowVal = newSelectedHex?.row ?? null;
            onHexSelectRef.current(colVal, rowVal);
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
    svg.appendChild(movementRangeLayer);
    svg.appendChild(unitLayer);
    svg.appendChild(hoverLayer);
    svg.appendChild(detectionLayer);
    
    // Debug: Log movement range info
    if (movementRange) {
      const rangeKeys = Object.keys(movementRange);
      console.log('[HexGrid] Movement range overlay rendered:', {
        rangeSize: rangeKeys.length,
        rangeKeys: rangeKeys.slice(0, 20),
        movementRangeLayerChildren: movementRangeLayer.children.length
      });
    }
  }, [columns, rows, hexes, units, selectedTerrain, selectedHex, externalSelectedHex, movementRange]);

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
