// Enhanced pallet optimization service for mixed pallet sizes and truck capacity
const PALLET_SIZES = {
  'standard': { 
    length: 1200, width: 1200, height: 1200, 
    volume: 1.728, weight: 1000, code: 'STD',
    footprint: 1.44 // m² floor space
  },
  'euro': { 
    length: 1200, width: 800, height: 1200, 
    volume: 1.152, weight: 800, code: 'EUR',
    footprint: 0.96
  },
  'half': { 
    length: 600, width: 1200, height: 1200, 
    volume: 0.864, weight: 500, code: 'HALF',
    footprint: 0.72
  },
  'quarter': { 
    length: 600, width: 800, height: 1200, 
    volume: 0.576, weight: 300, code: 'QTR',
    footprint: 0.48
  },
  'oversized': { 
    length: 1200, width: 1200, height: 1800, 
    volume: 2.592, weight: 1500, code: 'OS',
    footprint: 1.44
  }
};

// Detailed truck specifications with real capacity constraints
const TRUCK_SPECIFICATIONS = {
  'MR': { 
    name: 'Medium Rigid',
    maxPallets: 10, 
    maxVolume: 17.28, // m³
    maxWeight: 10000, // kg
    maxFootprint: 14.4, // m² floor space
    length: 6.0, // truck bed length
    width: 2.4, // truck bed width
    height: 2.4, // max cargo height
    costPerKm: 2.60,
    loadingTimePerPallet: 15 // minutes
  },
  'SEMI': { 
    name: 'Semi-Trailer (40ft)',
    maxPallets: 22, 
    maxVolume: 38.0, // m³
    maxWeight: 22000, // kg
    maxFootprint: 31.68, // m² floor space
    length: 12.2, // 40ft trailer length
    width: 2.4,
    height: 2.6,
    costPerKm: 3.60,
    loadingTimePerPallet: 12
  },
  'B_DOUBLE': { 
    name: 'B-Double',
    maxPallets: 36, 
    maxVolume: 62.2, // m³
    maxWeight: 36000, // kg
    maxFootprint: 51.84, // m² floor space (two trailers)
    length: 20.0, // combined trailer length
    width: 2.4,
    height: 2.6,
    costPerKm: 4.50,
    loadingTimePerPallet: 10
  }
};

class PalletOptimizationService {
  
  // Optimize pallet loading across different truck types
  optimizePalletLoading(orders) {
    // Group pallets by size and calculate totals
    const palletSummary = this.calculatePalletSummary(orders);
    
    // Generate truck configurations for each type
    const truckOptions = [];
    
    Object.keys(TRUCK_SPECIFICATIONS).forEach(truckType => {
      const config = this.calculateTruckConfiguration(palletSummary, truckType);
      if (config.feasible) {
        truckOptions.push({
          truckType,
          ...config,
          spec: TRUCK_SPECIFICATIONS[truckType]
        });
      }
    });
    
    // Sort by efficiency score
    return truckOptions.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }
  
  calculatePalletSummary(orders) {
    const summary = {
      totalPallets: 0,
      totalVolume: 0,
      totalWeight: 0,
      totalFootprint: 0,
      bySize: {},
      orders: orders
    };
    
    orders.forEach(order => {
      const palletSpec = PALLET_SIZES[order.palletSize];
      const quantity = parseInt(order.pallets);
      
      if (!summary.bySize[order.palletSize]) {
        summary.bySize[order.palletSize] = {
          quantity: 0,
          totalVolume: 0,
          totalWeight: 0,
          totalFootprint: 0,
          spec: palletSpec
        };
      }
      
      summary.bySize[order.palletSize].quantity += quantity;
      summary.bySize[order.palletSize].totalVolume += quantity * palletSpec.volume;
      summary.bySize[order.palletSize].totalWeight += quantity * palletSpec.weight;
      summary.bySize[order.palletSize].totalFootprint += quantity * palletSpec.footprint;
      
      summary.totalPallets += quantity;
      summary.totalVolume += quantity * palletSpec.volume;
      summary.totalWeight += quantity * palletSpec.weight;
      summary.totalFootprint += quantity * palletSpec.footprint;
    });
    
    return summary;
  }
  
