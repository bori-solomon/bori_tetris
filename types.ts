
export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export interface Position {
  x: number;
  y: number;
}

export interface Tetromino {
  type: TetrominoType;
  shape: number[][];
  color: string;
  position: Position;
}

export interface GameState {
  grid: (string | null)[][];
  currentPiece: Tetromino | null;
  nextPiece: Tetromino;
  heldPiece: Tetromino | null;
  canHold: boolean;
  isFrozen: boolean;
  score: number;
  lines: number;
  level: number;
  status: 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'IDLE';
  config: {
    width: number;
    height: number;
    baseSpeed: number;
  };
}

export interface CoachComment {
  text: string;
  type: 'encouraging' | 'funny' | 'warning' | 'celebratory';
}
