/**
 * Hex grid pathfinding utilities for calculating movement ranges
 * Uses flat-top hex coordinate system (even-q offset)
 */

import { HexSide, TerrainType, PlayerNumber, ScenarioUnit, ArmType } from "@/shared/types";

export interface MovementRange {
  [key: string]: number; // Key: "column,row", Value: minimum movement cost
}

/**
 * Get adjacent hex coordinates for flat-top hexes (even-q offset)
 */
function getAdjacentHex(column: number, row: number, side: HexSide): { column: number; row: number } {
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
      return { column, row };
  }
}

/**
 * Get all 6 adjacent hex coordinates with their connecting sides
 */
function getAllAdjacentHexes(column: number, row: number): Array<{ column: number; row: number; side: HexSide }> {
  return [
    { ...getAdjacentHex(column, row, HexSide.Top), side: HexSide.Top },
    { ...getAdjacentHex(column, row, HexSide.TopRight), side: HexSide.TopRight },
    { ...getAdjacentHex(column, row, HexSide.BottomRight), side: HexSide.BottomRight },
    { ...getAdjacentHex(column, row, HexSide.Bottom), side: HexSide.Bottom },
    { ...getAdjacentHex(column, row, HexSide.BottomLeft), side: HexSide.BottomLeft },
    { ...getAdjacentHex(column, row, HexSide.TopLeft), side: HexSide.TopLeft },
  ];
}

/**
 * Get the opposite side (for checking rivers/roads on the destination hex)
 * For flat-top hexes, opposite sides are: 0↔3, 1↔4, 2↔5
 */
function getOppositeSide(side: HexSide): HexSide {
  return ((side + 3) % 6) as HexSide;
}

/**
 * Calculate movement cost to enter a hex
 * Rules:
 * - Clear or Town: 1 point
 * - Mountain or Forest: 2 points
 * - Swamp or Desert: 3 points
 * - Water: not allowed (returns Infinity)
 * - River crossing: +1 point (if entering via a side with a river), +2 points for Artillery
 * - Road entry: Always 1 point regardless of terrain (if entering via a side with a road)
 */
function getMovementCost(
  hex: { column: number; row: number; terrain?: string; rivers?: number; roads?: number },
  entrySide: HexSide | null,
  sourceHex?: { column: number; row: number; rivers?: number; roads?: number },
  exitSide?: HexSide,
  unitArm?: ArmType
): number {
  const terrain = hex.terrain as TerrainType | undefined;
  
  // Water is not allowed
  if (terrain === TerrainType.Water) {
    return Infinity;
  }

  // Check if entering via a road - if so, cost is always 1
  // Roads are stored on both hexes that share a side, so check both
  let hasRoad = false;
  if (entrySide !== null && hex.roads !== undefined) {
    hasRoad = (hex.roads & (1 << entrySide)) !== 0;
  }
  // Also check the source hex if provided
  if (!hasRoad && sourceHex && exitSide !== undefined && sourceHex.roads !== undefined) {
    hasRoad = (sourceHex.roads & (1 << exitSide)) !== 0;
  }
  if (hasRoad) {
    return 1;
  }

  // Base terrain cost
  let baseCost: number;
  if (terrain === TerrainType.Clear || terrain === TerrainType.Town) {
    baseCost = 1;
  } else if (terrain === TerrainType.Mountain || terrain === TerrainType.Forest) {
    baseCost = 2;
  } else if (terrain === TerrainType.Swamp || terrain === TerrainType.Desert) {
    baseCost = 3;
  } else {
    // Default to 1 for unknown terrain types
    baseCost = 1;
  }

  // Check if crossing a river - add +1 point (or +2 for Artillery)
  // Rivers are stored on both hexes that share a side, so check both the destination and source hex
  let hasRiver = false;
  if (entrySide !== null && hex.rivers !== undefined) {
    hasRiver = (hex.rivers & (1 << entrySide)) !== 0;
  }
  // Also check the source hex if provided (more reliable since rivers are stored on both sides)
  if (!hasRiver && sourceHex && exitSide !== undefined && sourceHex.rivers !== undefined) {
    hasRiver = (sourceHex.rivers & (1 << exitSide)) !== 0;
  }
  if (hasRiver) {
    // Artillery costs 2 additional points to cross rivers, other units cost 1
    const riverCost = unitArm === 'Artillery' ? 2 : 1;
    baseCost += riverCost;
  }

  return baseCost;
}

