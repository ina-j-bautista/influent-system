import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Filter, Maximize2 } from 'lucide-react';
import * as d3 from 'd3';

interface Influencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  influent_score: number;
  bio?: string;
  location?: string;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  followers: number;
  influenceScore: number;
  type: 'keyword' | 'influencer';
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
}

const NetworkView: React.FC = () => {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [keyword, setKeyword] = useState('AI');
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    fetchInfluencers();
  }, []);

  useEffect(() => {
    if (influencers.length > 0) {
      renderNetwork();
    }
  }, [influencers, dimensions]);

  const fetchInfluencers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/influencers');
      const data = await response.json();
      if (Array.isArray(data)) {
        setInfluencers(data);
      }
    } catch (error) {
      console.error('Failed to fetch influencers:', error);
    }
  };

  const renderNetwork = () => {
    if (!svgRef.current || influencers.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;

    // Create nodes: central keyword + influencers
    const nodes: Node[] = [
      {
        id: 'keyword',
        name: keyword,
        followers: 0,
        influenceScore: 100,
        type: 'keyword',
        x: width / 2,
        y: height / 2
      },
      ...influencers.map(inf => ({
        id: inf.user_id,
        name: inf.display_name,
        followers: inf.followers,
        influenceScore: inf.influent_score,
        type: 'influencer' as const
      }))
    ];

    // Create links: all influencers connect to keyword
    const links: Link[] = influencers.map(inf => ({
      source: 'keyword',
      target: inf.user_id
    }));

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => {
        const node = d as Node;
        if (node.type === 'keyword') return 60;
        return Math.sqrt(node.followers / 10000) + 20;
      }));

    // Create container group
    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#d6d3d1')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g');

    // Add drag behavior
    const drag = d3.drag<SVGGElement, Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag as any);

    // Add circles
    // Add circles
node.append('circle')
  .attr('r', d => {
    if (d.type === 'keyword') return 50;
    return Math.sqrt(d.followers / 10000) + 15;
  })
  .attr('fill', d => {
    if (d.type === 'keyword') return '#6366f1';
    
    const influencerNodes = nodes.filter(n => n.type === 'influencer');
    const minScore = Math.min(...influencerNodes.map(n => n.influenceScore));
    const maxScore = Math.max(...influencerNodes.map(n => n.influenceScore));
    const normalized = (d.influenceScore - minScore) / (maxScore - minScore || 1);
    const lightness = 75 - (normalized * 40);
    
    return `hsl(260, 60%, ${lightness}%)`;
  })
  .attr('stroke', '#4f46e5')
  .attr('stroke-width', 2)
  .attr('cursor', d => d.type === 'influencer' ? 'pointer' : 'default')
  .on('click', (event, d) => {
    event.stopPropagation();  // Prevent event bubbling
    if (d.type === 'influencer') {
      const inf = influencers.find(i => i.user_id === d.id);
      if (inf) {
        console.log('Clicked influencer:', inf);  // Debug log
        setSelectedInfluencer(inf);
      }
    }
  })
  .on('mouseover', function(event, d) {
    if (d.type === 'influencer') {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke-width', 3)
        .attr('stroke', '#818cf8');
    }
  })
  .on('mouseout', function() {
    d3.select(this)
      .transition()
      .duration(200)
      .attr('stroke-width', 2)
      .attr('stroke', '#4f46e5');
  });

    // Add labels
    // Add labels
    node.append('text')
      .text(d => d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => {
        if (d.type === 'keyword') return 5;
        const radius = Math.sqrt(d.followers / 10000) + 15;
        return radius + 15;
      })
      .attr('font-size', d => d.type === 'keyword' ? '14px' : '12px')
      .attr('font-weight', d => d.type === 'keyword' ? '600' : '500')
      .attr('fill', '#ffffff')  // White text
      .attr('stroke', '#000000')  // Black border
      .attr('stroke-width', '0.5px')  // Thin border
      .attr('paint-order', 'stroke')  // Draw stroke behind fill
      .attr('pointer-events', 'none');
    // Add follower count for influencers
    node.filter(d => d.type === 'influencer')
      .append('text')
      .text(d => {
        if (d.followers >= 1000000) return `${(d.followers / 1000000).toFixed(1)}M`;
        if (d.followers >= 1000) return `${(d.followers / 1000).toFixed(0)}K`;
        return d.followers.toString();
      })
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .attr('font-size', '10px')
      .attr('fill', '#6366f1') // Purple-blue
      .attr('pointer-events', 'none');

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x!)
        .attr('y1', d => (d.source as Node).y!)
        .attr('x2', d => (d.target as Node).x!)
        .attr('y2', d => (d.target as Node).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
  };

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('network-container');
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: container.clientHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  return (
    <div className="h-screen flex">
      {/* Main Network View */}
      <div className="flex-1 flex flex-col bg-stone-50">
        {/* Header */}
        <div className="bg-white border-b border-stone-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-stone-900 mb-1">Network View</h2>
              <p className="text-sm text-stone-600">Interactive influence network visualization</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Central keyword..."
                  className="pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
              <button className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-white flex items-center gap-2">
                <Filter size={18} />
                Filter
              </button>
              <button className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Network Canvas */}
        <div id="network-container" className="flex-1 bg-white relative">
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="border border-stone-200"
          />
          
         {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white border border-stone-200 rounded-lg p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Legend</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full" style={{ background: '#6366f1' }} />
            <span className="text-xs text-stone-600">Central Keyword</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full" style={{ background: 'hsl(260, 60%, 35%)' }} />
            <span className="text-xs text-stone-600">High Influence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full" style={{ background: 'hsl(260, 60%, 75%)' }} />
            <span className="text-xs text-stone-600">Low Influence</span>
          </div>
          <div className="text-xs text-stone-500 mt-2 pt-2 border-t border-stone-200">
            Node size = Follower count
          </div>
        </div>
      </div>
          {/* Stats */}
          <div className="absolute top-4 left-4 bg-white border border-stone-200 rounded-lg p-4 shadow-lg">
            <div className="text-xs text-stone-600 mb-1">Total Nodes</div>
            <div className="text-2xl font-semibold text-stone-900">{influencers.length + 1}</div>
          </div>
        </div>
      </div>

      {/* Profile Sidebar - Always visible */}
      <div className="w-96 bg-white border-l border-stone-200 overflow-y-auto">
        {selectedInfluencer ? (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-lg font-semibold text-stone-900">Influencer Profile</h3>
              <button
                onClick={() => setSelectedInfluencer(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={20} />
              </button>
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
                <p className="text-sm text-stone-500 mt-2">
                  📍 {selectedInfluencer.location}
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

            {/* Action Buttons */}
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                View Details
              </button>
              <button className="w-full px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50">
                Export Profile
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 border-2 border-stone-300 rounded-full flex items-center justify-center">
                <div className="w-16 h-16 border border-stone-300" style={{ transform: 'rotate(45deg)' }} />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 mb-2">No Selection</h3>
              <p className="text-sm text-stone-600">Click on a node to view influencer details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkView;
