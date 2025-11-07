import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { Game, Scenario, Hex, Player } from './types';

const c = initContract();

// Zod schemas for validation
const TerrainTypeSchema = z.enum(['clear', 'mountain', 'forest', 'water', 'desert', 'swamp']);

const HexSchema: z.ZodType<Hex> = z.object({
  row: z.number().int().min(0),
  column: z.number().int().min(0),
  terrain: TerrainTypeSchema,
});

const PlayerSchema: z.ZodType<Player> = z.object({
  name: z.string(),
  userId: z.string(),
});

const GameSchema: z.ZodType<Game> = z.object({
  gameId: z.string(),
  status: z.enum(['waiting', 'active', 'finished']),
  scenarioId: z.string(),
  player1: PlayerSchema,
  player2: PlayerSchema.optional(),
  player1Id: z.string(),
  player2Id: z.string().optional(),
  turnNumber: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const ScenarioSchema: z.ZodType<Scenario> = z.object({
  scenarioId: z.string(),
  title: z.string(),
  description: z.string(),
  columns: z.number().int().min(1),
  rows: z.number().int().min(1),
  turns: z.number().int().min(1),
  hexes: z.array(HexSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  queryKey: z.string().optional(),
});

const UserSchema = z.object({
  userId: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  user: UserSchema.optional(),
  details: z.string().optional(),
});

// Games API Contract
export const contract = c.router({
  // GET /api/games - Get all games
  getGames: {
    method: 'GET',
    path: '/api/games',
    query: z.object({
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
      nextToken: z.string().optional(),
      playerId: z.string().optional(),
      player1Id: z.string().optional(),
      player2Id: z.string().optional(),
    }),
    responses: {
      200: z.object({
        games: z.array(GameSchema),
        count: z.number().int(),
        hasMore: z.boolean(),
        nextToken: z.string().optional(),
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Get all games with optional filtering',
  },

  // POST /api/games - Create a new game
  createGame: {
    method: 'POST',
    path: '/api/games',
    body: z.object({
      scenarioId: z.string(),
    }),
    responses: {
      200: z.object({
        gameId: z.string(),
        game: GameSchema,
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Create a new game',
  },

  // GET /api/games/:gameId - Get a specific game
  getGame: {
    method: 'GET',
    path: '/api/games/:gameId',
    pathParams: z.object({
      gameId: z.string(),
    }),
    responses: {
      200: z.object({
        gameId: z.string(),
        game: GameSchema,
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      404: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Get a specific game by ID',
  },

  // DELETE /api/games/:gameId - Delete a game
  deleteGame: {
    method: 'DELETE',
    path: '/api/games/:gameId',
    pathParams: z.object({
      gameId: z.string(),
    }),
    responses: {
      200: z.object({
        message: z.string(),
        gameId: z.string(),
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      403: ErrorResponseSchema,
      404: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Delete a game (only by creator)',
  },

  // POST /api/games/:gameId/join - Join a game
  joinGame: {
    method: 'POST',
    path: '/api/games/:gameId/join',
    pathParams: z.object({
      gameId: z.string(),
    }),
    body: z.object({}), // Empty body for join endpoint
    responses: {
      200: z.object({
        gameId: z.string(),
        game: GameSchema,
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      404: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Join a game as player2',
  },

  // GET /api/scenarios - Get all scenarios
  getScenarios: {
    method: 'GET',
    path: '/api/scenarios',
    query: z.object({
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
      nextToken: z.string().optional(),
    }),
    responses: {
      200: z.object({
        scenarios: z.array(ScenarioSchema),
        count: z.number().int(),
        hasMore: z.boolean(),
        nextToken: z.string().optional(),
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Get all scenarios',
  },

  // POST /api/scenarios - Create a new scenario
  createScenario: {
    method: 'POST',
    path: '/api/scenarios',
    body: z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      columns: z.number().int().min(1),
      rows: z.number().int().min(1),
      turns: z.number().int().min(1),
      hexes: z.array(HexSchema).optional(),
    }),
    responses: {
      200: z.object({
        scenarioId: z.string(),
        scenario: ScenarioSchema,
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Create a new scenario',
  },

  // GET /api/scenarios/:scenarioId - Get a specific scenario
  getScenario: {
    method: 'GET',
    path: '/api/scenarios/:scenarioId',
    pathParams: z.object({
      scenarioId: z.string(),
    }),
    responses: {
      200: z.object({
        scenarioId: z.string(),
        scenario: ScenarioSchema,
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      404: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Get a specific scenario by ID',
  },

  // PUT /api/scenarios/:scenarioId - Update a scenario
  updateScenario: {
    method: 'PUT',
    path: '/api/scenarios/:scenarioId',
    pathParams: z.object({
      scenarioId: z.string(),
    }),
    body: z.object({
      title: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      columns: z.number().int().min(1).optional(),
      rows: z.number().int().min(1).optional(),
      turns: z.number().int().min(1).optional(),
      hexes: z.array(HexSchema).optional(),
    }),
    responses: {
      200: z.object({
        scenarioId: z.string(),
        scenario: ScenarioSchema,
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      404: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Update a scenario',
  },

  // DELETE /api/scenarios/:scenarioId - Delete a scenario
  deleteScenario: {
    method: 'DELETE',
    path: '/api/scenarios/:scenarioId',
    pathParams: z.object({
      scenarioId: z.string(),
    }),
    responses: {
      200: z.object({
        message: z.string(),
        scenarioId: z.string(),
        user: UserSchema.optional(),
      }),
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      404: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    summary: 'Delete a scenario',
  },
});

export type Contract = typeof contract;