  calculateTruckConfiguration(palletSummary, truckType) {
    const truckSpec = TRUCK_SPECIFICATIONS[truckType];
    
    // Check basic feasibility
    const volumeUtilization = (palletSummary.totalVolume / truckSpec.maxVolume) * 100;
    const weightUtilization = (palletSummary.totalWeight / truckSpec.maxWeight) * 100;
    const footprintUtilization = (palletSummary.totalFootprint / truckSpec.maxFootprint) * 100;
    const palletUtilization = (palletSummary.totalPallets / truckSpec.maxPallets) * 100;
    
    // Check if it fits in a single truck
    const fitsInOne = volumeUtilization <= 100 && 
                     weightUtilization <= 100 && 
                     footprintUtilization <= 100 && 
                     palletUtilization <= 100;
    
    if (fitsInOne) {
      // Single truck solution
      const utilizationScore = Math.min(volumeUtilization, weightUtilization, footprintUtilization, palletUtilization);
      
      return {
        feasible: true,
        trucksRequired: 1,
        totalCost: this.calculateTotalCost([truckSpec], palletSummary),
        totalTime: this.calculateTotalTime([truckSpec], palletSummary),
        utilization: {
          volume: Math.round(volumeUtilization),
          weight: Math.round(weightUtilization),
          footprint: Math.round(footprintUtilization),
          pallets: Math.round(palletUtilization),
          overall: Math.round(utilizationScore)
        },
        loadingPlan: this.generateLoadingPlan(palletSummary, truckSpec),
        efficiencyScore: this.calculateEfficiencyScore(utilizationScore, 1, truckSpec),
        trucks: [{
          type: truckType,
          spec: truckSpec,
          pallets: palletSummary.totalPallets,
          utilization: Math.round(utilizationScore)
        }]
      };
    } else {
      // Multiple trucks needed
      const trucksNeeded = Math.ceil(Math.max(
        volumeUtilization / 100,
        weightUtilization / 100,
        footprintUtilization / 100,
        palletUtilization / 100
      ));
      
      if (trucksNeeded > 5) { // Reasonable limit
        return { feasible: false, reason: 'Too many trucks required' };
      }
      
      const avgUtilization = Math.min(100, (100 / trucksNeeded) * 
        Math.max(volumeUtilization, weightUtilization, footprintUtilization, palletUtilization) / 100);
      
      const trucks = this.distributeAcrossMultipleTrucks(palletSummary, truckSpec, trucksNeeded);
      
      return {
        feasible: true,
        trucksRequired: trucksNeeded,
        totalCost: this.calculateTotalCost(Array(trucksNeeded).fill(truckSpec), palletSummary),
        totalTime: this.calculateTotalTime(Array(trucksNeeded).fill(truckSpec), palletSummary),
        utilization: {
          volume: Math.round(volumeUtilization / trucksNeeded),
          weight: Math.round(weightUtilization / trucksNeeded),
          footprint: Math.round(footprintUtilization / trucksNeeded),
          pallets: Math.round(palletUtilization / trucksNeeded),
          overall: Math.round(avgUtilization)
        },
        loadingPlan: this.generateMultiTruckLoadingPlan(palletSummary, truckSpec, trucksNeeded),
        efficiencyScore: this.calculateEfficiencyScore(avgUtilization, trucksNeeded, truckSpec),
        trucks: trucks.map((truck, index) => ({
          type: truckType,
          spec: truckSpec,
          pallets: truck.pallets,
          utilization: truck.utilization,
          truckNumber: index + 1
        }))
      };
    }
  }
  
  generateLoadingPlan(palletSummary, truckSpec) {
    const plan = {
      truckType: truckSpec.name,
      palletBreakdown: [],
      loadingInstructions: [],
      totalLoadingTime: 0
    };
    
    Object.entries(palletSummary.bySize).forEach(([palletType, details]) => {
      if (details.quantity > 0) {
        plan.palletBreakdown.push({
          type: palletType,
          quantity: details.quantity,
          dimensions: `${details.spec.length}×${details.spec.width}×${details.spec.height}mm`,
          weight: `${details.totalWeight}kg total`,
          volume: `${details.totalVolume.toFixed(2)}m³ total`
        });
        
        plan.totalLoadingTime += details.quantity * truckSpec.loadingTimePerPallet;
      }
    });
    
    // Add loading instructions
    plan.loadingInstructions = [
      'Load heaviest pallets first for stability',
      'Distribute weight evenly across truck bed',
      'Secure all pallets with straps or load bars',
      `Estimated loading time: ${plan.totalLoadingTime} minutes`
    ];
    
    return plan;
  }
  
