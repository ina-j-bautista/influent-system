import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Network, Users, FileText, BarChart3, Download, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { path: '/', label: 'Home', icon: <BarChart3 size={20} /> },
    { path: '/network', label: 'Network View', icon: <Network size={20} /> },
    { path: '/influencers', label: 'Influencers', icon: <Users size={20} /> },
    { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
    { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
  ];

  const exportAllData = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/export/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `influent-complete-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-stone-950">
      {/* Sidebar */}
      <div className="w-64 bg-stone-50 dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-stone-900 dark:border-stone-100 flex items-center justify-center">
              <div className="w-6 h-6 border border-stone-900 dark:border-stone-100" style={{ transform: 'rotate(45deg)' }} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Influent</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400">Influence Analysis</p>
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
                  ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Theme Toggle & Settings */}
        <div className="p-4 border-t border-stone-200 dark:border-stone-800 space-y-2">
          <button 
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            <span className="font-medium">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>

        {/* Footer - Only show on non-home pages */}
        {!isHomePage && (
          <div className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
            <div className="px-8 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">
                    Export Complete Dataset
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    Download all analytics data including temporal trends, score distributions, and detailed metrics
                  </p>
                </div>
                <button
                  onClick={exportAllData}
                  className="px-6 py-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:bg-stone-800 dark:hover:bg-stone-200 flex items-center gap-2 flex-shrink-0 transition-colors"
                >
                  <Download size={18} />
                  Export All Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Layout;