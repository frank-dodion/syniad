export type ArmType = 'Infantry' | 'Cavalry' | 'Artillery';
export type UnitStatus = 'selected' | 'available' | 'moved' | 'unavailable';

/**
 * Player number enum - used for identifying players in a game
 */
export enum PlayerNumber {
  Player1 = 1,
  Player2 = 2,
}

/**
 * Terrain type enum - used for hex terrain types
 */
export enum TerrainType {
  Clear = 'clear',
  Mountain = 'mountain',
  Forest = 'forest',
  Water = 'water',
  Desert = 'desert',
  Swamp = 'swamp',
  Town = 'town',
}

/**
 * Hex side enum - used for identifying hex sides (0-5)
 * Used as bit positions in bitmasks for rivers and roads
 * For flat-top hexes: 0=top (North), 1=top right, 2=bottom right, 3=bottom (South), 4=bottom left, 5=top left
 */
export enum HexSide {
  Top = 0,           // North
  TopRight = 1,      // Northeast
  BottomRight = 2,   // Southeast
  Bottom = 3,        // South
  BottomLeft = 4,    // Southwest
  TopLeft = 5,       // Northwest
}

/**
 * Game phase enum - represents the current phase of the game
 */
export enum GamePhase {
  Movement = 'movement',
  Combat = 'combat',
  // Future phases can be added here
  // Reinforcement = 'reinforcement',
  // Supply = 'supply',
}

/**
 * Game action enum - represents the current action within a phase
 */
export enum GameAction {
  // Movement Phase actions
  SelectUnit = 'selectUnit',
  SelectDestinationHex = 'selectDestinationHex',
  
  // Combat Phase actions
  SelectTarget = 'selectTarget',
  SelectAttacker = 'selectAttacker',
  
  // Future actions can be added here
}

export interface Hex {
  column: number;
  row: number;
  terrain: TerrainType;
  rivers: number; // Bitmask: 0=top (North), 1=top right, 2=bottom right, 3=bottom (South), 4=bottom left, 5=top left
  roads: number; // Bitmask: 0=top (North), 1=top right, 2=bottom right, 3=bottom (South), 4=bottom left, 5=top left
}

export interface ScenarioUnit {
  id: string; // UUID
  player: PlayerNumber;
  combatStrength: number; // Integer 0-9
  movementAllowance: number; // Integer 0-9
  arm: ArmType;
  column: number; // 0-indexed hex column
  row: number; // 0-indexed hex row
  status?: UnitStatus; // Optional: selected (yellow border), available (white border), moved (dark gray border), unavailable (dark gray border)
  startingColumn?: number; // Starting column at the beginning of the current phase
  startingRow?: number; // Starting row at the beginning of the current phase
}

export interface Scenario {
  scenarioId: string;
  title: string;
  description: string;
  columns: number;
  rows: number;
  turns: number;
  hexes?: Hex[]; // Optional array of hex terrain definitions
  units?: ScenarioUnit[]; // Optional array of scenario units
  creatorId: string; // User ID of the scenario creator (required)
  creator?: Player; // Creator info (optional, for display)
  createdAt: string;
  updatedAt?: string;
  queryKey?: string; // Index field: constant "ALL_SCENARIOS" for efficient querying without Scan
}

/**
 * Game state - dynamic data that changes during gameplay
 */
export interface GameState {
  /** Current turn number - increments during gameplay */
  turnNumber: number;
  
  /** Active player - whose turn it is */
  activePlayer: PlayerNumber;
  
  /** Current game phase (e.g., Movement, Combat) */
  phase: GamePhase;
  
  /** Current action within the phase (e.g., SelectUnit, SelectDestinationHex) */
  action: GameAction;
  
  /** Units state for the current game (positions and statuses) */
  units: ScenarioUnit[];

  /** Currently selected unit (if any) */
  selectedUnitId?: string;

  /** Currently selected hex (if any) */
  selectedHex?: { column: number; row: number };
  
  // Future: Add more gameplay state here
  // unitPositions?: Map<string, { column: number; row: number }>;
}

/**
 * Game database record structure
 * 
 * Organized into:
 * - Fixed/Static: Set at creation, rarely changes (title can be renamed, but not during gameplay)
 * - Dynamic: Changes during gameplay (gameState object)
 */
export interface Game {
  // ============================================
  // FIXED/STATIC DATA (Set at creation, rarely changes)
  // ============================================
  
  /** Unique game identifier - never changes */
  gameId: string;
  
  /** Optional custom game title - can be renamed but not during gameplay */
  title?: string;
  
  /** Reference to original scenario (audit only, never used after creation) */
  scenarioId: string;
  
  /** Complete snapshot of scenario at game creation - immutable, never changes */
  scenarioSnapshot: Scenario;
  
  /** Player 1 (creator) - set at creation, never changes */
  player1: Player;
  
  /** Player 2 - set when joining, doesn't change during gameplay */
  player2?: Player;
  
  /** Index field: equals player1.userId for efficient queries - never changes */
  player1Id: string;
  
  /** Index field: equals player2.userId when player2 exists - set when joining, doesn't change during gameplay */
  player2Id?: string;
  
  /** Timestamp when game was created - never changes */
  createdAt: string;
  
  // ============================================
  // DYNAMIC DATA (Changes during gameplay)
  // ============================================
  
  /** Game state - all dynamic gameplay data */
  gameState: GameState;
  
  /** Timestamp of last game state update - changes whenever game state changes */
  updatedAt?: string;
}

/**
 * Derive game status dynamically based on game state
 * - 'waiting': Game has no player2 yet
 * - 'active': Game has player2 (both players have joined)
 * - 'finished': Game has ended (not yet implemented - would check turnNumber vs scenario.turns)
 */
export function getGameStatus(game: Game): 'waiting' | 'active' | 'finished' {
  if (!game.player2) {
    return 'waiting';
  }
  // TODO: Add logic to determine 'finished' status (e.g., game.gameState.turnNumber > scenarioSnapshot.turns)
  return 'active';
}

export interface Player {
  name: string;
  userId: string; // Required: Cognito sub (unique, immutable identifier)
  // Note: playerIndex is implicit - player1 is always index 1, player2 is always index 2
}

export interface GameDefinition {
  gameDefId: string;
  name: string;
  description: string;
  category: string;
  maxPlayers: number;
  minPlayers: number;
  map: MapDefinition;
  startingUnits: StartingUnit[];
  unitTypes: Record<string, UnitType>;
}

export interface MapDefinition {
  width: number;
  height: number;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface StartingUnit {
  playerIndex: number;
  units: {
    unitType: string;
    hexX: number;
    hexY: number;
  }[];
}

export interface UnitType {
  name: string;
  movement: number;
  attack: number;
  defense: number;
  health: number;
  range: number;
  cost?: number;
}

export interface Unit {
  unitId: string;
  unitType: string;
  ownerPlayerIndex: number;
  hexX: number;
  hexY: number;
  currentHealth: number;
  maxHealth: number;
  hasMoved?: boolean;
  hasAttacked?: boolean;
}

