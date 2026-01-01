
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Tetromino, Position, TetrominoType } from './types';
import { TETROMINOES, INITIAL_WIDTH, INITIAL_HEIGHT, SCORING, COLORS } from './constants';
import { GeminiCoachService } from './geminiService';

// --- Utility Components ---

const Block: React.FC<{ color: string; isGhost?: boolean }> = ({ color, isGhost }) => (
  <div className={`w-full h-full border rounded-sm transition-all duration-150 ${color} ${isGhost ? 'opacity-20' : ''}`} />
);

const PiecePreview: React.FC<{ piece: Tetromino | null; label: string }> = ({ piece, label }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-widest text-slate-500 px-2 font-bold">{label}</div>
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center min-h-[100px] w-32 shadow-inner relative overflow-hidden">
        {piece ? (
          <div className="grid grid-cols-4 grid-rows-4 gap-1">
            {piece.shape.map((row, y) => 
              row.map((cell, x) => (
                <div key={`${x}-${y}`} className="w-5 h-5">
                  {cell ? <Block color={piece.color} /> : null}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="text-slate-700 text-[10px] uppercase font-mono italic text-center">Empty</div>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    grid: Array.from({ length: INITIAL_HEIGHT }, () => Array(INITIAL_WIDTH).fill(null)),
    currentPiece: null,
    nextPiece: {
      type: 'I',
      shape: TETROMINOES['I'].shape,
      color: TETROMINOES['I'].color,
      position: { x: 0, y: 0 }
    },
    heldPiece: null,
    canHold: true,
    isFrozen: false,
    score: 0,
    lines: 0,
    level: 1,
    status: 'IDLE',
    config: { 
      width: INITIAL_WIDTH, 
      height: INITIAL_HEIGHT,
      baseSpeed: 500
    }
  });

  const [coachComment, setCoachComment] = useState<string>("Neural Link calibrated. Proceed with caution.");
  const coachService = useRef(new GeminiCoachService());
  const gameLoopRef = useRef<number | null>(null);

  // --- Constants for styling ---
  const FROZEN_COLOR = 'bg-red-600 border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.9)]';

  // --- Helper Functions ---

  const getRandomPiece = useCallback((width: number): Tetromino => {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const type = types[Math.floor(Math.random() * types.length)];
    const def = TETROMINOES[type];
    return {
      type,
      shape: def.shape,
      color: def.color,
      position: { x: Math.floor(width / 2) - 2, y: 0 }
    };
  }, []);

  const checkCollision = useCallback((piece: Tetromino, grid: (string | null)[][], moveX = 0, moveY = 0, newShape?: number[][]) => {
    const shape = newShape || piece.shape;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const nextX = piece.position.x + x + moveX;
          const nextY = piece.position.y + y + moveY;
          if (
            nextX < 0 || 
            nextX >= grid[0].length || 
            nextY >= grid.length ||
            (nextY >= 0 && grid[nextY][nextX])
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  const toggleFreeze = useCallback(() => {
    setGameState(prev => {
      if (prev.status !== 'PLAYING') return prev;
      return {
        ...prev,
        isFrozen: !prev.isFrozen
      };
    });
  }, []);

  const rotate = useCallback((clockwise: boolean) => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING' || prev.isFrozen) return prev;
      
      const newShape = prev.currentPiece.shape[0].map((_, index) =>
        prev.currentPiece!.shape.map(row => row[index])
      );
      
      if (clockwise) {
        newShape.forEach(row => row.reverse());
      } else {
        newShape.reverse();
      }

      if (!checkCollision(prev.currentPiece, prev.grid, 0, 0, newShape)) {
        return {
          ...prev,
          currentPiece: { ...prev.currentPiece, shape: newShape }
        };
      }
      return prev;
    });
  }, [checkCollision]);

  const lockPiece = useCallback((state: GameState): GameState => {
    const { currentPiece, grid, nextPiece, config, score, lines, level } = state;
    if (!currentPiece) return state;

    const newGrid = grid.map(row => [...row]);
    currentPiece.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          const gridY = currentPiece.position.y + y;
          const gridX = currentPiece.position.x + x;
          if (gridY >= 0) {
            newGrid[gridY][gridX] = currentPiece.color;
          }
        }
      });
    });

    let clearedLinesCount = 0;
    const filteredGrid = newGrid.filter(row => {
      if (row.every(cell => cell !== null)) {
        clearedLinesCount++;
        return false;
      }
      return true;
    });

    while (filteredGrid.length < config.height) {
      filteredGrid.unshift(Array(config.width).fill(null));
    }

    const newScore = score + (clearedLinesCount > 0 ? (SCORING[clearedLinesCount as keyof typeof SCORING] || 0) * level : 0);
    const newLinesTotal = lines + clearedLinesCount;
    const newLevel = Math.floor(newLinesTotal / 10) + 1;

    const spawnPos = { x: Math.floor(config.width / 2) - 2, y: 0 };
    if (checkCollision({ ...nextPiece, position: spawnPos }, filteredGrid)) {
      return {
        ...state,
        grid: filteredGrid,
        currentPiece: null,
        status: 'GAME_OVER',
        score: newScore,
        isFrozen: false
      };
    }

    return {
      ...state,
      grid: filteredGrid,
      currentPiece: { ...nextPiece, position: spawnPos },
      nextPiece: getRandomPiece(config.width),
      canHold: true,
      isFrozen: false,
      score: newScore,
      lines: newLinesTotal,
      level: newLevel
    };
  }, [checkCollision, getRandomPiece]);

  const move = useCallback((dx: number, dy: number) => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING') return prev;
      if (prev.isFrozen && dy !== 0) return prev; 

      if (!checkCollision(prev.currentPiece, prev.grid, dx, dy)) {
        return {
          ...prev,
          currentPiece: { 
            ...prev.currentPiece, 
            position: { 
              x: prev.currentPiece.position.x + dx, 
              y: prev.currentPiece.position.y + dy 
            } 
          }
        };
      }

      if (dy > 0) {
        return lockPiece(prev);
      }

      return prev;
    });
  }, [checkCollision, lockPiece]);

  const hardDrop = useCallback(() => {
    setGameState(prev => {
      if (!prev.currentPiece || prev.status !== 'PLAYING') return prev;
      let dropY = 0;
      while (!checkCollision(prev.currentPiece, prev.grid, 0, dropY + 1)) {
        dropY++;
      }
      const droppedPiece = {
        ...prev.currentPiece,
        position: { x: prev.currentPiece.position.x, y: prev.currentPiece.position.y + dropY }
      };
      return lockPiece({ ...prev, currentPiece: droppedPiece });
    });
  }, [checkCollision, lockPiece]);

  const holdPiece = useCallback(() => {
    setGameState(prev => {
      if (!prev.currentPiece || !prev.canHold || prev.status !== 'PLAYING') return prev;

      const newHeldType = prev.currentPiece.type;
      const def = TETROMINOES[newHeldType];
      const newHeldPiece: Tetromino = {
        type: newHeldType,
        shape: def.shape,
        color: def.color,
        position: { x: 0, y: 0 }
      };

      const spawnPos = { x: Math.floor(prev.config.width / 2) - 2, y: 0 };

      if (!prev.heldPiece) {
        return {
          ...prev,
          heldPiece: newHeldPiece,
          currentPiece: { ...prev.nextPiece, position: spawnPos },
          nextPiece: getRandomPiece(prev.config.width),
          canHold: false
        };
      } else {
        const heldType = prev.heldPiece.type;
        const heldDef = TETROMINOES[heldType];
        const nextFromHold: Tetromino = {
          type: heldType,
          shape: heldDef.shape,
          color: heldDef.color,
          position: spawnPos
        };
        return {
          ...prev,
          heldPiece: newHeldPiece,
          currentPiece: nextFromHold,
          canHold: false
        };
      }
    });
  }, [getRandomPiece]);

  // --- Game Loop and Effects ---

  useEffect(() => {
    if (gameState.status === 'PLAYING' && !gameState.isFrozen) {
      const currentSpeed = Math.max(50, gameState.config.baseSpeed * Math.pow(0.9, gameState.level - 1));
      gameLoopRef.current = window.setInterval(() => {
        move(0, 1);
      }, currentSpeed);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [gameState.status, gameState.level, gameState.config.baseSpeed, gameState.isFrozen, move]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState.status !== 'PLAYING') return;

      switch (e.code) {
        case 'ArrowLeft':
          move(-1, 0);
          break;
        case 'ArrowRight':
          move(1, 0);
          break;
        case 'ArrowDown':
          move(0, 1);
          break;
        case 'ArrowUp':
          rotate(true);
          break;
        case 'Space':
          hardDrop();
          break;
        case 'KeyC':
          holdPiece();
          break;
        case 'KeyF':
          toggleFreeze();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.status, move, rotate, hardDrop, holdPiece, toggleFreeze]);

  useEffect(() => {
    if (gameState.status === 'PLAYING' || gameState.status === 'GAME_OVER') {
      const fetchComment = async () => {
        const comment = await coachService.current.getCommentary(
          gameState.score, 
          gameState.lines, 
          gameState.level, 
          gameState.status
        );
        setCoachComment(comment);
      };
      
      // Fetch commentary when status or level changes
      fetchComment();
    }
  }, [gameState.status, gameState.level]);

  const startGame = () => {
    const initialWidth = INITIAL_WIDTH;
    setGameState(prev => ({
      ...prev,
      grid: Array.from({ length: INITIAL_HEIGHT }, () => Array(initialWidth).fill(null)),
      currentPiece: { ...getRandomPiece(initialWidth), position: { x: Math.floor(initialWidth / 2) - 2, y: 0 } },
      nextPiece: getRandomPiece(initialWidth),
      status: 'PLAYING',
      score: 0,
      lines: 0,
      level: 1,
      isFrozen: false,
      heldPiece: null,
      canHold: true
    }));
  };

  const getGhostPosition = () => {
    if (!gameState.currentPiece) return null;
    let dropY = 0;
    while (!checkCollision(gameState.currentPiece, gameState.grid, 0, dropY + 1)) {
      dropY++;
    }
    return {
      x: gameState.currentPiece.position.x,
      y: gameState.currentPiece.position.y + dropY
    };
  };

  const ghostPos = getGhostPosition();

  // --- Rendering ---

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-mono select-none overflow-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#334155_1px,transparent_1px)] bg-[length:24px_24px]" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-start max-w-5xl w-full">
        
        {/* Left Panel: Status & Hold */}
        <div className="flex flex-col gap-6 w-full lg:w-48">
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm shadow-2xl">
            <h1 className="text-2xl font-black italic tracking-tighter text-cyan-400 mb-2">NEON<br/>STACKER</h1>
            <div className="h-1 w-12 bg-cyan-500 rounded-full mb-6 shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Score</div>
                <div className="text-2xl font-mono text-white tabular-nums">{gameState.score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Level</div>
                <div className="text-2xl font-mono text-white tabular-nums">{gameState.level}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Lines</div>
                <div className="text-2xl font-mono text-white tabular-nums">{gameState.lines}</div>
              </div>
            </div>
          </div>

          <PiecePreview piece={gameState.heldPiece} label="Stored" />
          
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
             <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Controls</div>
             <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                <span>Arrows</span><span>Move/Rot</span>
                <span>Space</span><span>Drop</span>
                <span>C</span><span>Hold</span>
                <span>F</span><span>Freeze</span>
             </div>
          </div>
        </div>

        {/* Center: Game Grid */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-b from-cyan-500/20 to-purple-500/20 rounded-2xl blur opacity-75" />
          
          <div className="relative bg-slate-950 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div 
              className="grid gap-[1px] bg-slate-800" 
              style={{ 
                gridTemplateColumns: `repeat(${gameState.config.width}, minmax(0, 1fr))`,
                width: '320px',
                height: '640px'
              }}
            >
              {gameState.grid.map((row, y) => 
                row.map((cell, x) => {
                  let blockColor = cell;
                  let isGhost = false;

                  // Render ghost piece
                  if (!blockColor && ghostPos && gameState.currentPiece) {
                    const { shape } = gameState.currentPiece;
                    const relativeX = x - ghostPos.x;
                    const relativeY = y - ghostPos.y;
                    if (
                      relativeX >= 0 && relativeX < shape[0].length &&
                      relativeY >= 0 && relativeY < shape.length &&
                      shape[relativeY][relativeX]
                    ) {
                      blockColor = gameState.currentPiece.color;
                      isGhost = true;
                    }
                  }

                  // Render current piece
                  if (gameState.currentPiece) {
                    const { shape, position } = gameState.currentPiece;
                    const relativeX = x - position.x;
                    const relativeY = y - position.y;
                    if (
                      relativeX >= 0 && relativeX < shape[0].length &&
                      relativeY >= 0 && relativeY < shape.length &&
                      shape[relativeY][relativeX]
                    ) {
                      blockColor = gameState.isFrozen ? FROZEN_COLOR : gameState.currentPiece.color;
                      isGhost = false;
                    }
                  }

                  return (
                    <div key={`${x}-${y}`} className="bg-slate-900/50">
                      {blockColor && <Block color={blockColor} isGhost={isGhost} />}
                    </div>
                  );
                })
              )}
            </div>

            {/* Overlays */}
            {gameState.status !== 'PLAYING' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
                {gameState.status === 'GAME_OVER' ? (
                  <>
                    <div className="text-red-500 text-sm font-bold tracking-widest uppercase mb-2 animate-pulse">Critical Failure</div>
                    <div className="text-4xl font-black text-white mb-8 italic">CONNECTION LOST</div>
                    <div className="text-slate-400 text-sm mb-8 tabular-nums">Score: {gameState.score.toLocaleString()}</div>
                  </>
                ) : (
                  <>
                    <div className="text-cyan-400 text-sm font-bold tracking-widest uppercase mb-2">System Ready</div>
                    <div className="text-4xl font-black text-white mb-12 italic uppercase">initialize_link</div>
                  </>
                )}
                <button 
                  onClick={startGame}
                  className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-bold transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(8,145,178,0.5)]"
                >
                  {gameState.status === 'GAME_OVER' ? 'RETRY_SESSION' : 'START_MISSION'}
                </button>
              </div>
            )}

            {gameState.isFrozen && gameState.status === 'PLAYING' && (
              <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
                <div className="bg-red-600/20 border border-red-500/50 px-4 py-1 rounded-full text-red-500 text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse backdrop-blur-sm">
                  System Frozen
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Next & Coach */}
        <div className="flex flex-col gap-6 w-full lg:w-64">
          <PiecePreview piece={gameState.nextPiece} label="Up Next" />
          
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
              <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Coach Interface</div>
            </div>
            
            <div className="text-sm text-slate-300 italic font-mono leading-relaxed flex-1">
              "{coachComment}"
            </div>

            <div className="mt-6 pt-6 border-t border-slate-800/50 flex flex-col gap-1">
              <div className="flex justify-between text-[10px] uppercase text-slate-600">
                <span>Signal Strength</span>
                <span>98%</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 w-[98%] shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
