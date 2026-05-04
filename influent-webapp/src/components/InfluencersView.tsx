import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronUp, X, Share2 } from 'lucide-react';

interface Influencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  influent_score: number;
  bio?: string;
  location?: string;
}

const InfluencersView: React.FC = () => {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'influent_score' | 'followers' | 'engagement'>('influent_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDropdown, setFilterDropdown] = useState(false);

  useEffect(() => {
    fetchInfluencers();
  }, []);

  const fetchInfluencers = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/influencers');
    const data = await response.json();
    
    if (Array.isArray(data)) {
      setInfluencers(data);
    } else {
      console.error('API returned non-array:', data);
      setInfluencers([]); 
    }
  } catch (error) {
    console.error('Failed to fetch influencers:', error);
    setInfluencers([]);
  }
};

  const handleSort = (field: 'influent_score' | 'followers' | 'engagement') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedInfluencers = [...influencers]
    .filter(inf => {
      const searchLower = searchTerm.toLowerCase();
      const nameMatch = inf.display_name?.toLowerCase().includes(searchLower) || false;
      const idMatch = inf.user_id?.toLowerCase().includes(searchLower) || false;
      return nameMatch || idMatch;
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />;
  };

  return (
    <div className="h-screen flex">
      {/* Main Table */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-stone-900">Influencer Database</h2>
            
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search influencers..."
                  className="pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 w-64"
                />
              </div>

              {/* Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setFilterDropdown(!filterDropdown)}
                  className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50 flex items-center gap-2"
                >
                  <Filter size={18} />
                  Filter
                  <ChevronDown size={16} />
                </button>
                {filterDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-lg shadow-lg p-4 z-10">
                    <p className="text-sm font-semibold text-stone-900 mb-2">Filter by Score</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-stone-600">
                        <input type="checkbox" className="rounded" />
                        High (80-100%)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-stone-600">
                        <input type="checkbox" className="rounded" />
                        Medium (50-80%)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-stone-600">
                        <input type="checkbox" className="rounded" />
                        Low (0-50%)
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <button className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200 sticky top-0">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-stone-700">
                  <div className="flex items-center gap-2">
                    Name
                  </div>
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-stone-700">
                  Handle
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-stone-700 cursor-pointer hover:bg-stone-100"
                  onClick={() => handleSort('followers')}
                >
                  <div className="flex items-center gap-2">
                    Followers
                    <SortIcon field="followers" />
                  </div>
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-stone-700 cursor-pointer hover:bg-stone-100"
                  onClick={() => handleSort('engagement')}
                >
                  <div className="flex items-center gap-2">
                    Engagement
                    <SortIcon field="engagement" />
                  </div>
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-semibold text-stone-700 cursor-pointer hover:bg-stone-100"
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
              {sortedInfluencers.map((influencer, index) => (
                <tr
                  key={influencer.user_id}
                  onClick={() => setSelectedInfluencer(influencer)}
                  className={`border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${
                    selectedInfluencer?.user_id === influencer.user_id ? 'bg-stone-50' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 border border-stone-300 flex items-center justify-center flex-shrink-0">
                        <div className="w-6 h-6 border border-stone-300" style={{ transform: 'rotate(45deg)' }} />
                      </div>
                      <span className="font-medium text-stone-900">{influencer.display_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-stone-600">@{influencer.user_id}</td>
                  <td className="px-6 py-4 text-stone-900">{influencer.followers.toLocaleString()}</td>
                  <td className="px-6 py-4 text-stone-900">
                    {influencer.engagement.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-stone-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-stone-900 h-full rounded-full"
                          style={{ width: `${influencer.influent_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono text-stone-900 w-12">
                        {influencer.influent_score.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedInfluencers.length === 0 && (
            <div className="text-center py-12 text-stone-500">
              No influencers found
            </div>
          )}
        </div>
      </div>

      {/* Profile Sidebar */}
      {selectedInfluencer && (
        <div className="w-96 bg-white border-l border-stone-200 overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-lg font-semibold text-stone-900">Influencer Profile</h3>
              <div className="flex items-center gap-2">
                <button className="text-stone-400 hover:text-stone-600">
                  <Share2 size={18} />
                </button>
                <button
                  onClick={() => setSelectedInfluencer(null)}
                  className="text-stone-400 hover:text-stone-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Profile Picture */}
            <div className="w-32 h-32 mx-auto mb-4 border-2 border-stone-300 flex items-center justify-center">
              <div className="w-20 h-20 border border-stone-300" style={{ transform: 'rotate(45deg)' }} />
            </div>

            {/* User Info */}
            <div className="text-center mb-6">
              <h4 className="text-xl font-semibold text-stone-900 mb-1">
                {selectedInfluencer.display_name}
              </h4>
              <p className="text-stone-600">@{selectedInfluencer.user_id}</p>
              {selectedInfluencer.location && (
                <p className="text-sm text-stone-500 mt-2 flex items-center justify-center gap-1">
                  <span>📍</span> {selectedInfluencer.location}
                </p>
              )}
            </div>

            {/* Bio */}
            {selectedInfluencer.bio && (
              <div className="mb-6">
                <h5 className="text-sm font-semibold text-stone-900 mb-2">Bio</h5>
                <p className="text-sm text-stone-600 leading-relaxed">
                  {selectedInfluencer.bio}
                </p>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-stone-50 p-4 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">Followers</p>
                <p className="text-lg font-semibold text-stone-900">
                  {selectedInfluencer.followers.toLocaleString()}
                </p>
              </div>
              <div className="bg-stone-50 p-4 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">Engagement</p>
                <p className="text-lg font-semibold text-stone-900">
                  {selectedInfluencer.engagement.toFixed(1)}%
                </p>
              </div>
              <div className="col-span-2 bg-stone-50 p-4 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">Influence Score</p>
                <p className="text-2xl font-semibold text-stone-900">
                  {selectedInfluencer.influent_score.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Key Topics */}
            <div className="mb-6">
              <h5 className="text-sm font-semibold text-stone-900 mb-3">Key Topics</h5>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-stone-100 text-stone-700 text-sm rounded-full border border-stone-200">
                  Keyword
                </span>
                <span className="px-3 py-1 bg-stone-100 text-stone-700 text-sm rounded-full border border-stone-200">
                  Keyword
                </span>
              </div>
            </div>

            {/* Component Breakdown */}
            <div className="mb-6">
              <h5 className="text-sm font-semibold text-stone-900 mb-3">Score Breakdown</h5>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-stone-600 mb-1">
                    <span>Sentiment Component</span>
                    <span>0.XX</span>
                  </div>
                  <div className="bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-stone-700 h-full" style={{ width: '60%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-stone-600 mb-1">
                    <span>Engagement Component</span>
                    <span>0.XX</span>
                  </div>
                  <div className="bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-stone-700 h-full" style={{ width: '75%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-stone-600 mb-1">
                    <span>Connection Component</span>
                    <span>0.XX</span>
                  </div>
                  <div className="bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-stone-700 h-full" style={{ width: '85%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                View in Network
              </button>
              <button className="w-full px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50">
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