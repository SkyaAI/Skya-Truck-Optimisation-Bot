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
  maxDelayDays: 2, // Maximum days late delivery allowed (customer constraint)
  penaltyCostPerPalletPerDay: 0.50, // Customer penalty cost for late delivery
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

  // Create deadline-optimized dispatch scenarios with penalty cost analysis
  createAllDispatchScenarios(group) {
    const scenarios = [];
    const today = moment();
    const transitTime = 2; // Assume 2 days transit time
    
    // Generate multiple dispatch strategies
    scenarios.push(...this.createDeadlineOptimizedScenarios(group));
    scenarios.push(...this.createConsolidationScenarios(group));
    
    // Sort by total cost (truck cost + penalty cost)
    return scenarios.sort((a, b) => a.totalCostWithPenalties - b.totalCostWithPenalties);
  }

  // Create scenarios optimized for meeting delivery deadlines
  createDeadlineOptimizedScenarios(group) {
    const scenarios = [];
    const today = moment();
    const transitTime = 2;
    
    // Group orders by delivery deadline requirements
    const ordersByDeadline = this.groupOrdersByDeliveryDeadline(group.orders, transitTime);
    
    // Create dispatch timeline scenarios
    const dispatchTimeline = this.createOptimalDispatchTimeline(ordersByDeadline);
    
    dispatchTimeline.forEach((dispatchGroup, index) => {
      const { dispatchDate, orders, isOnTime, delayDays } = dispatchGroup;
      const waitDays = Math.max(0, dispatchDate.diff(today, 'days'));
      
      // Calculate costs
      const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(orders);
      const truckCost = palletRecommendation.totalCost || 0;
      const totalPallets = orders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      const penaltyCost = this.calculatePenaltyCost(orders, dispatchDate, transitTime);
      const totalCostWithPenalties = truckCost + penaltyCost;
      
      // Generate scenario name and description
      let scenarioName, scenarioType = 'deadline-optimized';
      const recommendations = [];
      
      if (index === 0) {
        scenarioName = `Deadline Compliance - Dispatch ${totalPallets} Pallets`;
        if (isOnTime) {
          recommendations.push(`✅ All orders arrive ON TIME`);
        } else {
          recommendations.push(`⚠️ Some orders ${delayDays} day${delayDays !== 1 ? 's' : ''} late`);
          recommendations.push(`💰 Penalty cost: $${penaltyCost.toFixed(2)}`);
        }
      } else {
        scenarioName = `Alternative Dispatch ${index + 1} - ${totalPallets} Pallets`;
        recommendations.push(`💰 Total cost: $${totalCostWithPenalties.toFixed(2)} (truck + penalties)`);
      }
      
      // Add cost breakdown
      recommendations.push(`🚚 Truck cost: $${truckCost.toFixed(2)}`);
      if (penaltyCost > 0) {
        recommendations.push(`⚠️ Late penalty: $${penaltyCost.toFixed(2)} (${penaltyCost / CONSOLIDATION_RULES.penaltyCostPerPalletPerDay} pallet-days)`);
      }
      
      // Add utilization info
      const utilization = palletRecommendation.utilization || 0;
      if (utilization >= 80) {
        recommendations.push(`✅ Excellent ${utilization}% truck utilization`);
      } else if (utilization >= 50) {
        recommendations.push(`📊 ${utilization}% truck utilization`);
      } else {
        recommendations.push(`⚠️ Low ${utilization}% truck utilization - consider smaller truck`);
      }
      
      const scenario = {
        id: `deadline-${index}-${group.routeKey}`,
        type: scenarioType,
        name: scenarioName,
        description: `Dispatch on ${dispatchDate.format('MMM DD')} to ${isOnTime ? 'meet' : 'minimize delay for'} delivery deadlines`,
        routeGroup: { ...group, orders },
        availableOrders: orders,
        dispatchDate: dispatchDate.format('YYYY-MM-DD'),
        waitTime: waitDays,
        totalPalletsOnDate: totalPallets,
        truckConfiguration: palletRecommendation.allOptions?.[0]?.trucks || [],
        utilization,
        estimatedCost: truckCost,
        penaltyCost,
        totalCostWithPenalties,
        estimatedTime: (palletRecommendation.totalTime || 0) + (waitDays * 24),
        isOnTime,
        delayDays,
        recommendations,
        deadlineRisk: this.assessDeadlineRisk(orders),
        truckCompanies: [],
        palletOptimization: palletRecommendation,
        score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, isOnTime, utilization)
      };
      
      scenarios.push(scenario);
    });
    
    return scenarios;
  }

  // Group orders by when they need to be dispatched to meet delivery deadlines
  groupOrdersByDeliveryDeadline(orders, transitTime) {
    const deadlineGroups = new Map();
    
    orders.forEach(order => {
      const requiredDispatchDate = order.deliveryDate.clone().subtract(transitTime, 'days');
      const actualDispatchDate = moment.max(order.pickupDate, requiredDispatchDate);
      const dateKey = actualDispatchDate.format('YYYY-MM-DD');
      
      if (!deadlineGroups.has(dateKey)) {
        deadlineGroups.set(dateKey, {
          dispatchDate: actualDispatchDate,
          orders: []
        });
      }
      
      deadlineGroups.get(dateKey).orders.push(order);
    });
    
    return Array.from(deadlineGroups.values()).sort((a, b) => a.dispatchDate.diff(b.dispatchDate));
  }

  // Create optimal dispatch timeline considering stock availability and deadlines
  createOptimalDispatchTimeline(ordersByDeadline) {
    const timeline = [];
    const today = moment();
    const transitTime = 2;
    
    // Strategy 1: Dispatch each deadline group separately (highest cost but on-time)
    ordersByDeadline.forEach(group => {
      const { dispatchDate, orders } = group;
      const delayDays = this.calculateDelayDays(orders, dispatchDate, transitTime);
      
      timeline.push({
        dispatchDate,
        orders,
        isOnTime: delayDays === 0,
        delayDays: Math.max(0, delayDays)
      });
    });
    
    // Strategy 2: Consolidation opportunities (potentially some delays but cost savings)
    if (ordersByDeadline.length > 1) {
      // Try consolidating first two groups
      const consolidatedOrders = [...ordersByDeadline[0].orders, ...ordersByDeadline[1].orders];
      const consolidatedDispatchDate = ordersByDeadline[1].dispatchDate; // Dispatch at later date
      const delayDays = this.calculateDelayDays(consolidatedOrders, consolidatedDispatchDate, transitTime);
      
      // Only add if delay is within acceptable limits
      if (delayDays <= CONSOLIDATION_RULES.maxDelayDays) {
        timeline.push({
          dispatchDate: consolidatedDispatchDate,
          orders: consolidatedOrders,
          isOnTime: delayDays === 0,
          delayDays: Math.max(0, delayDays)
        });
      }
    }
    
    return timeline;
  }

  // Calculate penalty cost for late deliveries
  calculatePenaltyCost(orders, dispatchDate, transitTime) {
    let totalPenalty = 0;
    
    orders.forEach(order => {
      const deliveryDate = dispatchDate.clone().add(transitTime, 'days');
      const daysLate = Math.max(0, deliveryDate.diff(order.deliveryDate, 'days'));
      const palletPenalty = daysLate * order.standardEquivalent * CONSOLIDATION_RULES.penaltyCostPerPalletPerDay;
      totalPenalty += palletPenalty;
    });
    
    return totalPenalty;
  }

  // Calculate how many days late orders would be
  calculateDelayDays(orders, dispatchDate, transitTime) {
    let maxDelayDays = 0;
    
    orders.forEach(order => {
      const deliveryDate = dispatchDate.clone().add(transitTime, 'days');
      const daysLate = Math.max(0, deliveryDate.diff(order.deliveryDate, 'days'));
      maxDelayDays = Math.max(maxDelayDays, daysLate);
    });
    
    return maxDelayDays;
  }

  // Calculate score prioritizing total cost (truck + penalties)
  calculateDeadlineOptimizedScore(totalCost, isOnTime, utilization) {
    let score = 100; // Start with base score
    
    // Prioritize on-time delivery
    if (isOnTime) score += 50;
    
    // Prefer lower total costs
    score -= totalCost / 100; // Reduce score by cost/100
    
    // Bonus for good utilization
    score += utilization / 10;
    
    return Math.max(0, score);
  }

  // Calculate scenario score for ranking
  calculateScenarioScore(utilization, waitDays, deadlineRisk, wouldMissDeadlines) {
    let score = utilization; // Start with utilization as base score
    
    // Penalize wait time
    score -= waitDays * 5;
    
    // Heavily penalize deadline risks
    score -= deadlineRisk.critical * 30;
    score -= deadlineRisk.warning * 10;
    
    // Severely penalize scenarios that would miss deadlines
    if (wouldMissDeadlines) score -= 50;
    
    return Math.max(0, score);
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
      // Generate all possible dispatch scenarios based on stock availability dates
      scenarios.push(...this.createAllDispatchScenarios(group));
    });

    return scenarios;
  }

  // Legacy immediate scenario function - replaced by createAllDispatchScenarios

  // Create traditional consolidation scenarios with penalty cost consideration
  createConsolidationScenarios(group) {
    const scenarios = [];
    const today = moment();
    const transitTime = 2;
    
    // Get all unique availability dates
    const availabilityDates = this.getUniqueStockAvailabilityDates(group.orders);
    
    // Create scenarios for each potential dispatch date
    availabilityDates.forEach((dispatchDate, index) => {
      const availableOrders = this.getAvailableOrdersForDate(group.orders, dispatchDate);
      const totalPallets = availableOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      const waitDays = Math.max(0, dispatchDate.diff(today, 'days'));
      
      // Skip if no orders available or wait time exceeds limit
      if (totalPallets === 0 || waitDays > CONSOLIDATION_RULES.maxWaitDays) return;
      
      // Calculate costs
      const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(availableOrders);
      const truckCost = palletRecommendation.totalCost || 0;
      const penaltyCost = this.calculatePenaltyCost(availableOrders, dispatchDate, transitTime);
      const totalCostWithPenalties = truckCost + penaltyCost;
      
      // Calculate utilization and efficiency metrics
      const utilization = palletRecommendation.utilization || 0;
      const deadlineRisk = this.assessDeadlineRisk(availableOrders);
      const delayDays = this.calculateDelayDays(availableOrders, dispatchDate, transitTime);
      
      // Skip if delays exceed maximum allowed
      if (delayDays > CONSOLIDATION_RULES.maxDelayDays) return;
      
      // Generate scenario recommendations
      const recommendations = [];
      
      // Analyze consolidation benefits
      if (utilization >= 80) {
        recommendations.push(`✅ Excellent ${utilization}% truck utilization`);
      } else if (utilization >= 60) {
        recommendations.push(`📊 Good ${utilization}% truck utilization`);
      } else {
        recommendations.push(`⚠️ Moderate ${utilization}% utilization - consider alternatives`);
      }
      
      // Add cost analysis
      recommendations.push(`🚚 Truck cost: $${truckCost.toFixed(2)}`);
      if (penaltyCost > 0) {
        const penaltyPalletDays = penaltyCost / CONSOLIDATION_RULES.penaltyCostPerPalletPerDay;
        recommendations.push(`⚠️ Late penalty: $${penaltyCost.toFixed(2)} (${penaltyPalletDays} pallet-days)`);
      } else {
        recommendations.push(`✅ No delivery penalties - all orders on time`);
      }
      
      // Add wait time assessment
      if (waitDays === 0) {
        recommendations.push(`🚀 Immediate dispatch available`);
      } else if (waitDays <= 2) {
        recommendations.push(`⏱️ Short ${waitDays}-day wait for consolidation`);
      } else {
        recommendations.push(`⏳ Extended ${waitDays}-day wait - consider risk vs savings`);
      }
      
      // AI consolidation decision
      const currentOrdersCount = availableOrders.length;
      const totalOrdersCount = group.orders.length;
      const consolidationRatio = currentOrdersCount / totalOrdersCount;
      
      if (consolidationRatio >= 0.8) {
        recommendations.push(`💡 High consolidation: ${currentOrdersCount}/${totalOrdersCount} orders`);
      } else if (consolidationRatio >= 0.5) {
        recommendations.push(`📊 Partial consolidation: ${currentOrdersCount}/${totalOrdersCount} orders`);
      } else {
        recommendations.push(`⚠️ Limited consolidation: ${currentOrdersCount}/${totalOrdersCount} orders`);
      }
      
      // Create scenario
      const scenario = {
        id: `consolidation-${index}-${group.routeKey}`,
        type: waitDays === 0 ? 'immediate' : 'consolidation',
        name: waitDays === 0 ? 
          `Immediate Dispatch - ${totalPallets} Pallets` : 
          `Wait ${waitDays} Day${waitDays !== 1 ? 's' : ''} - Consolidate ${totalPallets} Pallets`,
        description: waitDays === 0 ? 
          'Dispatch all available stock immediately' :
          `Wait for optimal consolidation on ${dispatchDate.format('MMM DD')}`,
        routeGroup: { ...group, orders: availableOrders },
        availableOrders,
        dispatchDate: dispatchDate.format('YYYY-MM-DD'),
        waitTime: waitDays,
        totalPalletsOnDate: totalPallets,
        truckConfiguration: palletRecommendation.allOptions?.[0]?.trucks || [],
        utilization,
        estimatedCost: truckCost,
        penaltyCost,
        totalCostWithPenalties,
        estimatedTime: (palletRecommendation.totalTime || 0) + (waitDays * 24),
        delayDays,
        isOnTime: delayDays === 0,
        recommendations,
        deadlineRisk,
        truckCompanies: [],
        palletOptimization: palletRecommendation,
        score: this.calculateConsolidationScore(totalCostWithPenalties, waitDays, utilization, delayDays),
        aiDecision: this.makeConsolidationAIDecision({
          totalCost: totalCostWithPenalties,
          waitDays,
          utilization,
          delayDays,
          penaltyCost,
          consolidationRatio
        })
      };
      
      scenarios.push(scenario);
    });
    
    return scenarios;
  }

  // AI decision engine for consolidation scenarios
  makeConsolidationAIDecision({ totalCost, waitDays, utilization, delayDays, penaltyCost, consolidationRatio }) {
    let recommend = false;
    let confidence = 'medium';
    const reasons = [];
    
    // Rule 1: No delays and good utilization = recommend
    if (delayDays === 0 && utilization >= 70) {
      recommend = true;
      confidence = 'high';
      reasons.push('No delays with excellent utilization');
    }
    // Rule 2: Small penalty cost vs significant consolidation = recommend  
    else if (penaltyCost < totalCost * 0.1 && consolidationRatio >= 0.6) {
      recommend = true;
      confidence = 'medium';
      reasons.push('Minor penalty cost justified by consolidation savings');
    }
    // Rule 3: Immediate dispatch with good utilization = recommend
    else if (waitDays === 0 && utilization >= 50) {
      recommend = true;
      confidence = 'high';
      reasons.push('Immediate dispatch with acceptable utilization');
    }
    // Rule 4: High penalty cost = not recommend
    else if (penaltyCost > totalCost * 0.2) {
      recommend = false;
      confidence = 'high';
      reasons.push('Penalty costs too high relative to truck costs');
    }
    // Rule 5: Long wait with low consolidation = not recommend
    else if (waitDays > 2 && consolidationRatio < 0.5) {
      recommend = false;
      confidence = 'medium';
      reasons.push('Extended wait with limited consolidation benefit');
    }
    // Default: moderate recommendation based on cost-benefit
    else {
      const costBenefit = (utilization - 50) / 50 - (waitDays * 10) - (penaltyCost / totalCost * 100);
      recommend = costBenefit > 0;
      confidence = 'low';
      reasons.push('Balanced cost-benefit analysis');
    }
    
    return {
      recommend,
      confidence,
      reasons,
      totalCostImpact: `$${totalCost.toFixed(2)} (truck: $${(totalCost - penaltyCost).toFixed(2)} + penalties: $${penaltyCost.toFixed(2)})`
    };
  }

  // Calculate score for consolidation scenarios
  calculateConsolidationScore(totalCost, waitDays, utilization, delayDays) {
    let score = 100; // Base score
    
    // Cost efficiency (lower cost = higher score)
    score -= totalCost / 100;
    
    // Utilization bonus
    score += utilization / 2;
    
    // Wait time penalty
    score -= waitDays * 10;
    
    // Delay penalty (severe)
    score -= delayDays * 25;
    
    // On-time bonus
    if (delayDays === 0) score += 20;
    
    return Math.max(0, score);
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
    const truckConfig = scenario.truckConfiguration || [];
    const criteria = {
      truckType: truckConfig.length > 0 ? truckConfig[0].type : 'SEMI',
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
      truckTypes: (scenario.truckConfiguration || []).map(truck => ({
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