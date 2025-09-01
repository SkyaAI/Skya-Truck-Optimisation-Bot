const moment = require('moment');
const routeOptimizer = require('./routeOptimizer');
const truckCompanyService = require('./truckCompanyService');
const palletOptimizationService = require('./palletOptimizationService');

// Pallet size definitions with volume calculations
const PALLET_SIZES = {
  'standard': { length: 1200, width: 1200, height: 1200, volume: 1.728, weight: 1000, code: 'STD' },
  'euro': { length: 1200, width: 800, height: 1200, volume: 1.152, weight: 800, code: 'EUR' },
  'half': { length: 600, width: 1200, height: 1200, volume: 0.864, weight: 500, code: 'HALF' },
  'quarter': { length: 600, width: 800, height: 1200, volume: 0.576, weight: 300, code: 'QTR' },
  'oversized': { length: 1200, width: 1200, height: 1800, volume: 2.592, weight: 1500, code: 'OS' }
};

// Truck capacity in terms of standard pallets and volume
const TRUCK_CAPACITIES = {
  'MR': { 
    maxPallets: 10, 
    maxVolume: 17.28, // m³
    maxWeight: 10000, // kg
    standardEquivalent: 10 
  },
  'SEMI': { 
    maxPallets: 22, 
    maxVolume: 38.0, // m³
    maxWeight: 22000, // kg
    standardEquivalent: 22 
  },
  'B_DOUBLE': { 
    maxPallets: 36, 
    maxVolume: 62.2, // m³
    maxWeight: 36000, // kg
    standardEquivalent: 36 
  }
};

// Wait time thresholds for consolidation
const CONSOLIDATION_RULES = {
  minUtilization: 0.5, // 50% minimum utilization
  maxWaitDays: 5, // Maximum days to wait for consolidation
  urgentOverride: true, // Allow urgent orders to bypass wait time
  costSavingsThreshold: 0.15 // Minimum 15% cost savings to recommend waiting
};

class ConsolidationService {
  constructor() {
    this.activeOrders = new Map(); // Store pending orders for consolidation
  }

  // Add multiple orders for consolidation analysis
  analyzeMultipleOrders(orders) {
    // Validate and process orders
    const processedOrders = orders.map(order => this.processOrder(order));
    
    // Group orders by similar routes and timeframes
    const routeGroups = this.groupOrdersByRoute(processedOrders);
    
    // Generate consolidation scenarios
    const consolidationScenarios = this.generateConsolidationScenarios(routeGroups);
    
    // Evaluate each scenario
    return consolidationScenarios.map(scenario => this.evaluateScenario(scenario));
  }

  processOrder(order) {
    const {
      id = this.generateOrderId(),
      source,
      destination,
      pallets,
      palletSize = 'standard',
      pickupDate,
      deliveryDate,
      urgency = 'standard',
      actualAddress = null,
      specialRequirements = null,
      customerName = null,
      contactInfo = null
    } = order;

    // Calculate pallet specifications
    const palletSpec = PALLET_SIZES[palletSize] || PALLET_SIZES['standard'];
    const totalVolume = pallets * palletSpec.volume;
    const totalWeight = pallets * palletSpec.weight;
    const standardEquivalent = this.calculateStandardEquivalent(pallets, palletSize);

    return {
      id,
      source: actualAddress?.pickup || source,
      destination: actualAddress?.delivery || destination,
      sourceCity: source,
      destinationCity: destination,
      actualAddress,
      pallets: parseInt(pallets),
      palletSize,
      palletSpec,
      totalVolume,
      totalWeight,
      standardEquivalent,
      pickupDate: moment(pickupDate),
      deliveryDate: moment(deliveryDate),
      urgency,
      specialRequirements,
      customerName,
      contactInfo,
      flexibility: this.calculateFlexibility(urgency, pickupDate, deliveryDate),
      processed: moment()
    };
  }

  calculateStandardEquivalent(pallets, palletSize) {
    const spec = PALLET_SIZES[palletSize] || PALLET_SIZES['standard'];
    return Math.ceil(pallets * (spec.volume / PALLET_SIZES['standard'].volume));
  }

