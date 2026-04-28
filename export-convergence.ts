import fs from 'fs';

export class ConvergenceLogger {
  private logs: Array<{iteration: number; userId: string; score: number; delta: number}> = [];
  
  logIteration(iteration: number, scores: Map<string, number>, prevScores: Map<string, number>) {
    for (const [userId, score] of scores) {
      const prevScore = prevScores.get(userId) || 0;
      const delta = Math.abs(score - prevScore);
      
      this.logs.push({
        iteration,
        userId,
        score,
        delta
      });
    }
  }
  
  exportToCSV(filename: string) {
    const csv = [
      'Iteration,UserId,Score,Delta',
      ...this.logs.map(log => 
        `${log.iteration},${log.userId},${log.score},${log.delta}`
      )
    ].join('\n');
    
    fs.writeFileSync(filename, csv);
    console.log(`\n📊 Exported convergence log to ${filename}`);
  }
}