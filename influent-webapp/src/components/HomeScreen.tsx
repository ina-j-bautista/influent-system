import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

const HomeScreen: React.FC = () => {
  const [keywords, setKeywords] = useState('');
  const [region, setRegion] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [likeWeight, setLikeWeight] = useState(33);
  const [commentWeight, setCommentWeight] = useState(33);
  const [shareWeight, setShareWeight] = useState(34);
  const [sentimentImportance, setSentimentImportance] = useState(0.85);
  const [temporalDecay, setTemporalDecay] = useState(0.5);
  const [useDeepTranslator, setUseDeepTranslator] = useState(true);
  const [maxItems, setMaxItems] = useState(100);

  const handleGenerate = async () => {
    const params = {
      keywords: keywords.split(',').map(k => k.trim()),
      region,
      startDate,
      endDate,
      maxItems,  // ADD THIS LINE
      weightPreferences: {
        wi: likeWeight / 100,
        wc: commentWeight / 100,
        ws: shareWeight / 100
      },
      sentimentImportance,
      temporalDecay,
      useDeepTranslator
    };

    try {
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      console.log('Analysis complete:', data);
      alert('Analysis complete! Check console for results.');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Make sure backend is running.');
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
          {/* Date Range */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <Calendar size={16} />
              Time Window
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

          {/* Topic Keywords */}
          <div>
            {/* Max Items to Scrape */}
<div>
  <label className="text-sm font-medium text-stone-700 mb-2 block">
    🔢 Max Items to Scrape
  </label>
  <input
    type="number"
    value={maxItems}
    onChange={(e) => setMaxItems(Number(e.target.value))}
    className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
    placeholder="e.g., 100"
    min="1"
    max="1000"
  />
  <p className="text-xs text-stone-500 mt-1">
    Maximum number of tweets/posts to collect from Twitter
  </p>
</div>
            <label className="text-sm font-medium text-stone-700 mb-2 block">
              # Topic Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
              placeholder="e.g., AI, machine learning, tech innovation"
            />
          </div>

          {/* Region */}
          <div>
            <label className="text-sm font-medium text-stone-700 mb-2 block">
              📍 Region/Audience
            </label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
              placeholder="e.g., Philippines, Southeast Asia, Global"
            />
          </div>

          {/* Weight Preferences */}
          <div>
            <label className="text-sm font-medium text-stone-700 mb-4 block">
              ⚖️ Weight Preferences
            </label>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-stone-600">Like Weight (wi)</span>
                  <span className="text-sm font-mono text-stone-900">{(likeWeight / 100).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={likeWeight}
                  onChange={(e) => setLikeWeight(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-stone-600">Comment Weight (wc)</span>
                  <span className="text-sm font-mono text-stone-900">{(commentWeight / 100).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={commentWeight}
                  onChange={(e) => setCommentWeight(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-stone-600">Share Weight (ws)</span>
                  <span className="text-sm font-mono text-stone-900">{(shareWeight / 100).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={shareWeight}
                  onChange={(e) => setShareWeight(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Sentiment Importance */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-stone-700">
                📊 Sentiment Importance
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
          </div>

          {/* Temporal Decay */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-stone-700">
                ⏱️ Temporal Decay
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
          </div>

          {/* Sentiment Pipeline Selection */}
          <div>
            <label className="text-sm font-medium text-stone-700 mb-3 block">
              🔬 Sentiment Analysis Pipeline
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setUseDeepTranslator(true)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                  useDeepTranslator
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                }`}
              >
                Deep Translator + VADER
              </button>
              <button
                onClick={() => setUseDeepTranslator(false)}
                disabled
                className="flex-1 px-4 py-3 rounded-lg border-2 border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed"
              >
                GERT (Coming Soon)
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleGenerate}
            className="w-full py-4 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors"
          >
            ▶ Generate Influence Map
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;