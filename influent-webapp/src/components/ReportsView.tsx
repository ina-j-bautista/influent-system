import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, MessageCircle, Target } from 'lucide-react';

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

const ReportsView: React.FC = () => {
  const [stats, setStats] = useState<ReportStats>({
    totalInfluencers: 0,
    avgInfluenceScore: 0,
    totalTopicReach: 0,
    avgEngagement: 0
  });
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      // Fetch influencer stats
      const statsResponse = await fetch('http://localhost:3001/api/stats');
      const statsData = await statsResponse.json();

      // Fetch keyword analysis
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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900 mb-2">Influencer Database</h1>
            <p className="text-stone-600">Overview of your influence analysis results</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-white">
              Filters
            </button>
            <button className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
              Export Report
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={<Users size={24} />}
            title="Total Influencers"
            value={stats.totalInfluencers}
            color="text-stone-900"
          />
          <StatCard
            icon={<Target size={24} />}
            title="Avg Influence Score"
            value={stats.avgInfluenceScore.toFixed(1)}
            trend="+5%"
            color="text-stone-900"
          />
          <StatCard
            icon={<MessageCircle size={24} />}
            title="Total Topic Reach"
            value={`${(stats.totalTopicReach / 1000000).toFixed(1)}M`}
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
            {/* Most Used Keywords */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-stone-400" />
                <h3 className="font-semibold text-stone-900">Most Used Keywords</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 bg-stone-100 border border-stone-200 rounded-lg text-sm font-medium text-stone-700"
                  >
                    {keyword.keyword}
                    <span className="ml-2 text-stone-500">({keyword.frequency})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Keyword Distribution Chart */}
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
          </div>
        </div>

        {/* Additional Insights Section */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          {/* Top Influencers by Category */}
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">
              Top Influencers by Score Range
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">High Score (80-100%)</span>
                <span className="text-sm font-semibold text-stone-900">12 influencers</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Medium Score (50-80%)</span>
                <span className="text-sm font-semibold text-stone-900">45 influencers</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Low Score (0-50%)</span>
                <span className="text-sm font-semibold text-stone-900">23 influencers</span>
              </div>
            </div>
          </div>

          {/* Network Statistics */}
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">
              Network Statistics
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Total Connections</span>
                <span className="text-sm font-semibold text-stone-900">2,456</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Avg Connections per User</span>
                <span className="text-sm font-semibold text-stone-900">30.7</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Network Density</span>
                <span className="text-sm font-semibold text-stone-900">42.3%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;
