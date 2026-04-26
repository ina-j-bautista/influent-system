// #### INFLUENT CORE SYSTEM ###

// helo this is ina if you are reading this pls do not touch the code w/o telling me thank

// #### DATABASE TYPES ###

// this part defines how a twitter user looks in our db
export interface TwitterUser {
  user_id: string;
  display_name: string;
  bio: string;
  location: string;
  profile_picture: string;
  followers: number;
  following: number;
  statuses_count: number;
  media_count: number;
  favourites_count: number;
  is_verified: boolean;
  is_blue_verified: boolean;
  scraped_at: Date;
}

// this part defines what a tweet/post looks like for us
export interface TwitterPost {
  post_id: string;
  user_id: string;
  content: string;
  created_at: Date;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  scraped_at: Date;
}

// this just limits interaction types to specific strings
export type InteractionType = 'reply' | 'mention' | 'retweet';

// this tracks how users interact with each other
export interface TwitterInteraction {
  from_user: string;
  to_user: string;
  post_id: string;
  interaction_type: InteractionType;
  created_at: Date;
}

// this bundles engagement stats between two users
export interface EngagementFeatures {
  from_user: string;
  to_user: string;
  total_likes: number;
  total_replies: number;
  total_retweets: number;
  avg_sentiment: number;
  last_interaction: Date;
}

// this stores sentiment analysis results per post
export interface SentimentScore {
  post_id: string;
  user_id: string;
  raw_sentiment: number;
  norm_sentiment: number;
  analyzed_at: Date;
}

// this tracks how mutual two users are
export interface ReciprocityStats {
  user_a: string;
  user_b: string;
  a_to_b: number;
  b_to_a: number;
  reciprocity: number;
}

// this measures how often two users interact
export interface InteractionFrequency {
  from_user: string;
  to_user: string;
  interactions_per_week: number;
}

// this pulls together features we use to build edges
export interface ConnectionFeatures {
  from_user: string;
  to_user: string;
  interaction_freq: number;
  reciprocity: number;
  verified: boolean;
}

// this is the final weight we give to a connection
export interface ConnectionWeight {
  from_user: string;
  to_user: string;
  weight: number;
  computed_at: Date;
}

// this tracks direct mentions
export interface TwitterMention {
  from_user: string;
  to_user: string;
  post_id: string;
  created_at: Date;
}

// #### USER INPUT TYPES ###

// this describes all the knobs the user can tweak
export interface AnalysisParameters {
  timeWindow: TimeWindow;
  topicKeywords: string[];
  regionAudience?: string;
  weightPreferences: WeightPreferences;
  sentimentImportance: number;
  temporalDecay: number;
}

// this defines the date range for analysis
export interface TimeWindow {
  startDate: Date;
  endDate: Date;
  durationDays?: number;
}

// this controls how much each factor matters
export interface WeightPreferences {
  ws: number;
  wc: number;
  wi: number;
}

// this defines how users can target what they want analyzed
export interface TargetInput {
  keywords?: string[];
  hashtags?: string[];
  industrySector?: string;
  publicUserHandles?: string[];
  communityOrRegion?: string;
}

// #### VALIDATION RESULTS ###

// this is the base shape for any validation result
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// this extends validation specifically for parameters
export interface ParameterValidationResult extends ValidationResult {
  validatedParams?: AnalysisParameters;
}

// #### CORE PARAMETER VALIDATOR ###

// this class makes sure analysis params actually make sense
export class InfluentParameterValidator {
  private static readonly MIN_TIME_WINDOW_DAYS = 1;
  private static readonly MAX_TIME_WINDOW_DAYS = 365;
  private static readonly WEIGHT_SUM_TOLERANCE = 0.001;
  
  // this is the main entry point for checking params
  static validateParameters(params: AnalysisParameters): ParameterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // checking the time window
    const timeValidation = this.validateTimeWindow(params.timeWindow);
    errors.push(...timeValidation.errors);
    warnings.push(...timeValidation.warnings);

