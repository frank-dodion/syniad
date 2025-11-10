"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import HexGrid from "@/components/HexGrid";
import {
  getAllScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  getScenario,
  type Scenario,
} from "@/lib/scenario-api";
import { useAuth } from "@/lib/auth-client";

const TERRAIN_TYPES = [
  "clear",
  "mountain",
  "forest",
  "water",
  "desert",
  "swamp",
  "town",
];

export function EditorClient() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [selectedTerrain, setSelectedTerrain] = useState("clear");
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
    Array<{ row: number; column: number; terrain: string; rivers: number; roads: number }>
  >([]);
  const [hoveredHex, setHoveredHex] = useState<{
    row: number;
    column: number;
  } | null>(null);
  const [selectedHex, setSelectedHex] = useState<{
    row: number;
    column: number;
  } | null>(null);
  const [selectedHexRivers, setSelectedHexRivers] = useState<number>(0);
  const [selectedHexRoads, setSelectedHexRoads] = useState<number>(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [expandedScenarioId, setExpandedScenarioId] = useState<string | null>(
    null
  );
  const [newScenarioTitle, setNewScenarioTitle] = useState("");
  const [newScenarioDescription, setNewScenarioDescription] = useState("");
  const [newScenarioColumns, setNewScenarioColumns] = useState(12);
  const [newScenarioRows, setNewScenarioRows] = useState(10);
  const [newScenarioTurns, setNewScenarioTurns] = useState(15);

  // Flag to track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Redirect to home page if not authenticated, but preserve the intended destination
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Store the intended destination so we can redirect back after login
      if (typeof window !== "undefined") {
        sessionStorage.setItem("authRedirect", "/editor");
      }
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadScenarios();
    }
  }, [isAuthenticated]);

  function showMessage(text: string, type: "success" | "error") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  async function loadScenarios() {
    if (!isAuthenticated) {
      showMessage("Please login to view scenarios", "error");
      return;
    }

    try {
      setLoading(true);
      const response = await getAllScenarios();
      setScenarios(response.scenarios || []);
    } catch (error: any) {
      showMessage(`Error loading scenarios: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

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

    try {
      setLoading(true);
      const response = await getScenario(scenarioId);
      const scenario = response.scenario;
      setCurrentScenario(scenario);
      setTitle(scenario.title);
      setDescription(scenario.description);
      setColumns(scenario.columns);
      setRows(scenario.rows);
      setTurns(scenario.turns);
      // Ensure all hexes have rivers and roads properties (default to 0)
      setHexes((scenario.hexes || []).map(hex => ({ ...hex, rivers: hex.rivers ?? 0, roads: hex.roads ?? 0 })));
      // Clear selected and hovered hexes when loading a new scenario
      setSelectedHex(null);
      setHoveredHex(null);
      // Reset unsaved changes flag when loading a scenario
      setHasUnsavedChanges(false);
      setIsEditing(true);
      // Hide create form and show edit form when scenario is loaded
      setShowCreateForm(false);
      setShowEditForm(true);
      showMessage("Scenario loaded", "success");
    } catch (error: any) {
      showMessage(`Error loading scenario: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
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
    // Clear selected and hovered hexes
    setSelectedHex(null);
    setHoveredHex(null);
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
      };

      if (currentScenario) {
        await updateScenario(currentScenario.scenarioId, scenarioData);
        // Reset unsaved changes flag after successful save
        setHasUnsavedChanges(false);
        showMessage("Scenario updated successfully", "success");
        await loadScenarios();
      } else {
        const response = await createScenario(scenarioData);
        setCurrentScenario(response.scenario);
        // Reset unsaved changes flag after successful creation
        setHasUnsavedChanges(false);
        setIsEditing(true);
        // Automatically show edit form when scenario is created
        setShowEditForm(true);
        showMessage("Scenario created successfully", "success");
        await loadScenarios();
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
      setHasUnsavedChanges(false);
      setIsEditing(false);
      setShowEditForm(false);

      // Reload scenarios list
      await loadScenarios();
    } catch (error: any) {
      showMessage(`Error deleting scenario: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  function handleHexClick(row: number, column: number) {
    // Only allow terrain changes when editing
    if (!showEditForm) {
      return;
    }

    if (!isEditing && !currentScenario) {
      return;
    }

    const existingIndex = hexes.findIndex(
      (h) => h.row === row && h.column === column
    );
    const existingHex = existingIndex >= 0 ? hexes[existingIndex] : null;
    // Preserve existing rivers and roads if hex exists, otherwise default to 0
    const newHex = { 
      row, 
      column, 
      terrain: selectedTerrain,
      rivers: existingHex?.rivers ?? 0,
      roads: existingHex?.roads ?? 0
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

  function handleHexHover(row: number | null, column: number | null) {
    if (row !== null && column !== null) {
      setHoveredHex({ row, column });
    } else {
      setHoveredHex(null);
    }
  }

  function handleHexSelect(row: number | null, column: number | null) {
    if (row !== null && column !== null) {
      setSelectedHex({ row, column });
      // Load rivers and roads values for selected hex
      const hex = hexes.find((h) => h.row === row && h.column === column);
      setSelectedHexRivers(hex?.rivers ?? 0);
      setSelectedHexRoads(hex?.roads ?? 0);
    } else {
      setSelectedHex(null);
      setSelectedHexRivers(0);
      setSelectedHexRoads(0);
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
    setHasUnsavedChanges(true);
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

  async function handleCreateScenarioFromTab() {
    if (!isAuthenticated) {
      showMessage("Please login to create scenarios", "error");
      return;
    }

    if (!newScenarioTitle.trim()) {
      showMessage("Please enter a title", "error");
      return;
    }

    if (!newScenarioDescription.trim()) {
      showMessage("Please enter a description", "error");
      return;
    }

    try {
      setLoading(true);
      const scenarioData = {
        title: newScenarioTitle.trim(),
        description: newScenarioDescription.trim(),
        columns: newScenarioColumns,
        rows: newScenarioRows,
        turns: newScenarioTurns,
        hexes: [], // Optional - start with empty hexes
      };

      const response = await createScenario(scenarioData);
      showMessage("Scenario created successfully", "success");

      // Close create form and reset form fields
      setShowCreateForm(false);
      setNewScenarioTitle("");
      setNewScenarioDescription("");
      setNewScenarioColumns(12);
      setNewScenarioRows(10);
      setNewScenarioTurns(15);

      // Refresh scenarios list
      await loadScenarios();

      // Optionally load the new scenario into the editor
      await handleLoadScenario(response.scenario.scenarioId);
    } catch (error: any) {
      showMessage(`Error creating scenario: ${error.message}`, "error");
    } finally {
      setLoading(false);
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
        <aside className="w-[360px] min-w-[360px] flex-shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col text-gray-800 shadow-sm">
          {/* Action buttons - Only visible when a scenario is selected */}
          {currentScenario && (
            <section className="p-4 border-b border-gray-200">
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

          {/* Selected and Hovered Hex Info - Only visible when a scenario is selected */}
          {currentScenario && (
            <section className="p-4 border-b border-gray-200">
              <div className="flex gap-4">
                {/* Selected Hex - Left Side */}
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-2 text-gray-700">
                    Selected
                  </h3>
                  <div className="space-y-1 text-xs min-h-[3rem]">
                    {selectedHex ? (
                      <>
                        <p className="text-gray-600">
                          <span className="font-medium">
                            {selectedHex.column + 1}-{selectedHex.row + 1}
                          </span>
                        </p>
                        {hexes.find(
                          (h) =>
                            h.row === selectedHex.row &&
                            h.column === selectedHex.column
                        ) ? (
                          <p className="text-gray-500">
                            {hexes.find(
                              (h) =>
                                h.row === selectedHex.row &&
                                h.column === selectedHex.column
                            )?.terrain || "clear"}
                          </p>
                        ) : (
                          <p className="text-gray-400 italic">clear</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-400 italic">None</p>
                    )}
                  </div>
                </div>

                {/* Hovered Hex - Right Side */}
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-2 text-gray-700">
                    Hovered
                  </h3>
                  <div className="space-y-1 text-xs min-h-[3rem]">
                    {hoveredHex ? (
                      <>
                        <p className="text-gray-600">
                          <span className="font-medium">
                            {hoveredHex.column + 1}-{hoveredHex.row + 1}
                          </span>
                        </p>
                        {hexes.find(
                          (h) =>
                            h.row === hoveredHex.row &&
                            h.column === hoveredHex.column
                        ) ? (
                          <p className="text-gray-500">
                            {hexes.find(
                              (h) =>
                                h.row === hoveredHex.row &&
                                h.column === hoveredHex.column
                            )?.terrain || "clear"}
                          </p>
                        ) : (
                          <p className="text-gray-400 italic">clear</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-400 italic">None</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <section className="flex flex-col h-full overflow-hidden p-4">
              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto">
                {showCreateForm && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">
                      Create New Scenario
                    </h3>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleCreateScenarioFromTab();
                      }}
                    >
                      <div className="mb-4">
                        <label
                          htmlFor="new-scenario-title"
                          className="block mb-2 font-medium text-gray-800"
                        >
                          Title <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="new-scenario-title"
                          value={newScenarioTitle}
                          onChange={(e) => setNewScenarioTitle(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          required
                          placeholder="Enter scenario title"
                        />
                      </div>

                      <div className="mb-4">
                        <label
                          htmlFor="new-scenario-description"
                          className="block mb-2 font-medium text-gray-800"
                        >
                          Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          id="new-scenario-description"
                          value={newScenarioDescription}
                          onChange={(e) =>
                            setNewScenarioDescription(e.target.value)
                          }
                          rows={3}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          required
                          placeholder="Enter scenario description"
                        />
                      </div>

                      {/* Columns - on its own line */}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <label
                            htmlFor="new-scenario-columns"
                            className="font-medium text-gray-800 min-w-[100px]"
                          >
                            Columns <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            id="new-scenario-columns"
                            value={newScenarioColumns}
                            onChange={(e) =>
                              setNewScenarioColumns(
                                parseInt(e.target.value) || 12
                              )
                            }
                            min={1}
                            className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white text-gray-900 text-center"
                            required
                          />
                        </div>
                      </div>

                      {/* Rows - on its own line */}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <label
                            htmlFor="new-scenario-rows"
                            className="font-medium text-gray-800 min-w-[100px]"
                          >
                            Rows <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            id="new-scenario-rows"
                            value={newScenarioRows}
                            onChange={(e) =>
                              setNewScenarioRows(parseInt(e.target.value) || 10)
                            }
                            min={1}
                            className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white text-gray-900 text-center"
                            required
                          />
                        </div>
                      </div>

                      {/* Turns - on its own line */}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <label
                            htmlFor="new-scenario-turns"
                            className="font-medium text-gray-800 min-w-[100px]"
                          >
                            Turns <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            id="new-scenario-turns"
                            value={newScenarioTurns}
                            onChange={(e) =>
                              setNewScenarioTurns(
                                parseInt(e.target.value) || 15
                              )
                            }
                            min={1}
                            className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white text-gray-900 text-center"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded transition-colors text-sm font-medium"
                          disabled={loading}
                        >
                          {loading ? "Creating..." : "Create"}
                        </button>
                        <button
                          type="button"
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors text-sm font-medium"
                          onClick={() => {
                            setShowCreateForm(false);
                            setNewScenarioTitle("");
                            setNewScenarioDescription("");
                            setNewScenarioColumns(12);
                            setNewScenarioRows(10);
                            setNewScenarioTurns(15);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Edit Form - shown when Edit button is clicked */}
                {showEditForm && isEditing && currentScenario && (
                  <div className="mb-6">
                    {/* Edit Hex controls - shown above Edit Scenario */}
                    <section className="pt-4 pb-4 border-b border-gray-200">
                      <h2 className="text-xl font-semibold mb-2 text-gray-800">
                        Hex Editor
                      </h2>
                      <p className="text-sm text-gray-600 mb-4">
                        Select hex to apply changes
                      </p>
                      {/* Terrain type dropdown */}
                      <div className="mb-6">
                        <label
                          htmlFor="terrain-type"
                          className="block mb-2 font-medium text-gray-800"
                        >
                          Terrain Type
                        </label>
                        <select
                          id="terrain-type"
                          value={selectedTerrain}
                          onChange={(e) => setSelectedTerrain(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm bg-white text-gray-900"
                        >
                          {TERRAIN_TYPES.map((terrain) => (
                            <option key={terrain} value={terrain}>
                              {terrain.charAt(0).toUpperCase() +
                                terrain.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* River sides checkboxes - arranged in hex pattern (flat-top) */}
                      <div className="mb-4">
                        <label className="block mb-2 font-medium text-gray-800">
                          River Sides
                        </label>
                        <div className="flex flex-col items-center gap-1">
                          {/* Top row: Top (North) - label above checkbox */}
                          <div className="flex flex-col items-center mb-1">
                            <span className="text-sm font-medium text-gray-800 mb-1">
                              Top (North)
                            </span>
                            <label className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRivers & (1 << 0)) !== 0}
                                onChange={(e) => {
                                  const newRivers = e.target.checked
                                    ? selectedHexRivers | (1 << 0)
                                    : selectedHexRivers & ~(1 << 0);
                                  setSelectedHexRivers(newRivers);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        rivers: newRivers,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                          </div>
                          {/* Middle rows: Top Left (label left), Top Right */}
                          <div className="flex gap-8 mb-1">
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <span className="text-sm font-medium text-gray-800">
                                Top Left
                              </span>
                              <input
                                type="checkbox"
                                checked={(selectedHexRivers & (1 << 5)) !== 0}
                                onChange={(e) => {
                                  const newRivers = e.target.checked
                                    ? selectedHexRivers | (1 << 5)
                                    : selectedHexRivers & ~(1 << 5);
                                  setSelectedHexRivers(newRivers);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        rivers: newRivers,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRivers & (1 << 1)) !== 0}
                                onChange={(e) => {
                                  const newRivers = e.target.checked
                                    ? selectedHexRivers | (1 << 1)
                                    : selectedHexRivers & ~(1 << 1);
                                  setSelectedHexRivers(newRivers);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        rivers: newRivers,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-800">
                                Top Right
                              </span>
                            </label>
                          </div>
                          {/* Lower middle row: Bottom Left (label left), Bottom Right */}
                          <div className="flex gap-8 mb-1">
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <span className="text-sm font-medium text-gray-800">
                                Bottom Left
                              </span>
                              <input
                                type="checkbox"
                                checked={(selectedHexRivers & (1 << 4)) !== 0}
                                onChange={(e) => {
                                  const newRivers = e.target.checked
                                    ? selectedHexRivers | (1 << 4)
                                    : selectedHexRivers & ~(1 << 4);
                                  setSelectedHexRivers(newRivers);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        rivers: newRivers,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRivers & (1 << 2)) !== 0}
                                onChange={(e) => {
                                  const newRivers = e.target.checked
                                    ? selectedHexRivers | (1 << 2)
                                    : selectedHexRivers & ~(1 << 2);
                                  setSelectedHexRivers(newRivers);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        rivers: newRivers,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-800">
                                Bottom Right
                              </span>
                            </label>
                          </div>
                          {/* Bottom row: Bottom (South) - label below checkbox */}
                          <div className="flex flex-col items-center">
                            <label className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRivers & (1 << 3)) !== 0}
                                onChange={(e) => {
                                  const newRivers = e.target.checked
                                    ? selectedHexRivers | (1 << 3)
                                    : selectedHexRivers & ~(1 << 3);
                                  setSelectedHexRivers(newRivers);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        rivers: newRivers,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <span className="text-sm font-medium text-gray-800 mt-1">
                              Bottom (South)
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Road sides checkboxes - arranged in hex pattern (flat-top) */}
                      <div className="mb-4">
                        <label className="block mb-2 font-medium text-gray-800">
                          Road Sides
                        </label>
                        <div className="flex flex-col items-center gap-1">
                          {/* Top row: Top (North) - label above checkbox */}
                          <div className="flex flex-col items-center mb-1">
                            <span className="text-sm font-medium text-gray-800 mb-1">
                              Top (North)
                            </span>
                            <label className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRoads & (1 << 0)) !== 0}
                                onChange={(e) => {
                                  const newRoads = e.target.checked
                                    ? selectedHexRoads | (1 << 0)
                                    : selectedHexRoads & ~(1 << 0);
                                  setSelectedHexRoads(newRoads);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        roads: newRoads,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                          </div>
                          {/* Middle rows: Top Left (label left), Top Right */}
                          <div className="flex gap-8 mb-1">
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <span className="text-sm font-medium text-gray-800">
                                Top Left
                              </span>
                              <input
                                type="checkbox"
                                checked={(selectedHexRoads & (1 << 5)) !== 0}
                                onChange={(e) => {
                                  const newRoads = e.target.checked
                                    ? selectedHexRoads | (1 << 5)
                                    : selectedHexRoads & ~(1 << 5);
                                  setSelectedHexRoads(newRoads);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        roads: newRoads,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRoads & (1 << 1)) !== 0}
                                onChange={(e) => {
                                  const newRoads = e.target.checked
                                    ? selectedHexRoads | (1 << 1)
                                    : selectedHexRoads & ~(1 << 1);
                                  setSelectedHexRoads(newRoads);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        roads: newRoads,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-800">
                                Top Right
                              </span>
                            </label>
                          </div>
                          {/* Lower middle row: Bottom Left (label left), Bottom Right */}
                          <div className="flex gap-8 mb-1">
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <span className="text-sm font-medium text-gray-800">
                                Bottom Left
                              </span>
                              <input
                                type="checkbox"
                                checked={(selectedHexRoads & (1 << 4)) !== 0}
                                onChange={(e) => {
                                  const newRoads = e.target.checked
                                    ? selectedHexRoads | (1 << 4)
                                    : selectedHexRoads & ~(1 << 4);
                                  setSelectedHexRoads(newRoads);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        roads: newRoads,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRoads & (1 << 2)) !== 0}
                                onChange={(e) => {
                                  const newRoads = e.target.checked
                                    ? selectedHexRoads | (1 << 2)
                                    : selectedHexRoads & ~(1 << 2);
                                  setSelectedHexRoads(newRoads);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        roads: newRoads,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-800">
                                Bottom Right
                              </span>
                            </label>
                          </div>
                          {/* Bottom row: Bottom (South) - label below checkbox */}
                          <div className="flex flex-col items-center">
                            <label className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={(selectedHexRoads & (1 << 3)) !== 0}
                                onChange={(e) => {
                                  const newRoads = e.target.checked
                                    ? selectedHexRoads | (1 << 3)
                                    : selectedHexRoads & ~(1 << 3);
                                  setSelectedHexRoads(newRoads);
                                  if (selectedHex) {
                                    const existingIndex = hexes.findIndex(
                                      (h) =>
                                        h.row === selectedHex.row &&
                                        h.column === selectedHex.column
                                    );
                                    if (existingIndex >= 0) {
                                      const newHexes = [...hexes];
                                      newHexes[existingIndex] = {
                                        ...newHexes[existingIndex],
                                        roads: newRoads,
                                      };
                                      setHexes(newHexes);
                                      if (isEditing) setHasUnsavedChanges(true);
                                    }
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <span className="text-sm font-medium text-gray-800 mt-1">
                              Bottom (South)
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Edit Scenario controls */}
                    <section className="pt-4 overflow-y-auto flex-1">
                      <h2 className="text-xl font-semibold mb-4 text-gray-800">
                        Edit Scenario
                      </h2>
                      <form>
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
                            placeholder="Enter scenario description"
                            rows={3}
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                          />
                        </div>

                        {/* Columns - on its own line */}
                        <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <label
                              htmlFor="scenario-columns"
                              className="font-medium text-gray-800 whitespace-nowrap min-w-[120px]"
                            >
                              Columns
                            </label>
                            <div className="flex gap-2 flex-1">
                              <input
                                type={isEditing ? "text" : "number"}
                                id="scenario-columns"
                                value={columns}
                                onChange={(e) => {
                                  if (!isEditing) {
                                    setColumns(parseInt(e.target.value) || 12);
                                    setHasUnsavedChanges(true);
                                  }
                                }}
                                placeholder="12"
                                min={1}
                                readOnly={isEditing}
                                disabled={isEditing}
                                className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white text-gray-900 disabled:bg-gray-50 disabled:text-gray-600 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                required
                              />
                            </div>
                          </div>
                          {isEditing && (
                            <>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium text-gray-800 whitespace-nowrap min-w-[120px] text-sm">
                                  Add
                                </span>
                                <div className="flex gap-2 flex-1">
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 text-white flex-1"
                                    onClick={() => addColumnLeft()}
                                    disabled={loading}
                                  >
                                    left
                                  </button>
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 text-white flex-1"
                                    onClick={() => addColumnRight()}
                                    disabled={loading}
                                  >
                                    right
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 whitespace-nowrap min-w-[120px] text-sm">
                                  Remove
                                </span>
                                <div className="flex gap-2 flex-1">
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-red-500 hover:bg-red-600 text-white flex-1"
                                    onClick={() => removeColumnLeft()}
                                    disabled={loading || columns <= 1}
                                  >
                                    left
                                  </button>
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-red-500 hover:bg-red-600 text-white flex-1"
                                    onClick={() => removeColumnRight()}
                                    disabled={loading || columns <= 1}
                                  >
                                    right
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Rows - on its own line */}
                        <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <label
                              htmlFor="scenario-rows"
                              className="font-medium text-gray-800 whitespace-nowrap min-w-[120px]"
                            >
                              Rows
                            </label>
                            <div className="flex gap-2 flex-1">
                              <input
                                type={isEditing ? "text" : "number"}
                                id="scenario-rows"
                                value={rows}
                                onChange={(e) => {
                                  if (!isEditing) {
                                    setRows(parseInt(e.target.value) || 10);
                                    setHasUnsavedChanges(true);
                                  }
                                }}
                                placeholder="10"
                                min={1}
                                readOnly={isEditing}
                                disabled={isEditing}
                                className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white text-gray-900 disabled:bg-gray-50 disabled:text-gray-600 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                required
                              />
                            </div>
                          </div>
                          {isEditing && (
                            <>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium text-gray-800 whitespace-nowrap min-w-[120px] text-sm">
                                  Add
                                </span>
                                <div className="flex gap-2 flex-1">
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 text-white flex-1"
                                    onClick={() => addRowTop()}
                                    disabled={loading}
                                  >
                                    top
                                  </button>
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-blue-500 hover:bg-blue-600 text-white flex-1"
                                    onClick={() => addRowBottom()}
                                    disabled={loading}
                                  >
                                    bottom
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 whitespace-nowrap min-w-[120px] text-sm">
                                  Remove
                                </span>
                                <div className="flex gap-2 flex-1">
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-red-500 hover:bg-red-600 text-white flex-1"
                                    onClick={() => removeRowTop()}
                                    disabled={loading || rows <= 1}
                                  >
                                    top
                                  </button>
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-red-500 hover:bg-red-600 text-white flex-1"
                                    onClick={() => removeRowBottom()}
                                    disabled={loading || rows <= 1}
                                  >
                                    bottom
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Turns - on its own line */}
                        <div className="mb-4">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor="scenario-turns"
                              className="font-medium text-gray-800 whitespace-nowrap min-w-[120px]"
                            >
                              Turns
                            </label>
                            <div className="flex gap-2 flex-1">
                              <input
                                type="number"
                                id="scenario-turns"
                                value={turns}
                                onChange={(e) => {
                                  setTurns(parseInt(e.target.value) || 15);
                                  if (isEditing) setHasUnsavedChanges(true);
                                }}
                                placeholder="15"
                                min={1}
                                className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white text-gray-900 text-center"
                                required
                              />
                            </div>
                          </div>
                        </div>
                      </form>
                    </section>
                  </div>
                )}

                {/* Scenario list - always appears after Edit/Create panels */}
                <div className="mt-6">
                  <h2 className="text-xl font-semibold text-gray-800 mb-2">
                    Scenarios
                  </h2>
                  {/* Action buttons - below Scenarios title, always visible */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                      className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => {
                        if (hasUnsavedChanges) {
                          if (
                            !confirm(
                              "You have unsaved changes. Are you sure you want to create a new scenario? Your changes will be lost."
                            )
                          ) {
                            return;
                          }
                        }
                        // Reset edit state to show only create form
                        setShowEditForm(false);
                        setIsEditing(false);
                        setCurrentScenario(null);
                        setTitle("");
                        setDescription("");
                        setColumns(12);
                        setRows(10);
                        setTurns(15);
                        setHexes([]);
                        setSelectedHex(null);
                        setHoveredHex(null);
                        setHasUnsavedChanges(false);
                        // Show create form
                        setShowCreateForm(true);
                      }}
                    >
                      New
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-gray-500 hover:bg-gray-600 text-white"
                      onClick={() => void loadScenarios()}
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-2">
                    {loading && !showCreateForm && !showEditForm ? (
                      <p className="text-center text-gray-500 py-4">
                        Loading scenarios...
                      </p>
                    ) : scenarios.length === 0 ? (
                      <p className="text-center text-gray-500 py-4 italic">
                        No scenarios found
                      </p>
                    ) : (
                      scenarios.map((scenario) => {
                        const isExpanded =
                          expandedScenarioId === scenario.scenarioId;
                        return (
                          <div
                            key={scenario.scenarioId}
                            className="bg-gray-50 rounded border border-transparent hover:border-gray-300 transition-colors overflow-hidden"
                          >
                            <div className="p-3">
                              <div className="flex items-start gap-2 mb-1">
                                <button
                                  className="text-blue-700 hover:text-blue-800 border border-blue-700 rounded transition-colors flex-shrink-0 p-0.5 mt-0.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleLoadScenario(
                                      scenario.scenarioId
                                    );
                                  }}
                                  title="Load scenario"
                                  aria-label="Load scenario"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2.5}
                                    stroke="currentColor"
                                    className="w-4 h-4"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
                                    />
                                  </svg>
                                </button>
                                <div
                                  className="flex-1 cursor-pointer hover:bg-gray-100 active:bg-gray-200 rounded p-1 -m-1 transition-colors"
                                  onClick={() =>
                                    setExpandedScenarioId(
                                      isExpanded ? null : scenario.scenarioId
                                    )
                                  }
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setExpandedScenarioId(
                                        isExpanded ? null : scenario.scenarioId
                                      );
                                    }
                                  }}
                                >
                                  <h3 className="text-base font-medium">
                                    {scenario.title}
                                  </h3>
                                </div>
                                <div
                                  className="text-gray-400 cursor-pointer hover:bg-gray-100 rounded transition-colors flex-shrink-0 w-6 h-6 flex items-center justify-center mt-0.5"
                                  onClick={() =>
                                    setExpandedScenarioId(
                                      isExpanded ? null : scenario.scenarioId
                                    )
                                  }
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setExpandedScenarioId(
                                        isExpanded ? null : scenario.scenarioId
                                      );
                                    }
                                  }}
                                >
                                  {isExpanded ? "−" : "+"}
                                </div>
                              </div>
                              <div
                                className="cursor-pointer hover:bg-gray-100 active:bg-gray-200 rounded p-1 -m-1 transition-colors"
                                onClick={() =>
                                  setExpandedScenarioId(
                                    isExpanded ? null : scenario.scenarioId
                                  )
                                }
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setExpandedScenarioId(
                                      isExpanded ? null : scenario.scenarioId
                                    );
                                  }
                                }}
                              >
                                <p className="text-xs text-gray-500 font-mono whitespace-nowrap text-center">
                                  {scenario.scenarioId}
                                </p>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="px-3 pb-3 pt-2 border-t border-gray-200">
                                <p className="text-sm text-gray-600 mb-2">
                                  {scenario.columns}×{scenario.rows},{" "}
                                  {scenario.turns} turns
                                </p>
                                {scenario.description && (
                                  <p className="text-sm text-gray-600">
                                    {scenario.description}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-4 shadow-inner flex items-start justify-start">
            {(isEditing || currentScenario) && (
              <HexGrid
                columns={columns}
                rows={rows}
                hexes={hexes}
                selectedTerrain={selectedTerrain}
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