  calculateFlexibility(urgency, pickupDate, deliveryDate) {
    const timeDiff = moment(deliveryDate).diff(moment(pickupDate), 'days');
    
    if (urgency === 'urgent') return { pickup: 0, delivery: 0, score: 0 };
    if (urgency === 'express') return { pickup: 1, delivery: 1, score: 2 };
    
    return { 
      pickup: Math.min(2, Math.floor(timeDiff * 0.3)), 
      delivery: Math.min(3, Math.floor(timeDiff * 0.5)),
      score: timeDiff 
    };
  }

  // Get orders that are available for pickup on or before a specific date
  getAvailableOrdersForDate(orders, targetDate) {
    return orders.filter(order => 
      order.pickupDate.isSameOrBefore(targetDate, 'day')
    );
  }

  // Assess delivery deadline risk for orders
  assessDeadlineRisk(orders) {
    const now = moment();
    let critical = 0, warning = 0, safe = 0;

    orders.forEach(order => {
      const daysToDeadline = order.deliveryDate.diff(now, 'days');
      if (daysToDeadline <= 1) critical++;
      else if (daysToDeadline <= 3) warning++;
      else safe++;
    });

    return { critical, warning, safe, total: orders.length };
  }

  // Create availability-based scenario when nothing is available immediately
  createAvailabilityBasedScenario(group, availabilityDate) {
    const availableOrders = this.getAvailableOrdersForDate(group.orders, availabilityDate);
    const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(availableOrders);
    const waitDays = availabilityDate.diff(moment(), 'days');
    
    return {
      id: `availability-${group.routeKey}`,
      type: 'availability',
      name: `Wait ${waitDays} Day${waitDays !== 1 ? 's' : ''} for Stock`,
      description: `Wait for stock availability on ${availabilityDate.format('YYYY-MM-DD')}`,
      routeGroup: { ...group, orders: availableOrders },
      availableOrders,
      waitTime: waitDays,
      truckConfiguration: palletRecommendation.allOptions?.[0]?.trucks || [],
      utilization: palletRecommendation.utilization || 0,
      estimatedCost: palletRecommendation.totalCost || 0,
      estimatedTime: palletRecommendation.totalTime || 0,
      consolidationSavings: 0,
      recommendations: [`Stock available on ${availabilityDate.format('MMM DD')}`],
      deadlineRisk: this.assessDeadlineRisk(availableOrders),
      truckCompanies: [],
      palletOptimization: palletRecommendation
    };
  }

  // Get unique stock availability dates from orders
  getUniqueStockAvailabilityDates(orders) {
    const dates = orders.map(order => order.pickupDate.clone().startOf('day'));
    const uniqueDates = [];
    
    dates.forEach(date => {
      if (!uniqueDates.some(d => d.isSame(date, 'day'))) {
        uniqueDates.push(date);
      }
    });
    
    return uniqueDates.sort((a, b) => a.diff(b));
  }

