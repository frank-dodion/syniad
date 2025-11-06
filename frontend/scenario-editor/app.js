/**
 * Main application logic
 */

let currentScenario = null;
let scenarios = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Set up terrain selector
    document.querySelectorAll('.terrain-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const terrain = btn.dataset.terrain;
            setSelectedTerrain(terrain);
        });
    });
    
    // Set initial terrain
    setSelectedTerrain('clear');
    
    // Set up hex click handler
    setHexClickCallback((row, column) => {
        if (selectedTerrain) {
            updateHexTerrain(row, column, selectedTerrain);
        }
    });
    
    // Set up form handlers
    document.getElementById('create-scenario-btn').addEventListener('click', handleCreateScenario);
    document.getElementById('save-scenario-btn').addEventListener('click', handleSaveScenario);
    document.getElementById('delete-scenario-btn').addEventListener('click', handleDeleteScenario);
    document.getElementById('cancel-edit-btn').addEventListener('click', handleCancelEdit);
    document.getElementById('refresh-scenarios-btn').addEventListener('click', loadScenarios);
    
    // Load scenarios on startup (if authenticated)
    isAuthenticated().then(authenticated => {
        if (authenticated) {
            loadScenarios();
        }
    });
}

/**
 * Show loading overlay
 */
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    overlay.querySelector('p').textContent = message;
    overlay.style.display = 'flex';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

/**
 * Show message to user
 */
function showMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    container.appendChild(messageEl);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        messageEl.remove();
    }, 5000);
}

/**
 * Load all scenarios
 */
async function loadScenarios() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        showMessage('Please login to view scenarios', 'error');
        return;
    }
    
    try {
        showLoading('Loading scenarios...');
        const response = await getAllScenarios();
        scenarios = response.scenarios || [];
        renderScenarioList();
    } catch (error) {
        showMessage(`Error loading scenarios: ${error.message}`, 'error');
        console.error('Error loading scenarios:', error);
    } finally {
        hideLoading();
    }
}

/**
 * Render scenario list
 */
function renderScenarioList() {
    const listContainer = document.getElementById('scenario-list');
    
    if (scenarios.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">No scenarios found</p>';
        return;
    }
    
    listContainer.innerHTML = scenarios.map(scenario => `
        <div class="scenario-item" data-scenario-id="${scenario.scenarioId}">
            <div class="scenario-item-title">${scenario.title}</div>
            <div class="scenario-item-meta">${scenario.columns}×${scenario.rows}, ${scenario.turns} turns</div>
            <button class="btn btn-small load-scenario-btn" data-scenario-id="${scenario.scenarioId}">Load</button>
        </div>
    `).join('');
    
    // Add click handlers
    listContainer.querySelectorAll('.load-scenario-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scenarioId = btn.dataset.scenarioId;
            loadScenario(scenarioId);
        });
    });
}

/**
 * Load a scenario for editing
 */
async function loadScenario(scenarioId) {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        showMessage('Please login to load scenarios', 'error');
        return;
    }
    
    try {
        showLoading('Loading scenario...');
        const response = await getScenario(scenarioId);
        currentScenario = response.scenario;
        
        // Populate form
        document.getElementById('scenario-title').value = currentScenario.title || '';
        document.getElementById('scenario-description').value = currentScenario.description || '';
        document.getElementById('scenario-columns').value = currentScenario.columns || 12;
        document.getElementById('scenario-rows').value = currentScenario.rows || 10;
        document.getElementById('scenario-turns').value = currentScenario.turns || 15;
        
        // Disable form fields (can't change size of existing scenario)
        document.getElementById('scenario-columns').disabled = true;
        document.getElementById('scenario-rows').disabled = true;
        document.getElementById('scenario-turns').disabled = true;
        
        // Render hex grid
        renderHexGrid(
            currentScenario.columns,
            currentScenario.rows,
            currentScenario.hexes || []
        );
        
        // Update UI
        document.getElementById('form-title').textContent = 'Edit Scenario';
        document.getElementById('create-scenario-btn').style.display = 'none';
        document.getElementById('save-scenario-btn').style.display = 'inline-block';
        document.getElementById('delete-scenario-btn').style.display = 'inline-block';
        document.getElementById('cancel-edit-btn').style.display = 'inline-block';
        
        showMessage('Scenario loaded', 'success');
    } catch (error) {
        showMessage(`Error loading scenario: ${error.message}`, 'error');
        console.error('Error loading scenario:', error);
    } finally {
        hideLoading();
    }
}

