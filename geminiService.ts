
import { GoogleGenAI } from "@google/genai";

export class GeminiCoachService {
  private ai: GoogleGenAI;

  constructor() {
    // Initialize with direct process.env.API_KEY as per instructions
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async getCommentary(score: number, lines: number, level: number, status: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `The player is playing Tetris. 
          Current Stats: Score: ${score}, Lines: ${lines}, Level: ${level}, Game Status: ${status}.
          Provide a very short (max 15 words) and witty or encouraging piece of commentary as a "Cyberpunk Game Coach".`,
        config: {
          temperature: 0.8,
          topP: 0.9,
        }
      });
      // Accessing the .text property directly as per guidelines
      return response.text?.trim() || "Keep stacking those bytes, runner.";
    } catch (error) {
      console.error("Gemini Coach Error:", error);
      return "Keep stacking those bytes, runner.";
    }
  }
}