  // AI Decision Engine for consolidation recommendations
  makeAIConsolidationDecision({ currentPallets, additionalPallets, totalPallets, waitDays, deadlineRisk, truckCapacity }) {
    const utilization = totalPallets / truckCapacity;
    const currentUtilization = currentPallets / truckCapacity;
    
    // Calculate cost savings (rough estimate)
    const costSavings = Math.max(0, (1 - utilization) * 0.15); // Up to 15% savings at full capacity
    
    const recommendations = [];
    let recommend = false;
    let delayRisk = 'low';
    
    // AI Logic Rules:
    
    // Rule 1: If current load is nearly full (>90%), don't wait
    if (currentUtilization >= 0.9) {
      recommendations.push(`Current load is ${Math.round(currentUtilization * 100)}% full - dispatch immediately`);
      recommend = false;
    }
    // Rule 2: If waiting achieves near-full truck (>85%) and no critical deadlines, recommend waiting
    else if (utilization >= 0.85 && deadlineRisk.critical === 0) {
      recommendations.push(`Waiting achieves ${Math.round(utilization * 100)}% truck utilization`);
      recommendations.push(`Cost savings: ~${Math.round(costSavings * 100)}%`);
      recommend = true;
    }
    // Rule 3: If critical deadlines exist and waiting >1 day, don't wait
    else if (deadlineRisk.critical > 0 && waitDays > 1) {
      recommendations.push(`${deadlineRisk.critical} orders have critical deadlines - don't risk delays`);
      recommend = false;
      delayRisk = 'high';
    }
    // Rule 4: Smart threshold based on wait time and improvement
    else {
      const utilizationImprovement = utilization - currentUtilization;
      const improvementThreshold = 0.3 + (waitDays * 0.1); // Higher threshold for longer waits
      
      if (utilizationImprovement >= improvementThreshold) {
        recommendations.push(`Utilization improves by ${Math.round(utilizationImprovement * 100)}%`);
        recommendations.push(`Worth waiting ${waitDays} day${waitDays !== 1 ? 's' : ''} for better efficiency`);
        recommend = true;
      } else {
        recommendations.push(`Only ${Math.round(utilizationImprovement * 100)}% improvement - not worth ${waitDays}-day delay`);
        recommend = false;
      }
    }
    
    // Add delay risk assessment
    if (deadlineRisk.warning > 0) {
      delayRisk = 'medium';
      recommendations.push(`⚠️ ${deadlineRisk.warning} orders have tight deadlines`);
    }
    
    return {
      recommend,
      costSavings: Math.round(costSavings * 100) / 100,
      delayRisk,
      recommendations,
      utilizationImprovement: utilization - currentUtilization,
      finalUtilization: utilization
    };
  }

  groupOrdersByRoute(orders) {
    const groups = new Map();

    orders.forEach(order => {
      // Create route key (bidirectional for potential consolidation)
      const routeKey = this.createRouteKey(order.sourceCity, order.destinationCity);
      
      if (!groups.has(routeKey)) {
        groups.set(routeKey, {
          routeKey,
          sourceCity: order.sourceCity,
          destinationCity: order.destinationCity,
          orders: [],
          totalVolume: 0,
          totalWeight: 0,
          totalStandardPallets: 0,
          urgentOrders: 0,
          earliestPickup: null,
          latestDelivery: null
        });
      }

      const group = groups.get(routeKey);
      group.orders.push(order);
      group.totalVolume += order.totalVolume;
      group.totalWeight += order.totalWeight;
      group.totalStandardPallets += order.standardEquivalent;
      
      if (order.urgency === 'urgent') group.urgentOrders++;
      
      if (!group.earliestPickup || order.pickupDate.isBefore(group.earliestPickup)) {
        group.earliestPickup = order.pickupDate;
      }
      
      if (!group.latestDelivery || order.deliveryDate.isAfter(group.latestDelivery)) {
        group.latestDelivery = order.deliveryDate;
      }
    });

    return Array.from(groups.values());
  }

  createRouteKey(source, destination) {
    // Normalize route key to handle bidirectional routes
    return [source, destination].sort().join('-');
  }

  generateConsolidationScenarios(routeGroups) {
    const scenarios = [];

    routeGroups.forEach(group => {
      // Immediate dispatch scenario
      scenarios.push(this.createImmediateScenario(group));

      // Consolidation scenarios (only if not all urgent)
      if (group.urgentOrders < group.orders.length) {
        scenarios.push(...this.createConsolidationScenarios(group));
      }

      // Partial consolidation scenarios
      if (group.orders.length > 2) {
        scenarios.push(...this.createPartialConsolidationScenarios(group));
      }
    });

    return scenarios;
  }

