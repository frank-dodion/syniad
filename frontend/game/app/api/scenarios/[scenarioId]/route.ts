import { NextRequest } from 'next/server';
import { extractUserIdentity, createApiResponse } from '@/lib/api-auth';
import { getScenario, updateScenario, deleteScenario } from '@/lib/api-db';
import { Scenario, Hex } from '../../../../../../shared/types';

// GET /api/scenarios/[scenarioId] - Get a specific scenario
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    const { scenarioId } = await params;
    
    if (!scenarioId) {
      return createApiResponse(400, {
        error: 'Missing scenarioId in path'
      }, user);
    }

    const scenario = await getScenario(scenarioId);
    
    if (!scenario) {
      return createApiResponse(404, {
        error: 'Scenario not found',
        scenarioId
      }, user);
    }
    
    return createApiResponse(200, {
      scenarioId,
      scenario
    }, user);
  } catch (error) {
    console.error('Error getting scenario:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
      return createApiResponse(401, {
        error: 'Authentication required'
      });
    }
    
    const { scenarioId } = await params;
    
    if (!scenarioId) {
      return createApiResponse(400, {
        error: 'Missing scenarioId in path'
      }, user);
    }

    const existing = await getScenario(scenarioId);
    if (!existing) {
      return createApiResponse(404, {
        error: 'Scenario not found',
        scenarioId
      }, user);
    }

    const body = await request.json();
    const { title, description, columns, rows, turns, hexes } = body;
    
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
    
    return createApiResponse(200, {
      scenarioId,
      scenario: updatedScenario
    }, user);
  } catch (error) {
    console.error('Error updating scenario:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
      return createApiResponse(401, {
        error: 'Authentication required'
      });
    }
    
    const { scenarioId } = await params;
    
    if (!scenarioId) {
      return createApiResponse(400, {
        error: 'Missing scenarioId in path'
      }, user);
    }

    const existing = await getScenario(scenarioId);
    if (!existing) {
      return createApiResponse(404, {
        error: 'Scenario not found',
        scenarioId
      }, user);
    }
    
    await deleteScenario(scenarioId);
    
    return createApiResponse(200, {
      message: 'Scenario deleted successfully',
      scenarioId
    }, user);
  } catch (error) {
    console.error('Error deleting scenario:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

