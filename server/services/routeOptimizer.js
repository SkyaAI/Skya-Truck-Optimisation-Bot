const moment = require('moment');

// Australian truck configurations with real market data
const TRUCK_TYPES = {
  MEDIUM_RIGID: {
    name: 'Medium Rigid (MR)',
    code: 'MR',
    palletCapacity: { min: 8, max: 10 },
    costPerKm: { min: 2.20, max: 3.00 },
    averageCostPerKm: 2.60,
    avgPallets: 9,
    useCases: ['Regional/metro distribution', 'Small loads', 'Urban delivery'],
    accessRestrictions: 'Low - can access most locations',
    weight: 1
  },
  SEMI_TRAILER: {
    name: 'Single Semi-Trailer (40ft)',
    code: 'SEMI',
    palletCapacity: { min: 20, max: 22 },
    costPerKm: { min: 3.00, max: 4.20 },
    averageCostPerKm: 3.60,
    avgPallets: 21,
    useCases: ['Inter-city linehaul', 'Medium loads', 'General freight'],
    accessRestrictions: 'Medium - industrial areas preferred',
    weight: 2
  },
  B_DOUBLE: {
    name: 'B-Double',
    code: 'B_DOUBLE',
    palletCapacity: { min: 34, max: 36 },
    costPerKm: { min: 3.80, max: 5.20 },
    averageCostPerKm: 4.50,
    avgPallets: 35,
    useCases: ['Major route linehaul', 'Large loads', 'Long distance'],
    accessRestrictions: 'High - designated B-double routes only',
    weight: 3
  }
};

// Fuel surcharge factors (8-20% as per requirements)
const FUEL_SURCHARGE_RATE = 0.14; // 14% average

// Peak period multipliers
const PEAK_MULTIPLIERS = {
  MORNING: 1.35,    // 7:30-10:00 AM - 35% increase
  AFTERNOON: 1.25,  // 2:30-4:00 PM - 25% increase
  EVENING: 1.40     // 5:00-7:00 PM - 40% increase
};

// Waiting time costs (per hour beyond standard 2-3 hours)
const WAITING_TIME_COST = 100; // $100/hour average

class RouteOptimizer {
  getTruckTypes() {
    return TRUCK_TYPES;
  }

  async optimizeRoutes(orderData) {
    const { 
      palletCount, 
      distance, 
      urgency, 
      peakHoursImpact,
      pickupDate,
      deliveryDate 
    } = orderData;

    const pallets = parseInt(palletCount);
    
    // Calculate base transit time (assuming average 70 km/h including stops)
    const baseTransitTime = Math.round((distance / 70) * 10) / 10;

    // Generate three route options
    const routes = [
      this.generateCostEffectiveRoute(pallets, distance, baseTransitTime, peakHoursImpact, urgency),
      this.generateTimeEffectiveRoute(pallets, distance, baseTransitTime, peakHoursImpact, urgency),
      this.generateHybridRoute(pallets, distance, baseTransitTime, peakHoursImpact, urgency)
    ];

    // Add comparative metrics
    this.addComparativeMetrics(routes);

    return routes;
  }

  generateCostEffectiveRoute(pallets, distance, baseTransitTime, peakHoursImpact, urgency) {
    // Prioritize largest truck types for better per-pallet economics
    const truckConfig = this.optimizeForCost(pallets);
    const totalCost = this.calculateTotalCost(truckConfig, distance, urgency);
    const transitTime = baseTransitTime + (peakHoursImpact?.totalDelay || 0);

    return {
      id: 'cost-effective',
      type: 'Cost Effective',
      description: 'Maximizes load efficiency and minimizes cost per pallet',
      totalCost: Math.round(totalCost),
      totalTime: Math.round(transitTime * 10) / 10,
      distance,
      trucks: truckConfig.trucks,
      fuelCost: Math.round(totalCost * FUEL_SURCHARGE_RATE),
      peakHourImpact: peakHoursImpact?.totalDelay || 0,
      deliveryWindow: this.calculateDeliveryWindow(baseTransitTime, peakHoursImpact),
      environmentalScore: this.calculateEnvironmentalScore(truckConfig.trucks),
      recommended: pallets >= 20, // Recommend for larger loads
      savings: null, // Will be calculated in comparative analysis
      utilization: this.calculateUtilization(truckConfig.trucks, pallets)
    };
  }

