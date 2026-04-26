import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomeScreen from './components/HomeScreen';
import NetworkView from './components/NetworkView';
import InfluencersView from './components/InfluencersView';
import ReportsView from './components/ReportsView';
import AnalyticsView from './components/AnalyticsView';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/network" element={<NetworkView />} />
          <Route path="/influencers" element={<InfluencersView />} />
          <Route path="/reports" element={<ReportsView />} />
          <Route path="/analytics" element={<AnalyticsView />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;