  createImmediateScenario(group) {
    // Check what's actually available for immediate dispatch
    const availableOrders = this.getAvailableOrdersForDate(group.orders, moment());
    const remainingOrders = group.orders.filter(order => 
      !availableOrders.some(avail => avail.id === order.id)
    );

    if (availableOrders.length === 0) {
      // Nothing available now - create scenario for earliest available date
      const earliestAvailable = group.orders.reduce((earliest, order) => 
        !earliest || order.pickupDate.isBefore(earliest) ? order.pickupDate : earliest, null
      );
      
      return this.createAvailabilityBasedScenario(group, earliestAvailable);
    }

    // Use enhanced pallet optimization for available orders only
    const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(availableOrders);
    const truckConfig = palletRecommendation.allOptions?.[0]?.trucks || this.optimizeTruckConfiguration(
      availableOrders.reduce((sum, o) => sum + o.standardEquivalent, 0), 'immediate'
    );

    // Check delivery deadline risk
    const deadlineRisk = this.assessDeadlineRisk(availableOrders);
    const recommendations = [palletRecommendation.reason || 'Optimized for immediate dispatch'];
    
    if (remainingOrders.length > 0) {
      recommendations.push(`${remainingOrders.length} orders not yet available - will require separate dispatch`);
    }

    if (deadlineRisk.critical > 0) {
      recommendations.unshift(`⚠️ ${deadlineRisk.critical} orders have tight delivery deadlines - dispatch immediately`);
    }
    
    return {
      id: `immediate-${group.routeKey}`,
      type: 'immediate',
      name: availableOrders.length === group.orders.length ? 'Immediate Dispatch (All Available)' : 
            `Immediate Dispatch (${availableOrders.length}/${group.orders.length} Available)`,
      description: 'Dispatch currently available stock without waiting',
      routeGroup: { ...group, orders: availableOrders },
      availableOrders,
      remainingOrders,
      waitTime: 0,
      truckConfiguration: truckConfig,
      utilization: palletRecommendation.utilization || this.calculateUtilization(
        availableOrders.reduce((sum, o) => sum + o.standardEquivalent, 0), truckConfig
      ),
      estimatedCost: palletRecommendation.totalCost || this.calculateScenarioCost({ ...group, orders: availableOrders }, truckConfig, 'immediate'),
      estimatedTime: palletRecommendation.totalTime || this.calculateScenarioTime({ ...group, orders: availableOrders }, truckConfig, 'immediate'),
      consolidationSavings: 0,
      recommendations,
      deadlineRisk,
      truckCompanies: [],
      palletOptimization: palletRecommendation
    };
  }

  createConsolidationScenarios(group) {
    const scenarios = [];
    
    // Smart consolidation based on stock availability and delivery deadlines
    const stockDates = this.getUniqueStockAvailabilityDates(group.orders);
    
    stockDates.forEach(stockDate => {
      const waitDays = stockDate.diff(moment(), 'days');
      if (waitDays <= 0 || waitDays > CONSOLIDATION_RULES.maxWaitDays) return;
      
      const availableOrders = this.getAvailableOrdersForDate(group.orders, stockDate);
      const deadlineRisk = this.assessDeadlineRisk(availableOrders);
      
      // Check if waiting would cause deadline violations
      const wouldMissDeadlines = availableOrders.some(order => {
        const transitTime = 2; // Estimate 2 days transit
        const requiredDispatchDate = order.deliveryDate.clone().subtract(transitTime, 'days');
        return stockDate.isAfter(requiredDispatchDate);
      });
      
      if (wouldMissDeadlines && deadlineRisk.critical > 0) {
        // Don't create scenarios that would miss critical deadlines
        return;
      }
      
      const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(availableOrders);
      const totalPallets = availableOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      
      // Calculate consolidation benefit
      const currentAvailable = this.getAvailableOrdersForDate(group.orders, moment());
      const currentPallets = currentAvailable.reduce((sum, o) => sum + o.standardEquivalent, 0);
      const additionalPallets = totalPallets - currentPallets;
      
      if (additionalPallets <= 0) return; // No benefit from waiting
      
      // AI Decision Logic: Should we wait?
      const shouldWait = this.makeAIConsolidationDecision({
        currentPallets,
        additionalPallets,
        totalPallets,
        waitDays,
        deadlineRisk,
        truckCapacity: palletRecommendation.allOptions?.[0]?.spec?.maxPallets || 22
      });
      
      if (!shouldWait.recommend && deadlineRisk.critical === 0) return;
      
      const scenario = {
        id: `consolidate-${waitDays}-${group.routeKey}`,
        type: 'consolidation',
        name: `Wait ${waitDays} Day${waitDays !== 1 ? 's' : ''} for Full Consolidation`,
        description: `Wait until ${stockDate.format('MMM DD')} when all ${totalPallets} pallets are available`,
        routeGroup: { ...group, orders: availableOrders },
        waitTime: waitDays,
        availableOnDate: stockDate.format('YYYY-MM-DD'),
        totalPalletsOnDate: totalPallets,
        additionalPallets,
        truckConfiguration: palletRecommendation.allOptions?.[0]?.trucks || [],
        utilization: palletRecommendation.utilization || 0,
        estimatedCost: palletRecommendation.totalCost || 0,
        estimatedTime: (palletRecommendation.totalTime || 0) + (waitDays * 24),
        consolidationSavings: shouldWait.costSavings,
        delayRisk: shouldWait.delayRisk,
        recommendations: shouldWait.recommendations,
        aiDecision: shouldWait,
        deadlineRisk,
        truckCompanies: [],
        palletOptimization: palletRecommendation
      };
      
      scenarios.push(scenario);
    });

    return scenarios;
  }