/**
 * Check if a hex coordinate is within the map bounds
 */
function isValidHex(column: number, row: number, maxColumns: number, maxRows: number): boolean {
  return column >= 0 && column < maxColumns && row >= 0 && row < maxRows;
}

/**
 * Calculate all reachable hexes from a starting position within movement allowance
 * Uses Dijkstra's algorithm to find minimum movement costs
 * 
 * @param startColumn Starting hex column
 * @param startRow Starting hex row
 * @param movementAllowance Maximum movement points available
 * @param hexes Array of all hexes in the map
 * @param maxColumns Maximum number of columns in the map
 * @param maxRows Maximum number of rows in the map
 * @param units Array of all units on the map
 * @param activePlayer The player whose unit is moving (to exclude enemy-occupied hexes)
 * @returns Map of reachable hexes with their minimum movement costs
 */
export function calculateMovementRange(
  startColumn: number,
  startRow: number,
  movementAllowance: number,
  hexes: Array<{ column: number; row: number; terrain?: string | TerrainType; rivers?: number; roads?: number }>,
  maxColumns: number,
  maxRows: number,
  units?: ScenarioUnit[],
  activePlayer?: PlayerNumber,
  unitArm?: ArmType
): MovementRange {
  const range: MovementRange = {};
  
  // Create a map of hexes for quick lookup
  const hexMap = new Map<string, { column: number; row: number; terrain?: string | TerrainType; rivers?: number; roads?: number }>();
  hexes.forEach((hex) => {
    const key = `${hex.column},${hex.row}`;
    hexMap.set(key, hex);
  });

  // Create a map of units by position to check for enemy units
  const unitMap = new Map<string, ScenarioUnit[]>();
  if (units) {
    units.forEach((unit) => {
      const key = `${unit.column},${unit.row}`;
      const existing = unitMap.get(key) || [];
      existing.push(unit);
      unitMap.set(key, existing);
    });
  }

  /**
   * Check if a hex is occupied by an enemy unit
   */
  function hasEnemyUnit(column: number, row: number): boolean {
    if (!activePlayer || !units) return false;
    const key = `${column},${row}`;
    const hexUnits = unitMap.get(key);
    if (!hexUnits || hexUnits.length === 0) return false;
    // Check if any unit at this hex belongs to the other player
    return hexUnits.some(unit => unit.player !== activePlayer);
  }

  /**
   * Check if a hex is adjacent to an enemy unit and if we must stop there
   * Returns true if the unit must stop (adjacent to enemy, not all separated by rivers)
   * Returns false if not adjacent to enemy, or all adjacent enemies are separated by rivers
   */
  function mustStopAtHex(column: number, row: number): boolean {
    if (!activePlayer || !units) return false;
    
    const hex = hexMap.get(`${column},${row}`) || { 
      column, 
      row, 
      rivers: 0 
    };
    const hexRivers = hex.rivers ?? 0;

    // Check all 6 adjacent hexes
    const adjacentHexes = getAllAdjacentHexes(column, row);
    let hasAdjacentEnemy = false;
    let allEnemiesSeparatedByRiver = true;

    for (const adjacent of adjacentHexes) {
      if (hasEnemyUnit(adjacent.column, adjacent.row)) {
        hasAdjacentEnemy = true;
        
        // Check if there's a river on the side connecting to this enemy hex
        // The side we're checking is the side from the current hex to the adjacent hex
        const connectingSide = adjacent.side;
        const hasRiver = (hexRivers & (1 << connectingSide)) !== 0;
        
        if (!hasRiver) {
          // Found an enemy unit that is NOT separated by a river
          allEnemiesSeparatedByRiver = false;
          break; // No need to check further - we must stop
        }
      }
    }

    // Must stop if adjacent to enemy and not all enemies are separated by rivers
    return hasAdjacentEnemy && !allEnemiesSeparatedByRiver;
  }

  // Dijkstra's algorithm: track minimum cost to reach each hex
  const costs: Map<string, number> = new Map();
  const visited: Set<string> = new Set();
  const queue: Array<{ column: number; row: number; cost: number }> = [];

  // Start from the unit's position with cost 0
  const startKey = `${startColumn},${startRow}`;
  costs.set(startKey, 0);
  queue.push({ column: startColumn, row: startRow, cost: 0 });

  while (queue.length > 0) {
    // Sort queue by cost (lowest first) - simple priority queue
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    const currentKey = `${current.column},${current.row}`;

    // Skip if already visited with a better path
    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    // Get the minimum cost to reach this hex (should match current.cost, but use costs map as source of truth)
    const minCostToCurrent = costs.get(currentKey) ?? current.cost;

    // Check if we must stop at this hex (adjacent to enemy, not all separated by rivers)
    // If we must stop here, we cannot explore further from this hex
    const mustStopHere = mustStopAtHex(current.column, current.row);
    
    // If we can reach this hex within movement allowance, add it to range with minimum cost
    // This includes hexes where we must stop (they're still valid destinations)
    if (minCostToCurrent <= movementAllowance) {
      range[currentKey] = minCostToCurrent;
    }

    // If we must stop at this hex, do NOT explore further - the unit cannot move beyond this point
    if (mustStopHere) {
      continue; // Skip exploring adjacent hexes from this hex
    }

    // Explore adjacent hexes using the minimum cost to reach current hex
    const adjacentHexes = getAllAdjacentHexes(current.column, current.row);
    
    for (const adjacent of adjacentHexes) {
      // Check bounds
      if (!isValidHex(adjacent.column, adjacent.row, maxColumns, maxRows)) {
        continue;
      }

      const adjacentKey = `${adjacent.column},${adjacent.row}`;
      
      // Skip if already visited (we already found the best path to it)
      if (visited.has(adjacentKey)) {
        continue;
      }

      // Find which side of the destination hex we're entering from
      // The side we're entering from is the opposite of the side we're leaving from
      const entrySide = getOppositeSide(adjacent.side);

      // Skip if hex is occupied by an enemy unit (enemy-occupied hexes are never valid destinations)
      if (hasEnemyUnit(adjacent.column, adjacent.row)) {
        continue;
      }

      // Get hex data for both source and destination
      const currentHex = hexMap.get(currentKey) || {
        column: current.column,
        row: current.row,
        rivers: 0,
        roads: 0
      };
      const hex = hexMap.get(adjacentKey) || { 
        column: adjacent.column, 
        row: adjacent.row,
        rivers: 0,
        roads: 0
      };
      // Pass source hex and exit side to properly detect river crossings
      // Also pass unit arm type for artillery river crossing penalty
      const moveCost = getMovementCost(hex, entrySide, currentHex, adjacent.side, unitArm);
      
      // Skip if movement is not allowed (water, etc.)
      if (moveCost === Infinity) {
        continue;
      }

      // Calculate new cost using the minimum cost to reach current hex
      const newCost = minCostToCurrent + moveCost;

      // Always track the minimum cost to reach each hex, even if it exceeds movement allowance
      // This ensures we find the best path to all reachable hexes
      const existingCost = costs.get(adjacentKey);
      
      // If we found a better (lower) path, update it
      if (existingCost === undefined || newCost < existingCost) {
        costs.set(adjacentKey, newCost);
        
        // Check if this adjacent hex is a valid destination (not enemy-occupied, not water, within movement allowance)
        const isAdjacentEnemyOccupied = hasEnemyUnit(adjacent.column, adjacent.row);
        const isAdjacentWater = (hex.terrain as TerrainType) === TerrainType.Water;
        const isWithinMovementAllowance = newCost <= movementAllowance;
        const isValidDestination = !isAdjacentEnemyOccupied && !isAdjacentWater && isWithinMovementAllowance;
        
        // If it's a valid destination, add it to the range immediately
        // This ensures hexes are shown in the overlay even if we must stop at them
        if (isValidDestination) {
          range[adjacentKey] = newCost;
          // Add to queue to continue exploring from this valid destination
          // The "must stop" check will happen when we process this hex from the queue
          // If we must stop at that hex, we won't explore further from it
          queue.push({ column: adjacent.column, row: adjacent.row, cost: newCost });
        }
      } else if (existingCost !== undefined && newCost >= existingCost) {
        // We found a path with same or higher cost, but we should still ensure it's in the range if valid
        // This handles the case where we might have discovered it via a different path
        const isAdjacentEnemyOccupied = hasEnemyUnit(adjacent.column, adjacent.row);
        const isAdjacentWater = (hex.terrain as TerrainType) === TerrainType.Water;
        const isWithinMovementAllowance = existingCost <= movementAllowance;
        const isValidDestination = !isAdjacentEnemyOccupied && !isAdjacentWater && isWithinMovementAllowance;
        
        if (isValidDestination && !range[adjacentKey]) {
          // Hex is valid but not yet in range - add it with the existing (better) cost
          range[adjacentKey] = existingCost;
        }
      }
    }
  }

  // Debug: Log the calculated range
  const rangeKeys = Object.keys(range);
  console.log('[calculateMovementRange] Calculated range:', {
    startColumn,
    startRow,
    movementAllowance,
    rangeSize: rangeKeys.length,
    rangeKeys: rangeKeys,
    range: range,
    includesHex7_8: range['7,8'] !== undefined,
    hex7_8Cost: range['7,8']
  });
  
  // Verify all hexes in range are valid
  const invalidHexes = rangeKeys.filter(key => {
    const [col, row] = key.split(',').map(Number);
    return isNaN(col) || isNaN(row) || col < 0 || row < 0 || col >= maxColumns || row >= maxRows;
  });
  if (invalidHexes.length > 0) {
    console.warn('[calculateMovementRange] Invalid hexes in range:', invalidHexes);
  }

  // Special rule: A unit with at least 1 movement allowance can always move to at least one adjacent hex,
  // even if it exceeds movement allowance (Water and enemy-occupied hexes are still ineligible)
  // Units with 0 movement allowance cannot move at all
  // Check if there are any adjacent hexes in the range (excluding the starting hex)
  // Note: startKey is already defined above, so we reuse it
  const hasAdjacentHexInRange = Object.keys(range).some(key => key !== startKey);
  
  // Only apply special case if unit has at least 1 movement allowance
  if (!hasAdjacentHexInRange && movementAllowance >= 1) {
    // No adjacent hexes reachable within movement allowance, find at least one eligible adjacent hex
    const adjacentHexes = getAllAdjacentHexes(startColumn, startRow);
    
    for (const adjacent of adjacentHexes) {
      // Check bounds
      if (!isValidHex(adjacent.column, adjacent.row, maxColumns, maxRows)) {
        continue;
      }

      // Skip if hex is occupied by an enemy unit (enemy-occupied hexes are never valid destinations)
      if (hasEnemyUnit(adjacent.column, adjacent.row)) {
        continue;
      }

      // Get hex data for both source and destination
      const startHex = hexMap.get(startKey) || {
        column: startColumn,
        row: startRow,
        rivers: 0,
        roads: 0
      };
      const hex = hexMap.get(`${adjacent.column},${adjacent.row}`) || { 
        column: adjacent.column, 
        row: adjacent.row,
        rivers: 0,
        roads: 0
      };
      
      // Find which side of the destination hex we're entering from
      const entrySide = getOppositeSide(adjacent.side);
      // Pass source hex and exit side to properly detect river/road crossings
      // Also pass unit arm type for artillery river crossing penalty
      const moveCost = getMovementCost(hex, entrySide, startHex, adjacent.side, unitArm);
      
      // Skip if movement is not allowed (water, etc.)
      if (moveCost === Infinity) {
        continue;
      }

      // Found an eligible hex - add it to range even if it exceeds movement allowance
      const adjacentKey = `${adjacent.column},${adjacent.row}`;
      range[adjacentKey] = moveCost;
      break; // Only need one eligible hex
    }
  }

  return range;
}

