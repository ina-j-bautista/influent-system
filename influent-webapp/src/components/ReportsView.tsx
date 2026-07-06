import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, MessageCircle, Target, FileText, Download, BarChart3, ShieldAlert } from 'lucide-react';

interface ReportStats {
  totalInfluencers: number;
  avgInfluenceScore: number;
  totalTopicReach: number;
  avgEngagement: number;
}

interface KeywordData {
  keyword: string;
  frequency: number;
}

interface FlaggedAccount {
  user_id: string;
  display_name: string;
  followers: number;
  account_flag: string;
  flag_reason: string | null;
  first_flagged_at: string | null;
  confirmations: number | null;
}

const ReportsView: React.FC = () => {
  const [stats, setStats] = useState<ReportStats>({
    totalInfluencers: 0,
    avgInfluenceScore: 0,
    totalTopicReach: 0,
    avgEngagement: 0
  });
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState<FlaggedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
    fetchFlaggedAccounts();
  }, []);

  const fetchFlaggedAccounts = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/flagged-accounts');
      const data = await response.json();
      setFlaggedAccounts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch flagged accounts:', error);
    }
  };

  const fetchReportData = async () => {
    try {
      const statsResponse = await fetch('http://localhost:3001/api/stats');
      const statsData = await statsResponse.json();

      const keywordsResponse = await fetch('http://localhost:3001/api/reports/keywords');
      const keywordsData = await keywordsResponse.json();

      setStats({
        totalInfluencers: parseInt(statsData.users) || 0,
        avgInfluenceScore: 80.3,
        totalTopicReach: 3300000,
        avgEngagement: 4.5
      });

      setKeywords(keywordsData.slice(0, 10));
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch report data:', error);
      setLoading(false);
    }
  };

  const exportReport = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/export/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `influent-complete-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const StatCard = ({ icon, title, value, color }: any) => (
    <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center shadow-lg`}>
          <div className="text-white">{icon}</div>
        </div>
      </div>
      <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">{value}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">{title}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-slate-50 dark:bg-slate-950">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
              Reports & Insights
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">Overview of your influence analysis results</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={<Users size={24} />}
            title="Total Influencers"
            value={stats.totalInfluencers.toLocaleString()}
            color="from-purple-600 to-purple-700"
          />
          <StatCard
            icon={<TrendingUp size={24} />}
            title="Avg Influence Score"
            value={`${stats.avgInfluenceScore.toFixed(1)}%`}
            color="from-purple-600 to-purple-700"
          />
          <StatCard
            icon={<Target size={24} />}
            title="Total Topic Reach"
            value={`${(stats.totalTopicReach / 1000000).toFixed(1)}M`}
            color="from-purple-600 to-purple-700"
          />
          <StatCard
            icon={<MessageCircle size={24} />}
            title="Avg Engagement"
            value={`${stats.avgEngagement.toFixed(1)}%`}
            color="from-purple-600 to-purple-700"
          />
        </div>

        {/* Keyword Analysis */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Keyword Analysis
              </h2>
            </div>
          </div>

          {keywords.length > 0 ? (
            <>
              {/* Most Used Keywords - Bubble Tags */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Most Used Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((kw, index) => (
                    <div
                      key={index}
                      className="group relative px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700 rounded-full transition-all cursor-default"
                      title={`${kw.frequency} mentions`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{kw.keyword}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">({kw.frequency})</span>
                      </div>
                      {/* Hover Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg">
                        {kw.frequency} mentions
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Keyword Distribution - Top 5 Bars */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Keyword Distribution (Top 5)</h3>
                <div className="space-y-4">
                  {keywords.slice(0, 5).map((kw, index) => {
                    const maxFreq = Math.max(...keywords.slice(0, 5).map(k => k.frequency));
                    const percentage = (kw.frequency / maxFreq) * 100;
                    
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{kw.keyword}</span>
                          <span className="text-slate-600 dark:text-slate-400">{kw.frequency} mentions</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-purple-600 to-purple-700 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No keyword data available
            </div>
          )}
        </div>

        {/* Bot & Spam Detection */}
        {(() => {
          const excluded = flaggedAccounts.filter(a => a.account_flag === 'excluded');
          const suspected = flaggedAccounts.filter(a => a.account_flag === 'suspected');
          const totalFlagged = excluded.length + suspected.length;
          const totalIngested = stats.totalInfluencers + excluded.length;

          return (
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <ShieldAlert className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Bot &amp; Spam Detection
                </h2>
              </div>

              {/* Summary chips */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalIngested}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Accounts Ingested</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{totalIngested - totalFlagged}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Clean</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{suspected.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Suspected</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">{excluded.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Excluded</p>
                </div>
              </div>

              {/* Flagged accounts table */}
              {flaggedAccounts.length > 0 ? (
                <div className="overflow-auto max-h-64 rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">User ID</th>
                        <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">Display Name</th>
                        <th className="text-right px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">Followers</th>
                        <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">Tag</th>
                        <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">Reason</th>
                        <th className="text-right px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">Confirmations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {flaggedAccounts.map((account) => (
                        <tr key={account.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">@{account.user_id}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{account.display_name || '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{(account.followers || 0).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              account.account_flag === 'excluded'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                            }`}>
                              {account.account_flag}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">{account.flag_reason || '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{account.confirmations ?? 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">
                  No flagged accounts — run an analysis to populate this table.
                </div>
              )}

              {/* Note */}
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Excluded accounts were removed from the interaction graph before scoring so they cannot inflate PageRank values.
                Suspected accounts are retained but flagged for review. Accounts flagged across multiple runs accumulate
                confirmation counts, raising confidence in their exclusion.
              </p>
            </div>
          );
        })()}

        {/* Export Section */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 border-2 border-purple-200 dark:border-purple-800 rounded-xl p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Download className="w-6 h-6 text-purple-700 dark:text-purple-400" />
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Export Complete Report
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Download a comprehensive CSV report with all influencer data, metrics, and analysis
              </p>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400"></div>
                  Full influencer profiles and metrics
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400"></div>
                  Engagement and relevancy scores
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400"></div>
                  Network connections and interactions
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400"></div>
                  Computation time breakdown
                </li>
              </ul>
            </div>
            <button
              onClick={exportReport}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-200 flex items-center gap-3 text-lg"
            >
              <Download size={20} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Top Influencer</h4>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-400 mb-1">95.8%</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Influence Score</p>
          </div>
          
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Network Density</h4>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-400 mb-1">68.3%</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Connection Rate</p>
          </div>
          
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Active Keywords</h4>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-400 mb-1">{keywords.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Topics</p>
          </div>
        </div>

        {/* Analysis Period */}
        <div className="mt-8 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Analysis Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Analysis Date</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {new Date().toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Data Points</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {(stats.totalInfluencers * 20).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Processing Time</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                ~45s
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Algorithm</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                INFLUENT
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;