  generateTimeEffectiveRoute(pallets, distance, baseTransitTime, peakHoursImpact, urgency) {
    // Prioritize multiple smaller trucks to reduce loading time and increase flexibility
    const truckConfig = this.optimizeForTime(pallets);
    const totalCost = this.calculateTotalCost(truckConfig, distance, urgency) * 1.15; // Premium for time efficiency
    const transitTime = baseTransitTime * 0.85 + (peakHoursImpact?.totalDelay || 0) * 0.7; // Faster routing

    return {
      id: 'time-effective',
      type: 'Time Effective',
      description: 'Minimizes total transit time with flexible scheduling',
      totalCost: Math.round(totalCost),
      totalTime: Math.round(transitTime * 10) / 10,
      distance,
      trucks: truckConfig.trucks,
      fuelCost: Math.round(totalCost * FUEL_SURCHARGE_RATE),
      peakHourImpact: (peakHoursImpact?.totalDelay || 0) * 0.7,
      deliveryWindow: this.calculateDeliveryWindow(transitTime, peakHoursImpact),
      environmentalScore: this.calculateEnvironmentalScore(truckConfig.trucks),
      recommended: urgency === 'urgent' || urgency === 'express',
      timeReduction: Math.round((baseTransitTime - transitTime) * 10) / 10,
      utilization: this.calculateUtilization(truckConfig.trucks, pallets)
    };
  }

  generateHybridRoute(pallets, distance, baseTransitTime, peakHoursImpact, urgency) {
    // Balance cost and time considerations
    const truckConfig = this.optimizeForHybrid(pallets);
    const baseCost = this.calculateTotalCost(truckConfig, distance, urgency);
    const totalCost = baseCost * 1.05; // Small premium for optimization
    const transitTime = baseTransitTime * 0.95 + (peakHoursImpact?.totalDelay || 0) * 0.85;

    return {
      id: 'hybrid',
      type: 'Hybrid',
      description: 'Balanced approach optimizing both cost and time',
      totalCost: Math.round(totalCost),
      totalTime: Math.round(transitTime * 10) / 10,
      distance,
      trucks: truckConfig.trucks,
      fuelCost: Math.round(totalCost * FUEL_SURCHARGE_RATE),
      peakHourImpact: (peakHoursImpact?.totalDelay || 0) * 0.85,
      deliveryWindow: this.calculateDeliveryWindow(transitTime, peakHoursImpact),
      environmentalScore: this.calculateEnvironmentalScore(truckConfig.trucks),
      recommended: urgency === 'standard' && pallets >= 10 && pallets <= 30,
      utilization: this.calculateUtilization(truckConfig.trucks, pallets)
    };
  }

  optimizeForCost(pallets) {
    const trucks = [];
    let remainingPallets = pallets;

    // Prioritize B-Doubles for maximum efficiency
    while (remainingPallets >= TRUCK_TYPES.B_DOUBLE.avgPallets) {
      const palletLoad = Math.min(remainingPallets, TRUCK_TYPES.B_DOUBLE.avgPallets);
      trucks.push({
        type: TRUCK_TYPES.B_DOUBLE.name,
        code: TRUCK_TYPES.B_DOUBLE.code,
        pallets: palletLoad,
        capacity: TRUCK_TYPES.B_DOUBLE.avgPallets,
        cost: 0, // Will be calculated later
        utilization: Math.round((palletLoad / TRUCK_TYPES.B_DOUBLE.avgPallets) * 100)
      });
      remainingPallets -= palletLoad;
    }

    // Use Semi-Trailer for medium loads
    while (remainingPallets >= TRUCK_TYPES.SEMI_TRAILER.avgPallets) {
      const palletLoad = Math.min(remainingPallets, TRUCK_TYPES.SEMI_TRAILER.avgPallets);
      trucks.push({
        type: TRUCK_TYPES.SEMI_TRAILER.name,
        code: TRUCK_TYPES.SEMI_TRAILER.code,
        pallets: palletLoad,
        capacity: TRUCK_TYPES.SEMI_TRAILER.avgPallets,
        cost: 0,
        utilization: Math.round((palletLoad / TRUCK_TYPES.SEMI_TRAILER.avgPallets) * 100)
      });
      remainingPallets -= palletLoad;
    }

    // Use Medium Rigid for remaining pallets
    while (remainingPallets > 0) {
      const palletLoad = Math.min(remainingPallets, TRUCK_TYPES.MEDIUM_RIGID.avgPallets);
      trucks.push({
        type: TRUCK_TYPES.MEDIUM_RIGID.name,
        code: TRUCK_TYPES.MEDIUM_RIGID.code,
        pallets: palletLoad,
        capacity: TRUCK_TYPES.MEDIUM_RIGID.avgPallets,
        cost: 0,
        utilization: Math.round((palletLoad / TRUCK_TYPES.MEDIUM_RIGID.avgPallets) * 100)
      });
      remainingPallets -= palletLoad;
    }

    return { trucks };
  }