  createPartialConsolidationScenarios(group) {
    const scenarios = [];
    const urgentOrders = group.orders.filter(o => o.urgency === 'urgent');
    const flexibleOrders = group.orders.filter(o => o.urgency !== 'urgent');

    if (urgentOrders.length > 0 && flexibleOrders.length > 0) {
      // Dispatch urgent immediately, consolidate flexible orders
      const urgentPallets = urgentOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      const flexiblePallets = flexibleOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      
      scenarios.push({
        id: `split-${group.routeKey}`,
        type: 'split',
        name: 'Split Dispatch - Urgent + Consolidated',
        description: 'Send urgent orders immediately, consolidate remaining orders',
        routeGroup: group,
        urgentDispatch: {
          pallets: urgentPallets,
          truckConfig: this.optimizeTruckConfiguration(urgentPallets, 'immediate'),
          orders: urgentOrders
        },
        consolidatedDispatch: {
          pallets: flexiblePallets,
          truckConfig: this.optimizeTruckConfiguration(flexiblePallets, 'consolidated'),
          orders: flexibleOrders,
          waitTime: 2
        },
        waitTime: 0, // Urgent orders don't wait
        utilization: this.calculateSplitUtilization(urgentPallets, flexiblePallets),
        estimatedCost: this.calculateSplitCost(urgentOrders, flexibleOrders),
        estimatedTime: this.calculateSplitTime(urgentOrders, flexibleOrders),
        consolidationSavings: this.calculatePartialSavings(urgentOrders, flexibleOrders),
        recommendations: ['Optimal for mixed urgency orders'],
        truckCompanies: []
      });
    }

    return scenarios;
  }

  optimizeTruckConfiguration(standardPallets, priority = 'balanced') {
    const trucks = [];
    let remainingPallets = standardPallets;

    if (priority === 'immediate' || priority === 'time') {
      // Prioritize faster loading/unloading with multiple smaller trucks
      while (remainingPallets > 0) {
        if (remainingPallets >= 20) {
          const palletLoad = Math.min(remainingPallets, 22);
          trucks.push({ type: 'SEMI', pallets: palletLoad, capacity: 22 });
          remainingPallets -= palletLoad;
        } else {
          trucks.push({ type: 'MR', pallets: remainingPallets, capacity: 10 });
          remainingPallets = 0;
        }
      }
    } else {
      // Prioritize cost efficiency with larger trucks
      while (remainingPallets >= 30) {
        const palletLoad = Math.min(remainingPallets, 36);
        trucks.push({ type: 'B_DOUBLE', pallets: palletLoad, capacity: 36 });
        remainingPallets -= palletLoad;
      }
      
      while (remainingPallets >= 15) {
        const palletLoad = Math.min(remainingPallets, 22);
        trucks.push({ type: 'SEMI', pallets: palletLoad, capacity: 22 });
        remainingPallets -= palletLoad;
      }
      
      if (remainingPallets > 0) {
        trucks.push({ type: 'MR', pallets: remainingPallets, capacity: 10 });
      }
    }

    return trucks;
  }

  calculateUtilization(pallets, truckConfig) {
    const totalCapacity = truckConfig.reduce((sum, truck) => sum + truck.capacity, 0);
    return Math.round((pallets / totalCapacity) * 100);
  }

  projectAdditionalOrders(group, waitDays) {
    // Simple projection model - would be enhanced with historical data
    const baseProjection = group.totalStandardPallets * 0.3; // 30% more orders expected
    const daysFactor = Math.min(waitDays / 3, 1); // Diminishing returns after 3 days
    
    return Math.round(baseProjection * daysFactor);
  }

