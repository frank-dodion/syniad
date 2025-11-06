'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import HexGrid from '@/components/HexGrid';
import { getAllScenarios, createScenario, updateScenario, deleteScenario, getScenario, type Scenario } from '@/lib/api';
import { useAuth } from '@/lib/auth-client';

const TERRAIN_TYPES = ['clear', 'mountain', 'forest', 'water', 'desert', 'swamp'];

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [selectedTerrain, setSelectedTerrain] = useState('clear');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState(12);
  const [rows, setRows] = useState(10);
  const [turns, setTurns] = useState(15);
  const [isEditing, setIsEditing] = useState(false);
  const [hexes, setHexes] = useState<Array<{ row: number; column: number; terrain: string }>>([]);

  useEffect(() => {
    if (isAuthenticated) {
      loadScenarios();
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
        // Update existing
        await updateScenario(currentScenario.scenarioId, scenarioData);
        showMessage('Scenario updated successfully', 'success');
        await loadScenarios();
      } else {
        // Create new
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
      // Need to create new scenario first
      return;
    }

    // Update hex terrain
    const existingIndex = hexes.findIndex(h => h.row === row && h.column === column);
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
    <>
      <Header />
      <div className="container">
        <aside className="sidebar">
          <section className="scenario-list-section">
            <h2>Scenarios</h2>
            <button className="btn btn-small" onClick={loadScenarios}>Refresh</button>
            <div className="scenario-list">
              {loading ? (
                <p className="loading">Loading scenarios...</p>
              ) : scenarios.length === 0 ? (
                <p className="empty-message">No scenarios found</p>
              ) : (
                scenarios.map((scenario) => (
                  <div key={scenario.scenarioId} className="scenario-item">
                    <h3>{scenario.title}</h3>
                    <p>{scenario.columns}×{scenario.rows}, {scenario.turns} turns</p>
                    <button
                      className="btn btn-small"
                      onClick={() => handleLoadScenario(scenario.scenarioId)}
                    >
                      Load
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="scenario-form-section">
            <h2>{isEditing ? 'Edit Scenario' : 'Create New Scenario'}</h2>
            <form>
              <div className="form-group">
                <label htmlFor="scenario-title">Title</label>
                <input
                  type="text"
                  id="scenario-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="scenario-description">Description</label>
                <textarea
                  id="scenario-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="scenario-columns">Columns</label>
                  <input
                    type="number"
                    id="scenario-columns"
                    value={columns}
                    onChange={(e) => setColumns(parseInt(e.target.value) || 12)}
                    min={1}
                    disabled={isEditing}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="scenario-rows">Rows</label>
                  <input
                    type="number"
                    id="scenario-rows"
                    value={rows}
                    onChange={(e) => setRows(parseInt(e.target.value) || 10)}
                    min={1}
                    disabled={isEditing}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="scenario-turns">Turns</label>
                  <input
                    type="number"
                    id="scenario-turns"
                    value={turns}
                    onChange={(e) => setTurns(parseInt(e.target.value) || 15)}
                    min={1}
                    disabled={isEditing}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                {!isEditing ? (
                  <button type="button" className="btn btn-primary" onClick={handleCreateNew}>
                    Create New
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-success" onClick={handleSave}>
                      Save Changes
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleDelete}>
                      Delete
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleCreateNew}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
          </section>

          <section className="terrain-selector-section">
            <h2>Terrain Type</h2>
            <div className="terrain-selector">
              {TERRAIN_TYPES.map((terrain) => (
                <button
                  key={terrain}
                  className={`terrain-btn ${selectedTerrain === terrain ? 'active' : ''}`}
                  onClick={() => setSelectedTerrain(terrain)}
                  title={terrain.charAt(0).toUpperCase() + terrain.slice(1)}
                >
                  {terrain.charAt(0).toUpperCase() + terrain.slice(1)}
                </button>
              ))}
            </div>
            <p className="selected-terrain">Selected: <span>{selectedTerrain}</span></p>
          </section>
        </aside>

        <main className="main-content">
          <HexGrid
            columns={columns}
            rows={rows}
            hexes={hexes}
            selectedTerrain={selectedTerrain}
            onHexClick={handleHexClick}
          />
        </main>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}

      {message && (
        <div className="message-container">
          <div className={`message message-${message.type}`}>
            {message.text}
          </div>
        </div>
      )}
    </>
  );
}

