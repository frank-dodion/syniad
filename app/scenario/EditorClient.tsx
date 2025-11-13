"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import HexGrid from "@/components/HexGrid";
import {
  createScenario,
  updateScenario,
  deleteScenario,
  getScenario,
  type Scenario,
} from "@/lib/scenario-api";
import { useAuth } from "@/lib/auth-client";
import type { ScenarioUnit, ArmType, UnitStatus } from "@/shared/types";
import { PlayerNumber, TerrainType, HexSide } from "@/shared/types";
import { v4 as uuidv4 } from "uuid";

const TERRAIN_TYPES = [
  TerrainType.Clear,
  TerrainType.Mountain,
  TerrainType.Forest,
  TerrainType.Water,
  TerrainType.Desert,
  TerrainType.Swamp,
  TerrainType.Town,
];

// Unit symbol preview component
function UnitSymbolPreview({ unit, size }: { unit: ScenarioUnit; size?: number }) {
  // Use provided size or calculate from hex dimensions to match map
  // If size is provided, it's the actual unit size (hexWidth * 0.72 * 0.85)
  // If not provided, use default preview size for edit form
  const hexSize = 28;
  const hexWidth = hexSize * 2;
  
  let previewSize: number;
  let unitSize: number;
  
  if (size) {
    // Size is provided - use it directly as unit size
    // For SVG viewBox, add extra space for border (2px border = 4px total)
    unitSize = size;
    previewSize = size + 4; // unit size + border space (4px for 2px border on each side)
  } else {
    // Default preview size for edit form
    previewSize = 80;
    const baseUnitSize = previewSize * 0.72;
    unitSize = baseUnitSize * 0.85;
  }
  
  const unitWidth = unitSize; // Square width
  const unitHeight = unitSize; // Square height
  const color = unit.player === PlayerNumber.Player1 ? "#3b82f6" : "#dc2626";
  
  // Arm symbol: rectangle centered horizontally, positioned above the text
  const baseArmSymbolWidth = unitWidth * 0.4; // Base width of rectangle
  const baseArmSymbolHeight = unitHeight * 0.25; // Base height to avoid fonts
  // Grow by 50% while keeping bottom position fixed
  const armSymbolWidth = baseArmSymbolWidth * 1.5; // 50% larger
  const armSymbolHeight = baseArmSymbolHeight * 1.5; // 50% larger
      const fontSize = unitHeight * 0.4; // Bigger font size - calculate first
      const textY = unitHeight / 2 - fontSize * 0.4 - unitHeight * 0.05; // Text position at bottom, moved up slightly
      const marginFromBorder = unitHeight * 0.05; // Margin from unit border
      const marginFromText = unitHeight * 0.15; // Increased margin from text to avoid touching
      // Calculate original bottom position, then adjust Y to keep bottom fixed
      const originalBottomY = textY - baseArmSymbolHeight - marginFromText - (baseArmSymbolHeight / 2) + baseArmSymbolHeight;
      const armSymbolX = -armSymbolWidth / 2; // Centered horizontally
      const armSymbolY = originalBottomY - armSymbolHeight - unitHeight * 0.05; // Keep bottom position fixed, moved up slightly
  
  // Arm symbol coordinates
  const symbolInset = Math.min(armSymbolWidth, armSymbolHeight) * 0.2;
  const symbolTop = armSymbolY + symbolInset;
  const symbolBottom = armSymbolY + armSymbolHeight - symbolInset;
  const symbolLeft = armSymbolX + symbolInset;
  const symbolRight = armSymbolX + armSymbolWidth - symbolInset;

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

  return (
    <div className="flex justify-center items-center" style={{ padding: size ? 0 : '0.5rem 0' }}>
      <svg 
        width={size || previewSize} 
        height={size || previewSize} 
        viewBox={`${-previewSize/2} ${-previewSize/2} ${previewSize} ${previewSize}`}
        style={{ display: 'block' }}
      >
        {/* Background for visibility (only in edit form, not in strip) */}
        {!size && (
          <rect
            x={-previewSize/2}
            y={-previewSize/2}
            width={previewSize}
            height={previewSize}
            fill="#f9fafb"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        )}
        {/* Main rectangle with rounded corners */}
        <rect
          x={-unitWidth / 2}
          y={-unitHeight / 2}
          width={unitWidth}
          height={unitHeight}
          rx={unitSize * 0.15}
          ry={unitSize * 0.15}
          fill={color}
          stroke={borderColor}
          strokeWidth={status === 'selected' ? "2" : "1"}
        />
        
        {/* Arm symbol rectangle */}
        <rect
          x={armSymbolX}
          y={armSymbolY}
          width={armSymbolWidth}
          height={armSymbolHeight}
          fill="none"
          stroke={armSymbolColor}
          strokeWidth="1.5"
        />
        
        {/* Arm-specific symbols */}
        {unit.arm === "Infantry" && (
          <>
            <line
              x1={symbolLeft}
              y1={symbolTop}
              x2={symbolRight}
              y2={symbolBottom}
              stroke={armSymbolColor}
              strokeWidth="2"
            />
            <line
              x1={symbolRight}
              y1={symbolTop}
              x2={symbolLeft}
              y2={symbolBottom}
              stroke={armSymbolColor}
              strokeWidth="2"
            />
          </>
        )}
        {unit.arm === "Cavalry" && (
          <line
            x1={symbolLeft}
            y1={symbolTop}
            x2={symbolRight}
            y2={symbolBottom}
            stroke={armSymbolColor}
            strokeWidth="2"
          />
        )}
        {unit.arm === "Artillery" && (
          <circle
            cx={armSymbolX + armSymbolWidth / 2}
            cy={armSymbolY + armSymbolHeight / 2}
            r={Math.min(armSymbolWidth, armSymbolHeight) * 0.25}
            fill={armSymbolColor}
            stroke={armSymbolColor}
            strokeWidth="1"
          />
        )}
        
        {/* Combat strength and movement allowance */}
        <text
          x="0"
          y={textY}
          fill={textColor}
          fontSize={fontSize}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {unit.combatStrength}-{unit.movementAllowance}
        </text>
      </svg>
    </div>
  );
}

