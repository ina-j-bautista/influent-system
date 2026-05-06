import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, MessageCircle, Target, Download, Filter, ChevronDown } from 'lucide-react';

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

interface Influencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  influent_score: number;
  is_verified?: boolean;
  is_blue_verified?: boolean;
}

const ReportsView: React.FC = () => {
  const [allInfluencers, setAllInfluencers] = useState<Influencer[]>([]);
  const [stats, setStats] = useState<ReportStats>({
    totalInfluencers: 0,
    avgInfluenceScore: 0,
    totalTopicReach: 0,
    avgEngagement: 0
  });
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState({
    high: 0,
    medium: 0,
    low: 0
  });
  const [networkStats, setNetworkStats] = useState({
    totalConnections: 0,
    avgConnectionsPerUser: 0,
    networkDensity: 0
  });
  const [loading, setLoading] = useState(true);
  const [filterDropdown, setFilterDropdown] = useState(false);

  // Filter states
  const [excludeBlueVerified, setExcludeVerified] = useState(false);
  const [scoreRanges, setScoreRanges] = useState({
    high: true,
    medium: true,
    low: true
  });

  useEffect(() => {
    fetchReportData();
  }, []);

  useEffect(() => {
    // Recalculate stats when filters change
    if (allInfluencers.length > 0) {
      calculateStats(allInfluencers);
    }
  }, [excludeBlueVerified, scoreRanges, allInfluencers]);

  const fetchReportData = async () => {
    try {
      const influencersResponse = await fetch('http://localhost:3001/api/influencers');
      const influencers: Influencer[] = await influencersResponse.json();

      const keywordsResponse = await fetch('http://localhost:3001/api/reports/keywords');
      const keywordsData = await keywordsResponse.json();

      setAllInfluencers(influencers);
      setKeywords(keywordsData.slice(0, 10));
      calculateStats(influencers);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch report data:', error);
      setLoading(false);
    }
  };

  const applyFilters = (influencer: Influencer): boolean => {
    if (excludeBlueVerified && influencer.is_blue_verified) {
      return false;
    }

    const score = influencer.influent_score;
    if (score >= 80 && !scoreRanges.high) return false;
    if (score >= 50 && score < 80 && !scoreRanges.medium) return false;
    if (score < 50 && !scoreRanges.low) return false;

    return true;
  };

  const calculateStats = (influencers: Influencer[]) => {
    const filtered = influencers.filter(applyFilters);
    const totalInfluencers = filtered.length;

    const avgInfluenceScore = totalInfluencers > 0
      ? filtered.reduce((sum, inf) => sum + inf.influent_score, 0) / totalInfluencers
      : 0;

    const totalTopicReach = filtered.reduce((sum, inf) => sum + inf.followers, 0);

    const avgEngagement = totalInfluencers > 0
      ? filtered.reduce((sum, inf) => sum + inf.engagement, 0) / totalInfluencers
      : 0;

    const high = filtered.filter(inf => inf.influent_score >= 80).length;
    const medium = filtered.filter(inf => inf.influent_score >= 50 && inf.influent_score < 80).length;
    const low = filtered.filter(inf => inf.influent_score < 50).length;

    const totalConnections = totalInfluencers > 0 ? totalInfluencers * (totalInfluencers - 1) : 0;
    const avgConnectionsPerUser = totalInfluencers > 1 ? totalInfluencers - 1 : 0;
    const maxPossibleConnections = totalInfluencers > 0 ? totalInfluencers * (totalInfluencers - 1) : 1;
    const networkDensity = (totalConnections / maxPossibleConnections) * 100;

    setStats({
      totalInfluencers,
      avgInfluenceScore,
      totalTopicReach,
      avgEngagement
    });

    setScoreDistribution({ high, medium, low });

    setNetworkStats({
      totalConnections,
      avgConnectionsPerUser,
      networkDensity
    });
  };

  const exportReport = async () => {
    try {
      const filteredInfluencers = allInfluencers.filter(applyFilters);
      
      const response = await fetch('http://localhost:3001/api/export/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats,
          scoreDistribution,
          networkStats,
          keywords,
          filters: {
            excludeBlueVerified,
            scoreRanges
          },
          userIds: filteredInfluencers.map(inf => inf.user_id)
        })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `influent-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const StatCard = ({ icon, title, value, trend, color }: any) => (
    <div className="bg-white border border-stone-200 rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 ${color} bg-opacity-10 rounded-lg flex items-center justify-center`}>
          <div className={color}>{icon}</div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <TrendingUp size={14} />
            <span>{trend}</span>
          </div>
        )}
      </div>
      <h3 className="text-2xl font-semibold text-stone-900 mb-1">{value}</h3>
      <p className="text-sm text-stone-600">{title}</p>
    </div>
  );

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-stone-500">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-stone-50">
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900 mb-2">Influence Reports</h1>
            <p className="text-stone-600">Overview of your influence analysis results</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setFilterDropdown(!filterDropdown)}
                className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-white flex items-center gap-2"
              >
                <Filter size={18} />
                Filters
                <ChevronDown size={16} />
              </button>
              {filterDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-stone-200 rounded-lg shadow-lg p-4 z-10">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-stone-900 mb-2">Account Type</p>
                    <label className="flex items-center gap-2 text-sm text-stone-600">
                      <input 
                        type="checkbox"
                        checked={excludeBlueVerified}
                        onChange={(e) => setExcludeVerified(e.target.checked)}
                        className="rounded"
                      />
                      Exclude Paid Twitter Accounts
                    </label>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-stone-900 mb-2">Influence Range</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-stone-600">
                        <input 
                          type="checkbox"
                          checked={scoreRanges.high}
                          onChange={(e) => setScoreRanges({...scoreRanges, high: e.target.checked})}
                          className="rounded"
                        />
                        High (80-100%)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-stone-600">
                        <input 
                          type="checkbox"
                          checked={scoreRanges.medium}
                          onChange={(e) => setScoreRanges({...scoreRanges, medium: e.target.checked})}
                          className="rounded"
                        />
                        Medium (50-80%)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-stone-600">
                        <input 
                          type="checkbox"
                          checked={scoreRanges.low}
                          onChange={(e) => setScoreRanges({...scoreRanges, low: e.target.checked})}
                          className="rounded"
                        />
                        Low (0-50%)
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={exportReport}
              className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 flex items-center gap-2"
            >
              <Download size={18} />
              Export Report
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<Users size={24} />}
            title="Total Influencers"
            value={stats.totalInfluencers}
            color="text-stone-900"
          />
          <StatCard
            icon={<Target size={24} />}
            title="Avg Influence Score"
            value={stats.avgInfluenceScore.toFixed(1) + '%'}
            color="text-stone-900"
          />
          <StatCard
            icon={<TrendingUp size={24} />}
            title="Average Engagement"
            value={`${stats.avgEngagement.toFixed(1)}%`}
            color="text-stone-900"
          />
        </div>

        {/* Key Insights */}
        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-stone-900 mb-6">Key Insights</h2>

          <div className="space-y-6">
            {/* Keywords */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-stone-400" />
                <h3 className="font-semibold text-stone-900">Most Used Keywords</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.length > 0 ? (
                  keywords.map((keyword, index) => (
                    <div
                      key={index}
                      className="px-4 py-2 bg-stone-100 border border-stone-200 rounded-lg text-sm font-medium text-stone-700"
                    >
                      {keyword.keyword}
                      <span className="ml-2 text-stone-500">({keyword.frequency})</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">No keywords available. Run an analysis first.</p>
                )}
              </div>
            </div>

            {/* Keyword Distribution */}
            {keywords.length > 0 && (
              <div>
                <h3 className="font-semibold text-stone-900 mb-4">Keyword Distribution</h3>
                <div className="space-y-2">
                  {keywords.slice(0, 5).map((keyword, index) => {
                    const maxFreq = Math.max(...keywords.map(k => k.frequency));
                    const percentage = (keyword.frequency / maxFreq) * 100;

                    return (
                      <div key={index} className="flex items-center gap-4">
                        <span className="text-sm text-stone-600 w-32 truncate">
                          {keyword.keyword}
                        </span>
                        <div className="flex-1 bg-stone-200 h-8 rounded overflow-hidden">
                          <div 
                            className="bg-stone-900 h-full flex items-center justify-end pr-3"
                            style={{ width: `${percentage}%` }}
                          >
                            <span className="text-xs text-white font-medium">
                              {keyword.frequency}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score Distribution & Network Stats */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">
              Influencers by Score Range
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">High Score (80-100%)</span>
                <span className="text-sm font-semibold text-stone-900">
                  {scoreDistribution.high} influencers
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Medium Score (50-80%)</span>
                <span className="text-sm font-semibold text-stone-900">
                  {scoreDistribution.medium} influencers
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Low Score (0-50%)</span>
                <span className="text-sm font-semibold text-stone-900">
                  {scoreDistribution.low} influencers
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">
              Network Statistics
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Total Connections</span>
                <span className="text-sm font-semibold text-stone-900">
                  {formatNumber(networkStats.totalConnections)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Avg Connections per User</span>
                <span className="text-sm font-semibold text-stone-900">
                  {networkStats.avgConnectionsPerUser.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Network Density</span>
                <span className="text-sm font-semibold text-stone-900">
                  {networkStats.networkDensity.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;