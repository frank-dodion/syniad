'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import HexGrid from '@/components/HexGrid';
import {
  getAllScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  getScenario,
  type Scenario,
} from '@/lib/scenario-api';
import { useAuth } from '@/lib/auth-client';

const TERRAIN_TYPES = ['clear', 'mountain', 'forest', 'water', 'desert', 'swamp'];

export function EditorClient() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [selectedTerrain, setSelectedTerrain] = useState('clear');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState(12);
  const [rows, setRows] = useState(10);
  const [turns, setTurns] = useState(15);
  const [isEditing, setIsEditing] = useState(false);
  const [hexes, setHexes] = useState<Array<{ row: number; column: number; terrain: string }>>([]);
  const [hoveredHex, setHoveredHex] = useState<{ row: number; column: number } | null>(null);
  const [selectedHex, setSelectedHex] = useState<{ row: number; column: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'editor'>('scenarios');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [newScenarioDescription, setNewScenarioDescription] = useState('');
  const [newScenarioColumns, setNewScenarioColumns] = useState(12);
  const [newScenarioRows, setNewScenarioRows] = useState(10);
  const [newScenarioTurns, setNewScenarioTurns] = useState(15);

  // Redirect to home page if not authenticated, but preserve the intended destination
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Store the intended destination so we can redirect back after login
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('authRedirect', '/editor');
      }
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadScenarios();
    }
  }, [isAuthenticated]);


  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  async function loadScenarios() {
    if (!isAuthenticated) {
      showMessage('Please login to view scenarios', 'error');
      return;
    }

    try {
      setLoading(true);
      const response = await getAllScenarios();
      setScenarios(response.scenarios || []);
    } catch (error: any) {
      showMessage(`Error loading scenarios: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadScenario(scenarioId: string) {
    if (!isAuthenticated) {
      showMessage('Please login to load scenarios', 'error');
      return;
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
      setHexes(scenario.hexes || []);
      setIsEditing(true);
      showMessage('Scenario loaded', 'success');
    } catch (error: any) {
      showMessage(`Error loading scenario: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateNew() {
    setCurrentScenario(null);
    setTitle('');
    setDescription('');
    setColumns(12);
    setRows(10);
    setTurns(15);
    setHexes([]);
    setIsEditing(false);
  }

  async function handleSave() {
    if (!isAuthenticated) {
      showMessage('Please login to save scenarios', 'error');
      return;
    }

    if (!title.trim()) {
      showMessage('Please enter a title', 'error');
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
        showMessage('Scenario updated successfully', 'success');
        await loadScenarios();
      } else {
        const response = await createScenario(scenarioData);
        setCurrentScenario(response.scenario);
        setIsEditing(true);
        showMessage('Scenario created successfully', 'success');
        await loadScenarios();
      }
    } catch (error: any) {
      showMessage(`Error saving scenario: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!currentScenario) return;

    if (!confirm('Are you sure you want to delete this scenario?')) return;

    if (!isAuthenticated) {
      showMessage('Please login to delete scenarios', 'error');
      return;
    }

    try {
      setLoading(true);
      await deleteScenario(currentScenario.scenarioId);
      showMessage('Scenario deleted successfully', 'success');
      handleCreateNew();
      await loadScenarios();
    } catch (error: any) {
      showMessage(`Error deleting scenario: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleHexClick(row: number, column: number) {
    // Only allow terrain changes when editor tab is active
    if (activeTab !== 'editor') {
      return;
    }

    if (!isEditing && !currentScenario) {
      return;
    }

    const existingIndex = hexes.findIndex((h) => h.row === row && h.column === column);
    const newHex = { row, column, terrain: selectedTerrain };

    if (existingIndex >= 0) {
      const newHexes = [...hexes];
      newHexes[existingIndex] = newHex;
      setHexes(newHexes);
    } else {
      setHexes([...hexes, newHex]);
    }
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
    } else {
      setSelectedHex(null);
    }
  }

  async function handleCreateScenarioFromTab() {
    if (!isAuthenticated) {
      showMessage('Please login to create scenarios', 'error');
      return;
    }

    if (!newScenarioTitle.trim()) {
      showMessage('Please enter a title', 'error');
      return;
    }

    if (!newScenarioDescription.trim()) {
      showMessage('Please enter a description', 'error');
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
      showMessage('Scenario created successfully', 'success');
      
      // Reset form
      setNewScenarioTitle('');
      setNewScenarioDescription('');
      setNewScenarioColumns(12);
      setNewScenarioRows(10);
      setNewScenarioTurns(15);
      setShowCreateForm(false);
      
      // Refresh scenarios list
      await loadScenarios();
      
      // Optionally load the new scenario into the editor
      await handleLoadScenario(response.scenario.scenarioId);
      setActiveTab('editor');
    } catch (error: any) {
      showMessage(`Error creating scenario: ${error.message}`, 'error');
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
            {isLoading ? 'Checking authentication...' : 'Redirecting to login...'}
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
          {/* Hover and Selected Hex Info - Always visible at top */}
          <section className="p-4 border-b border-gray-200">
            <div className="flex gap-4">
              {/* Hovered Hex */}
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-2 text-gray-700">Hovered</h3>
                {hoveredHex ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-gray-600">
                      <span className="font-medium">{hoveredHex.column + 1}-{hoveredHex.row + 1}</span>
                    </p>
                    {hexes.find((h) => h.row === hoveredHex.row && h.column === hoveredHex.column) && (
                      <p className="text-gray-500">
                        {hexes.find((h) => h.row === hoveredHex.row && h.column === hoveredHex.column)?.terrain || 'clear'}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">None</p>
                )}
              </div>

              {/* Selected Hex - Right Side */}
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-2 text-gray-700">Selected</h3>
                {selectedHex ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-gray-600">
                      <span className="font-medium">{selectedHex.column + 1}-{selectedHex.row + 1}</span>
                    </p>
                    {hexes.find((h) => h.row === selectedHex.row && h.column === selectedHex.column) && (
                      <p className="text-gray-500">
                        {hexes.find((h) => h.row === selectedHex.row && h.column === selectedHex.column)?.terrain || 'clear'}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">None</p>
                )}
              </div>
            </div>
          </section>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200">
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'scenarios'
                  ? 'bg-gray-100 text-gray-900 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab('scenarios')}
            >
              Scenarios
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'editor'
                  ? 'bg-gray-100 text-gray-900 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab('editor')}
            >
              Editor
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            {activeTab === 'scenarios' && (
              <section className="flex flex-col h-full overflow-hidden">
                {/* Fixed header with title and buttons */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h2 className="text-xl font-semibold text-gray-800">Scenarios</h2>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                      onClick={() => setShowCreateForm(!showCreateForm)}
                    >
                      {showCreateForm ? 'Cancel' : 'Create New'}
                    </button>
                    <button
                      className="px-3 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                      onClick={() => void loadScenarios()}
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto">
                  {showCreateForm && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-semibold mb-4 text-gray-800">Create New Scenario</h3>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleCreateScenarioFromTab();
                        }}
                      >
                        <div className="mb-4">
                          <label htmlFor="new-scenario-title" className="block mb-2 text-sm font-medium text-gray-800">
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
                          <label htmlFor="new-scenario-description" className="block mb-2 text-sm font-medium text-gray-800">
                            Description <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            id="new-scenario-description"
                            value={newScenarioDescription}
                            onChange={(e) => setNewScenarioDescription(e.target.value)}
                            rows={3}
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                            required
                            placeholder="Enter scenario description"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <label htmlFor="new-scenario-columns" className="block mb-2 text-sm font-medium text-gray-800">
                              Columns <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              id="new-scenario-columns"
                              value={newScenarioColumns}
                              onChange={(e) => setNewScenarioColumns(parseInt(e.target.value) || 12)}
                              min={1}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              required
                            />
                          </div>

                          <div>
                            <label htmlFor="new-scenario-rows" className="block mb-2 text-sm font-medium text-gray-800">
                              Rows <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              id="new-scenario-rows"
                              value={newScenarioRows}
                              onChange={(e) => setNewScenarioRows(parseInt(e.target.value) || 10)}
                              min={1}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              required
                            />
                          </div>

                          <div>
                            <label htmlFor="new-scenario-turns" className="block mb-2 text-sm font-medium text-gray-800">
                              Turns <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              id="new-scenario-turns"
                              value={newScenarioTurns}
                              onChange={(e) => setNewScenarioTurns(parseInt(e.target.value) || 15)}
                              min={1}
                              className="w-full p-2 border border-gray-300 rounded text-sm"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded transition-colors text-sm"
                            disabled={loading}
                          >
                            {loading ? 'Creating...' : 'Create Scenario'}
                          </button>
                          <button
                            type="button"
                            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                            onClick={() => {
                              setShowCreateForm(false);
                              setNewScenarioTitle('');
                              setNewScenarioDescription('');
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

                  <div className="space-y-2">
                    {loading && !showCreateForm ? (
                      <p className="text-center text-gray-500 py-4">Loading scenarios...</p>
                    ) : scenarios.length === 0 ? (
                      <p className="text-center text-gray-500 py-4 italic">No scenarios found</p>
                    ) : (
                      scenarios.map((scenario) => (
                        <div
                          key={scenario.scenarioId}
                          className="p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <h3 className="text-base font-medium mb-1">{scenario.title}</h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {scenario.columns}×{scenario.rows}, {scenario.turns} turns
                          </p>
                          <button
                            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                            onClick={() => void handleLoadScenario(scenario.scenarioId)}
                          >
                            Load
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'editor' && (
              <>
                <section className="mb-8 pb-8 border-b border-gray-200">
                  <h2 className="text-xl font-semibold mb-4 text-gray-800">
                    {isEditing ? 'Edit Scenario' : 'Create New Scenario'}
                  </h2>
            <form>
              <div className="mb-4">
                <label htmlFor="scenario-title" className="block mb-2 font-medium text-gray-800">
                  Title
                </label>
                <input
                  type="text"
                  id="scenario-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                />
              </div>

              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label htmlFor="scenario-columns" className="block mb-2 font-medium text-gray-800">
                    Columns
                  </label>
                  <input
                    type="number"
                    id="scenario-columns"
                    value={columns}
                    onChange={(e) => setColumns(parseInt(e.target.value) || 12)}
                    min={1}
                    disabled={isEditing}
                    className="w-full p-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                    required
                  />
                </div>

                <div className="flex-1">
                  <label htmlFor="scenario-rows" className="block mb-2 font-medium text-gray-800">
                    Rows
                  </label>
                  <input
                    type="number"
                    id="scenario-rows"
                    value={rows}
                    onChange={(e) => setRows(parseInt(e.target.value) || 10)}
                    min={1}
                    disabled={isEditing}
                    className="w-full p-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                    required
                  />
                </div>

                <div className="flex-1">
                  <label htmlFor="scenario-turns" className="block mb-2 font-medium text-gray-800">
                    Turns
                  </label>
                  <input
                    type="number"
                    id="scenario-turns"
                    value={turns}
                    onChange={(e) => setTurns(parseInt(e.target.value) || 15)}
                    min={1}
                    disabled={isEditing}
                    className="w-full p-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {!isEditing ? (
                  <button
                    type="button"
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors text-sm"
                    onClick={handleCreateNew}
                  >
                    Create New
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded transition-colors text-sm"
                      onClick={() => void handleSave()}
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors text-sm"
                      onClick={() => void handleDelete()}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                      onClick={handleCreateNew}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4 text-gray-800">Terrain Type</h2>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {TERRAIN_TYPES.map((terrain) => (
                      <button
                        key={terrain}
                        className={`p-3 border-2 rounded text-sm transition-all ${
                          selectedTerrain === terrain
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-gray-300 bg-white hover:border-blue-500 hover:bg-blue-50'
                        }`}
                        onClick={() => setSelectedTerrain(terrain)}
                        title={terrain.charAt(0).toUpperCase() + terrain.slice(1)}
                      >
                        {terrain.charAt(0).toUpperCase() + terrain.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mt-4">
                    Selected: <span className="font-medium">{selectedTerrain}</span>
                  </p>
                </section>
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-4 shadow-inner flex items-start justify-start">
            <HexGrid
              columns={columns}
              rows={rows}
              hexes={hexes}
              selectedTerrain={selectedTerrain}
              onHexClick={handleHexClick}
              onHexHover={handleHexHover}
              onHexSelect={handleHexSelect}
            />
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
              message.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            } text-white`}
          >
            {message.text}
          </div>
        </div>
      )}
    </div>
  );
}


