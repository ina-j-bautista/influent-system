import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Network, Users, FileText, BarChart3, Settings } from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: <Settings size={20} /> },
    { path: '/network', label: 'Network View', icon: <Network size={20} /> },
    { path: '/influencers', label: 'Influencers', icon: <Users size={20} /> },
    { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
    { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="w-64 bg-stone-50 border-r border-stone-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-stone-900 flex items-center justify-center">
              <div className="w-6 h-6 border border-stone-900" style={{ transform: 'rotate(45deg)' }} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-stone-900">Influent</h1>
              <p className="text-xs text-stone-500">Influence Analysis</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                location.pathname === item.path
                  ? 'bg-stone-200 text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Settings */}
        <div className="p-4 border-t border-stone-200">
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-stone-600 hover:bg-stone-100">
            <Settings size={20} />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
};

export default Layout;