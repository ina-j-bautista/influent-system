//######## INFLUENT ITERATIVE CONVERGENCE ALGORITHM #########################

import { InfluentScore } from './influent-algorithm';

export interface ConvergenceResult {
  finalScores: Map<string, number>;
  iterations: number;
  converged: boolean;
}

export interface ConvergenceLogger {
  logIteration(iteration: number, scores: Map<string, number>, prevScores: Map<string, number>): void;
}

export class InfluentIterativeAlgorithm {
  
  /**
   * Iterative INFLUENT score computation with convergence checking
   * Based on exact thesis formula:
   * INFLUENTₜ₊₁(u) = (1-d) + d × Σ(v∈in(u)) [INFLUENTₜ(v) * W(v,u) * S(v,u) * E(v,u)] / C(v)
   * 
   * Where:
   * - W(v,u) = Connection weight (normalized: Σ W(v,u) = 1 for all outgoing connections)
   * - S(v,u) = Sentiment score [0, 1]
   * - E(v,u) = Engagement score with temporal decay: E(v,u) * e^(-λΔt)
   * - C(v) = Normalization factor = 1 (since weights already sum to 1)
   */
  static computeWithConvergence(
    users: string[],
    connectionWeights: Map<string, Map<string, number>>,  // W(v,u) - already normalized
    sentimentScores: Map<string, number>,                  // S(v,u) ∈ [0, 1]
    engagementScores: Map<string, number>,                 // E(v,u) - normalized
    dampeningFactor: number = 0.85,                        // d
    convergenceThreshold: number = 1e-6,                   // ε (from your diagram: 10^-6)
    maxIterations: number = 200,
    logger?: ConvergenceLogger
  ): ConvergenceResult {
    
    const n = users.length;
    
    // Initialize: INFLUENT₀(u) = 1/|U|
    const currentScores = new Map<string, number>();
    for (const user of users) {
      currentScores.set(user, 1.0 / n);
    }
    
    let iteration = 0;
    let converged = false;
    
    console.log(`\n🔄 Starting INFLUENT convergence (d=${dampeningFactor}, ε=${convergenceThreshold})...`);
    console.log(`📊 Users: ${n}, Max iterations: ${maxIterations}\n`);
    
    while (iteration < maxIterations && !converged) {
      const nextScores = new Map<string, number>();
      
      // For each user u, compute INFLUENTₜ₊₁(u)
      for (const u of users) {
        let influenceSum = 0;
        
        // Sum over all incoming connections: Σ(v∈in(u))
        for (const v of users) {
          if (v === u) continue;
          
          // Get connection weight W(v,u) - already normalized to sum to 1
          const wvu = connectionWeights.get(v)?.get(u) || 0;
          if (wvu === 0) continue;
          
          // Get sentiment S(v,u) ∈ [0, 1]
          const svu = sentimentScores.get(v) || 0.5;
          
          // Get engagement E(v,u) - already normalized to [0, 1]
          const evu = engagementScores.get(v) || 0;
          
          // C(v) = 1 since we already normalized connection weights to sum to 1
          const cv = 1.0;
          
          // Compute influence contribution: INFLUENTₜ(v) * W(v,u) * S(v,u) * E(v,u) / C(v)
          const influenceContribution = 
            (currentScores.get(v) || 0) * wvu * svu * evu / cv;
          
          influenceSum += influenceContribution;
        }
        
        // Apply formula: INFLUENTₜ₊₁(u) = (1-d) + d * Σ
        const newScore = (1 - dampeningFactor) + dampeningFactor * influenceSum;
        nextScores.set(u, newScore);
      }
      
      // Log iteration if logger provided
      if (logger) {
        logger.logIteration(iteration + 1, nextScores, currentScores);
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
      
      // Log progress every 10 iterations or when close to convergence
      if (iteration % 10 === 0 || maxDelta < convergenceThreshold * 10) {
        console.log(`   Iteration ${iteration}: max Δ = ${maxDelta.toExponential(4)}`);
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
      console.log(`   ⚠️  Reached max iterations (${maxIterations}) without full convergence`);
      console.log(`   Final max delta: ${
        Math.max(...Array.from(users).map(u => 
          Math.abs((currentScores.get(u) || 0) - 1.0/n)
        ))
      }\n`);
    }
    
    return {
      finalScores: currentScores,
      iterations: iteration,
      converged
    };
  }
}
