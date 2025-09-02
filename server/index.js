const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routeOptimizer = require('./services/routeOptimizer');
const distanceCalculator = require('./services/distanceCalculator');
const peakHoursService = require('./services/peakHoursService');
const consolidationService = require('./services/consolidationService');
const truckCompanyService = require('./services/truckCompanyService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - Configure helmet with relaxed CSP for external resources and navigation
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:"],
      formAction: ["'self'", "https:"], // Allow form submissions to external sites
      navigateTo: ["https:"], // Allow navigation to external https sites
      childSrc: ["'self'", "https:"], // Allow opening external windows
    },
  },
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
// Health check endpoint for Vercel deployment
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Skya Truck Optimization Bot API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Simple test endpoint for debugging
app.post('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/optimize-route', async (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate required fields
    if (!orderData.source || !orderData.destination || !orderData.palletCount) {
      return res.status(400).json({
        error: 'Missing required fields: source, destination, or palletCount'
      });
    }

    // Calculate distance between locations
    const distance = await distanceCalculator.calculateDistance(
      orderData.source,
      orderData.destination
    );

    // Check for peak hours impact
    const peakHoursImpact = peakHoursService.calculatePeakHoursImpact(
      orderData.pickupDate,
      orderData.pickupTime,
      orderData.deliveryDate,
      orderData.deliveryTime
    );

    // Generate route options
    const routes = await routeOptimizer.optimizeRoutes({
      ...orderData,
      distance,
      peakHoursImpact
    });

    res.json(routes);
  } catch (error) {
    console.error('Route optimization error:', error);
    res.status(500).json({
      error: 'Failed to optimize routes',
      message: error.message
    });
  }
});

app.get('/api/truck-types', (req, res) => {
  const truckTypes = routeOptimizer.getTruckTypes();
  res.json(truckTypes);
});

app.post('/api/calculate-distance', async (req, res) => {
  try {
    const { source, destination } = req.body;
    
    if (!source || !destination) {
      return res.status(400).json({
        error: 'Source and destination are required'
      });
    }

    const distance = await distanceCalculator.calculateDistance(source, destination);
    res.json({ distance });
  } catch (error) {
    console.error('Distance calculation error:', error);
    res.status(500).json({
      error: 'Failed to calculate distance',
      message: error.message
    });
  }
});

app.get('/api/peak-hours', (req, res) => {
  const peakHours = peakHoursService.getCurrentPeakHours();
  res.json(peakHours);
});

// New multi-order consolidation endpoint
app.post('/api/consolidate-orders', async (req, res) => {
  try {
    const { orders } = req.body;
    
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        error: 'Orders array is required and must not be empty'
      });
    }

    // Validate each order has required fields
    for (const order of orders) {
      if (!order.source || !order.destination || !order.pallets) {
        return res.status(400).json({
          error: 'Each order must have source, destination, and pallets'
        });
      }
    }

    // Analyze consolidation scenarios
    const scenarios = consolidationService.analyzeMultipleOrders(orders);
    
    res.json({
      totalOrders: orders.length,
      scenarios: scenarios.sort((a, b) => b.score - a.score), // Sort by best score
      summary: {
        totalPallets: orders.reduce((sum, order) => sum + parseInt(order.pallets || 0), 0),
        routes: scenarios.length,
        bestScenario: scenarios.find(s => s.score === Math.max(...scenarios.map(sc => sc.score)))?.name || 'None'
      }
    });
  } catch (error) {
    console.error('Consolidation analysis error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    
    res.status(500).json({
      error: 'Failed to analyze consolidation options',
      debug: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      },
      message: error.message
    });
  }
});

// Get truck companies
app.get('/api/truck-companies', (req, res) => {
  try {
    const companies = truckCompanyService.getAllCompanies();
    res.json(companies);
  } catch (error) {
    console.error('Truck companies error:', error);
    res.status(500).json({
      error: 'Failed to get truck companies',
      message: error.message
    });
  }
});

// Get truck company recommendations
app.post('/api/truck-companies/recommend', (req, res) => {
  try {
    const criteria = req.body;
    const recommendations = truckCompanyService.recommendCompanies(criteria);
    res.json(recommendations);
  } catch (error) {
    console.error('Truck company recommendations error:', error);
    res.status(500).json({
      error: 'Failed to get truck company recommendations',
      message: error.message
    });
  }
});

// Get pallet size options
app.get('/api/pallet-sizes', (req, res) => {
  const palletSizes = {
    standard: { label: 'Standard (1200×1200×1200mm)', weight: '1000kg', volume: '1.728m³' },
    euro: { label: 'Euro (1200×800×1200mm)', weight: '800kg', volume: '1.152m³' },
    half: { label: 'Half (600×1200×1200mm)', weight: '500kg', volume: '0.864m³' },
    quarter: { label: 'Quarter (600×800×1200mm)', weight: '300kg', volume: '0.576m³' },
    oversized: { label: 'Oversized (1200×1200×1800mm)', weight: '1500kg', volume: '2.592m³' }
  };
  res.json(palletSizes);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Catch all handler: send back the main index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚛 Skya Truck Optimization Bot server running on port ${PORT}`);
  console.log(`🌐 Frontend available at: http://localhost:${PORT}`);
  console.log(`🔧 API available at: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;