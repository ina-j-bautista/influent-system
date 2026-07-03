//######## INFLUENT ALGORITHM IMPLEMENTATION #########################

import {
  TwitterUser,
  TwitterPost,
  TwitterInteraction,
  AnalysisParameters,
  WeightPreferences
} from './influent-core';

export interface EngagementScore {
  user_id: string;
  raw_engagement: number;
  normalized_engagement: number;
  temporal_adjusted: number;
}

export interface ConnectionScore {
  from_user: string;
  to_user: string;
  reciprocity: number;
  frequency: number;
  verified_bonus: number;
  connection_weight: number;
}

export interface InfluentScore {
  user_id: string;
  sentiment_component: number;
  engagement_component: number;
  connection_component: number;
  influent_score: number;
}

export class InfluentAlgorithm {
  

  static computeEngagementScore(
    post: TwitterPost,
    weights: WeightPreferences,
    lambda: number,
    currentDate: Date
  ): EngagementScore {
    
 
    const S_max = 1000;
    const L_max = 5000; 
    const C_max = 500;

    const s_normalized = Math.min(post.retweet_count / S_max, 1.0);
    const l_normalized = Math.min(post.like_count / L_max, 1.0);
    const c_normalized = Math.min(post.reply_count / C_max, 1.0);

    const raw_engagement = 
      weights.ws * s_normalized +
      weights.wi * l_normalized +
      weights.wc * c_normalized;

    const delta_t_ms = currentDate.getTime() - post.created_at.getTime();
    const delta_t_days = delta_t_ms / (1000 * 60 * 60 * 24);
    
    const temporal_factor = Math.exp(-lambda * delta_t_days);
    const temporal_adjusted = raw_engagement * temporal_factor;

    return {
      user_id: post.user_id,
      raw_engagement,
      normalized_engagement: raw_engagement,
      temporal_adjusted
    };
  }

  /**
   * Formula: W(v,u) = 0.4*reciprocity + 0.4*frequency + 0.2*verified
   */
  static computeConnectionWeight(
    from_user: string,
    to_user: string,
    interactions_from_to: number,
    interactions_to_from: number,
    frequency_per_week: number,
    is_verified: boolean
  ): ConnectionScore {
    
    let reciprocity = 0;
    if (interactions_to_from > 0) {
      reciprocity = Math.min(interactions_from_to / interactions_to_from, 1.0);
    } else if (interactions_from_to > 0) {
      reciprocity = 0; 
    }

    const frequency_normalized = Math.min(frequency_per_week / 10.0, 1.0);

    const verified_bonus = is_verified ? 1.0 : 0.0;

    const connection_weight = 
      0.4 * reciprocity +
      0.4 * frequency_normalized +
      0.2 * verified_bonus;

    return {
      from_user,
      to_user,
      reciprocity,
      frequency: frequency_normalized,
      verified_bonus,
      connection_weight
    };
  }


  static buildInteractionGraph(
    users: TwitterUser[],
    interactions: TwitterInteraction[],
    timeWindow: { startDate: Date; endDate: Date }
  ): Map<string, ConnectionScore[]> {
    
    const connectionMap = new Map<string, ConnectionScore[]>();
    
    const interactionCounts = new Map<string, { to: number; from: number }>();
    
    for (const interaction of interactions) {
      const key = `${interaction.from_user}-${interaction.to_user}`;
      const reverseKey = `${interaction.to_user}-${interaction.from_user}`;
      
      if (!interactionCounts.has(key)) {
        interactionCounts.set(key, { to: 0, from: 0 });
      }
      if (!interactionCounts.has(reverseKey)) {
        interactionCounts.set(reverseKey, { to: 0, from: 0 });
      }
      
      const counts = interactionCounts.get(key)!;
      counts.to++;
      
      const reverseCounts = interactionCounts.get(reverseKey)!;
      reverseCounts.from++;
    }

    const windowDurationWeeks = 
      (timeWindow.endDate.getTime() - timeWindow.startDate.getTime()) / 
      (1000 * 60 * 60 * 24 * 7);

    for (const user of users) {
      const connections: ConnectionScore[] = [];
      
      for (const otherUser of users) {
        if (user.user_id === otherUser.user_id) continue;
        
        const key = `${user.user_id}-${otherUser.user_id}`;
        const reverseKey = `${otherUser.user_id}-${user.user_id}`;
        
        const counts = interactionCounts.get(key) || { to: 0, from: 0 };
        const reverseCounts = interactionCounts.get(reverseKey) || { to: 0, from: 0 };
        
        const interactions_from_to = counts.to;
        const interactions_to_from = reverseCounts.to;
        
        if (interactions_from_to > 0 || interactions_to_from > 0) {
          const frequency_per_week = (interactions_from_to + interactions_to_from) / windowDurationWeeks;
          
          const connectionScore = this.computeConnectionWeight(
            user.user_id,
            otherUser.user_id,
            interactions_from_to,
            interactions_to_from,
            frequency_per_week,
            otherUser.is_verified
          );
          
          connections.push(connectionScore);
        }
      }
      
      connectionMap.set(user.user_id, connections);
    }

    return connectionMap;
  }

  /**
   * Formula: INFLUENT(u) = ws*S + wc*C + wi*E
   */
  static computeInfluentScore(
    user_id: string,
    sentiment_component: number,
    engagement_component: number,
    connection_component: number,
    component_weights: { ws: number; wc: number; wi: number }
  ): InfluentScore {
    
    const influent_score = 
      component_weights.ws * sentiment_component +
      component_weights.wc * connection_component +
      component_weights.wi * engagement_component;

    return {
      user_id,
      sentiment_component,
      engagement_component,
      connection_component,
      influent_score
    };
  }


  static aggregateUserEngagement(
    user_id: string,
    engagementScores: EngagementScore[]
  ): number {
    const userScores = engagementScores.filter(e => e.user_id === user_id);
    if (userScores.length === 0) return 0;

    const sum = userScores.reduce((acc, score) => acc + score.temporal_adjusted, 0);
    return sum / userScores.length;
  }


  static aggregateUserConnections(
    user_id: string,
    connectionMap: Map<string, ConnectionScore[]>
  ): number {
    const connections = connectionMap.get(user_id) || [];
    if (connections.length === 0) return 0;

    const sum = connections.reduce((acc, conn) => acc + conn.connection_weight, 0);
    return sum / connections.length;
  }


  static normalizeScores(scores: number[]): number[] {
    if (scores.length === 0) return [];
    
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    
    if (max === min) return scores.map(() => 0.5); 
    
    return scores.map(s => (s - min) / (max - min));
  }

  static demoSentimentComponent(user_id: string): number {

    const hash = user_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (Math.sin(hash) + 1) / 2; 
  }
}
