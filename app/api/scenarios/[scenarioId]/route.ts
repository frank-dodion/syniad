import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { getScenario, updateScenario, deleteScenario } from '@/lib/api-db';
import { Scenario, Hex } from '@/shared/types';
import { contract } from '@/shared/contract';
import {
  validatePathParams,
  validateRequestBody,
  validateResponse,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/ts-rest-adapter';

// GET /api/scenarios/[scenarioId] - Get a specific scenario
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    const pathParams = await params;
    
    const validation = validatePathParams(contract.getScenario, pathParams);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { scenarioId } = validation.data;

    const scenario = await getScenario(scenarioId);
    
    if (!scenario) {
      return createErrorResponse(404, `Scenario not found: ${scenarioId}`, user);
    }
    
    const response = { scenarioId, scenario };
    const responseValidation = validateResponse(contract.getScenario, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error getting scenario:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

// PUT /api/scenarios/[scenarioId] - Update a scenario
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    const pathParams = await params;
    const pathValidation = validatePathParams(contract.updateScenario, pathParams);
    if (!pathValidation.valid) {
      return createErrorResponse(400, pathValidation.error, user);
    }

    const { scenarioId } = pathValidation.data;

    const existing = await getScenario(scenarioId);
    if (!existing) {
      return createErrorResponse(404, `Scenario not found: ${scenarioId}`, user);
    }

    const body = await request.json();
    const bodyValidation = validateRequestBody(contract.updateScenario, body);
    if (!bodyValidation.valid) {
      return createErrorResponse(400, bodyValidation.error, user);
    }

    const { title, description, columns, rows, turns, hexes } = bodyValidation.data;
    
    const updatedScenario: Scenario = {
      ...existing,
      title: title !== undefined ? title : existing.title,
      description: description !== undefined ? description : existing.description,
      columns: columns !== undefined ? columns : existing.columns,
      rows: rows !== undefined ? rows : existing.rows,
      turns: turns !== undefined ? turns : existing.turns,
      hexes: hexes !== undefined ? hexes : existing.hexes,
      updatedAt: new Date().toISOString()
    };
    
    // Validate hexes if provided
    if (hexes && Array.isArray(hexes)) {
      const hexMap = new Map<string, Hex>();
      for (const hex of hexes) {
        if (hex.row >= 0 && hex.row < updatedScenario.rows && hex.column >= 0 && hex.column < updatedScenario.columns) {
          hexMap.set(`${hex.row},${hex.column}`, hex);
        }
      }
      
      // Fill in all hexes
      const allHexes: Hex[] = [];
      for (let row = 0; row < updatedScenario.rows; row++) {
        for (let col = 0; col < updatedScenario.columns; col++) {
          const key = `${row},${col}`;
          const providedHex = hexMap.get(key);
          allHexes.push(providedHex || { row, column: col, terrain: 'clear' });
        }
      }
      updatedScenario.hexes = allHexes;
    }
    
    await updateScenario(updatedScenario);
    
    const response = { scenarioId, scenario: updatedScenario };
    const responseValidation = validateResponse(contract.updateScenario, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error updating scenario:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

// DELETE /api/scenarios/[scenarioId] - Delete a scenario
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    const pathParams = await params;
    const validation = validatePathParams(contract.deleteScenario, pathParams);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { scenarioId } = validation.data;

    const existing = await getScenario(scenarioId);
    if (!existing) {
      return createErrorResponse(404, `Scenario not found: ${scenarioId}`, user);
    }
    
    await deleteScenario(scenarioId);
    
    const response = {
      message: 'Scenario deleted successfully',
      scenarioId,
    };
    const responseValidation = validateResponse(contract.deleteScenario, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error deleting scenario:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