// Component to display units in a horizontal scrollable strip
function UnitStrip({ 
  units, 
  hexLabel, 
  onUnitClick 
}: { 
  units: ScenarioUnit[]; 
  hexLabel: string;
  onUnitClick?: (unit: ScenarioUnit) => void;
}) {
  // Calculate unit size to match the map: hexWidth * 0.72 * 0.85
  // hexWidth = hexSize * 2 = 28 * 2 = 56
  // unitSize = 56 * 0.72 * 0.85 = 34.272
  const hexSize = 28;
  const hexWidth = hexSize * 2;
  const unitSize = hexWidth * 0.72 * 0.85; // Same calculation as in HexGrid
  const maxBorderWidth = 2; // Selected units have 2px border
  const containerSize = unitSize + (maxBorderWidth * 2); // border on both sides
  // Halve the spacing by reducing container width by half the border width
  const reducedContainerSize = containerSize - maxBorderWidth;

  return (
    <div>
      <div className="bg-gray-300" style={{ padding: 0, minHeight: `${containerSize}px` }}>
        <div className="overflow-x-auto overflow-y-visible scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100" style={{ padding: 0 }}>
          <div className="flex" style={{ minWidth: 'min-content', gap: 0, padding: 0, margin: 0, minHeight: `${containerSize}px` }}>
            {units.map((unit) => {
              return (
                <div
                  key={unit.id}
                  className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                  style={{ 
                    width: `${reducedContainerSize}px`, 
                    height: `${containerSize}px`,
                    margin: 0,
                    padding: 0
                  }}
                  onClick={() => onUnitClick?.(unit)}
                >
                  <UnitSymbolPreview unit={unit} size={unitSize} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Icon components for rivers and roads
function RiverIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 12c0 2.5 2 5 5 5s5-2.5 5-5" />
      <path d="M12 12c0 2.5 2 5 5 5s5-2.5 5-5" />
      <path d="M7 12c0 2.5 2 5 5 5s5-2.5 5-5" />
    </svg>
  );
}

function RoadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 12h16" />
      <path d="M4 8h16" />
      <path d="M4 16h16" />
    </svg>
  );
}

export function EditorClient({ params }: { params?: Promise<{ scenarioId: string }> }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [scenarioIdFromRoute, setScenarioIdFromRoute] = useState<string | null>(null);
  const [selectedTerrain, setSelectedTerrain] = useState<TerrainType>(TerrainType.Clear);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState(12);
  const [rows, setRows] = useState(10);
  const [turns, setTurns] = useState(15);
  const [isEditing, setIsEditing] = useState(false);
  const [hexes, setHexes] = useState<
    Array<{ column: number; row: number; terrain: TerrainType; rivers: number; roads: number }>
  >([]);
  const [hoveredHex, setHoveredHex] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const [selectedHex, setSelectedHex] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const [selectedHexRivers, setSelectedHexRivers] = useState<number>(0);
  const [selectedHexRoads, setSelectedHexRoads] = useState<number>(0);
  const [paintMode, setPaintMode] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  // Unit management state
  const [units, setUnits] = useState<ScenarioUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<ScenarioUnit | null>(null);
  const [editingUnit, setEditingUnit] = useState<ScenarioUnit | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'scenario' | 'hex' | 'unit'>('scenario');

  // Flag to track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Import scenario state
  const [importScenarioId, setImportScenarioId] = useState("");
  const [showImportForm, setShowImportForm] = useState(false);

  // Redirect to home page if not authenticated, but preserve the intended destination
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Store the intended destination so we can redirect back after login
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname + window.location.search + window.location.hash;
        sessionStorage.setItem("authRedirect", currentPath);
      }
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Extract scenarioId from route params
  useEffect(() => {
    if (params) {
      params.then((p) => {
        setScenarioIdFromRoute(p.scenarioId);
      });
    }
  }, [params]);

  // Update river and road selections when selected hex changes
  useEffect(() => {
    if (selectedHex) {
      const hex = hexes.find(
        (h) => h.row === selectedHex.row && h.column === selectedHex.column
      );
      setSelectedHexRivers(hex?.rivers ?? 0);
      setSelectedHexRoads(hex?.roads ?? 0);
    } else {
      setSelectedHexRivers(0);
      setSelectedHexRoads(0);
    }
  }, [selectedHex, hexes]);

  // Update terrain selection when selected hex changes (only in normal mode)
  useEffect(() => {
    if (!paintMode && selectedHex) {
      const hex = hexes.find(
        (h) => h.row === selectedHex.row && h.column === selectedHex.column
      );
      setSelectedTerrain(hex?.terrain ?? TerrainType.Clear);
    }
  }, [selectedHex, hexes, paintMode]);

  function showMessage(text: string, type: "success" | "error") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  // Define handleLoadScenarioFromRoute - handles loading scenario from route params
  const handleLoadScenarioFromRoute = useCallback(async (scenarioId: string) => {
    if (!isAuthenticated) {
      showMessage("Please login to load scenarios", "error");
      return;
    }

    try {
      setLoading(true);
      const response = await getScenario(scenarioId);
      const scenario = response.scenario;
      
      if (!scenario) {
        showMessage('Scenario not found', "error");
        router.push('/');
        return;
      }

      setCurrentScenario(scenario);
      setTitle(scenario.title);
      setDescription(scenario.description);
      setColumns(scenario.columns);
      setRows(scenario.rows);
      setTurns(scenario.turns);
      // Ensure all hexes have rivers and roads properties (default to 0)
      // Cast terrain to TerrainType since it comes from JSON as string
      setHexes((scenario.hexes || []).map(hex => ({ 
        ...hex, 
        terrain: hex.terrain as TerrainType,
        rivers: hex.rivers ?? 0, 
        roads: hex.roads ?? 0 
      })));
      // Load units with default status 'available' if not set
      setUnits((scenario.units || []).map(unit => ({ ...unit, status: (unit.status || 'available') as UnitStatus })));
      // Clear selected and hovered hexes when loading a new scenario
      setSelectedHex(null);
      setHoveredHex(null);
      setSelectedUnit(null);
      setEditingUnit(null);
      // Reset unsaved changes flag when loading a scenario
      setHasUnsavedChanges(false);
      setIsEditing(true);
      // Show edit form when scenario is loaded from route
      setShowEditForm(true);
      // Switch to Scenario tab when scenario is loaded
      setActiveTab('scenario');
    } catch (error: any) {
      console.error('[handleLoadScenarioFromRoute] Error loading scenario:', error);
      showMessage(`Error loading scenario: ${error.message}`, "error");
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, showMessage, router]);

  // Load scenario from route params
  useEffect(() => {
    if (scenarioIdFromRoute && isAuthenticated && !currentScenario) {
      void handleLoadScenarioFromRoute(scenarioIdFromRoute);
    }
  }, [scenarioIdFromRoute, isAuthenticated, currentScenario, handleLoadScenarioFromRoute]);

  async function handleLoadScenario(scenarioId: string) {
    if (!isAuthenticated) {
      showMessage("Please login to load scenarios", "error");
      return;
    }

    // If there are unsaved changes, show confirmation before loading a new scenario
    if (hasUnsavedChanges && isEditing) {
      if (
        !confirm(
          "You have unsaved changes. Are you sure you want to load a different scenario? Your changes will be lost."
        )
      ) {
        return; // User cancelled, don't load the scenario
      }
    }

    // Navigate to scenario URL - this will load the scenario via route params
    router.push(`/scenario/${scenarioId}`);
  }

  function handleCreateNew() {
    // If editing, cancel changes by reloading the scenario
    if (isEditing && currentScenario) {
      void handleLoadScenario(currentScenario.scenarioId);
      return;
    }

    // Otherwise, start fresh (new scenario)
    setCurrentScenario(null);
    setTitle("");
    setDescription("");
    setColumns(12);
    setRows(10);
    setTurns(15);
    setHexes([]);
    setUnits([]);
    // Clear selected and hovered hexes
    setSelectedHex(null);
    setHoveredHex(null);
    setSelectedUnit(null);
    setEditingUnit(null);
    setHasUnsavedChanges(false);
    setIsEditing(false);
    setShowEditForm(false);
  }

  async function handleSave() {
    if (!isAuthenticated) {
      showMessage("Please login to save scenarios", "error");
      return;
    }

    if (!title.trim()) {
      showMessage("Please enter a title", "error");
      return;
    }

    try {
      setLoading(true);
      const scenarioData = {
        title: title.trim(),
        description: description.trim(),
        columns,
        rows,
        turns,
        hexes,
        units,
      };

      if (currentScenario) {
        await updateScenario(currentScenario.scenarioId, scenarioData);
        // Reset unsaved changes flag after successful save
        setHasUnsavedChanges(false);
        showMessage("Scenario updated successfully", "success");
      } else {
        const response = await createScenario(scenarioData);
        showMessage("Scenario created successfully", "success");
        // Navigate to scenario URL - this will load the scenario via route params
        router.push(`/scenario/${response.scenario.scenarioId}`);
      }
    } catch (error: any) {
      showMessage(`Error saving scenario: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!currentScenario) return;

    if (!confirm("Are you sure you want to delete this scenario?")) return;

    if (!isAuthenticated) {
      showMessage("Please login to delete scenarios", "error");
      return;
    }

    try {
      setLoading(true);
      await deleteScenario(currentScenario.scenarioId);
      showMessage("Scenario deleted successfully", "success");

      // Reset form state
      setCurrentScenario(null);
      setTitle("");
      setDescription("");
      setColumns(12);
      setRows(10);
      setTurns(15);
      setHexes([]);
      setUnits([]);
      setSelectedUnit(null);
      setEditingUnit(null);
      setHasUnsavedChanges(false);
      setIsEditing(false);
      setShowEditForm(false);

      // Redirect to landing page since scenarios are managed there
      router.push("/");
    } catch (error: any) {
      showMessage(`Error deleting scenario: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleShareScenario(scenarioId: string) {
    try {
      // Copy scenario UUID to clipboard
      await navigator.clipboard.writeText(scenarioId);
      showMessage("Scenario UUID copied to clipboard!", "success");
    } catch (error: any) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = scenarioId;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        showMessage("Scenario UUID copied to clipboard!", "success");
      } catch (err) {
        showMessage("Failed to copy UUID. Please copy manually: " + scenarioId, "error");
      }
      document.body.removeChild(textArea);
    }
  }

  async function handleImportScenario() {
    if (!isAuthenticated) {
      showMessage("Please login to import scenarios", "error");
      return;
    }

    if (!user?.userId) {
      showMessage("User information not available", "error");
      return;
    }

    const scenarioIdToImport = importScenarioId.trim();
    if (!scenarioIdToImport) {
      showMessage("Please enter a scenario UUID", "error");
      return;
    }

    try {
      setLoading(true);
      
      // Fetch the scenario to copy
      const { scenario: sourceScenario } = await getScenario(scenarioIdToImport);
      
      if (!sourceScenario) {
        showMessage("Scenario not found", "error");
        return;
      }

      // Create a copy with the current user as creator
      const scenarioData = {
        title: `${sourceScenario.title} (Copy)`,
        description: sourceScenario.description,
        columns: sourceScenario.columns,
        rows: sourceScenario.rows,
        turns: sourceScenario.turns,
        hexes: sourceScenario.hexes ? [...sourceScenario.hexes] : undefined,
        units: sourceScenario.units ? [...sourceScenario.units] : undefined,
      };

      const response = await createScenario(scenarioData);
      showMessage(`Scenario "${sourceScenario.title}" imported successfully!`, "success");
      
      // Reset import form
      setImportScenarioId("");
      setShowImportForm(false);
      
      // Redirect to landing page since scenarios are managed there
      router.push("/");
    } catch (error: any) {
      showMessage(`Error importing scenario: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  function handleHexClick(column: number, row: number) {
    // Always allow selection, even when not editing
    // Selection is independent of edit mode
    
    // In paint mode, apply terrain from dropdown to clicked hex
    if (paintMode && showEditForm) {
      if (isEditing || currentScenario) {
        const existingIndex = hexes.findIndex(
          (h) => h.column === column && h.row === row
        );
        const existingHex = existingIndex >= 0 ? hexes[existingIndex] : null;
        // Preserve existing rivers and roads if hex exists, otherwise default to 0
        const newHex = {
          column,
          row,
          terrain: selectedTerrain,
          rivers: existingHex?.rivers ?? 0,
          roads: existingHex?.roads ?? 0,
        };

        if (existingIndex >= 0) {
          const newHexes = [...hexes];
          newHexes[existingIndex] = newHex;
          setHexes(newHexes);
        } else {
          setHexes([...hexes, newHex]);
        }

        // Mark as having unsaved changes
        if (isEditing) setHasUnsavedChanges(true);
      }
    }
    
    // Always select the clicked hex (even in paint mode)
    handleHexSelect(column, row);
  }

  function handleHexHover(column: number | null, row: number | null) {
    if (column !== null && row !== null) {
      setHoveredHex({ column, row });
    } else {
      setHoveredHex(null);
    }
  }

  function handleHexSelect(column: number | null, row: number | null) {
    if (column !== null && row !== null) {
      setSelectedHex({ column, row });
      // Load rivers and roads values for selected hex
      const hex = hexes.find((h) => h.column === column && h.row === row);
      setSelectedHexRivers(hex?.rivers ?? 0);
      setSelectedHexRoads(hex?.roads ?? 0);
      
      // Log selected hex and all adjacent hexes with their side numbers
      const sideNames = ['Top', 'Top Right', 'Bottom Right', 'Bottom', 'Bottom Left', 'Top Left'];
      const adjacentHexes: Array<{ side: HexSide; sideName: string; hex: { column: number; row: number } | null }> = [];
      
      for (let side = 0; side < 6; side++) {
        const adjacent = getAdjacentHex(column, row, side);
        adjacentHexes.push({
          side: side as HexSide,
          sideName: sideNames[side],
          hex: adjacent
        });
      }
      
      console.log('Hex selected:', {
        selectedHex: `${column}-${row}`,
        adjacentHexes: adjacentHexes.map(adj => ({
          side: adj.side,
          sideName: adj.sideName,
          hex: adj.hex ? `${adj.hex.column}-${adj.hex.row}` : null,
          inBounds: adj.hex ? (adj.hex.column >= 0 && adj.hex.row >= 0 && adj.hex.column < columns && adj.hex.row < rows) : false
        }))
      });
    } else {
      setSelectedHex(null);
      setSelectedHexRivers(0);
      setSelectedHexRoads(0);
    }
  }

  // Helper function to get adjacent hex coordinates for a given side (flat-top, even-q offset)
  // Uses 0-indexed arrays: hex "4-9" means column 4, row 9 (both 0-indexed)
  // Examples (0-indexed):
  // Odd column hex 3-2 has adjacent: 3-1 (side 0), 4-2 (side 1), 4-3 (side 2), 3-3 (side 3), 2-3 (side 4), 2-2 (side 5)
  // Even column hex 4-3 has adjacent: 4-2 (side 0), 5-2 (side 1), 5-3 (side 2), 4-4 (side 3), 3-3 (side 4), 3-2 (side 5)
  function getAdjacentHex(column: number, row: number, side: HexSide): { column: number; row: number } | null {
    const isEvenCol = column % 2 === 0;

    switch (side) {
      case HexSide.Top: // Top (North)
        return { column, row: row - 1 };
      case HexSide.TopRight: // Top Right (Northeast)
        return isEvenCol ? { column: column + 1, row: row - 1 } : { column: column + 1, row };
      case HexSide.BottomRight: // Bottom Right (Southeast)
        return isEvenCol ? { column: column + 1, row } : { column: column + 1, row: row + 1 };
      case HexSide.Bottom: // Bottom (South)
        return { column, row: row + 1 };
      case HexSide.BottomLeft: // Bottom Left (Southwest)
        return isEvenCol ? { column: column - 1, row } : { column: column - 1, row: row + 1 };
      case HexSide.TopLeft: // Top Left (Northwest)
        return isEvenCol ? { column: column - 1, row: row - 1 } : { column: column - 1, row };
      default:
        return null;
    }
  }

  // Helper function to get the opposite side on the adjacent hex
  // For flat-top hexes, opposite sides are: 0↔3, 1↔4, 2↔5
  // This is always true regardless of column parity
  function getOppositeSide(origSide: HexSide): HexSide {
    return ((origSide + 3) % 6) as HexSide;
  }

  // Helper function to toggle river side
  function toggleRiverSide(side: HexSide) {
    const newRivers = (selectedHexRivers & (1 << side)) !== 0
      ? selectedHexRivers & ~(1 << side)
      : selectedHexRivers | (1 << side);
    setSelectedHexRivers(newRivers);
    if (selectedHex) {
      const newHexes = [...hexes];
      const existingIndex = hexes.findIndex(
        (h) => h.row === selectedHex.row && h.column === selectedHex.column
      );
      
      // Update the selected hex
      if (existingIndex >= 0) {
        newHexes[existingIndex] = {
          ...newHexes[existingIndex],
          rivers: newRivers,
        };
      } else {
        // Create new hex if it doesn't exist
        const newHex = {
          row: selectedHex.row,
          column: selectedHex.column,
          terrain: TerrainType.Clear,
          rivers: newRivers,
          roads: 0,
        };
        newHexes.push(newHex);
      }

      // Update adjacent hex sharing this side
      const adjacentHex = getAdjacentHex(selectedHex.column, selectedHex.row, side);
      if (adjacentHex && adjacentHex.column >= 0 && adjacentHex.row >= 0 && adjacentHex.column < columns && adjacentHex.row < rows) {
        // Calculate which side of the adjacent hex corresponds to the shared side
        // For flat-top hexes, opposite sides are always: 0↔3, 1↔4, 2↔5
        const oppositeSide = getOppositeSide(side);
        
        // Debug logging (using 0-indexed values)
        const sideNames = ['Top', 'Top Right', 'Bottom Right', 'Bottom', 'Bottom Left', 'Top Left'];
        console.log('River toggle debug:', {
          selectedHex: `${selectedHex.column}-${selectedHex.row}`,
          side,
          sideName: sideNames[side],
          calculatedAdjacent: `${adjacentHex.column}-${adjacentHex.row}`,
          oppositeSide: oppositeSide,
          oppositeSideName: sideNames[oppositeSide],
          isEvenColumn: selectedHex.column % 2 === 0
        });
        
        // Find the adjacent hex in the original array to get its current state
        const originalAdjacentIndex = hexes.findIndex(
          (h) => h.row === adjacentHex.row && h.column === adjacentHex.column
        );
        
        // Find it in the new array (might have been added if it didn't exist)
        const adjacentIndex = newHexes.findIndex(
          (h) => h.row === adjacentHex.row && h.column === adjacentHex.column
        );
        
        const isRiverSet = (newRivers & (1 << side)) !== 0;
        
        if (adjacentIndex >= 0) {
          // Update existing adjacent hex
          const currentRivers = newHexes[adjacentIndex].rivers ?? 0;
          const newAdjacentRivers = isRiverSet
            ? currentRivers | (1 << oppositeSide)
            : currentRivers & ~(1 << oppositeSide);
          console.log('Updating existing adjacent hex:', {
            hex: `${adjacentHex.column}-${adjacentHex.row}`,
            currentRivers: currentRivers.toString(2).padStart(6, '0'),
            newRivers: newAdjacentRivers.toString(2).padStart(6, '0'),
            settingSide: oppositeSide
          });
          newHexes[adjacentIndex] = {
            ...newHexes[adjacentIndex],
            rivers: newAdjacentRivers,
          };
        } else {
          // Create new adjacent hex if it doesn't exist
          const newAdjacentRivers = isRiverSet ? (1 << oppositeSide) : 0;
          console.log('Creating new adjacent hex:', {
            hex: `${adjacentHex.column}-${adjacentHex.row}`,
            rivers: newAdjacentRivers.toString(2).padStart(6, '0'),
            settingSide: oppositeSide
          });
          const newAdjacentHex = {
            row: adjacentHex.row,
            column: adjacentHex.column,
            terrain: TerrainType.Clear,
            rivers: newAdjacentRivers,
            roads: 0,
          };
          newHexes.push(newAdjacentHex);
        }
      }

      setHexes(newHexes);
      if (isEditing) setHasUnsavedChanges(true);
    }
  }

  // Helper function to toggle road side
  function toggleRoadSide(side: HexSide) {
    const newRoads = (selectedHexRoads & (1 << side)) !== 0
      ? selectedHexRoads & ~(1 << side)
      : selectedHexRoads | (1 << side);
    setSelectedHexRoads(newRoads);
    if (selectedHex) {
      const newHexes = [...hexes];
      const existingIndex = hexes.findIndex(
        (h) => h.row === selectedHex.row && h.column === selectedHex.column
      );
      
      // Update the selected hex
      if (existingIndex >= 0) {
        newHexes[existingIndex] = {
          ...newHexes[existingIndex],
          roads: newRoads,
        };
      } else {
        // Create new hex if it doesn't exist
        const newHex = {
          row: selectedHex.row,
          column: selectedHex.column,
          terrain: TerrainType.Clear,
          rivers: 0,
          roads: newRoads,
        };
        newHexes.push(newHex);
      }

      // Update adjacent hex sharing this side
      const adjacentHex = getAdjacentHex(selectedHex.column, selectedHex.row, side);
      if (adjacentHex && adjacentHex.column >= 0 && adjacentHex.row >= 0 && adjacentHex.column < columns && adjacentHex.row < rows) {
        // Calculate which side of the adjacent hex corresponds to the shared side
        // For flat-top hexes, opposite sides are always: 0↔3, 1↔4, 2↔5
        const oppositeSide = getOppositeSide(side);
        
        // Find the adjacent hex in the new array (might have been added if it didn't exist)
        const adjacentIndex = newHexes.findIndex(
          (h) => h.row === adjacentHex.row && h.column === adjacentHex.column
        );
        
        const isRoadSet = (newRoads & (1 << side)) !== 0;
        
        if (adjacentIndex >= 0) {
          // Update existing adjacent hex
          const currentRoads = newHexes[adjacentIndex].roads ?? 0;
          const newAdjacentRoads = isRoadSet
            ? currentRoads | (1 << oppositeSide)
            : currentRoads & ~(1 << oppositeSide);
          newHexes[adjacentIndex] = {
            ...newHexes[adjacentIndex],
            roads: newAdjacentRoads,
          };
        } else {
          // Create new adjacent hex if it doesn't exist
          const newAdjacentRoads = isRoadSet ? (1 << oppositeSide) : 0;
          const newAdjacentHex = {
            row: adjacentHex.row,
            column: adjacentHex.column,
            terrain: TerrainType.Clear,
            rivers: 0,
            roads: newAdjacentRoads,
          };
          newHexes.push(newAdjacentHex);
        }
      }

      setHexes(newHexes);
      if (isEditing) setHasUnsavedChanges(true);
    }
  }

  // Resize functions
  function addColumnLeft() {
    if (!isEditing) return;
    setColumns(columns + 1);
    // Shift all existing hexes' columns to the right
    setHexes(hexes.map((h) => ({ ...h, column: h.column + 1 })));
    setHasUnsavedChanges(true);
  }

  function addColumnRight() {
    if (!isEditing) return;
    setColumns(columns + 1);
    // No need to shift hexes, new column is added to the right
    setHasUnsavedChanges(true);
  }

  function removeColumnLeft() {
    if (!isEditing || columns <= 1) return;
    setColumns(columns - 1);
    // Remove hexes in the leftmost column and shift others left
    setHexes(
      hexes
        .filter((h) => h.column !== 0)
        .map((h) => ({ ...h, column: h.column - 1 }))
    );
    setHasUnsavedChanges(true);
  }

  function removeColumnRight() {
    if (!isEditing || columns <= 1) return;
    const newColumns = columns - 1;
    setColumns(newColumns);
    // Remove hexes in the rightmost column
    setHexes(hexes.filter((h) => h.column < newColumns));
    setHasUnsavedChanges(true);
  }

  function addRowTop() {
    if (!isEditing) return;
    setRows(rows + 1);
    // Shift all existing hexes' rows down
    setHexes(hexes.map((h) => ({ ...h, row: h.row + 1 })));
    setHasUnsavedChanges(true);
  }

  function addRowBottom() {
    if (!isEditing) return;
    setRows(rows + 1);
    // No need to shift hexes, new row is added to the bottom
    setHasUnsavedChanges(true);
  }

  function removeRowTop() {
    if (!isEditing || rows <= 1) return;
    setRows(rows - 1);
    // Remove hexes in the topmost row and shift others up
    setHexes(
      hexes.filter((h) => h.row !== 0).map((h) => ({ ...h, row: h.row - 1 }))
    );
    setHasUnsavedChanges(true);
  }

  function removeRowBottom() {
    if (!isEditing || rows <= 1) return;
    const newRows = rows - 1;
    setRows(newRows);
    // Remove hexes in the bottommost row
    setHexes(hexes.filter((h) => h.row < newRows));
    // Remove units in the bottommost row
    setUnits(units.filter((u) => u.row < newRows));
    setHasUnsavedChanges(true);
  }

  // Unit management functions
  function handleCreateUnit() {
    if (!isEditing) return;
    const newUnit: ScenarioUnit = {
      id: uuidv4(),
      player: PlayerNumber.Player1,
      combatStrength: 3,
      movementAllowance: 3,
      arm: 'Infantry',
      column: selectedHex?.column ?? 0,
      row: selectedHex?.row ?? 0,
      status: 'selected' as UnitStatus,
    };
    // Set all other units to available, then add new unit
    setUnits([...units.map(u => ({ ...u, status: 'available' as UnitStatus })), newUnit]);
    setEditingUnit(newUnit);
    setSelectedUnit(newUnit);
    setHasUnsavedChanges(true);
  }

  function handleUpdateUnit(unitId: string, updates: Partial<ScenarioUnit>) {
    if (!isEditing) return;
    setUnits(units.map(u => u.id === unitId ? { ...u, ...updates } : u));
    if (editingUnit?.id === unitId) {
      setEditingUnit({ ...editingUnit, ...updates });
    }
    if (selectedUnit?.id === unitId) {
      setSelectedUnit({ ...selectedUnit, ...updates });
    }
    setHasUnsavedChanges(true);
  }

  function handleDeleteUnit(unitId: string) {
    if (!isEditing) return;
    setUnits(units.filter(u => u.id !== unitId));
    if (selectedUnit?.id === unitId) {
      setSelectedUnit(null);
      setEditingUnit(null);
    }
    if (editingUnit?.id === unitId) {
      setEditingUnit(null);
    }
    setHasUnsavedChanges(true);
  }

  function handleSelectUnit(unit: ScenarioUnit | null) {
    if (unit) {
      // If clicking on the already selected unit, deselect it
      if (selectedUnit?.id === unit.id) {
        // Deselect: set all units to 'available'
        setUnits(units.map(u => ({ ...u, status: 'available' as UnitStatus })));
        setSelectedUnit(null);
        setEditingUnit(null);
      } else {
        // Set selected unit to 'selected', all others to 'available'
        setUnits(units.map(u => ({
          ...u,
          status: (u.id === unit.id ? 'selected' : 'available') as UnitStatus
        })));
        setSelectedUnit({ ...unit, status: 'selected' as UnitStatus });
        setEditingUnit({ ...unit, status: 'selected' as UnitStatus });
        setSelectedHex({ column: unit.column, row: unit.row });
      }
    } else {
      // Deselect: set all units to 'available'
      setUnits(units.map(u => ({ ...u, status: 'available' as UnitStatus })));
      setSelectedUnit(null);
      setEditingUnit(null);
    }
  }

  function handleShowEdit() {
    // If there are unsaved changes, show confirmation
    if (hasUnsavedChanges && isEditing) {
      if (
        !confirm(
          "You have unsaved changes. Are you sure you want to close the editor? Your changes will be lost."
        )
      ) {
        return; // User cancelled
      }
      // User confirmed, discard changes by reloading the scenario
      if (currentScenario) {
        void handleLoadScenario(currentScenario.scenarioId);
      }
    }
    setShowEditForm(true);
  }

  function handleCancelChanges() {
    // If there are unsaved changes, show confirmation before discarding
    if (hasUnsavedChanges && isEditing) {
      if (
        !confirm(
          "You have unsaved changes. Are you sure you want to discard your changes?"
        )
      ) {
        return; // User cancelled, don't discard changes
      }
    }
    // Discard changes by reloading the scenario
    if (currentScenario) {
      void handleLoadScenario(currentScenario.scenarioId);
    }
  }


  // Show loading state while checking authentication or redirecting
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen min-w-full bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isLoading
              ? "Checking authentication..."
              : "Redirecting to login..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen min-w-full bg-slate-100 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 mt-14 px-6 py-6 gap-6 items-stretch overflow-hidden">
        <aside className="w-[360px] min-w-[360px] flex-shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col min-h-0 text-gray-800 shadow-sm">
          {/* Action Buttons Panel - Fixed size, shown when scenario is selected */}
          {currentScenario && (
            <section className="p-4 border-b border-gray-200 flex-shrink-0">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors text-sm font-medium"
                  onClick={handleCancelChanges}
                  disabled={!hasUnsavedChanges || loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors text-sm font-medium"
                  onClick={() => void handleDelete()}
                  disabled={loading}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors text-sm font-medium"
                  onClick={() => void handleSave()}
                  disabled={!hasUnsavedChanges || loading}
                >
                  Save
                </button>
              </div>
            </section>
          )}

          {/* Hovered Hex Info Panel - Fixed size, shown when scenario is selected */}
          {currentScenario && (() => {
            const hoveredUnits = hoveredHex ? units.filter((u) => u.row === hoveredHex.row && u.column === hoveredHex.column) : [];
            return (
              <section className="p-4 border-b border-gray-200 flex-shrink-0" style={{ minHeight: '100px', height: '100px' }}>
                <h3 className="text-sm font-semibold mb-2 text-gray-700">
                  Hovered Hex{hoveredHex ? ` ${hoveredHex.column}-${hoveredHex.row} (${hoveredUnits.length} units)` : ''}
                </h3>
                <div className="text-xs">
                  {hoveredHex ? (
                    <UnitStrip
                      units={hoveredUnits}
                      hexLabel={`${hoveredHex.column}-${hoveredHex.row}`}
                      onUnitClick={handleSelectUnit}
                    />
                  ) : (
                    <p className="text-gray-400 italic">None</p>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Selected Hex Info Panel - Fixed size, shown when scenario is selected */}
          {currentScenario && (() => {
            const selectedUnits = selectedHex ? units.filter((u) => u.row === selectedHex.row && u.column === selectedHex.column) : [];
            return (
              <section className="p-4 border-b border-gray-200 flex-shrink-0" style={{ minHeight: '100px', height: '100px' }}>
                <h3 className="text-sm font-semibold mb-2 text-gray-700">
                  Selected Hex{selectedHex ? ` ${selectedHex.column}-${selectedHex.row} (${selectedUnits.length} units)` : ''}
                </h3>
                <div className="text-xs">
                  {selectedHex ? (
                    <UnitStrip
                      units={selectedUnits}
                      hexLabel={`${selectedHex.column}-${selectedHex.row}`}
                      onUnitClick={handleSelectUnit}
                    />
                  ) : (
                    <p className="text-gray-400 italic">None</p>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Tabs Panel - Fixed size, shown when scenario is selected */}
          {currentScenario && (
            <section className="border-b border-gray-200 px-4 flex-shrink-0">
              <div className="flex gap-1 items-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('scenario')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'scenario'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Scenario
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('hex')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'hex'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Hexes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('unit')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'unit'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Units
                </button>
              </div>
            </section>
          )}

          {/* Tab Content Panel - Expands to fill remaining space, shown when scenario is selected */}
          {currentScenario && (
            <section className="flex flex-col flex-1 min-h-0 overflow-hidden p-4">
              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto">
                {/* Scenario Tab */}
                {activeTab === 'scenario' && showEditForm && isEditing && currentScenario && (
                  <div>
                    <section className="pt-4 overflow-y-auto flex-1">
                      <div className="mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">
                          Edit Scenario
                        </h2>
                      </div>
                      <form>
                        <div className="mb-4">
                          <label
                            htmlFor="scenario-uuid"
                            className="block mb-2 font-medium text-gray-800"
                          >
                            Scenario UUID
                          </label>
                          <input
                            type="text"
                            id="scenario-uuid"
                            value={currentScenario.scenarioId}
                            readOnly
                            className="w-full p-2 border border-gray-300 rounded text-sm bg-gray-100 text-gray-600"
                          />
                        </div>
                        <div className="mb-4">
                          <label
                            htmlFor="scenario-title"
                            className="block mb-2 font-medium text-gray-800"
                          >
                            Title
                          </label>
                          <input
                            type="text"
                            id="scenario-title"
                            value={title}
                            onChange={(e) => {
                              setTitle(e.target.value);
                              if (isEditing) setHasUnsavedChanges(true);
                            }}
                            placeholder="Enter scenario title"
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                            required
                          />
                        </div>

                        <div className="mb-4">
                          <label
                            htmlFor="scenario-description"
                            className="block mb-2 font-medium text-gray-800"
                          >
                            Description
                          </label>
                          <textarea
                            id="scenario-description"
                            value={description}
                            onChange={(e) => {
                              setDescription(e.target.value);
                              if (isEditing) setHasUnsavedChanges(true);
                            }}
                            rows={3}
                            placeholder="Enter scenario description"
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                          />
                        </div>

                        <div className="mb-4 grid grid-cols-2 gap-4">
                          <div>
                            <label
                              htmlFor="scenario-columns"
                              className="block mb-2 font-medium text-gray-800"
                            >
                              Columns
                            </label>
                            <input
                              type="number"
                              id="scenario-columns"
                              value={columns}
                              readOnly
                              className="w-full p-2 border border-gray-300 rounded text-sm mb-2 bg-gray-50 cursor-default [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                              required
                            />
                            {isEditing && (
                              <div className="space-y-1">
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={addColumnLeft}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white flex flex-col items-center justify-center"
                                    title="Add column to the left"
                                  >
                                    <span>+</span>
                                    <span>Left</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={addColumnRight}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white flex flex-col items-center justify-center"
                                    title="Add column to the right"
                                  >
                                    <span>+</span>
                                    <span>Right</span>
                                  </button>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={removeColumnLeft}
                                    disabled={columns <= 1}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed flex flex-col items-center justify-center"
                                    title="Remove leftmost column"
                                  >
                                    <span>-</span>
                                    <span>Left</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={removeColumnRight}
                                    disabled={columns <= 1}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed flex flex-col items-center justify-center"
                                    title="Remove rightmost column"
                                  >
                                    <span>-</span>
                                    <span>Right</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                          <div>
                            <label
                              htmlFor="scenario-rows"
                              className="block mb-2 font-medium text-gray-800"
                            >
                              Rows
                            </label>
                            <input
                              type="number"
                              id="scenario-rows"
                              value={rows}
                              readOnly
                              className="w-full p-2 border border-gray-300 rounded text-sm mb-2 bg-gray-50 cursor-default [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                              required
                            />
                            {isEditing && (
                              <div className="space-y-1">
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={addRowTop}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white flex flex-col items-center justify-center"
                                    title="Add row to the top"
                                  >
                                    <span>+</span>
                                    <span>Top</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={addRowBottom}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white flex flex-col items-center justify-center"
                                    title="Add row to the bottom"
                                  >
                                    <span>+</span>
                                    <span>Bottom</span>
                                  </button>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={removeRowTop}
                                    disabled={rows <= 1}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed flex flex-col items-center justify-center"
                                    title="Remove topmost row"
                                  >
                                    <span>-</span>
                                    <span>Top</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={removeRowBottom}
                                    disabled={rows <= 1}
                                    className="flex-1 px-2 py-2 text-xs font-medium rounded bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed flex flex-col items-center justify-center"
                                    title="Remove bottommost row"
                                  >
                                    <span>-</span>
                                    <span>Bottom</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mb-4">
                          <label
                            htmlFor="scenario-turns"
                            className="block mb-2 font-medium text-gray-800"
                          >
                            Turns
                          </label>
                          <input
                            type="number"
                            id="scenario-turns"
                            value={turns}
                            onChange={(e) => {
                              const newTurns = parseInt(e.target.value) || 15;
                              setTurns(newTurns);
                              if (isEditing) setHasUnsavedChanges(true);
                            }}
                            min={1}
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                            required
                          />
                        </div>
                      </form>
                    </section>
                  </div>
                )}

                {/* Hexes Tab */}
                {activeTab === 'hex' && showEditForm && isEditing && currentScenario && (
                  <div>
                    <section className="pt-4 pb-4 border-b border-gray-200">
                      <h2 className="text-xl font-semibold mb-2 text-gray-800">
                        Hexes
                      </h2>
                      {/* Terrain type dropdown */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <label
                            htmlFor="terrain-type"
                            className="block font-medium text-gray-800"
                          >
                            Terrain Type
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-sm text-gray-700">Paint Mode</span>
                            <input
                              type="checkbox"
                              checked={paintMode}
                              onChange={(e) => setPaintMode(e.target.checked)}
                              className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                            />
                          </label>
                        </div>
                        <select
                          id="terrain-type"
                          value={selectedTerrain}
                          onChange={(e) => {
                            const newTerrain = e.target.value as TerrainType;
                            setSelectedTerrain(newTerrain);
                            // In normal mode, update the selected hex's terrain
                            if (!paintMode && selectedHex) {
                              const existingIndex = hexes.findIndex(
                                (h) =>
                                  h.row === selectedHex.row &&
                                  h.column === selectedHex.column
                              );
                              if (existingIndex >= 0) {
                                const newHexes = [...hexes];
                                newHexes[existingIndex] = {
                                  ...newHexes[existingIndex],
                                  terrain: newTerrain,
                                };
                                setHexes(newHexes);
                                if (isEditing) setHasUnsavedChanges(true);
                              } else {
                                // Hex doesn't exist yet, create it
                                const newHex = {
                                  row: selectedHex.row,
                                  column: selectedHex.column,
                                  terrain: newTerrain,
                                  rivers: 0,
                                  roads: 0,
                                };
                                setHexes([...hexes, newHex]);
                                if (isEditing) setHasUnsavedChanges(true);
                              }
                            }
                          }}
                          className="w-full p-2 border border-gray-300 rounded text-sm bg-white text-gray-900"
                        >
                          {TERRAIN_TYPES.map((terrain) => (
                            <option key={terrain} value={terrain}>
                              {terrain.charAt(0).toUpperCase() + terrain.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Rivers toggle sectors - arranged in hex pattern (flat-top) */}
                      <div className="mb-4">
                        <label className="block mb-2 font-medium text-gray-800">
                          Rivers
                        </label>
                        <div className="mx-auto" style={{ width: '172.8px', height: '172.8px' }}>
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ transform: "rotate(-30deg)" }}
                          >
                            {/* Hex outline */}
                            <polygon
                              points="100,20 170,60 170,140 100,180 30,140 30,60"
                              fill="none"
                              stroke="#d1d5db"
                              strokeWidth="2"
                            />
                            {/* Clickable sectors - each sector is a triangle from center to two adjacent vertices forming a side */}
                            {/* Top (bit 0) - sector from center to top-left and top-right vertices */}
                            <path
                              d="M 100 100 L 30 60 L 100 20 L 170 60 Z"
                              fill={(selectedHexRivers & (1 << 0)) !== 0 ? "#3b82f6" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRiverSide(HexSide.Top)}
                            >
                              <title>Toggle Top river</title>
                            </path>
                            {/* Top Right (bit 1) - sector from center to top-right and bottom-right vertices */}
                            <path
                              d="M 100 100 L 170 60 L 170 140 Z"
                              fill={(selectedHexRivers & (1 << 1)) !== 0 ? "#3b82f6" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRiverSide(HexSide.TopRight)}
                            >
                              <title>Toggle Top Right river</title>
                            </path>
                            {/* Bottom Right (bit 2) - sector from center to bottom-right and bottom vertices */}
                            <path
                              d="M 100 100 L 170 140 L 100 180 Z"
                              fill={(selectedHexRivers & (1 << 2)) !== 0 ? "#3b82f6" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRiverSide(HexSide.BottomRight)}
                            >
                              <title>Toggle Bottom Right river</title>
                            </path>
                            {/* Bottom (bit 3) - sector from center to bottom and bottom-left vertices */}
                            <path
                              d="M 100 100 L 100 180 L 30 140 Z"
                              fill={(selectedHexRivers & (1 << 3)) !== 0 ? "#3b82f6" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRiverSide(HexSide.Bottom)}
                            >
                              <title>Toggle Bottom river</title>
                            </path>
                            {/* Bottom Left (bit 4) - sector from center to bottom-left and top-left vertices */}
                            <path
                              d="M 100 100 L 30 140 L 30 60 Z"
                              fill={(selectedHexRivers & (1 << 4)) !== 0 ? "#3b82f6" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRiverSide(HexSide.BottomLeft)}
                            >
                              <title>Toggle Bottom Left river</title>
                            </path>
                            {/* Top Left (bit 5) - sector from center to top-left and top vertices */}
                            <path
                              d="M 100 100 L 30 60 L 100 20 Z"
                              fill={(selectedHexRivers & (1 << 5)) !== 0 ? "#3b82f6" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRiverSide(HexSide.TopLeft)}
                            >
                              <title>Toggle Top Left river</title>
                            </path>
                          </svg>
                        </div>
                      </div>
                      {/* Roads toggle sectors - arranged in hex pattern (flat-top) */}
                      <div className="mb-4">
                        <label className="block mb-2 font-medium text-gray-800">
                          Roads
                        </label>
                        <div className="mx-auto" style={{ width: '172.8px', height: '172.8px' }}>
                          <svg
                            className="w-full h-full"
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ transform: "rotate(-30deg)" }}
                          >
                            {/* Hex outline */}
                            <polygon
                              points="100,20 170,60 170,140 100,180 30,140 30,60"
                              fill="none"
                              stroke="#d1d5db"
                              strokeWidth="2"
                            />
                            {/* Clickable sectors - each sector is a triangle from center to two adjacent vertices forming a side */}
                            {/* Top (bit 0) - sector from center to top-left and top-right vertices */}
                            <path
                              d="M 100 100 L 30 60 L 100 20 L 170 60 Z"
                              fill={(selectedHexRoads & (1 << 0)) !== 0 ? "#dc2626" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRoadSide(HexSide.Top)}
                            >
                              <title>Toggle Top road</title>
                            </path>
                            {/* Top Right (bit 1) - sector from center to top-right and bottom-right vertices */}
                            <path
                              d="M 100 100 L 170 60 L 170 140 Z"
                              fill={(selectedHexRoads & (1 << 1)) !== 0 ? "#dc2626" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRoadSide(HexSide.TopRight)}
                            >
                              <title>Toggle Top Right road</title>
                            </path>
                            {/* Bottom Right (bit 2) - sector from center to bottom-right and bottom vertices */}
                            <path
                              d="M 100 100 L 170 140 L 100 180 Z"
                              fill={(selectedHexRoads & (1 << 2)) !== 0 ? "#dc2626" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRoadSide(HexSide.BottomRight)}
                            >
                              <title>Toggle Bottom Right road</title>
                            </path>
                            {/* Bottom (bit 3) - sector from center to bottom and bottom-left vertices */}
                            <path
                              d="M 100 100 L 100 180 L 30 140 Z"
                              fill={(selectedHexRoads & (1 << 3)) !== 0 ? "#dc2626" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRoadSide(HexSide.Bottom)}
                            >
                              <title>Toggle Bottom road</title>
                            </path>
                            {/* Bottom Left (bit 4) - sector from center to bottom-left and top-left vertices */}
                            <path
                              d="M 100 100 L 30 140 L 30 60 Z"
                              fill={(selectedHexRoads & (1 << 4)) !== 0 ? "#dc2626" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRoadSide(HexSide.BottomLeft)}
                            >
                              <title>Toggle Bottom Left road</title>
                            </path>
                            {/* Top Left (bit 5) - sector from center to top-left and top vertices */}
                            <path
                              d="M 100 100 L 30 60 L 100 20 Z"
                              fill={(selectedHexRoads & (1 << 5)) !== 0 ? "#dc2626" : "#e5e7eb"}
                              stroke="#9ca3af"
                              strokeWidth="1"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => toggleRoadSide(HexSide.TopLeft)}
                            >
                              <title>Toggle Top Left road</title>
                            </path>
                          </svg>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {/* Units Tab */}
                {activeTab === 'unit' && showEditForm && isEditing && currentScenario && (
                  <div>
                    <section className="pt-4 pb-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">
                          Units
                        </h2>
                        <button
                          type="button"
                          onClick={handleCreateUnit}
                          disabled={!isEditing || !selectedHex}
                          className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white"
                          title={!selectedHex ? "Select a hex first" : "Create unit at selected hex"}
                        >
                          + Add Unit
                        </button>
                      </div>

                      {/* Unit editor form */}
                      {editingUnit && (
                        <div className="border border-gray-300 rounded p-3 bg-gray-50 mb-4">
                          <h3 className="text-sm font-semibold mb-3 text-gray-800">
                            Edit Unit
                          </h3>
                          {/* Unit symbol preview */}
                          <UnitSymbolPreview unit={editingUnit} />
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Player
                              </label>
                              <select
                                value={editingUnit.player}
                                onChange={(e) =>
                                  handleUpdateUnit(editingUnit.id, {
                                    player: parseInt(e.target.value) as PlayerNumber,
                                  })
                                }
                                className="w-full p-1.5 border border-gray-300 rounded text-sm"
                              >
                                <option value={PlayerNumber.Player1}>Player 1 (Blue)</option>
                                <option value={PlayerNumber.Player2}>Player 2 (Red)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Arm
                              </label>
                              <select
                                value={editingUnit.arm}
                                onChange={(e) =>
                                  handleUpdateUnit(editingUnit.id, {
                                    arm: e.target.value as ArmType,
                                  })
                                }
                                className="w-full p-1.5 border border-gray-300 rounded text-sm"
                              >
                                <option value="Infantry">Infantry</option>
                                <option value="Cavalry">Cavalry</option>
                                <option value="Artillery">Artillery</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Combat Strength
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="9"
                                  value={editingUnit.combatStrength}
                                  onChange={(e) =>
                                    handleUpdateUnit(editingUnit.id, {
                                      combatStrength: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Movement
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="9"
                                  value={editingUnit.movementAllowance}
                                  onChange={(e) =>
                                    handleUpdateUnit(editingUnit.id, {
                                      movementAllowance: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Column
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editingUnit.column}
                                  onChange={(e) =>
                                    handleUpdateUnit(editingUnit.id, {
                                      column: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm"
                                  placeholder="Column"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Row
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editingUnit.row}
                                  onChange={(e) =>
                                    handleUpdateUnit(editingUnit.id, {
                                      row: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full p-1.5 border border-gray-300 rounded text-sm"
                                  placeholder="Row"
                                />
                              </div>
                            </div>
                            <div className="pt-2 flex justify-center">
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm("Delete this unit?")) {
                                    handleDeleteUnit(editingUnit.id);
                                  }
                                }}
                                className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors"
                              >
                                Delete Unit
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {!editingUnit && (
                        <p className="text-sm text-gray-500 italic text-center py-4">
                          Select a unit from the hex strips above to edit it.
                        </p>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </section>
          )}

        </aside>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-4 shadow-inner flex items-start justify-start">
            {(isEditing || currentScenario) && (
              <HexGrid
                columns={columns}
                rows={rows}
                hexes={hexes}
                units={units}
                selectedTerrain={selectedTerrain}
                selectedHex={selectedHex}
                onHexClick={handleHexClick}
                onHexHover={handleHexHover}
                onHexSelect={handleHexSelect}
              />
            )}
            {!isEditing && !currentScenario && (
              <div className="flex items-center justify-center w-full h-full text-gray-400">
                <p className="text-center">
                  Load or create a scenario to view the hex map
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-[9999] text-white">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
          <p>Loading...</p>
        </div>
      )}

      {message && (
        <div className="fixed top-[70px] right-5 z-[10000]">
          <div
            className={`px-6 py-4 rounded shadow-lg animate-slideIn ${
              message.type === "success" ? "bg-green-500" : "bg-red-500"
            } text-white`}
          >
            {message.text}
          </div>
        </div>
      )}
    </div>
  );
}
