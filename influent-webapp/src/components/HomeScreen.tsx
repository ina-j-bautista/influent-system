import React, { useState } from 'react';
import { Calendar, Globe, Users, Heart, TrendingUp, BarChart3, X, ChevronRight, Sparkles } from 'lucide-react';

interface AnalysisResult {
  success: boolean;
  rankings: Array<{
    user_id: string;
    display_name: string;
    followers: number;
    engagement: number;
    relevancy: number;
    influent_score: number;
  }>;
  metadata: {
    totalUsers: number;
    totalPosts: number;
    keywords: string[];
    elapsedTimeMs?: number;
  };
}

const HomeScreen: React.FC = () => {
  const [keywords, setKeywords] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [language, setLanguage] = useState('en');
  const [minFollowers, setMinFollowers] = useState(0);
  const [minAvgLikes, setMinAvgLikes] = useState(5);
  const [maxAccounts, setMaxAccounts] = useState(20);
  const [tweetsPerAccount, setTweetsPerAccount] = useState(20);
  const [likeWeight, setLikeWeight] = useState(33);
  const [commentWeight, setCommentWeight] = useState(33);
  const [shareWeight, setShareWeight] = useState(34);
  const [sentimentImportance, setSentimentImportance] = useState(0.85);
  const [temporalDecay, setTemporalDecay] = useState(0.5);
  const [maxItems, setMaxItems] = useState(10);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleWeightChange = (type: 'like' | 'comment' | 'share', value: number) => {
    const newValue = Math.max(0, Math.min(100, value));
    
    if (type === 'like') {
      setLikeWeight(newValue);
      const remaining = 100 - newValue;
      const ratio = commentWeight / (commentWeight + shareWeight) || 0.5;
      setCommentWeight(Math.round(remaining * ratio));
      setShareWeight(100 - newValue - Math.round(remaining * ratio));
    } else if (type === 'comment') {
      setCommentWeight(newValue);
      const remaining = 100 - newValue;
      const ratio = likeWeight / (likeWeight + shareWeight) || 0.5;
      setLikeWeight(Math.round(remaining * ratio));
      setShareWeight(100 - newValue - Math.round(remaining * ratio));
    } else {
      setShareWeight(newValue);
      const remaining = 100 - newValue;
      const ratio = likeWeight / (likeWeight + commentWeight) || 0.5;
      setLikeWeight(Math.round(remaining * ratio));
      setCommentWeight(100 - newValue - Math.round(remaining * ratio));
    }
  };

  const estimatedPhase1 = Math.min(maxItems, 50);
  const estimatedPhase2 = Math.min(maxAccounts * tweetsPerAccount, 1000);
  const estimatedTotal = estimatedPhase1 + estimatedPhase2;

  const handleGenerate = async () => {
    if (!keywords.trim()) {
      alert('Please enter at least one keyword');
      return;
    }

    const params = {
      keywords: keywords.split(',').map(k => k.trim()),
      language,
      minFollowers,
      minAvgLikes,
      maxAccounts,
      tweetsPerAccount,
      startDate,
      endDate,
      maxItems,
      weightPreferences: {
        wi: likeWeight / 100,
        wc: commentWeight / 100,
        ws: shareWeight / 100
      },
      sentimentImportance,
      temporalDecay
    };

    setIsLoading(true);
    
    try {
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        setShowResults(true);
      } else {
        alert('Analysis failed. Please try again.');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto p-8">
        
        {/* Header with Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-6">
            <img 
              src="/src/public/INFLUENT_logo.png"
              alt="INFLUENT Logo" 
              className="w-32 h-auto dark:hidden"
              onError={(e) => {
                console.error('Logo failed to load');
                e.currentTarget.style.display = 'none';
              }}
            />
            <img 
              src="/src/public/INFLUENT_logo_dark.png"
              alt="INFLUENT Logo" 
              className="w-32 h-auto hidden dark:block"
              onError={(e) => {
                console.error('Dark logo failed to load');
                e.currentTarget.style.display = 'none';
              }}
            />
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                INFLUENT
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Twitter Influence Analysis Platform</p>
            </div>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 p-8">
          
          {/* Keywords Input */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              <Sparkles className="inline w-4 h-4 mr-2 text-purple-600 dark:text-purple-400" />
              Search Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="social media, streaming, telecom..."
              className="w-full px-4 py-3.5 bg-white dark:bg-slate-800 border-2 border-purple-200 dark:border-purple-900/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 focus:border-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all text-lg"
            />
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            
            {/* Data Collection Section */}
            <div className="space-y-4 p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Data Collection
              </h3>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Initial Search Items</label>
                <input
                  type="number"
                  value={maxItems}
                  onChange={(e) => setMaxItems(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  <Globe className="inline w-3 h-3 mr-1" />
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                >
                  <option value="en">English</option>
                  <option value="tl">Tagalog</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                  <option value="ar">Arabic</option>
                  <option value="hi">Hindi</option>
                  <option value="nl">Dutch</option>
                  <option value="ru">Russian</option>
                  <option value="tr">Turkish</option>
                  <option value="id">Indonesian</option>
                  <option value="th">Thai</option>
                  <option value="pl">Polish</option>
                  <option value="sv">Swedish</option>
                  <option value="da">Danish</option>
                  <option value="no">Norwegian</option>
                  <option value="fi">Finnish</option>
                  <option value="cs">Czech</option>
                  <option value="hu">Hungarian</option>
                  <option value="ro">Romanian</option>
                  <option value="uk">Ukrainian</option>
                  <option value="vi">Vietnamese</option>
                  <option value="he">Hebrew</option>
                  <option value="fa">Persian</option>
                  <option value="ur">Urdu</option>
                  <option value="bn">Bengali</option>
                  <option value="ms">Malay</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  <Users className="inline w-3 h-3 mr-1" />
                  Min Followers
                </label>
                <input
                  type="number"
                  value={minFollowers}
                  onChange={(e) => setMinFollowers(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  <Heart className="inline w-3 h-3 mr-1" />
                  Minimum Average Likes
                </label>
                <input
                  type="number"
                  value={minAvgLikes}
                  onChange={(e) => setMinAvgLikes(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Max Accounts to Analyze</label>
                <input
                  type="number"
                  value={maxAccounts}
                  onChange={(e) => setMaxAccounts(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Tweets Per Account</label>
                <input
                  type="number"
                  value={tweetsPerAccount}
                  onChange={(e) => setTweetsPerAccount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* ===== RESTORED: Time Window ===== */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  <Calendar className="inline w-3 h-3 mr-1" />
                  Time Window (Optional)
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Estimated Data Collection</p>
                <p className="text-sm font-semibold text-purple-700 dark:text-purple-400">~{estimatedTotal} total tweets</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Phase 1: {estimatedPhase1} • Phase 2: {estimatedPhase2}</p>
              </div>
            </div>

            {/* Algorithm Parameters Section */}
<div className="space-y-4 p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 rounded-xl border border-purple-200/50 dark:border-purple-800/50">
  <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide flex items-center gap-2">
    <TrendingUp className="w-4 h-4" />
    Algorithm Parameters
  </h3>

  <div>
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
      Sentiment Importance: {sentimentImportance.toFixed(2)}
    </label>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={sentimentImportance}
      onChange={(e) => setSentimentImportance(parseFloat(e.target.value))}
      className="w-full h-2 bg-purple-200 dark:bg-purple-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
    />
  </div>

  <div>
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
      Temporal Decay (λ): {temporalDecay.toFixed(2)}
    </label>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={temporalDecay}
      onChange={(e) => setTemporalDecay(parseFloat(e.target.value))}
      className="w-full h-2 bg-purple-200 dark:bg-purple-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
    />
  </div>

  {/* Info Tips */}
  <div className="pt-3 border-t border-purple-200 dark:border-purple-800 space-y-2">
    {[
      {
        label: 'Sentiment Importance',
        tip: 'Scales how heavily post sentiment (positive/negative tone) affects influence score propagation. Higher values reward positive engagement more strongly.'
      },
      {
        label: 'λ — Temporal Decay',
        tip: 'Determines how quickly older posts lose influence. Higher λ fades past activity faster, keeping rankings responsive to recent content.'
      }
    ].map(({ label, tip }) => (
      <div
        key={label}
        className="group relative cursor-default"
      >
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 dark:bg-purple-600 flex-shrink-0" />
          <span className="font-medium text-purple-700 dark:text-purple-400">{label}</span>
        </div>
        <p className="mt-0.5 pl-3 text-xs text-slate-400 dark:text-slate-500 leading-relaxed
          max-h-0 overflow-hidden opacity-0
          group-hover:max-h-20 group-hover:opacity-100
          transition-all duration-300 ease-in-out">
          {tip}
        </p>
      </div>
    ))}
  </div>
</div>

            {/* Engagement Weights Section */}
            <div className="space-y-4 p-5 bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/20 dark:to-indigo-900/10 rounded-xl border border-indigo-200/50 dark:border-indigo-800/50">
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Engagement Weights
              </h3>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Likes</label>
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-400">{likeWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={likeWeight}
                  onChange={(e) => handleWeightChange('like', parseInt(e.target.value))}
                  className="w-full h-2 bg-indigo-200 dark:bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Replies</label>
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-400">{commentWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={commentWeight}
                  onChange={(e) => handleWeightChange('comment', parseInt(e.target.value))}
                  className="w-full h-2 bg-indigo-200 dark:bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Retweets</label>
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-400">{shareWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={shareWeight}
                  onChange={(e) => handleWeightChange('share', parseInt(e.target.value))}
                  className="w-full h-2 bg-indigo-200 dark:bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>

              <div className="pt-3 border-t border-indigo-200 dark:border-indigo-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Weight Balance</p>
                <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${likeWeight}%` }} className="bg-blue-500"></div>
                  <div style={{ width: `${commentWeight}%` }} className="bg-green-500"></div>
                  <div style={{ width: `${shareWeight}%` }} className="bg-orange-500"></div>
                </div>
              </div>
            </div>

          </div>

          {/* Action Button */}
          <div className="flex justify-center">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-200 flex items-center gap-3 text-lg disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Run Analysis
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>

        </div>

        {/* Results Modal */}
        {showResults && results && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 p-6 flex items-center justify-between rounded-t-2xl">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-6 h-6" />
                  Analysis Complete
                </h2>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6">
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  Successfully analyzed {results.metadata.totalUsers} accounts across {results.metadata.totalPosts} posts
                </p>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Accounts</p>
                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{results.metadata.totalUsers}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Posts</p>
                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{results.metadata.totalPosts}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Time</p>
                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">
                      {results.metadata.elapsedTimeMs ? `${results.metadata.elapsedTimeMs}ms` : 'N/A'}
                    </p>
                  </div>
                </div>

                {results.metadata.keywords && results.metadata.keywords.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {results.metadata.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-sm font-medium"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {results.rankings && results.rankings.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Top Influencer</p>
                    <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-4 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-lg">{results.rankings[0].display_name}</p>
                          <p className="text-sm text-purple-200">@{results.rankings[0].user_id}</p>
                          <p className="text-xs text-purple-300 mt-1">
                            Followers: {results.rankings[0].followers.toLocaleString()} • Engagement: {results.rankings[0].engagement.toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-purple-200">Score</p>
                          <p className="text-4xl font-bold">{results.rankings[0].influent_score.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowResults(false)}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  View Full Results
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default HomeScreen;