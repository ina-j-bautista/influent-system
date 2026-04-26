import React, { useState, useEffect } from 'react';
import { Search, Filter, X } from 'lucide-react';

interface Node {
  id: string;
  name: string;
  followers: number;
  influenceScore: number;
  bio?: string;
  location?: string;
}

const NetworkView: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchNetworkData();
  }, []);

  const fetchNetworkData = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/network-data');
      const data = await response.json();
      setNodes(data.nodes || []);
    } catch (error) {
      console.error('Failed to fetch network data:', error);
    }
  };

  return (
    <div className="h-screen flex">
      {/* Main Network Graph */}
      <div className="flex-1 relative bg-stone-50">
        {/* Header */}
        <div className="bg-white border-b border-stone-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-stone-900">Influence Network Map</h2>
            
            <div className="flex items-center gap-4">
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
              <button className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50">
                Filters
              </button>
              <button className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Network Grid View */}
        <div className="p-8">
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <p className="text-center text-stone-500 mb-4">
              3D Network visualization will be available soon. For now, view influencers in the table view.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-6">
              {nodes.slice(0, 9).map((node) => (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className="border border-stone-200 rounded-lg p-4 hover:bg-stone-50 cursor-pointer"
                >
                  <div className="w-12 h-12 border border-stone-300 mb-3 flex items-center justify-center mx-auto">
                    <div className="w-8 h-8 border border-stone-300" style={{ transform: 'rotate(45deg)' }} />
                  </div>
                  <h3 className="font-semibold text-stone-900 text-center text-sm">{node.name}</h3>
                  <p className="text-xs text-stone-500 text-center">@{node.id}</p>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-stone-600">Score: </span>
                    <span className="text-xs font-mono text-stone-900">
                      {(node.influenceScore * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white border border-stone-200 rounded-lg p-4 shadow-lg">
          <h3 className="text-sm font-semibold text-stone-900 mb-3">Legend</h3>
          <div className="space-y-2 text-xs text-stone-600">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-stone-900"></div>
              <span>Node Size = Follower Count</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-stone-900 opacity-30"></div>
              <span>Opacity = Influence Score</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Sidebar */}
      {selectedNode && (
        <div className="w-96 bg-white border-l border-stone-200 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-lg font-semibold text-stone-900">Influencer Profile</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="w-32 h-32 mx-auto mb-4 border-2 border-stone-300 flex items-center justify-center">
              <div className="w-20 h-20 border border-stone-300" style={{ transform: 'rotate(45deg)' }} />
            </div>

            <div className="text-center mb-6">
              <h4 className="text-xl font-semibold text-stone-900 mb-1">{selectedNode.name}</h4>
              <p className="text-stone-600">@{selectedNode.id}</p>
              {selectedNode.location && (
                <p className="text-sm text-stone-500 mt-2">📍 {selectedNode.location}</p>
              )}
            </div>

            {selectedNode.bio && (
              <div className="mb-6">
                <h5 className="text-sm font-semibold text-stone-900 mb-2">Bio</h5>
                <p className="text-sm text-stone-600 leading-relaxed">{selectedNode.bio}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-stone-50 p-4 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">Followers</p>
                <p className="text-lg font-semibold text-stone-900">
                  {selectedNode.followers.toLocaleString()}
                </p>
              </div>
              <div className="bg-stone-50 p-4 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">Influence Score</p>
                <p className="text-lg font-semibold text-stone-900">
                  {(selectedNode.influenceScore * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                View Full Profile
              </button>
              <button className="w-full px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50">
                Export Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkView;