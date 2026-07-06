import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Calendar, BarChart3, X, Sparkles, Loader2 } from 'lucide-react';
import ModelComparisonPanel from './ModelComparisonPanel';

// Base URL for the backend API.
// Locally: falls back to localhost:3001 (your Express dev server).
// In production: set VITE_API_URL in Vercel's Environment Variables to your Render backend URL,
// e.g. https://influent-backend.onrender.com
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface TemporalData {
  date: string;
  post_count: number;
  avg_likes?: number;
  avg_replies?: number;
  avg_retweets?: number;
}

interface ScoreDistribution {
  range: string;
  count: number;
}

const chartTitles: Record<string, string> = {
  temporal: 'Temporal Trends',
  distribution: 'Influence Score Distribution',
  engagement: 'Engagement Trends',
};

// Sends the chart's actual data to the backend, which forwards it to Gemini
// and returns a plain-language explanation of what the trend means.
async function fetchAIExplanation(chartKey: string, data: any[]): Promise<string> {
  const response = await fetch(`${API_BASE}/api/analyze-chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chartType: chartKey, data }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const json = await response.json();
  if (!json.explanation) {
    throw new Error('No explanation returned');
  }
  return json.explanation as string;
}

const InfoPopover: React.FC<{ chartKey: string; data: any[] }> = ({ chartKey, data }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const title = chartTitles[chartKey];

  const handleOpen = async () => {
    setOpen(true);

    // Already fetched for this session, don't re-call the API
    if (explanation || loading) return;

    setLoading(true);
    setError(null);
    try {
      const text = await fetchAIExplanation(chartKey, data);
      setExplanation(text);
    } catch (err) {
      console.error('AI explanation failed:', err);
      setError('Could not get an AI explanation right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setExplanation(null);
    setError(null);
    handleOpen();
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 text-xs font-medium hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
        aria-label={`Explain ${title} with AI`}
      >
        <Sparkles size={12} />
        Explain
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-9 z-50 w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500 dark:text-purple-400" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title} — AI Explanation</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={14} />
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4 justify-center">
                <Loader2 size={16} className="animate-spin" />
                Reading the chart...
              </div>
            )}

            {!loading && error && (
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <p className="mb-3">{error}</p>
                <button
                  onClick={handleRetry}
                  className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !error && explanation && (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {explanation}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const AnalyticsView: React.FC = () => {
  const [temporalData, setTemporalData] = useState<TemporalData[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/analytics`);
      const data = await response.json();
      setTemporalData(data.temporalData || []);
      setScoreDistribution(data.scoreDistribution || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setLoading(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportAllData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/export/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `influent-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-slate-50 dark:bg-slate-950">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-7 h-7 text-purple-600 dark:text-purple-400" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
            </div>
            <p className="text-slate-600 dark:text-slate-400">Track trends and insights over time</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-300 transition-all">
              <Calendar size={18} />
              Last 30 Days
            </button>
            <button className="px-4 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all">
              Filters
            </button>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">

          {/* Temporal Trends */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6 col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Temporal Trends</h2>
                <InfoPopover chartKey="temporal" data={temporalData} />
              </div>
              <button
                onClick={() => exportToCSV(temporalData, 'temporal-trends.csv')}
                className="px-4 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 transition-all"
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
            {temporalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={temporalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }} />
                  <Line type="monotone" dataKey="post_count" stroke="#1e293b" strokeWidth={2} dot={{ fill: '#1e293b', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">No temporal data available</div>
            )}
          </div>

          {/* Influence Score Distribution */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Influence Score Distribution</h2>
                <InfoPopover chartKey="distribution" data={scoreDistribution} />
              </div>
              <button
                onClick={() => exportToCSV(scoreDistribution, 'score-distribution.csv')}
                className="px-3 py-1.5 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 transition-all"
              >
                <Download size={14} />
                CSV
              </button>
            </div>
            {scoreDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="range" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }} />
                  <Bar dataKey="count" fill="#1e293b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">No score distribution data available</div>
            )}
          </div>

          {/* Engagement Trends */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Engagement Trends</h2>
                <InfoPopover chartKey="engagement" data={temporalData} />
              </div>
              <button
                onClick={() => exportToCSV(temporalData, 'engagement-trends.csv')}
                className="px-3 py-1.5 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 transition-all"
              >
                <Download size={14} />
                CSV
              </button>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={temporalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e7e5e4', borderRadius: '8px', padding: '12px', minWidth: '200px' }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1c1917', fontSize: '14px' }}>
                          {new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                          {[['Posts', data.post_count], ['Avg Likes', (data.avg_likes || 0).toFixed(1)], ['Avg Replies', (data.avg_replies || 0).toFixed(1)], ['Avg Retweets', (data.avg_retweets || 0).toFixed(1)]].map(([label, val]) => (
                            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                              <span style={{ color: '#78716c' }}>{label}:</span>
                              <span style={{ fontWeight: '600', color: '#1c1917' }}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="post_count" stroke="#1e293b" strokeWidth={2} dot={{ fill: '#1e293b', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Comparison Benchmark */}
        <div className="mb-6">
          <ModelComparisonPanel />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
            <h4 className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Data Points</h4>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {temporalData.reduce((sum, d) => sum + d.post_count, 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
            <h4 className="text-sm text-slate-600 dark:text-slate-400 mb-2">Avg Posts/Day</h4>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {temporalData.length > 0 ? (temporalData.reduce((sum, d) => sum + d.post_count, 0) / temporalData.length).toFixed(1) : 0}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
            <h4 className="text-sm text-slate-600 dark:text-slate-400 mb-2">Peak Activity</h4>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {temporalData.length > 0 ? Math.max(...temporalData.map(d => d.post_count)) : 0}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
            <h4 className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Users</h4>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {scoreDistribution.reduce((sum, d) => sum + d.count, 0)}
            </p>
          </div>
        </div>

        {/* Export Section */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Export Complete Analytics Dataset</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Download all analytics data including temporal trends, score distributions, and detailed metrics</p>
            </div>
            <button
              onClick={exportAllData}
              className="px-6 py-3 bg-slate-900 dark:bg-purple-600 hover:bg-slate-800 dark:hover:bg-purple-700 text-white font-semibold rounded-lg flex items-center gap-2 transition-all"
            >
              <Download size={18} />
              Export All Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
