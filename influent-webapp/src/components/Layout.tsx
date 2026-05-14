/**
 * Imports
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Network, Users, FileText, BarChart3, Home, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeContext';

/**
 * Component Definition: Layout
 */
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Hooks: Routing and Theme Context
   */
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  /**
   * Navigation Configuration
   */
  const navItems = [
    { path: '/', label: 'Home', icon: <Home size={20} /> },
    { path: '/network', label: 'Network View', icon: <Network size={20} /> },
    { path: '/influencers', label: 'Influencers', icon: <Users size={20} /> },
    { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
    { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
  ];

  /**
   * Main Layout Render
   */
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      
      {/**
       * Primary Sidebar Navigation
       */}
      <div className="w-64 bg-white dark:bg-slate-900 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-xl">
        
        {/**
         * Branding Section
         */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <img 
              src="/src/public/INFLUENT_logo.png"
              alt="INFLUENT Logo" 
              className="w-10 h-auto dark:hidden"
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
            <img 
              src="/src/public/INFLUENT_logo_dark.png"
              alt="INFLUENT Logo" 
              className="w-10 h-auto hidden dark:block"
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-purple-900 dark:from-purple-400 dark:to-purple-600 bg-clip-text text-transparent">
                Influent
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Influence Analysis</p>
            </div>
          </div>
        </div>

        {/**
         * Navigational Links
         */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-400'
                }`}
              >
                <span className={isActive ? '' : 'group-hover:scale-110 transition-transform'}>
                  {item.icon}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/**
         * Theme Configuration Control
         */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button 
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-slate-600 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-400 transition-all duration-200 group"
          >
            <span className="group-hover:rotate-180 transition-transform duration-500">
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </span>
            <span className="font-medium">Dark Mode</span>
          </button>
        </div>
      </div>

      {/**
       * Dynamic Content Area
       */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
};

export default Layout;