  optimizeForTime(pallets) {
    const trucks = [];
    let remainingPallets = pallets;

    // Use multiple smaller trucks for parallel loading/unloading and flexibility
    if (pallets <= TRUCK_TYPES.MEDIUM_RIGID.avgPallets) {
      // Single MR truck for small loads
      trucks.push({
        type: TRUCK_TYPES.MEDIUM_RIGID.name,
        code: TRUCK_TYPES.MEDIUM_RIGID.code,
        pallets: remainingPallets,
        capacity: TRUCK_TYPES.MEDIUM_RIGID.avgPallets,
        cost: 0,
        utilization: Math.round((remainingPallets / TRUCK_TYPES.MEDIUM_RIGID.avgPallets) * 100)
      });
    } else {
      // Prefer Semi-Trailers for better time efficiency
      while (remainingPallets >= TRUCK_TYPES.SEMI_TRAILER.avgPallets) {
        const palletLoad = Math.min(remainingPallets, TRUCK_TYPES.SEMI_TRAILER.avgPallets);
        trucks.push({
          type: TRUCK_TYPES.SEMI_TRAILER.name,
          code: TRUCK_TYPES.SEMI_TRAILER.code,
          pallets: palletLoad,
          capacity: TRUCK_TYPES.SEMI_TRAILER.avgPallets,
          cost: 0,
          utilization: Math.round((palletLoad / TRUCK_TYPES.SEMI_TRAILER.avgPallets) * 100)
        });
        remainingPallets -= palletLoad;
      }

      // Handle remaining pallets with MR
      if (remainingPallets > 0) {
        trucks.push({
          type: TRUCK_TYPES.MEDIUM_RIGID.name,
          code: TRUCK_TYPES.MEDIUM_RIGID.code,
          pallets: remainingPallets,
          capacity: TRUCK_TYPES.MEDIUM_RIGID.avgPallets,
          cost: 0,
          utilization: Math.round((remainingPallets / TRUCK_TYPES.MEDIUM_RIGID.avgPallets) * 100)
        });
      }
    }

    return { trucks };
  }

  optimizeForHybrid(pallets) {
    const trucks = [];
    let remainingPallets = pallets;

    // Balanced approach: use appropriate truck sizes for load
    if (pallets >= 30) {
      // Use B-Double for large loads
      const bDoubleLoad = Math.min(remainingPallets, TRUCK_TYPES.B_DOUBLE.avgPallets);
      trucks.push({
        type: TRUCK_TYPES.B_DOUBLE.name,
        code: TRUCK_TYPES.B_DOUBLE.code,
        pallets: bDoubleLoad,
        capacity: TRUCK_TYPES.B_DOUBLE.avgPallets,
        cost: 0,
        utilization: Math.round((bDoubleLoad / TRUCK_TYPES.B_DOUBLE.avgPallets) * 100)
      });
      remainingPallets -= bDoubleLoad;
    }

    // Use Semi-Trailer for medium remaining loads
    while (remainingPallets >= 15) {
      const semiLoad = Math.min(remainingPallets, TRUCK_TYPES.SEMI_TRAILER.avgPallets);
      trucks.push({
        type: TRUCK_TYPES.SEMI_TRAILER.name,
        code: TRUCK_TYPES.SEMI_TRAILER.code,
        pallets: semiLoad,
        capacity: TRUCK_TYPES.SEMI_TRAILER.avgPallets,
        cost: 0,
        utilization: Math.round((semiLoad / TRUCK_TYPES.SEMI_TRAILER.avgPallets) * 100)
      });
      remainingPallets -= semiLoad;
    }

    // Use MR for remaining small loads
    if (remainingPallets > 0) {
      trucks.push({
        type: TRUCK_TYPES.MEDIUM_RIGID.name,
        code: TRUCK_TYPES.MEDIUM_RIGID.code,
        pallets: remainingPallets,
        capacity: TRUCK_TYPES.MEDIUM_RIGID.avgPallets,
        cost: 0,
        utilization: Math.round((remainingPallets / TRUCK_TYPES.MEDIUM_RIGID.avgPallets) * 100)
      });
    }

    return { trucks };
  }

