# Skya Truck Optimisation Bot

A comprehensive freight optimization system that helps consolidate pallets onto different truck types by offering optimal routes with cost-effective, time-effective, and hybrid options.

## Features

- **Multi-Modal Route Optimization**: Compare B-Double, Semi-Trailer (40ft), and Medium Rigid trucks
- **Cost vs Time Analysis**: Get recommendations based on cost efficiency, time efficiency, or hybrid approach  
- **Pallet Consolidation**: Optimize pallet loads across different truck types
- **Peak Hours Awareness**: Considers Australian peak traffic periods (7:30-10am, 2:30-4pm, 5-7pm)
- **Distance Calculation**: Automatic distance calculation between Australian cities
- **Real-time Pricing**: Dynamic cost calculations based on current fuel surcharges and market conditions

## Truck Types Supported

| Truck Type | Pallet Capacity | Cost Per KM | Best Use Case |
|------------|----------------|-------------|---------------|
| Medium Rigid (MR) | 8-10 pallets | $2.20-3.00/km | Regional/metro distribution |
| Single Semi-Trailer (40ft) | 20-22 pallets | $3.00-4.20/km | Inter-city linehaul |
| B-Double | 34-36 pallets | $3.80-5.20/km | Major route linehaul |

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- PM2 (for production deployment)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd skya-truck-optimization-bot
```

2. Install dependencies:
```bash
npm run install-deps
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Production Deployment

```bash
# Build the client
npm run build

# Start with PM2
pm2 start ecosystem.config.js
```

## API Endpoints

- `POST /api/optimize-route` - Calculate optimal routes for given orders
- `GET /api/truck-types` - Get available truck configurations
- `POST /api/calculate-distance` - Calculate distance between locations
- `GET /api/peak-hours` - Get current peak hour status

## Usage

1. **Input Order Details**:
   - Source and destination locations
   - Number of pallets and dimensions
   - Pickup availability time
   - Expected delivery date

2. **Review Route Options**:
   - Most cost-effective route
   - Most time-effective route  
   - Hybrid recommendation

3. **Approve Route**:
   - Select preferred option
   - Confirm pallet consolidation
   - Generate shipping manifest

## Peak Hours Consideration

The system automatically adjusts delivery times during peak traffic periods in Australian cities:
- **Morning Peak**: 7:30 AM - 10:00 AM (adds 25-40% travel time)
- **Afternoon Peak**: 2:30 PM - 4:00 PM (adds 20-30% travel time)  
- **Evening Peak**: 5:00 PM - 7:00 PM (adds 30-50% travel time)

## Cost Factors

- **Base Freight Rate**: Per kilometer charges by truck type
- **Fuel Surcharge**: 8-20% adjustment based on diesel prices
- **Waiting Time**: $80-120/hour for loading/unloading beyond 2-3 hours
- **Peak Period Premium**: 15-30% increase during high-demand periods
- **Route Restrictions**: Additional charges for limited access routes

## License

MIT License - see LICENSE file for details.

## Support

For technical support or feature requests, please contact the development team.