    // checking keywords
    const keywordValidation = this.validateTopicKeywords(params.topicKeywords);
    errors.push(...keywordValidation.errors);
    warnings.push(...keywordValidation.warnings);

    // checking weights
    const weightValidation = this.validateWeightPreferences(params.weightPreferences);
    errors.push(...weightValidation.errors);
    warnings.push(...weightValidation.warnings);

    // checking sentiment importance
    const sentimentValidation = this.validateSentimentImportance(params.sentimentImportance);
    errors.push(...sentimentValidation.errors);
    warnings.push(...sentimentValidation.warnings);

    // checking decay value
    const decayValidation = this.validateTemporalDecay(params.temporalDecay);
    errors.push(...decayValidation.errors);
    warnings.push(...decayValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      validatedParams: errors.length === 0 ? params : undefined
    };
  }

  
  // this makes sure the time window is valid
  private static validateTimeWindow(timeWindow: TimeWindow): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!(timeWindow.startDate instanceof Date) || isNaN(timeWindow.startDate.getTime())) {
      errors.push("Start date is invalid");
    }

    if (!(timeWindow.endDate instanceof Date) || isNaN(timeWindow.endDate.getTime())) {
      errors.push("End date is invalid");
    }

    if (errors.length === 0) {
      if (timeWindow.startDate >= timeWindow.endDate) {
        errors.push("Start date must be before end date");
      }

      const durationMs = timeWindow.endDate.getTime() - timeWindow.startDate.getTime();
      const durationDays = durationMs / (1000 * 60 * 60 * 24);

      if (durationDays < this.MIN_TIME_WINDOW_DAYS) {
        errors.push(`Time window must be at least ${this.MIN_TIME_WINDOW_DAYS} day(s)`);
      }

      if (durationDays > this.MAX_TIME_WINDOW_DAYS) {
        warnings.push(`Time window exceeds ${this.MAX_TIME_WINDOW_DAYS} days. This may impact performance.`);
      }

      const now = new Date();
      if (timeWindow.endDate > now) {
        warnings.push("End date is in the future. Analysis will only include data up to present.");
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  // this checks if the keywords list is usable
  private static validateTopicKeywords(keywords: string[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(keywords)) {
      errors.push("Topic keywords must be an array");
      return { isValid: false, errors, warnings };
    }

    if (keywords.length === 0) {
      warnings.push("No topic keywords specified. Analysis will include all posts.");
    }

    const invalidKeywords = keywords.filter(k => !k || typeof k !== 'string' || k.trim().length === 0);
    if (invalidKeywords.length > 0) {
      errors.push("All keywords must be non-empty strings");
    }

    const uniqueKeywords = new Set(keywords.map(k => k.toLowerCase().trim()));
    if (uniqueKeywords.size < keywords.length) {
      warnings.push("Duplicate keywords detected. They will be deduplicated.");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }


  //this makes sure weight prefs sum correctly
  private static validateWeightPreferences(weights: WeightPreferences): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (weights.ws < 0 || weights.ws > 1) {
      errors.push("Sentiment weight (ws) must be between 0 and 1");
    }
    if (weights.wc < 0 || weights.wc > 1) {
      errors.push("Connection weight (wc) must be between 0 and 1");
    }
    if (weights.wi < 0 || weights.wi > 1) {
      errors.push("Interaction weight (wi) must be between 0 and 1");
    }

    const sum = weights.ws + weights.wc + weights.wi;
    if (Math.abs(sum - 1.0) > this.WEIGHT_SUM_TOLERANCE) {
      errors.push(`Weights must sum to 1 (current sum: ${sum.toFixed(4)})`);
    }

    if (weights.ws === 0) {
      warnings.push("Sentiment weight is 0. Sentiment analysis will not affect results.");
    }
    if (weights.wc === 0) {
      warnings.push("Connection weight is 0. Network connections will not affect results.");
    }
    if (weights.wi === 0) {
      warnings.push("Interaction weight is 0. Direct interactions will not affect results.");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  // this keeps sentiment importance within bounds
  private static validateSentimentImportance(importance: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof importance !== 'number' || isNaN(importance)) {
      errors.push("Sentiment importance must be a number");
    } else if (importance < 0 || importance > 1) {
      errors.push("Sentiment importance must be between 0 and 1");
    } else if (importance === 0) {
      warnings.push("Sentiment importance is 0. Sentiment will not affect engagement scoring.");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  //this validates how fast old data fades away
  private static validateTemporalDecay(lambda: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof lambda !== 'number' || isNaN(lambda)) {
      errors.push("Temporal decay (λ) must be a number");
    } else if (lambda < 0) {
      errors.push("Temporal decay (λ) must be non-negative");
    } else if (lambda === 0) {
      warnings.push("Temporal decay is 0. All interactions will be weighted equally regardless of time.");
    } else if (lambda > 1) {
      warnings.push("High temporal decay (λ > 1) will heavily discount older interactions.");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}



// #### TARGET INPUT VALIDATOR ###

// this checks if the target input is usable
export class TargetInputValidator {
  static validateTargetInput(target: TargetInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    let hasAnyInput = false;

    if (target.keywords && target.keywords.length > 0) {
      hasAnyInput = true;
      const invalidKeywords = target.keywords.filter(k => !k || k.trim().length === 0);
      if (invalidKeywords.length > 0) {
        errors.push("All keywords must be non-empty strings");
      }
    }

    if (target.hashtags && target.hashtags.length > 0) {
      hasAnyInput = true;
      const invalidHashtags = target.hashtags.filter(h => !h || h.trim().length === 0);
      if (invalidHashtags.length > 0) {
        errors.push("All hashtags must be non-empty strings");
      }

      target.hashtags.forEach(h => {
        if (!h.startsWith('#')) {
          warnings.push(`Hashtag "${h}" should start with #`);
        }
      });
    }

    if (target.publicUserHandles && target.publicUserHandles.length > 0) {
      hasAnyInput = true;
      const invalidHandles = target.publicUserHandles.filter(h => !h || h.trim().length === 0);
      if (invalidHandles.length > 0) {
        errors.push("All user handles must be non-empty strings");
      }

      target.publicUserHandles.forEach(h => {
        if (h.startsWith('@')) {
          warnings.push(`User handle "${h}" should not include @ symbol`);
        }
      });
    }

    if (target.industrySector && target.industrySector.trim().length > 0) {
      hasAnyInput = true;
    }

    if (target.communityOrRegion && target.communityOrRegion.trim().length > 0) {
      hasAnyInput = true;
    }

    if (!hasAnyInput) {
      errors.push("At least one target input field must be provided");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}



// #### DATA INTERFACE (for external DB) ###

export interface InfluentDataSource {
  // User queries
  getUserById(userId: string): Promise<TwitterUser | null>;
  getUsersByHandles(handles: string[]): Promise<TwitterUser[]>;
  getAllUsers(limit?: number): Promise<TwitterUser[]>; 
  
  // Post queries
  getPostsByTimeWindow(startDate: Date, endDate: Date): Promise<TwitterPost[]>;
  getPostsByKeywords(keywords: string[], timeWindow: TimeWindow): Promise<TwitterPost[]>;
  
  // Interaction queries
  getInteractionsByTimeWindow(startDate: Date, endDate: Date): Promise<TwitterInteraction[]>;
  
  // Feature queries
  getEngagementFeatures(fromUser: string, toUser: string): Promise<EngagementFeatures | null>;
  getSentimentScores(postIds: string[]): Promise<SentimentScore[]>;
  getReciprocityStats(userA: string, userB: string): Promise<ReciprocityStats | null>;
  getConnectionWeights(userId: string): Promise<ConnectionWeight[]>;
  
  // Utility
  executeQuery<T = any>(sql: string, params?: any[]): Promise<T[]>; 
}




// #### MAIN CONTROLLER ###

//this is the controller
export class InfluentCoreController {
  private dataSource: InfluentDataSource;

  constructor(dataSource: InfluentDataSource) {
    this.dataSource = dataSource;
  }

//validation stuff
  async initializeAnalysis(
    targetInput: TargetInput,
    analysisParams: AnalysisParameters
  ): Promise<{
    success: boolean;
    validationResult: ParameterValidationResult;
    targetValidation: ValidationResult;
    readyForProcessing: boolean;
  }> {
    const targetValidation = TargetInputValidator.validateTargetInput(targetInput);
    
    if (!targetValidation.isValid) {
      return {
        success: false,
        validationResult: { isValid: false, errors: [], warnings: [] },
        targetValidation,
        readyForProcessing: false
      };
    }

    const paramValidation = InfluentParameterValidator.validateParameters(analysisParams);
    
    if (!paramValidation.isValid) {
      return {
        success: false,
        validationResult: paramValidation,
        targetValidation,
        readyForProcessing: false
      };
    }

    return {
      success: true,
      validationResult: paramValidation,
      targetValidation,
      readyForProcessing: true
    };
  }




//this part pulls the data
async fetchRelevantData(
  targetInput: TargetInput,
  params: AnalysisParameters
): Promise<{
  users: TwitterUser[];
  posts: TwitterPost[];
  interactions: TwitterInteraction[];
}> {
  // fetch users based on handles if provided, otherwise get all users
  let users: TwitterUser[] = [];
  if (targetInput.publicUserHandles && targetInput.publicUserHandles.length > 0) {
    users = await this.dataSource.getUsersByHandles(targetInput.publicUserHandles);
  } else {
    users = await this.dataSource.getAllUsers(100);
  }

  // fetch posts based on time window and keywords
  let posts: TwitterPost[] = [];
  if (params.topicKeywords.length > 0) {
    posts = await this.dataSource.getPostsByKeywords(
      params.topicKeywords,
      params.timeWindow
    );
  } else {
    posts = await this.dataSource.getPostsByTimeWindow(
      params.timeWindow.startDate,
      params.timeWindow.endDate
    );
  }

  // fetch interactions within time window
  const interactions = await this.dataSource.getInteractionsByTimeWindow(
    params.timeWindow.startDate,
    params.timeWindow.endDate
  );

  return { users, posts, interactions };
}
}
// #### USAGE EXAMPLE ###

// this just shows how everything would be used together (made this for the mock def)
export async function exampleUsage() {
  const mockDataSource: InfluentDataSource = {
    getUserById: async (id) => null,
    getUsersByHandles: async (handles) => [],
    getAllUsers: async (limit) => [],
    getPostsByTimeWindow: async (start, end) => [],
    getPostsByKeywords: async (keywords, window) => [],
    getInteractionsByTimeWindow: async (start, end) => [],
    getEngagementFeatures: async (from, to) => null,
    getSentimentScores: async (ids) => [],
    getReciprocityStats: async (a, b) => null,
    getConnectionWeights: async (id) => [],
    executeQuery: async (sql, params) => []
  };
  const controller = new InfluentCoreController(mockDataSource);



  // KEYWORDS ARE PLACE HOLDERS IM TESTING STUFF
  const targetInput: TargetInput = {
    keywords: ['AI', 'machine learning'],
    hashtags: ['#TechTwitter', '#AI'],
    industrySector: 'Technology',
    publicUserHandles: ['elonmusk', 'satyanadella']
  };

  const analysisParams: AnalysisParameters = {
    timeWindow: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    },
    topicKeywords: ['AI', 'artificial intelligence'],
    regionAudience: 'North America',
    weightPreferences: {
      ws: 0.3,
      wc: 0.4,
      wi: 0.3
    },
    sentimentImportance: 0.85,
    temporalDecay: 0.5
  };

  const result = await controller.initializeAnalysis(targetInput, analysisParams);

  if (result.readyForProcessing) {
    console.log('System ready for processing!');
    
    const data = await controller.fetchRelevantData(targetInput, analysisParams);
    console.log(`Fetched ${data.posts.length} posts, ${data.interactions.length} interactions`);
  } else {
    console.log('Validation failed:');
    console.log('Errors:', result.validationResult.errors);
    console.log('Warnings:', result.validationResult.warnings);
  }
}