  evaluateScenario(scenario) {
    // Add truck company recommendations
    scenario.truckCompanies = this.recommendTruckCompanies(scenario);
    
    // Calculate overall score
    scenario.score = this.calculateScenarioScore(scenario);
    
    // Add detailed analysis
    scenario.analysis = this.generateScenarioAnalysis(scenario);
    
    return scenario;
  }

  recommendTruckCompanies(scenario) {
    const criteria = {
      truckType: scenario.truckConfiguration[0]?.type || 'SEMI',
      sourceLocation: scenario.routeGroup.sourceCity,
      destinationLocation: scenario.routeGroup.destinationCity,
      urgency: scenario.routeGroup.urgentOrders > 0 ? 'urgent' : 'standard',
      prioritizeBy: scenario.type === 'immediate' ? 'time' : 'cost'
    };

    const recommendations = truckCompanyService.recommendCompanies(criteria);
    
    return recommendations.map(company => ({
      ...company,
      estimatedCost: Math.round(scenario.estimatedCost * company.estimatedCostMultiplier),
      estimatedTime: Math.round(scenario.estimatedTime * company.estimatedTimeBonus * 10) / 10,
      truckTypes: scenario.truckConfiguration.map(truck => ({
        type: truck.type,
        quantity: 1,
        pallets: truck.pallets,
        bookingReference: `${company.companyCode}-${truck.type}-${Date.now()}`
      }))
    }));
  }

  calculateScenarioScore(scenario) {
    let score = 0;
    
    // Utilization score (0-40 points)
    score += Math.min(40, scenario.utilization * 0.4);
    
    // Cost efficiency score (0-30 points)
    const costEfficiency = Math.max(0, 1 - (scenario.estimatedCost / 10000));
    score += costEfficiency * 30;
    
    // Time efficiency score (0-20 points) 
    const timeEfficiency = Math.max(0, 1 - (scenario.estimatedTime / 100));
    score += timeEfficiency * 20;
    
    // Consolidation savings score (0-10 points)
    if (scenario.consolidationSavings > 0) {
      score += Math.min(10, scenario.consolidationSavings * 0.01);
    }
    
    // Penalty for waiting (urgent orders)
    if (scenario.waitTime > 0 && scenario.routeGroup.urgentOrders > 0) {
      score -= scenario.waitTime * 5;
    }
    
    return Math.round(score * 10) / 10;
  }

  generateScenarioAnalysis(scenario) {
    const analysis = {
      pros: [],
      cons: [],
      recommendations: [...(scenario.recommendations || [])],
      riskFactors: []
    };

    // Analyze utilization
    if (scenario.utilization >= 80) {
      analysis.pros.push('Excellent truck utilization (>80%)');
    } else if (scenario.utilization < 50) {
      analysis.cons.push('Low truck utilization (<50%)');
      analysis.recommendations.push('Consider waiting for more orders or using smaller trucks');
    }

    // Analyze wait time
    if (scenario.waitTime > 0) {
      if (scenario.consolidationSavings > scenario.estimatedCost * 0.15) {
        analysis.pros.push(`Significant cost savings (${Math.round(scenario.consolidationSavings)}$) justify wait time`);
      } else {
        analysis.cons.push('Wait time may not justify modest savings');
      }
    }

    // Analyze urgency conflicts
    if (scenario.waitTime > 0 && scenario.routeGroup.urgentOrders > 0) {
      analysis.riskFactors.push('Urgent orders present - waiting may breach delivery commitments');
    }

    // Analyze truck configuration
    if (scenario.truckConfiguration.length > 3) {
      analysis.cons.push('Multiple trucks increase coordination complexity');
      analysis.recommendations.push('Consider consolidating into fewer, larger trucks');
    }

    return analysis;
  }

