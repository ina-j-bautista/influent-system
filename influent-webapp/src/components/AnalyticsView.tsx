import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Calendar } from 'lucide-react';

interface TemporalData {
  date: string;
  post_count: number;
}

interface ScoreDistribution {
  range: string;
  count: number;
}

const AnalyticsView: React.FC = () => {
  const [allTemporalData, setAllTemporalData] = useState<TemporalData[]>([]);
  const [displayTemporalData, setDisplayTemporalData] = useState<TemporalData[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLast30Days, setShowLast30Days] = useState(false);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  useEffect(() => {
    // Filter data when Last 30 Days toggle changes
    if (allTemporalData.length > 0) {
      filterTemporalData();
    }
  }, [showLast30Days, allTemporalData]);

  const fetchAnalyticsData = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/analytics');
      const data = await response.json();

      setAllTemporalData(data.temporalData || []);
      setDisplayTemporalData(data.temporalData || []);
      setScoreDistribution(data.scoreDistribution || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setLoading(false);
    }
  };

  const filterTemporalData = () => {
    if (showLast30Days && allTemporalData.length > 0) {
      // Get data from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const filtered = allTemporalData.filter(d => {
        const dataDate = new Date(d.date);
        return dataDate >= thirtyDaysAgo;
      });

      setDisplayTemporalData(filtered);
    } else {
      setDisplayTemporalData(allTemporalData);
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

  const exportAnalytics = async () => {
    try {
      // Prepare last 30 days data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const last30DaysData = allTemporalData.filter(d => {
        const dataDate = new Date(d.date);
        return dataDate >= thirtyDaysAgo;
      });

      const response = await fetch('http://localhost:3001/api/export/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullData: {
            temporalData: allTemporalData,
            scoreDistribution
          },
          last30DaysData: {
            temporalData: last30DaysData,
            scoreDistribution
          }
        })
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

  const exportIndividualCSV = (type: 'temporal' | 'distribution') => {
    if (type === 'temporal') {
      exportToCSV(displayTemporalData, `temporal-trends-${showLast30Days ? 'last30days' : 'full'}-${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      exportToCSV(scoreDistribution, `score-distribution-${new Date().toISOString().split('T')[0]}.csv`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-stone-500">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-stone-50">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900 mb-2">Analytics Dashboard</h1>
            <p className="text-stone-600">Track trends and insights over time</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowLast30Days(!showLast30Days)}
              className={`px-4 py-2 border rounded-lg flex items-center gap-2 transition-colors ${
                showLast30Days 
                  ? 'bg-stone-900 text-white border-stone-900' 
                  : 'border-stone-300 hover:bg-white'
              }`}
            >
              <Calendar size={18} />
              Last 30 Days
            </button>
            <button 
              onClick={exportAnalytics}
              className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 flex items-center gap-2"
            >
              <Download size={18} />
              Export All
            </button>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Temporal Trends */}
          <div className="bg-white border border-stone-200 rounded-lg p-6 col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">Temporal Trends</h2>
                {showLast30Days && (
                  <p className="text-sm text-stone-500 mt-1">Showing last 30 days only</p>
                )}
              </div>
              <button
                onClick={() => exportIndividualCSV('temporal')}
                className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50 flex items-center gap-2 text-sm"
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
            {displayTemporalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={displayTemporalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#78716c"
                    tick={{ fill: '#78716c', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#78716c"
                    tick={{ fill: '#78716c', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e7e5e4',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="post_count" 
                    stroke="#1c1917" 
                    strokeWidth={2}
                    dot={{ fill: '#1c1917', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-72 flex items-center justify-center text-stone-500">
                No temporal data available
              </div>
            )}
          </div>

          {/* Score Distribution */}
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-stone-900">
                Influence Score Distribution
              </h2>
              <button
                onClick={() => exportIndividualCSV('distribution')}
                className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-50 flex items-center gap-2 text-sm"
              >
                <Download size={14} />
                CSV
              </button>
            </div>
            {scoreDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis 
                    dataKey="range" 
                    stroke="#78716c"
                    tick={{ fill: '#78716c', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#78716c"
                    tick={{ fill: '#78716c', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e7e5e4',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#1c1917"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-72 flex items-center justify-center text-stone-500">
                No distribution data available
              </div>
            )}
          </div>

          {/* Engagement Trends */}
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">
                  Engagement Trends
                </h2>
                {showLast30Days && (
                  <p className="text-sm text-stone-500 mt-1">Showing last 30 days only</p>
                )}
              </div>
              <button
                onClick={() => exportIndividualCSV('temporal')}
                className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-50 flex items-center gap-2 text-sm"
              >
                <Download size={14} />
                CSV
              </button>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={displayTemporalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis 
                  dataKey="date" 
                  stroke="#78716c"
                  tick={{ fill: '#78716c', fontSize: 12 }}
                />
                <YAxis 
                  stroke="#78716c"
                  tick={{ fill: '#78716c', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e7e5e4',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="post_count" 
                  stroke="#44403c" 
                  strokeWidth={2}
                  dot={{ fill: '#44403c', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <p className="text-sm text-stone-600 mb-2">Total Data Points</p>
            <p className="text-2xl font-semibold text-stone-900">
              {displayTemporalData.length}
            </p>
            {showLast30Days && (
              <p className="text-xs text-stone-500 mt-1">Last 30 days</p>
            )}
          </div>
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <p className="text-sm text-stone-600 mb-2">Avg Posts/Day</p>
            <p className="text-2xl font-semibold text-stone-900">
              {displayTemporalData.length > 0 
                ? (displayTemporalData.reduce((sum, d) => sum + d.post_count, 0) / displayTemporalData.length).toFixed(1)
                : '0'
              }
            </p>
            {showLast30Days && (
              <p className="text-xs text-stone-500 mt-1">Last 30 days</p>
            )}
          </div>
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <p className="text-sm text-stone-600 mb-2">Peak Activity</p>
            <p className="text-2xl font-semibold text-stone-900">
              {displayTemporalData.length > 0 
                ? Math.max(...displayTemporalData.map(d => d.post_count))
                : '0'
              }
            </p>
            {showLast30Days && (
              <p className="text-xs text-stone-500 mt-1">Last 30 days</p>
            )}
          </div>
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <p className="text-sm text-stone-600 mb-2">Total Users</p>
            <p className="text-2xl font-semibold text-stone-900">
              {scoreDistribution.reduce((sum, d) => sum + d.count, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;