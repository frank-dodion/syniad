import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getScenario, updateScenario } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';
import { Scenario, Hex, TerrainType } from '../shared/types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);
    
    // Extract scenarioId from path parameters
    const scenarioId = event.pathParameters?.scenarioId;
    
    if (!scenarioId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing scenarioId in path',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Check if scenario exists
    const existing = await getScenario(scenarioId);
    if (!existing) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Scenario not found',
          scenarioId,
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            error: 'Invalid JSON in request body',
            user: {
              userId: user.userId,
              username: user.username,
              email: user.email
            }
          })
        };
      }
    }
    
    // Build updated scenario - merge with existing
    const updatedScenario: Scenario = {
      ...existing,
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.columns !== undefined && { columns: body.columns }),
      ...(body.rows !== undefined && { rows: body.rows }),
      ...(body.turns !== undefined && { turns: body.turns }),
      ...(body.hexes !== undefined && { hexes: undefined }) // Will be processed below
    };
    
    // Validate updated fields
    if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Invalid title field',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (body.description !== undefined && typeof body.description !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Invalid description field',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (body.columns !== undefined && (typeof body.columns !== 'number' || body.columns < 1)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Invalid columns field (must be a positive number)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (body.rows !== undefined && (typeof body.rows !== 'number' || body.rows < 1)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Invalid rows field (must be a positive number)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (body.turns !== undefined && (typeof body.turns !== 'number' || body.turns < 1)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Invalid turns field (must be a positive number)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    // Use updated rows/columns for hex validation if they were changed, otherwise use existing
    const finalRows = updatedScenario.rows;
    const finalColumns = updatedScenario.columns;
    
    // Validate and process hexes if provided
    if (body.hexes !== undefined) {
      if (body.hexes === null) {
        updatedScenario.hexes = undefined; // Allow clearing hexes
      } else if (!Array.isArray(body.hexes)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            error: 'hexes must be an array or null',
            user: {
              userId: user.userId,
              username: user.username,
              email: user.email
            }
          })
        };
      } else {
        const processedHexes: Hex[] = [];
        const validTerrainTypes: TerrainType[] = ['clear', 'mountain', 'forest', 'water', 'desert', 'swamp'];
        
        for (let i = 0; i < body.hexes.length; i++) {
          const hex = body.hexes[i];
          if (!hex || typeof hex.row !== 'number' || typeof hex.column !== 'number' || typeof hex.terrain !== 'string') {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ 
                error: `Invalid hex at index ${i}: must have row (number), column (number), and terrain (string)`,
                user: {
                  userId: user.userId,
                  username: user.username,
                  email: user.email
                }
              })
            };
          }
          
          if (hex.row < 0 || hex.row >= finalRows) {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ 
                error: `Invalid hex at index ${i}: row ${hex.row} is out of bounds (must be 0-${finalRows - 1})`,
                user: {
                  userId: user.userId,
                  username: user.username,
                  email: user.email
                }
              })
            };
          }
          
          if (hex.column < 0 || hex.column >= finalColumns) {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ 
                error: `Invalid hex at index ${i}: column ${hex.column} is out of bounds (must be 0-${finalColumns - 1})`,
                user: {
                  userId: user.userId,
                  username: user.username,
                  email: user.email
                }
              })
            };
          }
          
          if (!validTerrainTypes.includes(hex.terrain as TerrainType)) {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ 
                error: `Invalid hex at index ${i}: terrain "${hex.terrain}" is not valid. Must be one of: ${validTerrainTypes.join(', ')}`,
                user: {
                  userId: user.userId,
                  username: user.username,
                  email: user.email
                }
              })
            };
          }
          
          processedHexes.push({
            row: hex.row,
            column: hex.column,
            terrain: hex.terrain as TerrainType
          });
        }
        
        updatedScenario.hexes = processedHexes;
      }
    }
    
    // Update scenario
    await updateScenario(updatedScenario);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        scenarioId,
        scenario: updatedScenario,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        }
      })
    };
  } catch (error) {
    console.error('Error updating scenario:', error);
    
    // Handle specific error messages
    if (error instanceof Error && error.message === 'Scenario not found') {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: error.message,
          user: extractUserIdentity(event)
        })
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        user: extractUserIdentity(event)
      })
    };
  }
};