  // Utility methods for calculations
  calculateScenarioCost(group, truckConfig, priority, waitDays = 0) {
    // Base cost calculation using existing route optimizer
    const baseCost = truckConfig.reduce((sum, truck) => {
      const costPerKm = this.getTruckCostPerKm(truck.type);
      return sum + (800 * costPerKm); // Assume 800km average
    }, 0);

    // Wait time penalty
    const waitPenalty = waitDays * 50; // $50 per day storage cost
    
    // Urgency multiplier
    const urgencyMultiplier = priority === 'immediate' && group.urgentOrders > 0 ? 1.25 : 1.0;
    
    return Math.round((baseCost + waitPenalty) * urgencyMultiplier);
  }

  calculateScenarioTime(group, truckConfig, priority, waitDays = 0) {
    const baseTime = 12; // 12 hours base transit time
    const loadingTime = truckConfig.length * 2; // 2 hours per truck
    
    return baseTime + loadingTime + (waitDays * 24);
  }

  calculateConsolidationSavings(group, waitDays) {
    const immediateCost = this.calculateScenarioCost(group, 
      this.optimizeTruckConfiguration(group.totalStandardPallets, 'immediate'), 
      'immediate'
    );
    
    const consolidatedCost = this.calculateScenarioCost(group,
      this.optimizeTruckConfiguration(group.totalStandardPallets * 1.3, 'consolidated'),
      'consolidated',
      waitDays
    );
    
    return Math.max(0, immediateCost - consolidatedCost);
  }

  getTruckCostPerKm(truckType) {
    const costs = { MR: 2.60, SEMI: 3.60, B_DOUBLE: 4.50 };
    return costs[truckType] || 3.60;
  }

  generateOrderId() {
    return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
  }

  // Additional helper methods
  calculateSplitUtilization(urgentPallets, flexiblePallets) {
    const urgentConfig = this.optimizeTruckConfiguration(urgentPallets, 'immediate');
    const flexibleConfig = this.optimizeTruckConfiguration(flexiblePallets, 'consolidated');
    
    const totalCapacity = urgentConfig.concat(flexibleConfig).reduce((sum, truck) => sum + truck.capacity, 0);
    return Math.round(((urgentPallets + flexiblePallets) / totalCapacity) * 100);
  }

  calculateSplitCost(urgentOrders, flexibleOrders) {
    // Calculate costs for split dispatch scenario
    const urgentPallets = urgentOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
    const flexiblePallets = flexibleOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
    
    const urgentCost = this.calculateScenarioCost(
      { totalStandardPallets: urgentPallets, urgentOrders: urgentOrders.length },
      this.optimizeTruckConfiguration(urgentPallets, 'immediate'),
      'immediate'
    );
    
    const flexibleCost = this.calculateScenarioCost(
      { totalStandardPallets: flexiblePallets, urgentOrders: 0 },
      this.optimizeTruckConfiguration(flexiblePallets, 'consolidated'),
      'consolidated',
      2
    );
    
    return urgentCost + flexibleCost;
  }

  calculateSplitTime(urgentOrders, flexibleOrders) {
    // Return time for urgent orders (flexible orders wait 2 days)
    return 12; // Urgent orders get 12-hour delivery
  }

  calculatePartialSavings(urgentOrders, flexibleOrders) {
    // Calculate savings from partial consolidation
    const totalOrders = urgentOrders.concat(flexibleOrders);
    const totalPallets = totalOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
    
    const allImmediateCost = this.calculateScenarioCost(
      { totalStandardPallets: totalPallets, urgentOrders: totalOrders.length },
      this.optimizeTruckConfiguration(totalPallets, 'immediate'),
      'immediate'
    );
    
    const splitCost = this.calculateSplitCost(urgentOrders, flexibleOrders);
    
    return Math.max(0, allImmediateCost - splitCost);
  }

  generateWaitRecommendations(group, waitDays) {
    const recommendations = [];
    
    recommendations.push(`Monitor for additional orders on ${group.routeKey} route`);
    recommendations.push(`Set booking deadline ${waitDays} days from now`);
    
    if (group.urgentOrders === 0) {
      recommendations.push('No urgent orders - safe to wait for consolidation');
    }
    
    if (waitDays <= 2) {
      recommendations.push('Short wait period - low risk of delivery delays');
    } else {
      recommendations.push('Extended wait - confirm customer acceptance');
    }
    
    return recommendations;
  }
}

module.exports = new ConsolidationService();