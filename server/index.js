const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routeOptimizer = require('./services/routeOptimizer');
const distanceCalculator = require('./services/distanceCalculator');
const peakHoursService = require('./services/peakHoursService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - Configure helmet with relaxed CSP for external resources
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:"],
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