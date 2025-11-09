'use client';

import { useEffect, useState } from 'react';
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
  const { isAuthenticated } = useAuth();
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

  return (
    <div className="min-h-screen min-w-full bg-slate-100">
      <Header />
      <div className="flex h-[calc(100vh-56px)] mt-[72px] px-6 pb-6 gap-6 items-stretch">
        <aside className="self-start w-[360px] min-w-[360px] flex-shrink-0 bg-white border border-gray-200 rounded-lg overflow-y-auto p-4 text-gray-800 shadow-sm">
          <section className="mb-8 pb-8 border-b border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Scenarios</h2>
            <button
              className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors mb-4"
              onClick={() => void loadScenarios()}
            >
              Refresh
            </button>
            <div className="max-h-[300px] overflow-y-auto">
              {loading ? (
                <p className="text-center text-gray-500 py-4">Loading scenarios...</p>
              ) : scenarios.length === 0 ? (
                <p className="text-center text-gray-500 py-4 italic">No scenarios found</p>
              ) : (
                scenarios.map((scenario) => (
                  <div
                    key={scenario.scenarioId}
                    className="p-3 mb-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
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
          </section>

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
        </aside>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="h-full w-full overflow-scroll rounded-lg border border-gray-200 bg-white p-4 shadow-inner flex items-start justify-start">
            <HexGrid
              columns={columns}
              rows={rows}
              hexes={hexes}
              selectedTerrain={selectedTerrain}
              onHexClick={handleHexClick}
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


