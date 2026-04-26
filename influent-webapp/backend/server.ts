import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Simple test endpoint
app.get('/api/stats', (req, res) => {
  res.json({
    users: 100,
    posts: 2006,
    interactions: 3854
  });
});

app.get('/api/influencers', (req, res) => {
  res.json([
    { user_id: 'user1', display_name: 'Test User', followers: 1000, engagement: 0.05, influent_score: 0.75 }
  ]);
});

app.get('/api/network-data', (req, res) => {
  res.json({ nodes: [], links: [] });
});

app.get('/api/analytics', (req, res) => {
  res.json({ temporalData: [], scoreDistribution: [] });
});

app.get('/api/reports/keywords', (req, res) => {
  res.json([]);
});


app.post('/api/analyze', (req, res) => {
  try {
    const { keywords, region, startDate, endDate, maxItems, weightPreferences, sentimentImportance, temporalDecay, useDeepTranslator } = req.body;
    
    console.log('Received analysis request:', {
      keywords,
      region,
      startDate,
      endDate,
      maxItems,
      weightPreferences,
      sentimentImportance,
      temporalDecay,
      useDeepTranslator
    });

    // For now, return mock data
    res.json({
      success: true,
      message: 'Analysis complete',
      rankings: [
        { user_id: 'user1', display_name: 'Test User 1', influent_score: 0.85, sentiment: 0.7, engagement: 0.6, followers: 10000 },
        { user_id: 'user2', display_name: 'Test User 2', influent_score: 0.75, sentiment: 0.65, engagement: 0.55, followers: 8000 }
      ],
      convergence: {
        iterations: 10,
        converged: true
      }
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 INFLUENT Backend Server running on http://localhost:${PORT}\n`);
});