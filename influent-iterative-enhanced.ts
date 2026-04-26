//######## INFLUENT ITERATIVE CONVERGENCE WITH LOGGING #########################

import * as fs from 'fs';
import * as path from 'path';

export interface ConvergenceResult {
  finalScores: Map<string, number>;
  iterations: number;
  converged: boolean;
  convergenceLog: IterationLog[];
}

export interface IterationLog {
  iteration: number;
  maxDelta: number;
  meanScore: number;
  minScore: number;
  maxScore: number;
  timestamp: Date;
  topUsers: Array<{ user_id: string; score: number }>;
}

export class InfluentIterativeAlgorithm {
  
  /**
   * Iterative INFLUENT score computation with convergence checking and detailed logging
   */
  static computeWithConvergence(
    users: string[],
    userDisplayNames: Map<string, string>,  // For readable logs
    connectionWeights: Map<string, Map<string, number>>,
    sentimentScores: Map<string, number>,
    engagementScores: Map<string, number>,
    dampeningFactor: number = 0.85,
    convergenceThreshold: number = 1e-5,
    maxIterations: number = 100
  ): ConvergenceResult {
    
    const n = users.length;
    const convergenceLog: IterationLog[] = [];
    
    // Initialize: INFLUENT₀(u) = 1/|U|
    const currentScores = new Map<string, number>();
    for (const user of users) {
      currentScores.set(user, 1.0 / n);
    }
    
    // Log initial state
    const initialLog = this.createIterationLog(0, 0, currentScores, users);
    convergenceLog.push(initialLog);
    
    let iteration = 0;
    let converged = false;
    
    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║   ITERATIVE CONVERGENCE PROCESS                    ║`);
    console.log(`╚════════════════════════════════════════════════════╝`);
    console.log(`Dampening factor (d): ${dampeningFactor}`);
    console.log(`Convergence threshold (ε): ${convergenceThreshold}`);
    console.log(`Maximum iterations: ${maxIterations}\n`);
    
    console.log(`Iteration | Max Delta     | Mean Score | Min Score  | Max Score  | Status`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    
    while (iteration < maxIterations && !converged) {
      const nextScores = new Map<string, number>();
      
      // For each user u, compute INFLUENTₜ₊₁(u)
      for (const u of users) {
        let influenceSum = 0;
        
        // Sum over all incoming connections: Σ(v∈in(u))
        for (const v of users) {
          if (v === u) continue;
          
          // Get connection weight W(v,u)
          const wvu = connectionWeights.get(v)?.get(u) || 0;
          if (wvu === 0) continue;
          
          // Get sentiment S(v,u)
          const svu = sentimentScores.get(v) || 0.5;
          
          // Get engagement E(v,u)
          const evu = engagementScores.get(v) || 0;
          
          // Get out-degree normalization C(v)
          let cv = 0;
          const vConnections = connectionWeights.get(v);
          if (vConnections) {
            for (const weight of vConnections.values()) {
              cv += weight;
            }
          }
          
          if (cv === 0) continue;
          
          // Compute: INFLUENTₜ(v) * W(v,u) * S(v,u) * E(v,u) / C(v)
          const influenceContribution = 
            (currentScores.get(v) || 0) * wvu * svu * evu / cv;
          
          influenceSum += influenceContribution;
        }
        
        // Apply formula: INFLUENTₜ₊₁(u) = (1-d) + d * Σ
        const newScore = (1 - dampeningFactor) + dampeningFactor * influenceSum;
        nextScores.set(u, newScore);
      }
      
      // Check convergence: max |INFLUENTₜ₊₁(u) - INFLUENTₜ(u)| < ε
      let maxDelta = 0;
      for (const u of users) {
        const delta = Math.abs((nextScores.get(u) || 0) - (currentScores.get(u) || 0));
        if (delta > maxDelta) {
          maxDelta = delta;
        }
      }
      
      iteration++;
      
      // Create log entry for this iteration
      const iterationLog = this.createIterationLog(iteration, maxDelta, nextScores, users);
      convergenceLog.push(iterationLog);
      
      // Print progress
      const status = maxDelta < convergenceThreshold ? '✓ CONVERGED' : '';
      console.log(
        `${iteration.toString().padStart(9)} | ` +
        `${maxDelta.toExponential(4).padEnd(13)} | ` +
        `${iterationLog.meanScore.toFixed(6)} | ` +
        `${iterationLog.minScore.toFixed(6)} | ` +
        `${iterationLog.maxScore.toFixed(6)} | ` +
        `${status}`
      );
      
      if (maxDelta < convergenceThreshold) {
        converged = true;
      }
      
      // Update scores for next iteration
      for (const [user, score] of nextScores) {
        currentScores.set(user, score);
      }
    }
    
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);
    
    if (converged) {
      console.log(`✓ Algorithm converged after ${iteration} iterations`);
      console.log(`  Final max delta: ${convergenceLog[convergenceLog.length - 1].maxDelta.toExponential(6)}\n`);
    } else {
      console.log(`⚠ Maximum iterations (${maxIterations}) reached without full convergence`);
      console.log(`  Final max delta: ${convergenceLog[convergenceLog.length - 1].maxDelta.toExponential(6)}\n`);
    }
    
    // Save logs to file
    this.saveConvergenceLog(convergenceLog, userDisplayNames, dampeningFactor, convergenceThreshold);
    
    return {
      finalScores: currentScores,
      iterations: iteration,
      converged,
      convergenceLog
    };
  }
  
  /**
   * Create log entry for a single iteration
   */
  private static createIterationLog(
    iteration: number,
    maxDelta: number,
    scores: Map<string, number>,
    users: string[]
  ): IterationLog {
    
    const scoreArray = Array.from(scores.values());
    const meanScore = scoreArray.reduce((sum, s) => sum + s, 0) / scoreArray.length;
    const minScore = Math.min(...scoreArray);
    const maxScore = Math.max(...scoreArray);
    
    // Get top 5 users for this iteration
    const topUsers = users
      .map(user => ({ user_id: user, score: scores.get(user) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    return {
      iteration,
      maxDelta,
      meanScore,
      minScore,
      maxScore,
      timestamp: new Date(),
      topUsers
    };
  }
  
  /**
   * Save convergence log to CSV files in logs folder
   */
  private static saveConvergenceLog(
    logs: IterationLog[],
    userDisplayNames: Map<string, string>,
    dampeningFactor: number,
    convergenceThreshold: number
  ): void {
    
    const logsDir = path.join(process.cwd(), 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    // 1. Save summary CSV (iteration stats)
    const summaryPath = path.join(logsDir, `convergence_summary_${timestamp}.csv`);
    const summaryHeader = 'Iteration,Max Delta,Mean Score,Min Score,Max Score,Timestamp\n';
    const summaryRows = logs.map(log => 
      `${log.iteration},${log.maxDelta},${log.meanScore},${log.minScore},${log.maxScore},${log.timestamp.toISOString()}`
    ).join('\n');
    fs.writeFileSync(summaryPath, summaryHeader + summaryRows);
    console.log(`✓ Saved convergence summary: ${summaryPath}`);
    
    // 2. Save detailed CSV (top 5 users per iteration)
    const detailedPath = path.join(logsDir, `convergence_detailed_${timestamp}.csv`);
    const detailedHeader = 'Iteration,Rank,User ID,Display Name,Score\n';
    const detailedRows = logs.flatMap(log => 
      log.topUsers.map((user, rank) => 
        `${log.iteration},${rank + 1},${user.user_id},${userDisplayNames.get(user.user_id) || user.user_id},${user.score}`
      )
    ).join('\n');
    fs.writeFileSync(detailedPath, detailedHeader + detailedRows);
    console.log(`✓ Saved detailed rankings: ${detailedPath}`);
    
    // 3. Save parameters metadata
    const metadataPath = path.join(logsDir, `convergence_metadata_${timestamp}.txt`);
    const metadata = 
      `INFLUENT Convergence Run Metadata\n` +
      `================================\n\n` +
      `Run Timestamp: ${new Date().toISOString()}\n` +
      `Dampening Factor (d): ${dampeningFactor}\n` +
      `Convergence Threshold (ε): ${convergenceThreshold}\n` +
      `Total Iterations: ${logs[logs.length - 1].iteration}\n` +
      `Converged: ${logs[logs.length - 1].maxDelta < convergenceThreshold ? 'Yes' : 'No'}\n` +
      `Final Max Delta: ${logs[logs.length - 1].maxDelta}\n` +
      `Total Users: ${userDisplayNames.size}\n`;
    fs.writeFileSync(metadataPath, metadata);
    console.log(`✓ Saved run metadata: ${metadataPath}\n`);
  }
}
