import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { saveScenario } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';
import { Scenario, Hex, TerrainType } from '../shared/types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);
    
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
    
    // Validate required fields
    const { title, description, columns, rows, turns, hexes } = body;
    
    if (!title || typeof title !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing or invalid title field',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (!description || typeof description !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing or invalid description field',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (!columns || typeof columns !== 'number' || columns < 1) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing or invalid columns field (must be a positive number)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (!rows || typeof rows !== 'number' || rows < 1) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing or invalid rows field (must be a positive number)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (!turns || typeof turns !== 'number' || turns < 1) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing or invalid turns field (must be a positive number)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    // Validate and process hexes if provided
    let processedHexes: Hex[] | undefined;
    if (hexes !== undefined) {
      if (!Array.isArray(hexes)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            error: 'hexes must be an array',
            user: {
              userId: user.userId,
              username: user.username,
              email: user.email
            }
          })
        };
      }
      
      processedHexes = [];
      const validTerrainTypes: TerrainType[] = ['clear', 'mountain', 'forest', 'water', 'desert', 'swamp'];
      
      for (let i = 0; i < hexes.length; i++) {
        const hex = hexes[i];
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
        
        if (hex.row < 0 || hex.row >= rows) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: `Invalid hex at index ${i}: row ${hex.row} is out of bounds (must be 0-${rows - 1})`,
              user: {
                userId: user.userId,
                username: user.username,
                email: user.email
              }
            })
          };
        }
        
        if (hex.column < 0 || hex.column >= columns) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: `Invalid hex at index ${i}: column ${hex.column} is out of bounds (must be 0-${columns - 1})`,
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
    }
    
    // If hexes not provided, generate default grid with all clear terrain
    if (processedHexes === undefined) {
      processedHexes = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          processedHexes.push({
            row,
            column,
            terrain: 'clear' as TerrainType
          });
        }
      }
    }
    
    // Create scenario
    const scenarioId = uuidv4();
    const scenario: Scenario = {
      scenarioId,
      title,
      description,
      columns,
      rows,
      turns,
      hexes: processedHexes,
      createdAt: new Date().toISOString()
    };
    
    await saveScenario(scenario);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        scenarioId, 
        scenario,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        }
      })
    };
  } catch (error) {
    console.error('Error creating scenario:', error);
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

