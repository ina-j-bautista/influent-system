import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Calendar, BarChart3, X } from 'lucide-react';
import ModelComparisonPanel from './ModelComparisonPanel';

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

const chartInfo: Record<string, { title: string; lines: string[] }> = {
  temporal: {
    title: 'Temporal Trends',
    lines: [
      'Shows how many posts were collected per day across the analysis period.',
      'A steady rise may indicate growing community activity around your keywords.',
      'Sharp spikes often correspond to news events, product launches, or viral moments.',
      'Flat or declining lines suggest the topic is losing traction or the time window is too narrow.',
      'Use this to identify the most active periods before narrowing your date filter.',
    ],
  },
  distribution: {
    title: 'Influence Score Distribution',
    lines: [
      'Breaks down how many users fall into each INFLUENT score range.',
      'A heavy left skew (most users in low ranges) is normal ; true influence is rare.',
      'A wide spread across ranges suggests a healthy, diverse community.',
      'If most users cluster in one narrow band, consider adjusting your keyword filters or minimum followers threshold.',
      'The rightmost bars represent your top-tier influencers worth targeting.',
    ],
  },
  engagement: {
    title: 'Engagement Trends',
    lines: [
      'Tracks average likes, replies, and retweets per post over time.',
      'High replies relative to likes may signal controversy or debate around your keywords.',
      'High retweets with low replies suggest content is being amplified passively.',
      'A divergence between likes and retweets can indicate viral but polarizing content.',
      'Compare this chart with Temporal Trends ; spikes in posts don\'t always mean spikes in engagement.',
    ],
  },
};

const InfoPopover: React.FC<{ chartKey: string }> = ({ chartKey }) => {
  const [open, setOpen] = useState(false);
  const info = chartInfo[chartKey];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 rounded-full border-2 border-purple-300 dark:border-purple-700 text-purple-500 dark:text-purple-400 text-xs font-bold flex items-center justify-center hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
        aria-label={`Info about ${info.title}`}
      >
        ?
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-8 z-50 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{info.title}</p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={14} />
              </button>
            </div>
            <ul className="space-y-2">
              {info.lines.map((line, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-400 dark:bg-purple-500 flex-shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
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
      const response = await fetch('http://localhost:3001/api/analytics');
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
      const response = await fetch('http://localhost:3001/api/export/analytics', {
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
                <InfoPopover chartKey="temporal" />
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
                <InfoPopover chartKey="distribution" />
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
                <InfoPopover chartKey="engagement" />
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