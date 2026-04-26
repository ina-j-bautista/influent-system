//######## INFLUENT ITERATIVE CONVERGENCE ALGORITHM #########################

import { InfluentScore } from './influent-algorithm';

export interface ConvergenceResult {
  finalScores: Map<string, number>;
  iterations: number;
  converged: boolean;
}

export class InfluentIterativeAlgorithm {
  
  /**
   * Iterative INFLUENT score computation with convergence checking
   * Based on: INFLUENTₜ₊₁ = (1-d) + d × Σ(v∈in(u)) INFLUENTₜ(v) * W(v,u) * S(v,u) * E(v,u)/C(v)
   */
  static computeWithConvergence(
    users: string[],
    connectionWeights: Map<string, Map<string, number>>,  // W(v,u)
    sentimentScores: Map<string, number>,                  // S(v,u)
    engagementScores: Map<string, number>,                 // E(v,u)
    dampeningFactor: number = 0.85,
    convergenceThreshold: number = 1e-5,
    maxIterations: number = 100
  ): ConvergenceResult {
    
    const n = users.length;
    
    // Initialize: INFLUENT₀(u) = 1/|U|
    const currentScores = new Map<string, number>();
    for (const user of users) {
      currentScores.set(user, 1.0 / n);
    }
    
    let iteration = 0;
    let converged = false;
    
    console.log(`\nStarting iterative convergence (d=${dampeningFactor}, ε=${convergenceThreshold})...`);
    
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
          
          // Get out-degree normalization C(v) - sum of outgoing connection weights
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
      
      if (iteration % 10 === 0 || maxDelta < convergenceThreshold) {
        console.log(`   Iteration ${iteration}: max delta = ${maxDelta.toExponential(4)}`);
      }
      
      if (maxDelta < convergenceThreshold) {
        converged = true;
        console.log(`   ✓ Converged after ${iteration} iterations\n`);
      }
      
      // Update scores for next iteration
      for (const [user, score] of nextScores) {
        currentScores.set(user, score);
      }
    }
    
    if (!converged) {
      console.log(`   ⚠ Maximum iterations (${maxIterations}) reached without full convergence\n`);
    }
    
    return {
      finalScores: currentScores,
      iterations: iteration,
      converged
    };
  }
}
