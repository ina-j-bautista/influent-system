import React, { useState, useEffect } from 'react';
import { Calendar, Globe, Users, Heart, X } from 'lucide-react';

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
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [commentWeight, setCommentWeight] = useState(33);
  const [shareWeight, setShareWeight] = useState(34);
  const [sentimentImportance, setSentimentImportance] = useState(0.85);
  const [temporalDecay, setTemporalDecay] = useState(0.5);
  const [maxItems, setMaxItems] = useState(100);

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
      console.log('Analysis complete:', data);
      
      // Show results modal
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
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 mx-auto mb-4 border-2 border-stone-900 flex items-center justify-center">
            <div className="w-10 h-10 border border-stone-900" style={{ transform: 'rotate(45deg)' }} />
          </div>
          <h1 className="text-3xl font-semibold text-stone-900 mb-2">Influent</h1>
          <p className="text-stone-500">Configure your Twitter influencer mapping parameters</p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Keywords */}
          <div>
            <label className="text-sm font-medium text-stone-700 mb-2 block">
              # Topic Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
              placeholder="e.g., hermitcraft, grian, mumbojumbo"
            />
            <p className="text-xs text-stone-500 mt-1">
              Separate multiple keywords with commas
            </p>
          </div>

          {/* Data Collection Settings */}
          <div className="border border-stone-200 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-stone-900">Data Collection</h3>
            
            {/* Max Items */}
            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">
                🔢 Target Number To Scrape
              </label>
              <input
                type="number"
                value={maxItems}
                onChange={(e) => setMaxItems(Number(e.target.value))}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="e.g., 100"
                min="10"
                max="1000"
              />
            </div>

            {/* Language */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
                <Globe size={16} />
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
                <option value="tl">Tagalog/Filipino</option>
              </select>
            </div>

            {/* Min Followers */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
                <Users size={16} />
                Minimum Followers
              </label>
              <input
                type="number"
                value={minFollowers}
                onChange={(e) => setMinFollowers(Number(e.target.value))}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="e.g., 1000"
                min="0"
              />
              <p className="text-xs text-stone-500 mt-1">
                Filter accounts below this follower count
              </p>
            </div>

            {/* Min Likes */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
                <Heart size={16} />
                Minimum Average Likes
              </label>
              <input
                type="number"
                value={minAvgLikes}
                onChange={(e) => setMinAvgLikes(Number(e.target.value))}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="e.g., 5"
                min="0"
              />
              <p className="text-xs text-stone-500 mt-1">
                Only include tweets with at least this many likes
              </p>
            </div>

            {/* Max Accounts */}
            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">
                👥 Max Accounts to Analyze
              </label>
              <input
                type="number"
                value={maxAccounts}
                onChange={(e) => setMaxAccounts(Number(e.target.value))}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="e.g., 20"
                min="1"
                max="100"
              />
              <p className="text-xs text-stone-500 mt-1">
                Number of relevant accounts to deep-scrape
              </p>
            </div>

            {/* Tweets Per Account */}
            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">
                📝 Tweets Per Account
              </label>
              <input
                type="number"
                value={tweetsPerAccount}
                onChange={(e) => setTweetsPerAccount(Number(e.target.value))}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="e.g., 20"
                min="5"
                max="100"
              />
              <p className="text-xs text-stone-500 mt-1">
                Maximum tweets to collect from each account
              </p>
            </div>

            {/* Data Points Estimate */}
            <div className="bg-gradient-to-r from-stone-50 to-stone-100 border-2 border-stone-300 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-900">Estimated Data Collection</p>
                  <p className="text-xs text-stone-500 mt-1">
                    Phase 1 + Phase 2 combined
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-stone-900">
                    ~{(maxItems + (maxAccounts * tweetsPerAccount)).toLocaleString()}
                  </p>
                  <p className="text-xs text-stone-500">total tweets</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-stone-300 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-stone-500">Phase 1 (keyword search):</span>
                  <span className="font-semibold text-stone-900 ml-1">{maxItems}</span>
                </div>
                <div>
                  <span className="text-stone-500">Phase 2 (deep scrape):</span>
                  <span className="font-semibold text-stone-900 ml-1">{maxAccounts * tweetsPerAccount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Time Window */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <Calendar size={16} />
              Time Window (Optional)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="Start Date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                placeholder="End Date"
              />
            </div>
          </div>

          {/* Engagement Weights */}
          <div>
            <label className="text-sm font-medium text-stone-700 mb-3 block">
              ⚖️ Engagement Weights
            </label>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="text-center">
                  <div className="text-xs text-stone-500 mb-1">Likes</div>
                  <input
                    type="number"
                    value={likeWeight}
                    onChange={(e) => handleWeightChange('like', Number(e.target.value))}
                    className="w-full px-2 py-2 text-center border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                    min="0"
                    max="100"
                  />
                  <div className="text-xs text-stone-400 mt-1">{(likeWeight / 100).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-stone-500 mb-1">Comments</div>
                  <input
                    type="number"
                    value={commentWeight}
                    onChange={(e) => handleWeightChange('comment', Number(e.target.value))}
                    className="w-full px-2 py-2 text-center border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                    min="0"
                    max="100"
                  />
                  <div className="text-xs text-stone-400 mt-1">{(commentWeight / 100).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-stone-500 mb-1">Shares</div>
                  <input
                    type="number"
                    value={shareWeight}
                    onChange={(e) => handleWeightChange('share', Number(e.target.value))}
                    className="w-full px-2 py-2 text-center border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                    min="0"
                    max="100"
                  />
                  <div className="text-xs text-stone-400 mt-1">{(shareWeight / 100).toFixed(2)}</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-stone-500">
                  Total: <span className="font-mono font-semibold">{likeWeight + commentWeight + shareWeight}%</span>
                  {(likeWeight + commentWeight + shareWeight) !== 100 && (
                    <span className="text-red-500 ml-2">⚠️ Must equal 100%</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Algorithm Parameters */}
          <div className="space-y-4">
            {/* Sentiment Importance */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-stone-700">
                  📊 Sentiment Importance (d)
                </label>
                <span className="text-sm font-mono text-stone-900">{sentimentImportance.toFixed(2)}</span>
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
              <p className="text-xs text-stone-500 mt-1">
                Dampening factor for the INFLUENT algorithm
              </p>
            </div>

            {/* Temporal Decay */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-stone-700">
                  ⏱️ Temporal Decay (λ)
                </label>
                <span className="text-sm font-mono text-stone-900">{temporalDecay.toFixed(2)}</span>
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
              <p className="text-xs text-stone-500 mt-1">
                How quickly engagement value decreases over time
              </p>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!keywords.trim() || (likeWeight + commentWeight + shareWeight) !== 100 || isLoading}
            className="w-full py-4 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:bg-stone-400 disabled:cursor-not-allowed"
          >
            {isLoading ? '⏳ Analyzing...' : '▶ Generate Influence Map'}
          </button>
        </div>
      </div>

      {/* Results Summary Modal */}
      {showResults && results && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-8 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-stone-900">✅ Analysis Complete</h2>
              <button
                onClick={() => setShowResults(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
                <p className="text-sm text-stone-500 mb-1">Target Tweets</p>
                <p className="text-3xl font-bold text-stone-900">
                  {maxItems + (maxAccounts * tweetsPerAccount)}
                </p>
                <p className="text-xs text-stone-500 mt-1">estimated collection</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-700 mb-1">Actually Collected</p>
                <p className="text-3xl font-bold text-green-900">
                  {results.metadata?.totalPosts || 0}
                </p>
                <p className="text-xs text-green-700 mt-1">actual tweets scraped</p>
              </div>
              <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
                <p className="text-sm text-stone-500 mb-1">Target Accounts</p>
                <p className="text-3xl font-bold text-stone-900">{maxAccounts}</p>
                <p className="text-xs text-stone-500 mt-1">for deep scraping</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-700 mb-1">Analyzed Users</p>
                <p className="text-3xl font-bold text-blue-900">
                  {results.metadata?.totalUsers || 0}
                </p>
                <p className="text-xs text-blue-700 mt-1">unique accounts</p>
              </div>
            </div>

            {/* Top Influencer */}
            {results.rankings && results.rankings.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-700 mb-2">🏆 Top Influencer</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-semibold text-amber-900">
                      {results.rankings[0].display_name}
                    </p>
                    <p className="text-sm text-amber-700">
                      {results.rankings[0].followers.toLocaleString()} followers
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-amber-900">
                      {results.rankings[0].influent_score.toFixed(1)}%
                    </p>
                    <p className="text-sm text-amber-700">influence score</p>
                  </div>
                </div>
              </div>
            )}

            {/* Keywords */}
            <div className="mb-6">
              <p className="text-sm text-stone-500 mb-2">Keywords Analyzed</p>
              <div className="flex flex-wrap gap-2">
                {results.metadata?.keywords?.map((keyword: string, i: number) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-stone-100 text-stone-700 text-sm rounded-full border border-stone-200"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowResults(false);
                  window.location.href = '/influencers';
                }}
                className="flex-1 py-3 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800"
              >
                View Full Results
              </button>
              <button
                onClick={() => setShowResults(false)}
                className="px-6 py-3 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;