import { NextRequest } from 'next/server';
import { extractUserIdentity, createApiResponse } from '@/lib/api-auth';
import { getAllScenarios, saveScenario } from '@/lib/api-db';
import { v4 as uuidv4 } from 'uuid';
import { Scenario, Hex } from '../../../../../shared/types';

// GET /api/scenarios - Get all scenarios
export async function GET(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const nextToken = searchParams.get('nextToken');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    
    if (limit && (limit < 1 || limit > 100)) {
      return createApiResponse(400, {
        error: 'limit must be between 1 and 100'
      }, user);
    }
    
    const result = await getAllScenarios(limit, nextToken || undefined);
    
    return createApiResponse(200, {
      scenarios: result.items,
      count: result.items.length,
      hasMore: result.hasMore,
      nextToken: result.nextToken
    }, user);
  } catch (error) {
    console.error('Error getting scenarios:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// POST /api/scenarios - Create a new scenario
export async function POST(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createApiResponse(401, {
        error: 'Authentication required'
      });
    }

    const body = await request.json();
    const { title, description, columns, rows, turns, hexes } = body;
    
    if (!title || typeof title !== 'string') {
      return createApiResponse(400, {
        error: 'Missing or invalid title field'
      }, user);
    }
    
    if (!description || typeof description !== 'string') {
      return createApiResponse(400, {
        error: 'Missing or invalid description field'
      }, user);
    }
    
    if (!columns || typeof columns !== 'number' || columns < 1) {
      return createApiResponse(400, {
        error: 'Missing or invalid columns field (must be >= 1)'
      }, user);
    }
    
    if (!rows || typeof rows !== 'number' || rows < 1) {
      return createApiResponse(400, {
        error: 'Missing or invalid rows field (must be >= 1)'
      }, user);
    }
    
    if (!turns || typeof turns !== 'number' || turns < 1) {
      return createApiResponse(400, {
        error: 'Missing or invalid turns field (must be >= 1)'
      }, user);
    }
    
    const scenarioId = uuidv4();
    
    // Generate default hexes if not provided
    const defaultHexes: Hex[] = [];
    if (!hexes || !Array.isArray(hexes)) {
      // Generate all hexes with default 'clear' terrain
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          defaultHexes.push({ row, column: col, terrain: 'clear' });
        }
      }
    } else {
      // Create a map of provided hexes
      const hexMap = new Map<string, Hex>();
      for (const hex of hexes) {
        if (hex.row >= 0 && hex.row < rows && hex.column >= 0 && hex.column < columns) {
          hexMap.set(`${hex.row},${hex.column}`, hex);
        }
      }
      
      // Fill in all hexes, using provided ones or defaulting to 'clear'
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const key = `${row},${col}`;
          const providedHex = hexMap.get(key);
          defaultHexes.push(providedHex || { row, column: col, terrain: 'clear' });
        }
      }
    }
    
    const scenario: Scenario = {
      scenarioId,
      title,
      description,
      columns,
      rows,
      turns,
      hexes: defaultHexes,
      createdAt: new Date().toISOString(),
      queryKey: 'ALL_SCENARIOS'
    };
    
    await saveScenario(scenario);
    
    return createApiResponse(200, {
      scenarioId,
      scenario
    }, user);
  } catch (error) {
    console.error('Error creating scenario:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