/**
 * Handle create new scenario
 */
async function handleCreateScenario() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        showMessage('Please login to create scenarios', 'error');
        return;
    }
    
    const title = document.getElementById('scenario-title').value.trim();
    const description = document.getElementById('scenario-description').value.trim();
    const columns = parseInt(document.getElementById('scenario-columns').value);
    const rows = parseInt(document.getElementById('scenario-rows').value);
    const turns = parseInt(document.getElementById('scenario-turns').value);
    
    if (!title) {
        showMessage('Please enter a title', 'error');
        return;
    }
    
    if (columns < 1 || rows < 1 || turns < 1) {
        showMessage('Columns, rows, and turns must be at least 1', 'error');
        return;
    }
    
    // Create new scenario object
    currentScenario = {
        title,
        description,
        columns,
        rows,
        turns,
        hexes: []
    };
    
    // Render empty hex grid
    renderHexGrid(columns, rows, []);
    
    // Update UI
    document.getElementById('form-title').textContent = 'New Scenario';
    document.getElementById('create-scenario-btn').style.display = 'none';
    document.getElementById('save-scenario-btn').style.display = 'inline-block';
    document.getElementById('delete-scenario-btn').style.display = 'none';
    document.getElementById('cancel-edit-btn').style.display = 'inline-block';
    
    showMessage('New scenario created. Edit the hex grid and save when ready.', 'success');
}

/**
 * Handle save scenario
 */
async function handleSaveScenario() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        showMessage('Please login to save scenarios', 'error');
        return;
    }
    
    if (!currentScenario) {
        showMessage('No scenario to save', 'error');
        return;
    }
    
    const title = document.getElementById('scenario-title').value.trim();
    const description = document.getElementById('scenario-description').value.trim();
    
    if (!title) {
        showMessage('Please enter a title', 'error');
        return;
    }
    
    try {
        showLoading('Saving scenario...');
        
        // Get hex data from grid
        const hexes = getHexGridData();
        
        const scenarioData = {
            title,
            description,
            columns: currentScenario.columns,
            rows: currentScenario.rows,
            turns: currentScenario.turns,
            hexes: hexes
        };
        
        let response;
        if (currentScenario.scenarioId) {
            // Update existing
            response = await updateScenario(currentScenario.scenarioId, scenarioData);
            showMessage('Scenario updated successfully', 'success');
        } else {
            // Create new
            response = await createScenario(scenarioData);
            currentScenario.scenarioId = response.scenarioId;
            showMessage('Scenario created successfully', 'success');
        }
        
        // Reload scenarios list
        await loadScenarios();
        
    } catch (error) {
        showMessage(`Error saving scenario: ${error.message}`, 'error');
        console.error('Error saving scenario:', error);
    } finally {
        hideLoading();
    }
}

/**
 * Handle delete scenario
 */
async function handleDeleteScenario() {
    if (!currentScenario || !currentScenario.scenarioId) {
        showMessage('No scenario to delete', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${currentScenario.title}"? This cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading('Deleting scenario...');
        await deleteScenario(currentScenario.scenarioId);
        showMessage('Scenario deleted successfully', 'success');
        
        // Reset UI
        handleCancelEdit();
        await loadScenarios();
    } catch (error) {
        showMessage(`Error deleting scenario: ${error.message}`, 'error');
        console.error('Error deleting scenario:', error);
    } finally {
        hideLoading();
    }
}

/**
 * Handle cancel edit
 */
function handleCancelEdit() {
    currentScenario = null;
    
    // Clear form
    document.getElementById('scenario-form').reset();
    document.getElementById('scenario-columns').disabled = false;
    document.getElementById('scenario-rows').disabled = false;
    document.getElementById('scenario-turns').disabled = false;
    
    // Clear hex grid
    clearHexGrid();
    
    // Update UI
    document.getElementById('form-title').textContent = 'Create New Scenario';
    document.getElementById('create-scenario-btn').style.display = 'inline-block';
    document.getElementById('save-scenario-btn').style.display = 'none';
    document.getElementById('delete-scenario-btn').style.display = 'none';
    document.getElementById('cancel-edit-btn').style.display = 'none';
}

