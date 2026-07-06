import React, { useState, useEffect, useRef } from 'react';
import { X, Filter, Download, ChevronDown, Network as NetworkIcon } from 'lucide-react';
import * as d3 from 'd3';

interface Influencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  influent_score: number;
  bio?: string;
  location?: string;
  is_verified?: boolean;
  is_blue_verified?: boolean;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  followers: number;
  influenceScore: number;
  type: 'keyword' | 'influencer';
  keyword?: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  type: 'keyword-link' | 'interaction';
}

const NetworkView: React.FC = () => {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [keywords, setKeywords] = useState<string[]>(['AI']);
  const [userKeywords, setUserKeywords] = useState<Map<string, Set<string>>>(new Map());
  const [interactions, setInteractions] = useState<Array<{from_user: string, to_user: string}>>([]); 
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [filterDropdown, setFilterDropdown] = useState(false);

  // Filter states
  const [excludeBlueVerified, setExcludeBlueVerified] = useState(false);
  const [scoreRanges, setScoreRanges] = useState({
    high: true,
    medium: true,
    low: true
  });

  useEffect(() => {
    fetchNetworkData();
  }, []);

  useEffect(() => {
    if (influencers.length > 0) {
      renderNetwork();
    }
  }, [influencers, keywords, interactions, dimensions, excludeBlueVerified, scoreRanges]);

  const fetchNetworkData = async () => {
    try {
      const influencersResponse = await fetch('http://localhost:3001/api/influencers');
      const influencersData = await influencersResponse.json();
      if (Array.isArray(influencersData)) {
        setInfluencers(influencersData);
      }

      const networkResponse = await fetch('http://localhost:3001/api/network-data');
      const networkData = await networkResponse.json();
      
      if (networkData.keywords && networkData.keywords.length > 0) {
        setKeywords(networkData.keywords);
      }
      
      if (networkData.userKeywords) {
        const ukMap = new Map<string, Set<string>>();
        Object.entries(networkData.userKeywords).forEach(([user, kws]: [string, any]) => {
          ukMap.set(user, new Set(kws));
        });
        setUserKeywords(ukMap);
      }
      
      if (networkData.interactions) {
        setInteractions(networkData.interactions);
      }
    } catch (error) {
      console.error('Failed to fetch network data:', error);
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

  const filteredInfluencers = influencers.filter(applyFilters);

  const exportFullCalculation = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/export/full-calculation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excludeBlueVerified,
          scoreRanges,
          userIds: filteredInfluencers.map(inf => inf.user_id)
        })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `influent-network-calculation-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const renderNetwork = () => {
    if (!svgRef.current || filteredInfluencers.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;

    const keywordNodes: Node[] = keywords.map((kw) => ({
      id: `keyword-${kw}`,
      name: kw,
      followers: 0,
      influenceScore: 100,
      type: 'keyword',
      keyword: kw
    }));

    const influencerNodes: Node[] = filteredInfluencers.map(inf => ({
      id: inf.user_id,
      name: inf.display_name,
      followers: inf.followers,
      influenceScore: inf.influent_score,
      type: 'influencer'
    }));

    const nodes = [...keywordNodes, ...influencerNodes];

    const keywordLinks: Link[] = [];
    filteredInfluencers.forEach(inf => {
      const userKws = userKeywords.get(inf.user_id) || new Set(keywords);
      userKws.forEach(kw => {
        keywordLinks.push({
          source: `keyword-${kw}`,
          target: inf.user_id,
          type: 'keyword-link'
        });
      });
    });

    const interactionLinks: Link[] = interactions
      .filter(i => {
        const sourceExists = filteredInfluencers.some(inf => inf.user_id === i.from_user);
        const targetExists = filteredInfluencers.some(inf => inf.user_id === i.to_user);
        return sourceExists && targetExists;
      })
      .map(i => ({
        source: i.from_user,
        target: i.to_user,
        type: 'interaction'
      }));

    const links = [...keywordLinks, ...interactionLinks];

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(d => {
        return d.type === 'keyword-link' ? 200 : 100;
      }))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => {
        const node = d as Node;
        if (node.type === 'keyword') return 60;
        return Math.sqrt(node.followers / 10000) + 20;
      }));

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => d.type === 'keyword-link' ? '#cbd5e1' : '#22c55e')
      .attr('stroke-width', d => d.type === 'keyword-link' ? 2 : 1.5)
      .attr('stroke-opacity', d => d.type === 'keyword-link' ? 0.4 : 0.6)
      .attr('stroke-dasharray', d => d.type === 'interaction' ? '5,5' : '0');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g');

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

    node.append('circle')
      .attr('r', d => {
        if (d.type === 'keyword') return 50;
        return Math.sqrt(d.followers / 10000) + 15;
      })
      .attr('fill', d => {
        if (d.type === 'keyword') return '#9333ea'; // Purple-600

        const influencerNodes = nodes.filter(n => n.type === 'influencer');
        const minScore = Math.min(...influencerNodes.map(n => n.influenceScore));
        const maxScore = Math.max(...influencerNodes.map(n => n.influenceScore));
        const normalized = (d.influenceScore - minScore) / (maxScore - minScore || 1);
        
        // Purple gradient based on score
        if (normalized > 0.7) return '#7c3aed'; // Purple-600
        if (normalized > 0.4) return '#a855f7'; // Purple-500
        return '#c084fc'; // Purple-400
      })
      .attr('stroke', '#7c3aed')
      .attr('stroke-width', 2)
      .attr('cursor', d => d.type === 'influencer' ? 'pointer' : 'default')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.type === 'influencer') {
          const inf = filteredInfluencers.find(i => i.user_id === d.id);
          if (inf) setSelectedInfluencer(inf);
        }
      })
      .on('mouseover', function(_event, d) {
        if (d.type === 'influencer') {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-width', 3)
            .attr('stroke', '#a855f7');
        }
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 2)
          .attr('stroke', '#7c3aed');
      });

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
      .attr('fill', '#ffffff')
      .attr('stroke', '#000000')
      .attr('stroke-width', '0.5px')
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none');

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
      .attr('fill', '#9333ea')
      .attr('pointer-events', 'none');

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
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 flex flex-col">
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NetworkIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                  Network View
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {keywords.length} keyword{keywords.length !== 1 ? 's' : ''}: {keywords.join(', ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Filter Dropdown */}
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
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
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
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={scoreRanges.high}
                            onChange={(e) => setScoreRanges({...scoreRanges, high: e.target.checked})}
                            className="rounded accent-purple-600"
                          />
                          High (80-100%)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={scoreRanges.medium}
                            onChange={(e) => setScoreRanges({...scoreRanges, medium: e.target.checked})}
                            className="rounded accent-purple-600"
                          />
                          Medium (50-80%)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={scoreRanges.low}
                            onChange={(e) => setScoreRanges({...scoreRanges, low: e.target.checked})}
                            className="rounded accent-purple-600"
                          />
                          Low (0-50%)
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={exportFullCalculation}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-200"
              >
                <Download size={18} />
                Export
              </button>
            </div>
          </div>
        </div>

        <div id="network-container" className="flex-1 bg-white dark:bg-slate-900 relative">
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="border border-slate-200 dark:border-slate-800"
          />

          <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Legend</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-purple-600" />
                <span className="text-xs text-slate-600 dark:text-slate-400">Keyword Node</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-purple-600" />
                <span className="text-xs text-slate-600 dark:text-slate-400">High Influence</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-purple-400" />
                <span className="text-xs text-slate-600 dark:text-slate-400">Low Influence</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-full h-px bg-slate-300 dark:bg-slate-700" />
                <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Keyword Link</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-full h-px bg-green-500" style={{ borderTop: '2px dashed' }} />
                <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Interaction</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                Node size = Follower count
              </div>
            </div>
          </div>

          <div className="absolute top-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-lg">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Nodes</div>
            <div className="text-2xl font-semibold text-purple-700 dark:text-purple-400">{filteredInfluencers.length + keywords.length}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {keywords.length} keywords • {filteredInfluencers.length} users
            </div>
          </div>
        </div>
      </div>

      <div className="w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-y-auto shadow-xl">
        {selectedInfluencer ? (
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                Influencer Profile
              </h3>
              <button
                onClick={() => setSelectedInfluencer(null)}
                className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="w-32 h-32 mx-auto mb-4 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center text-white text-5xl font-bold shadow-lg shadow-purple-500/30">
              {selectedInfluencer.display_name.charAt(0).toUpperCase()}
            </div>

            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h4 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {selectedInfluencer.display_name}
                </h4>
                {selectedInfluencer.is_verified && (
                  <span className="text-blue-500" title="Verified">✓</span>
                )}
                {selectedInfluencer.is_blue_verified && (
                  <span className="text-amber-500" title="Twitter Blue">★</span>
                )}
              </div>
              <p className="text-slate-600 dark:text-slate-400">@{selectedInfluencer.user_id}</p>
              {selectedInfluencer.location && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-center gap-1">
                  <span>📍</span> {selectedInfluencer.location}
                </p>
              )}
            </div>

            {selectedInfluencer.bio && (
              <div className="mb-6">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Bio</h5>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {selectedInfluencer.bio}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium">Followers</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedInfluencer.followers.toLocaleString()}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium">Engagement</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedInfluencer.engagement.toFixed(1)}%
                </p>
              </div>
              <div className="col-span-2 bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium">Influence Score</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {selectedInfluencer.influent_score.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-200">
                View Details
              </button>
              <button className="w-full px-4 py-3 border-2 border-purple-200 dark:border-purple-800 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 text-slate-900 dark:text-slate-100 font-semibold transition-all duration-200">
                Export Profile
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center">
                <NetworkIcon className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Selection</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Click on a node to view influencer details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkView;