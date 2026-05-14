/**
 * Imports
 */
import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronUp, X, Share2, Download, TrendingUp } from 'lucide-react';

/**
 * Type Definitions
 */
interface Influencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  relevancy: number;
  influent_score: number;
  bio?: string;
  location?: string;
  is_verified?: boolean;
  is_blue_verified?: boolean;
}

/**
 * Component Definition: InfluencersView
 */
const InfluencersView: React.FC = () => {
  /**
   * State Hooks: UI and Data
   */
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'influent_score' | 'followers' | 'engagement' | 'relevancy'>('influent_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDropdown, setFilterDropdown] = useState(false);
  
  /**
   * State Hooks: Filtering Logic
   */
  const [excludeBlueVerified, setExcludeBlueVerified] = useState(false);
  const [scoreRanges, setScoreRanges] = useState({
    high: true,    // 80 to 100%
    medium: true,  // 50 to 80%
    low: true      // 0 to 50%
  });

  /**
   * Component Lifecycle: Initial Data Fetch
   */
  useEffect(() => {
    fetchInfluencers();
  }, []);

  /**
   * API Logic: Fetch and Validate Influencer Data
   */
  const fetchInfluencers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/influencers');
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const validInfluencers = data.filter(inf => 
          inf.user_id && 
          inf.display_name && 
          inf.user_id.trim() !== '' &&
          inf.display_name.trim() !== ''
        ).map(inf => ({
          ...inf,
          relevancy: inf.relevancy || 0
        }));
        setInfluencers(validInfluencers);
      } else {
        console.error('API returned non-array:', data);
        setInfluencers([]); 
      }
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
      setInfluencers([]);
    }
  };

  /**
   * Event Handler: Table Column Sorting
   */
  const handleSort = (field: 'influent_score' | 'followers' | 'engagement' | 'relevancy') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  /**
   * Helper Logic: Core Filtering Criteria
   */
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

  /**
   * Data Processing: Search, Filter, and Sort Applied to Dataset
   */
  const sortedInfluencers = [...influencers]
    .filter(inf => {
      const searchLower = searchTerm.toLowerCase();
      const nameMatch = inf.display_name?.toLowerCase().includes(searchLower) || false;
      const idMatch = inf.user_id?.toLowerCase().includes(searchLower) || false;
      return nameMatch || idMatch;
    })
    .filter(applyFilters)
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

  /**
   * API Logic: Trigger Detailed CSV Export
   */
  const exportFullCalculation = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/export/full-calculation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excludeBlueVerified,
          scoreRanges,
          userIds: sortedInfluencers.map(inf => inf.user_id)
        })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `influent-full-calculation-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  /**
   * Sub-component: Sorting UI Indicator
   */
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp size={16} className="text-purple-600 dark:text-purple-400" /> : 
      <ChevronDown size={16} className="text-purple-600 dark:text-purple-400" />;
  };

  /**
   * Main Layout Render
   */
  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950">
      
      {/**
       * Primary Data View Section
       */}
      <div className="flex-1 flex flex-col">
        
        {/**
         * View Controls Header
         */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                Influencer Database
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              {/**
               * Search Bar Interface
               */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search influencers..."
                  className="pl-10 pr-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-all"
                />
              </div>

              {/**
               * Filtering Control Popover
               */}
              <div className="relative">
                <button
                  onClick={() => setFilterDropdown(!filterDropdown)}
                  className="px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 text-slate-700 dark:text-slate-300 transition-all"
                >
                  <Filter size={18} />
                  Filter
                  <ChevronDown size={16} className={`transition-transform ${filterDropdown ? 'rotate-180' : ''}`} />
                </button>
                {filterDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 z-10">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Account Type</p>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={excludeBlueVerified}
                          onChange={(e) => setExcludeBlueVerified(e.target.checked)}
                          className="rounded accent-purple-600"
                        />
                        Exclude Paid Twitter Accounts
                      </label>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Influence Range</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={scoreRanges.high}
                            onChange={(e) => setScoreRanges({...scoreRanges, high: e.target.checked})}
                            className="rounded accent-purple-600"
                          />
                          High (80 to 100%)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={scoreRanges.medium}
                            onChange={(e) => setScoreRanges({...scoreRanges, medium: e.target.checked})}
                            className="rounded accent-purple-600"
                          />
                          Medium (50 to 80%)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={scoreRanges.low}
                            onChange={(e) => setScoreRanges({...scoreRanges, low: e.target.checked})}
                            className="rounded accent-purple-600"
                          />
                          Low (0 to 50%)
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={exportFullCalculation}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-purple-500/30 transition-all duration-200"
              >
                <Download size={18} />
                Export
              </button>
            </div>
          </div>
        </div>

        {/**
         * Interactive Data Table
         */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Name</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Handle</th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('followers')}
                >
                  <div className="flex items-center gap-2">
                    Followers
                    <SortIcon field="followers" />
                  </div>
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('engagement')}
                >
                  <div className="flex items-center gap-2">
                    Engagement
                    <SortIcon field="engagement" />
                  </div>
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('relevancy')}
                >
                  <div className="flex items-center gap-2">
                    Relevancy
                    <SortIcon field="relevancy" />
                  </div>
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => handleSort('influent_score')}
                >
                  <div className="flex items-center gap-2">
                    Score
                    <SortIcon field="influent_score" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedInfluencers.map((influencer) => (
                <tr
                  key={influencer.user_id}
                  onClick={() => setSelectedInfluencer(influencer)}
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-purple-50 dark:hover:bg-purple-900/10 cursor-pointer transition-colors ${
                    selectedInfluencer?.user_id === influencer.user_id ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-white dark:bg-slate-950'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg flex items-center justify-center text-white font-bold">
                        {influencer.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{influencer.display_name}</span>
                        {influencer.is_verified && <span className="text-blue-500">✓</span>}
                        {influencer.is_blue_verified && <span className="text-amber-500">★</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">@{influencer.user_id}</td>
                  <td className="px-6 py-4 text-slate-900 dark:text-slate-100">{influencer.followers.toLocaleString()}</td>
                  <td className="px-6 py-4 text-slate-900 dark:text-slate-100">{influencer.engagement.toFixed(1)}%</td>
                  <td className="px-6 py-4 text-slate-900 dark:text-slate-100">{influencer.relevancy.toFixed(1)}%</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-purple-600 to-purple-700 h-full rounded-full transition-all"
                          style={{ width: `${influencer.influent_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 w-12">
                        {influencer.influent_score.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedInfluencers.length === 0 && (
            <div className="text-center py-12 text-slate-500">No influencers found</div>
          )}
        </div>
      </div>

      {/**
       * Individual Profile Detail Sidebar
       */}
      {selectedInfluencer && (
        <div className="w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-y-auto shadow-xl">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                Influencer Profile
              </h3>
              <div className="flex items-center gap-2">
                <button className="text-slate-400 hover:text-purple-600 transition-colors"><Share2 size={18} /></button>
                <button onClick={() => setSelectedInfluencer(null)} className="text-slate-400 hover:text-purple-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="w-32 h-32 mx-auto mb-4 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center text-white text-5xl font-bold shadow-lg shadow-purple-500/30">
              {selectedInfluencer.display_name.charAt(0).toUpperCase()}
            </div>

            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h4 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedInfluencer.display_name}</h4>
                {selectedInfluencer.is_verified && <span className="text-blue-500">✓</span>}
                {selectedInfluencer.is_blue_verified && <span className="text-amber-500">★</span>}
              </div>
              <p className="text-slate-600 dark:text-slate-400">@{selectedInfluencer.user_id}</p>
              {selectedInfluencer.location && (
                <p className="text-sm text-slate-500 mt-2 flex items-center justify-center gap-1">📍 {selectedInfluencer.location}</p>
              )}
            </div>

            {selectedInfluencer.bio && (
              <div className="mb-6">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Bio</h5>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{selectedInfluencer.bio}</p>
              </div>
            )}

            {/**
             * Profile Metric Grid
             */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 mb-1 font-medium">Followers</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedInfluencer.followers.toLocaleString()}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 mb-1 font-medium">Engagement</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedInfluencer.engagement.toFixed(1)}%</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 mb-1 font-medium">Relevancy</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedInfluencer.relevancy.toFixed(1)}%</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 mb-1 font-medium">Influence Score</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedInfluencer.influent_score.toFixed(1)}%</p>
              </div>
            </div>

            <div className="space-y-2">
              <button className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-xl shadow-lg transition-all">
                View in Network
              </button>
              <button className="w-full px-4 py-3 border-2 border-purple-200 dark:border-purple-800 rounded-xl text-slate-900 dark:text-slate-100 font-semibold transition-all">
                Export Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfluencersView;