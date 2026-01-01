
import { TetrominoType, Tetromino } from './types';

export const INITIAL_WIDTH = 10;
export const INITIAL_HEIGHT = 20;

export const TETROMINOES: Record<TetrominoType, { shape: number[][]; color: string }> = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-cyan-400 border-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]',
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: 'bg-blue-600 border-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.8)]',
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: 'bg-orange-500 border-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.8)]',
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: 'bg-yellow-400 border-yellow-200 shadow-[0_0_10px_rgba(250,204,21,0.8)]',
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: 'bg-green-500 border-green-300 shadow-[0_0_10px_rgba(34,197,94,0.8)]',
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: 'bg-purple-500 border-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.8)]',
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: 'bg-red-500 border-red-300 shadow-[0_0_10px_rgba(239,68,68,0.8)]',
  },
};

export const COLORS = {
  grid: 'bg-slate-900',
  border: 'border-slate-800',
  ghost: 'bg-white/10 border-white/20',
};

export const SCORING = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};