  generateMultiTruckLoadingPlan(palletSummary, truckSpec, trucksNeeded) {
    const plans = [];
    const palletsPerTruck = Math.ceil(palletSummary.totalPallets / trucksNeeded);
    
    for (let i = 0; i < trucksNeeded; i++) {
      plans.push({
        truckNumber: i + 1,
        estimatedPallets: Math.min(palletsPerTruck, palletSummary.totalPallets - (i * palletsPerTruck)),
        loadingTime: palletsPerTruck * truckSpec.loadingTimePerPallet
      });
    }
    
    return plans;
  }
  
  distributeAcrossMultipleTrucks(palletSummary, truckSpec, trucksNeeded) {
    const trucks = [];
    const palletsPerTruck = Math.ceil(palletSummary.totalPallets / trucksNeeded);
    
    for (let i = 0; i < trucksNeeded; i++) {
      const palletCount = Math.min(palletsPerTruck, palletSummary.totalPallets - (i * palletsPerTruck));
      const utilization = Math.round((palletCount / truckSpec.maxPallets) * 100);
      
      trucks.push({
        pallets: palletCount,
        utilization: utilization
      });
    }
    
    return trucks;
  }
  
  calculateTotalCost(truckSpecs, palletSummary, distance = 800) {
    return truckSpecs.reduce((total, spec) => {
      return total + (spec.costPerKm * distance);
    }, 0);
  }
  
  calculateTotalTime(truckSpecs, palletSummary, distance = 800) {
    const transitTime = distance / 70; // 70 km/h average
    const loadingTime = truckSpecs.reduce((total, spec) => {
      return total + (palletSummary.totalPallets * spec.loadingTimePerPallet / truckSpecs.length) / 60; // Convert to hours
    }, 0);
    
    return Math.round((transitTime + loadingTime) * 10) / 10;
  }
  
  calculateEfficiencyScore(utilization, trucksNeeded, truckSpec) {
    let score = utilization; // Base score from utilization
    
    // Penalty for multiple trucks
    score -= (trucksNeeded - 1) * 10;
    
    // Bonus for single truck solutions
    if (trucksNeeded === 1 && utilization >= 80) {
      score += 10;
    }
    
    // Bonus for appropriate truck size
    if (truckSpec.name.includes('B-Double') && utilization >= 70) {
      score += 5; // Bonus for efficient use of large truck
    }
    
    return Math.max(0, Math.round(score));
  }
  
  // Get recommendation for best truck type
  getBestTruckRecommendation(orders) {
    const options = this.optimizePalletLoading(orders);
    
    if (options.length === 0) {
      return {
        recommendation: 'No suitable truck configuration found',
        reason: 'Orders may exceed maximum capacity constraints'
      };
    }
    
    const best = options[0];
    
    return {
      recommendation: best.spec.name,
      truckType: best.truckType,
      trucksRequired: best.trucksRequired,
      utilization: best.utilization.overall,
      totalCost: best.totalCost,
      totalTime: best.totalTime,
      loadingPlan: best.loadingPlan,
      reason: this.generateRecommendationReason(best),
      allOptions: options
    };
  }
  
  generateRecommendationReason(config) {
    const reasons = [];
    
    if (config.trucksRequired === 1) {
      reasons.push('Single truck solution - optimal for coordination');
    }
    
    if (config.utilization.overall >= 80) {
      reasons.push('Excellent space utilization (>80%)');
    } else if (config.utilization.overall >= 60) {
      reasons.push('Good space utilization');
    } else {
      reasons.push('Consider waiting for more orders to improve utilization');
    }
    
    if (config.spec.name.includes('B-Double')) {
      reasons.push('Most cost-effective for large loads');
    } else if (config.spec.name.includes('Semi')) {
      reasons.push('Good balance of capacity and accessibility');
    } else {
      reasons.push('Best for smaller loads and urban delivery');
    }
    
    return reasons.join(', ');
  }
}

module.exports = new PalletOptimizationService();