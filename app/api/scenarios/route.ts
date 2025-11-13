import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { getAllScenarios, saveScenario } from '@/lib/api-db';
import { v4 as uuidv4 } from 'uuid';
import { Scenario, Hex, TerrainType } from '@/shared/types';
import { contract } from '@/shared/contract';
import {
  validateRequestBody,
  validateQueryParams,
  validateResponse,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/ts-rest-adapter';

// GET /api/scenarios - Get all scenarios
export async function GET(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    console.log('[scenarios/GET] User identity:', user ? `userId=${user.userId}` : 'null');
    
    if (!user || !user.userId) {
      console.log('[scenarios/GET] Authentication check failed - returning 401');
      return createErrorResponse(401, 'Authentication required');
    }
    
    console.log('[scenarios/GET] Authentication check passed - proceeding with request');
    
    const { searchParams } = new URL(request.url);
    const validation = validateQueryParams(contract.getScenarios, searchParams);
    
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const query = validation.data || {};
    const limit = query.limit;
    const nextToken = query.nextToken;
    const creatorId = query.creatorId;
    
    if (limit && (limit < 1 || limit > 100)) {
      return createErrorResponse(400, 'limit must be between 1 and 100', user);
    }
    
    // If creatorId is provided, filter by creator. Otherwise get all scenarios.
    const result = await getAllScenarios(limit, nextToken, creatorId);
    
    const response = {
      scenarios: result.items,
      count: result.items.length,
      hasMore: result.hasMore,
      nextToken: result.nextToken,
    };
    const responseValidation = validateResponse(contract.getScenarios, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error getting scenarios:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

// POST /api/scenarios - Create a new scenario
export async function POST(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createErrorResponse(401, 'Authentication required');
    }

    const body = await request.json();
    const validation = validateRequestBody(contract.createScenario, body);
    
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { title, description, columns, rows, turns, hexes, units } = validation.data;
    
    const scenarioId = uuidv4();
    
    // Generate default hexes if not provided
    const defaultHexes: Hex[] = [];
    if (!hexes || !Array.isArray(hexes)) {
      // Generate all hexes with default 'clear' terrain
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          defaultHexes.push({ column: col, row, terrain: TerrainType.Clear, rivers: 0, roads: 0 });
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
          defaultHexes.push(providedHex || { column: col, row, terrain: TerrainType.Clear, rivers: 0, roads: 0 });
        }
      }
    }
    
    const playerName = user.email || `User-${user.userId.substring(0, 8)}`;
    
    const scenario: Scenario = {
      scenarioId,
      title,
      description,
      columns,
      rows,
      turns,
      hexes: defaultHexes,
      units: units || [],
      creatorId: user.userId, // Store creator ID
      creator: {
        name: playerName,
        userId: user.userId
      }, // Store creator info for display
      createdAt: new Date().toISOString(),
      queryKey: 'ALL_SCENARIOS'
    };
    
    await saveScenario(scenario);
    
    const response = { scenarioId, scenario };
    const responseValidation = validateResponse(contract.createScenario, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error creating scenario:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