  calculateTotalCost(truckConfig, distance, urgency) {
    let totalCost = 0;

    truckConfig.trucks.forEach(truck => {
      let truckType;
      switch (truck.code) {
        case 'MR':
          truckType = TRUCK_TYPES.MEDIUM_RIGID;
          break;
        case 'SEMI':
          truckType = TRUCK_TYPES.SEMI_TRAILER;
          break;
        case 'B_DOUBLE':
          truckType = TRUCK_TYPES.B_DOUBLE;
          break;
      }

      const baseCost = distance * truckType.averageCostPerKm;
      const fuelSurcharge = baseCost * FUEL_SURCHARGE_RATE;
      
      // Urgency premium
      let urgencyMultiplier = 1.0;
      if (urgency === 'express') urgencyMultiplier = 1.25;
      if (urgency === 'urgent') urgencyMultiplier = 1.50;

      const truckCost = (baseCost + fuelSurcharge) * urgencyMultiplier;
      truck.cost = Math.round(truckCost);
      totalCost += truckCost;
    });

    return totalCost;
  }

  calculateDeliveryWindow(transitTime, peakHoursImpact) {
    const baseTime = transitTime;
    const withPeaks = baseTime + (peakHoursImpact?.totalDelay || 0);
    
    // Add buffer for loading/unloading
    const minTime = Math.round(withPeaks * 10) / 10;
    const maxTime = Math.round((withPeaks * 1.2) * 10) / 10;
    
    return `${minTime}-${maxTime} hours`;
  }

  calculateEnvironmentalScore(trucks) {
    let score = 10;
    
    // Penalize for multiple trucks (more emissions)
    score -= (trucks.length - 1) * 0.5;
    
    // Reward high utilization
    const avgUtilization = trucks.reduce((sum, truck) => sum + truck.utilization, 0) / trucks.length;
    score += (avgUtilization - 70) * 0.02; // Bonus for >70% utilization
    
    // Penalize B-Doubles slightly (larger carbon footprint)
    const bDoubles = trucks.filter(t => t.code === 'B_DOUBLE').length;
    score -= bDoubles * 0.3;
    
    return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  }

  calculateUtilization(trucks, totalPallets) {
    const totalCapacity = trucks.reduce((sum, truck) => sum + truck.capacity, 0);
    return Math.round((totalPallets / totalCapacity) * 100);
  }

  addComparativeMetrics(routes) {
    // Sort by cost to identify savings
    const sortedByCost = [...routes].sort((a, b) => a.totalCost - b.totalCost);
    const cheapest = sortedByCost[0];
    
    routes.forEach(route => {
      if (route.id !== cheapest.id) {
        route.savings = route.totalCost - cheapest.totalCost;
      }
    });

    // Add time reduction comparisons
    const sortedByTime = [...routes].sort((a, b) => a.totalTime - b.totalTime);
    const fastest = sortedByTime[0];
    
    routes.forEach(route => {
      if (route.id !== fastest.id && !route.timeReduction) {
        route.timeReduction = Math.round((route.totalTime - fastest.totalTime) * 10) / 10;
      }
    });
  }
}

module.exports = new RouteOptimizer();