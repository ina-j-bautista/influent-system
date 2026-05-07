import React, { useState } from 'react';
import { Calendar, Globe, Users, Heart, TrendingUp, BarChart3, X, ChevronRight } from 'lucide-react';

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

  // Auto-balance weights to always sum to 100
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
      setResults(data);
      setShowResults(true);
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Make sure backend is running on port 3001.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <div className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-4xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 border-2 border-stone-900 dark:border-stone-100 flex items-center justify-center">
              <div className="w-7 h-7 border border-stone-900 dark:border-stone-100" style={{ transform: 'rotate(45deg)' }} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
                Influence Analysis
              </h1>
              <p className="text-stone-600 dark:text-stone-400">
                Configure analysis parameters for Twitter influence mapping
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="space-y-6">
          {/* Keywords */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2 block">
              Topic Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
              placeholder="e.g., technology, AI, startup"
            />
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
              Separate multiple keywords with commas
            </p>
          </div>

          {/* Data Collection Settings */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">Data Collection</h3>
            
            <div className="space-y-4">
              {/* Max Items */}
              <div>
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2 block">
                  Initial Search Items
                </label>
                <input
                  type="number"
                  value={maxItems}
                  onChange={(e) => setMaxItems(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                  min="10"
                  max="1000"
                />
              </div>

              {/* Language & Min Followers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                    <Globe size={16} />
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                    <option value="de">German (Deutsch)</option>
                    <option value="it">Italian (Italiano)</option>
                    <option value="pt">Portuguese (Português)</option>
                    <option value="ja">Japanese (日本語)</option>
                    <option value="ko">Korean (한국어)</option>
                    <option value="zh">Chinese (中文)</option>
                    <option value="ar">Arabic (العربية)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="nl">Dutch (Nederlands)</option>
                    <option value="ru">Russian (Русский)</option>
                    <option value="tr">Turkish (Türkçe)</option>
                    <option value="id">Indonesian (Bahasa Indonesia)</option>
                    <option value="th">Thai (ไทย)</option>
                    <option value="pl">Polish (Polski)</option>
                    <option value="sv">Swedish (Svenska)</option>
                    <option value="da">Danish (Dansk)</option>
                    <option value="no">Norwegian (Norsk)</option>
                    <option value="fi">Finnish (Suomi)</option>
                    <option value="cs">Czech (Čeština)</option>
                    <option value="hu">Hungarian (Magyar)</option>
                    <option value="ro">Romanian (Română)</option>
                    <option value="uk">Ukrainian (Українська)</option>
                    <option value="vi">Vietnamese (Tiếng Việt)</option>
                    <option value="he">Hebrew (עברית)</option>
                    <option value="fa">Persian (فارسی)</option>
                    <option value="ur">Urdu (اردو)</option>
                    <option value="bn">Bengali (বাংলা)</option>
                    <option value="tl">Tagalog/Filipino</option>
                    <option value="ms">Malay (Bahasa Melayu)</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                    <Users size={16} />
                    Min Followers
                  </label>
                  <input
                    type="number"
                    value={minFollowers}
                    onChange={(e) => setMinFollowers(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                    min="0"
                  />
                </div>
              </div>

              {/* Min Likes */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                  <Heart size={16} />
                  Minimum Average Likes
                </label>
                <input
                  type="number"
                  value={minAvgLikes}
                  onChange={(e) => setMinAvgLikes(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                  min="0"
                />
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Only include tweets with at least this many likes
                </p>
              </div>

              {/* Max Accounts & Tweets Per Account */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2 block">
                    Max Accounts to Analyze
                  </label>
                  <input
                    type="number"
                    value={maxAccounts}
                    onChange={(e) => setMaxAccounts(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                    min="1"
                    max="100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2 block">
                    Tweets Per Account
                  </label>
                  <input
                    type="number"
                    value={tweetsPerAccount}
                    onChange={(e) => setTweetsPerAccount(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                    min="5"
                    max="100"
                  />
                </div>
              </div>

              {/* Data Points Estimate */}
              <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Estimated Data Collection
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                      Phase 1 + Phase 2 combined
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                      ~{estimatedTotal.toLocaleString()}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">total tweets</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-700 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-stone-500 dark:text-stone-400">Phase 1:</span>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 ml-1">{estimatedPhase1}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 dark:text-stone-400">Phase 2:</span>
                    <span className="font-semibold text-stone-900 dark:text-stone-100 ml-1">{estimatedPhase2}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Time Window */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
              <Calendar size={16} />
              Time Window (Optional)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-3 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
              />
            </div>
          </div>

          {/* Engagement Weights */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-3 block">
              Engagement Weights
            </label>
            <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="text-center">
                  <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">Likes</div>
                  <input
                    type="number"
                    value={likeWeight}
                    onChange={(e) => handleWeightChange('like', Number(e.target.value))}
                    className="w-full px-2 py-2 text-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                    min="0"
                    max="100"
                  />
                  <div className="text-xs text-stone-400 mt-1">{(likeWeight / 100).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">Comments</div>
                  <input
                    type="number"
                    value={commentWeight}
                    onChange={(e) => handleWeightChange('comment', Number(e.target.value))}
                    className="w-full px-2 py-2 text-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                    min="0"
                    max="100"
                  />
                  <div className="text-xs text-stone-400 mt-1">{(commentWeight / 100).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">Shares</div>
                  <input
                    type="number"
                    value={shareWeight}
                    onChange={(e) => handleWeightChange('share', Number(e.target.value))}
                    className="w-full px-2 py-2 text-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
                    min="0"
                    max="100"
                  />
                  <div className="text-xs text-stone-400 mt-1">{(shareWeight / 100).toFixed(2)}</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  Total: <span className="font-mono font-semibold">{likeWeight + commentWeight + shareWeight}%</span>
                  {(likeWeight + commentWeight + shareWeight) !== 100 && (
                    <span className="text-red-500 ml-2">Must equal 100%</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Algorithm Parameters */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Sentiment Importance (d)
                </label>
                <span className="text-sm font-mono text-stone-900 dark:text-stone-100">{sentimentImportance.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sentimentImportance}
                onChange={(e) => setSentimentImportance(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                Dampening factor for the INFLUENT algorithm
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Temporal Decay (λ)
                </label>
                <span className="text-sm font-mono text-stone-900 dark:text-stone-100">{temporalDecay.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temporalDecay}
                onChange={(e) => setTemporalDecay(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                How quickly engagement value decreases over time
              </p>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!keywords.trim() || (likeWeight + commentWeight + shareWeight) !== 100 || isLoading}
            className="w-full py-4 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:bg-stone-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Running Analysis...' : 'Run Analysis'}
          </button>

          {/* Info Cards */}
          <div className="grid grid-cols-3 gap-6 mt-6">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="text-stone-700 dark:text-stone-300" size={24} />
              </div>
              <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Influence Scoring</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                PageRank-inspired algorithm with temporal decay
              </p>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-lg flex items-center justify-center mb-4">
                <Users className="text-stone-700 dark:text-stone-300" size={24} />
              </div>
              <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Network Analysis</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Connection patterns and interaction frequency
              </p>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="text-stone-700 dark:text-stone-300" size={24} />
              </div>
              <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Engagement Metrics</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Weighted analysis with recency bias
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Results Modal */}
      {showResults && results && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-8">
          <div className="bg-white dark:bg-stone-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-8 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                  Analysis Complete
                </h2>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  <X size={24} />
                </button>
              </div>
              <p className="text-stone-600 dark:text-stone-400">
                Successfully analyzed {results.metadata.totalUsers} accounts across {results.metadata.totalPosts} posts
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                  <p className="text-sm text-stone-600 dark:text-stone-400 mb-1">Accounts</p>
                  <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {results.metadata.totalUsers}
                  </p>
                </div>
                <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                  <p className="text-sm text-stone-600 dark:text-stone-400 mb-1">Posts</p>
                  <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {results.metadata.totalPosts}
                  </p>
                </div>
                <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                  <p className="text-sm text-stone-600 dark:text-stone-400 mb-1">Time</p>
                  <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {results.metadata.elapsedTimeMs ? `${results.metadata.elapsedTimeMs}ms` : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="mb-8">
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {results.metadata.keywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-sm rounded-full"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              {results.rankings[0] && (
                <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-6">
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-4">Top Influencer</p>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">
                        {results.rankings[0].display_name}
                      </h3>
                      <p className="text-sm text-stone-600 dark:text-stone-400 mb-3">
                        @{results.rankings[0].user_id}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-stone-600 dark:text-stone-400">Followers:</span>{' '}
                          <span className="font-medium text-stone-900 dark:text-stone-100">
                            {results.rankings[0].followers.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-600 dark:text-stone-400">Engagement:</span>{' '}
                          <span className="font-medium text-stone-900 dark:text-stone-100">
                            {results.rankings[0].engagement.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-stone-600 dark:text-stone-400 mb-1">Score</p>
                      <p className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
                        {results.rankings[0].influent_score.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowResults(false);
                    window.location.href = '/influencers';
                  }}
                  className="flex-1 px-6 py-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:bg-stone-800 dark:hover:bg-stone-200 font-medium flex items-center justify-center gap-2"
                >
                  View Full Results
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setShowResults(false)}
                  className="px-6 py-3 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-white dark:hover:bg-stone-900 font-medium text-stone-900 dark:text-stone-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;