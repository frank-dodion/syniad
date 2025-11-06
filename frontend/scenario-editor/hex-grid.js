/**
 * Hex grid rendering and interaction
 */

const TERRAIN_COLORS = {
    clear: '#e8e8e8',
    mountain: '#8b7355',
    forest: '#2d5016',
    water: '#4a90e2',
    desert: '#f4a460',
    swamp: '#556b2f'
};

let currentHexGrid = null;
let selectedHex = null;
let selectedTerrain = 'clear';
let onHexClickCallback = null;

/**
 * Calculate hexagon points for SVG
 */
function getHexPoints(size) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = size + size * Math.cos(angle);
        const y = size + size * Math.sin(angle);
        points.push(`${x},${y}`);
    }
    return points.join(' ');
}

/**
 * Render hex grid
 */
function renderHexGrid(columns, rows, hexes = []) {
    const container = document.getElementById('hex-grid-container');
    container.innerHTML = '';
    
    if (columns === 0 || rows === 0) {
        container.innerHTML = '<p class="info-message">Set columns and rows to create a grid</p>';
        return;
    }
    
    // Create SVG for hex grid
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'hex-grid-svg');
    svg.setAttribute('viewBox', `0 0 ${columns * 100} ${rows * 100}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    
    // Create a map of hexes for quick lookup
    const hexMap = new Map();
    hexes.forEach(hex => {
        const key = `${hex.row},${hex.column}`;
        hexMap.set(key, hex);
    });
    
    // Calculate hex size based on grid dimensions
    const hexSize = 40;
    const hexWidth = hexSize * Math.sqrt(3);
    const hexHeight = hexSize * 2;
    
    // Render each hex
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            const key = `${row},${col}`;
            const hex = hexMap.get(key) || { row, column: col, terrain: 'clear' };
            
            // Calculate position (offset rows for hex grid)
            const x = col * hexWidth * 0.75 + (row % 2 === 1 ? hexWidth * 0.375 : 0);
            const y = row * hexHeight * 0.75;
            
            // Create hexagon
            const hexGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            hexGroup.setAttribute('class', 'hex-group');
            hexGroup.setAttribute('data-row', row);
            hexGroup.setAttribute('data-column', col);
            
            // Create hexagon polygon
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const points = getHexPoints(hexSize);
            polygon.setAttribute('points', points);
            polygon.setAttribute('fill', TERRAIN_COLORS[hex.terrain] || TERRAIN_COLORS.clear);
            polygon.setAttribute('stroke', '#333');
            polygon.setAttribute('stroke-width', '1');
            polygon.setAttribute('transform', `translate(${x}, ${y})`);
            polygon.setAttribute('class', 'hex');
            
            // Add click handler
            polygon.addEventListener('click', () => handleHexClick(row, col));
            polygon.addEventListener('mouseenter', () => {
                if (selectedHex?.row !== row || selectedHex?.column !== col) {
                    polygon.setAttribute('stroke-width', '2');
                    polygon.setAttribute('stroke', '#666');
                }
            });
            polygon.addEventListener('mouseleave', () => {
                if (selectedHex?.row !== row || selectedHex?.column !== col) {
                    polygon.setAttribute('stroke-width', '1');
                    polygon.setAttribute('stroke', '#333');
                }
            });
            
            hexGroup.appendChild(polygon);
            
            // Add row/column label (small text)
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + hexSize);
            text.setAttribute('y', y + hexSize + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '10');
            text.setAttribute('fill', '#666');
            text.setAttribute('pointer-events', 'none');
            text.textContent = `${row},${col}`;
            hexGroup.appendChild(text);
            
            svg.appendChild(hexGroup);
        }
    }
    
    container.appendChild(svg);
    currentHexGrid = { columns, rows, hexes: hexMap };
    
    // Update selected hex visual
    updateSelectedHex();
}

/**
 * Handle hex click
 */
function handleHexClick(row, column) {
    selectedHex = { row, column };
    updateSelectedHex();
    
    if (onHexClickCallback) {
        onHexClickCallback(row, column);
    }
}

/**
 * Update visual feedback for selected hex
 */
function updateSelectedHex() {
    if (!currentHexGrid) return;
    
    const svg = document.querySelector('.hex-grid-svg');
    if (!svg) return;
    
    // Reset all hexes
    svg.querySelectorAll('.hex').forEach(hex => {
        hex.setAttribute('stroke-width', '1');
        hex.setAttribute('stroke', '#333');
    });
    
    // Highlight selected hex
    if (selectedHex) {
        const hexGroup = svg.querySelector(
            `g[data-row="${selectedHex.row}"][data-column="${selectedHex.column}"]`
        );
        if (hexGroup) {
            const hex = hexGroup.querySelector('.hex');
            hex.setAttribute('stroke-width', '3');
            hex.setAttribute('stroke', '#ff0000');
        }
    }
}

/**
 * Set selected terrain type
 */
function setSelectedTerrain(terrain) {
    selectedTerrain = terrain;
    document.getElementById('selected-terrain-text').textContent = terrain;
    
    // Update terrain button states
    document.querySelectorAll('.terrain-btn').forEach(btn => {
        if (btn.dataset.terrain === terrain) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // If a hex is selected, update it immediately
    if (selectedHex && currentHexGrid) {
        updateHexTerrain(selectedHex.row, selectedHex.column, terrain);
    }
}

/**
 * Update hex terrain at specific coordinates
 */
function updateHexTerrain(row, column, terrain) {
    if (!currentHexGrid) return;
    
    const key = `${row},${column}`;
    const hex = currentHexGrid.hexes.get(key) || { row, column, terrain: 'clear' };
    hex.terrain = terrain;
    currentHexGrid.hexes.set(key, hex);
    
    // Update visual
    const svg = document.querySelector('.hex-grid-svg');
    if (svg) {
        const hexGroup = svg.querySelector(`g[data-row="${row}"][data-column="${column}"]`);
        if (hexGroup) {
            const polygon = hexGroup.querySelector('.hex');
            polygon.setAttribute('fill', TERRAIN_COLORS[terrain] || TERRAIN_COLORS.clear);
        }
    }
}

/**
 * Get current hex grid data
 */
function getHexGridData() {
    if (!currentHexGrid) return [];
    
    const hexes = [];
    for (let row = 0; row < currentHexGrid.rows; row++) {
        for (let col = 0; col < currentHexGrid.columns; col++) {
            const key = `${row},${col}`;
            const hex = currentHexGrid.hexes.get(key) || { row, column: col, terrain: 'clear' };
            hexes.push(hex);
        }
    }
    return hexes;
}

/**
 * Set hex click callback
 */
function setHexClickCallback(callback) {
    onHexClickCallback = callback;
}

/**
 * Clear hex grid
 */
function clearHexGrid() {
    const container = document.getElementById('hex-grid-container');
    container.innerHTML = '<p class="info-message">Create or load a scenario to start editing</p>';
    currentHexGrid = null;
    selectedHex = null;
}

