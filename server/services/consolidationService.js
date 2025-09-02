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

  // Create comprehensive weekly dispatch schedule showing ALL pallets
  createAllDispatchScenarios(group) {
    const scenarios = [];
    const today = moment();
    const transitTime = 2;
    
    // Create comprehensive weekly schedule scenarios (handles ALL pallets)
    scenarios.push(...this.createCompleteWeeklySchedule(group));
    
    // Add alternative configurations for comparison
    scenarios.push(...this.createAlternativeScheduleConfigurations(group));
    
    // Sort by score (prioritizing cost efficiency, then time, then utilization)
    return scenarios.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // Create complete weekly schedule showing how to dispatch ALL pallets
  createCompleteWeeklySchedule(group) {
    const scenarios = [];
    const today = moment();
    const transitTime = 2;
    const totalPallets = group.orders.reduce((sum, o) => sum + o.standardEquivalent, 0);
    
    // Strategy 1: Dispatch all pallets as soon as stock is available (fastest)
    const immediateDispatchScenario = this.createImmediateDispatchSchedule(group, totalPallets);
    if (immediateDispatchScenario) scenarios.push(immediateDispatchScenario);
    
    // Strategy 2: Optimized dispatch based on delivery deadlines
    const optimizedDispatchScenario = this.createOptimizedDispatchSchedule(group, totalPallets);
    if (optimizedDispatchScenario) scenarios.push(optimizedDispatchScenario);
    
    // Strategy 3: Cost-minimized dispatch (may have some delays)
    const costMinimizedScenario = this.createCostMinimizedSchedule(group, totalPallets);
    if (costMinimizedScenario) scenarios.push(costMinimizedScenario);
    
    return scenarios;
  }

  // Strategy 1: Dispatch ALL pallets immediately when stock available
  createImmediateDispatchSchedule(group, totalPallets) {
    const today = moment();
    const transitTime = 2;
    
    // Find the earliest date when ALL orders have stock available
    const allStockAvailableDate = group.orders.reduce((latest, order) => {
      return moment.max(latest, order.pickupDate);
    }, today);
    
    // Calculate costs for immediate dispatch of ALL pallets
    const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(group.orders);
    const truckCost = palletRecommendation.totalCost || 0;
    const penaltyCost = this.calculatePenaltyCost(group.orders, allStockAvailableDate, transitTime);
    const totalCostWithPenalties = truckCost + penaltyCost;
    const waitDays = Math.max(0, allStockAvailableDate.diff(today, 'days'));
    
    // Calculate proper utilization - fix 0% issue
    const actualUtilization = this.calculateActualUtilization(palletRecommendation, totalPallets);
    
    return {
      id: `immediate-all-${group.routeKey}`,
      type: 'immediate-complete',
      name: `Immediate Dispatch - ALL ${totalPallets} Pallets`,
      description: `Dispatch all ${totalPallets} pallets on ${allStockAvailableDate.format('MMM DD')} when all stock is available`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchDate: allStockAvailableDate.format('YYYY-MM-DD'),
      waitTime: waitDays,
      totalPalletsOnDate: totalPallets,
      truckConfiguration: palletRecommendation.allOptions?.[0]?.trucks || [],
      utilization: actualUtilization,
      estimatedCost: truckCost,
      penaltyCost,
      totalCostWithPenalties,
      estimatedTime: (palletRecommendation.totalTime || 0) + (waitDays * 24),
      isOnTime: penaltyCost === 0,
      delayDays: penaltyCost > 0 ? Math.ceil(penaltyCost / (totalPallets * CONSOLIDATION_RULES.penaltyCostPerPalletPerDay)) : 0,
      recommendations: [
        `🚚 Complete shipment: ${totalPallets} pallets in ${palletRecommendation.allOptions?.[0]?.trucks?.length || 1} truck(s)`,
        `💰 Total cost: $${totalCostWithPenalties.toFixed(2)} (truck: $${truckCost.toFixed(2)} + penalties: $${penaltyCost.toFixed(2)})`,
        `⏱️ Estimated time: ${(palletRecommendation.totalTime || 20)} hours`,
        penaltyCost === 0 ? `✅ All deliveries on time` : `⚠️ Some deliveries delayed by ${Math.ceil(penaltyCost / (totalPallets * CONSOLIDATION_RULES.penaltyCostPerPalletPerDay))} day(s)`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [], // Remove truck companies as requested
      palletOptimization: palletRecommendation,
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, penaltyCost === 0, palletRecommendation.utilization || 0, palletRecommendation.totalTime || 20)
    };
  }

  // Strategy 2: Optimized dispatch based on delivery deadlines
  createOptimizedDispatchSchedule(group, totalPallets) {
    const today = moment();
    const transitTime = 2;
    
    // Group orders by their delivery deadline requirements  
    const ordersByDeadline = this.groupOrdersByDeliveryDeadline(group.orders, transitTime);
    
    // Create dispatch plan that balances deadlines and efficiency
    const dispatchPlan = [];
    let totalCost = 0;
    let totalPenalty = 0;
    let maxEstimatedTime = 0;
    
    ordersByDeadline.forEach((deadlineGroup, index) => {
      const pallets = deadlineGroup.orders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      const recommendation = palletOptimizationService.getBestTruckRecommendation(deadlineGroup.orders);
      const penalty = this.calculatePenaltyCost(deadlineGroup.orders, deadlineGroup.dispatchDate, transitTime);
      
      dispatchPlan.push({
        date: deadlineGroup.dispatchDate.format('MMM DD'),
        pallets: pallets,
        orders: deadlineGroup.orders.length,
        trucks: recommendation.allOptions?.[0]?.trucks || [],
        cost: recommendation.totalCost || 0,
        penalty: penalty
      });
      
      totalCost += recommendation.totalCost || 0;
      totalPenalty += penalty;
      maxEstimatedTime = Math.max(maxEstimatedTime, recommendation.totalTime || 20);
    });
    
    // Calculate average utilization across all dispatches - fix 0% utilization issue
    const avgUtilization = this.calculateDispatchPlanUtilization(dispatchPlan, totalPallets);
    
    const totalCostWithPenalties = totalCost + totalPenalty;
    
    return {
      id: `optimized-schedule-${group.routeKey}`,
      type: 'deadline-optimized',
      name: `Optimized Weekly Schedule - ALL ${totalPallets} Pallets`,
      description: `Smart dispatch plan across ${dispatchPlan.length} day(s) to meet delivery deadlines`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchPlan: dispatchPlan, // Weekly schedule breakdown
      totalPalletsOnDate: totalPallets,
      truckConfiguration: dispatchPlan.flatMap(p => p.trucks),
      utilization: Math.round(avgUtilization),
      estimatedCost: totalCost,
      penaltyCost: totalPenalty,
      totalCostWithPenalties,
      estimatedTime: maxEstimatedTime,
      isOnTime: totalPenalty === 0,
      delayDays: totalPenalty > 0 ? Math.ceil(totalPenalty / (totalPallets * CONSOLIDATION_RULES.penaltyCostPerPalletPerDay)) : 0,
      recommendations: [
        `📅 Weekly schedule: ${dispatchPlan.length} dispatch date(s)`,
        `🚚 Total: ${totalPallets} pallets across ${dispatchPlan.flatMap(p => p.trucks).length} truck(s)`,
        `💰 Total cost: $${totalCostWithPenalties.toFixed(2)} (base: $${totalCost.toFixed(2)} + penalties: $${totalPenalty.toFixed(2)})`,
        totalPenalty === 0 ? `✅ All deliveries meet deadlines` : `⚠️ ${totalPenalty > 0 ? 'Some delays' : 'All on time'}`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [], // Remove as requested
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, totalPenalty === 0, avgUtilization, maxEstimatedTime)
    };
  }

  // Strategy 3: Cost-minimized schedule (may have delays but cheapest)
  createCostMinimizedSchedule(group, totalPallets) {
    const today = moment();
    const transitTime = 2;
    
    // Wait for maximum consolidation opportunity (within limits)
    const maxWaitDate = today.clone().add(CONSOLIDATION_RULES.maxWaitDays, 'days');
    const latestStockDate = group.orders.reduce((latest, order) => {
      return moment.max(latest, order.pickupDate);
    }, today);
    
    const dispatchDate = moment.min(maxWaitDate, latestStockDate);
    
    // Calculate costs for maximum consolidation
    const palletRecommendation = palletOptimizationService.getBestTruckRecommendation(group.orders);
    const truckCost = palletRecommendation.totalCost || 0;
    const penaltyCost = this.calculatePenaltyCost(group.orders, dispatchDate, transitTime);
    const totalCostWithPenalties = truckCost + penaltyCost;
    const waitDays = Math.max(0, dispatchDate.diff(today, 'days'));
    
    // Calculate proper utilization - fix 0% issue
    const actualUtilization = this.calculateActualUtilization(palletRecommendation, totalPallets);
    
    return {
      id: `cost-minimized-${group.routeKey}`,
      type: 'cost-optimized', 
      name: `Cost Minimized - ALL ${totalPallets} Pallets`,
      description: `Maximum consolidation dispatch on ${dispatchDate.format('MMM DD')} for lowest cost`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchDate: dispatchDate.format('YYYY-MM-DD'),
      waitTime: waitDays,
      totalPalletsOnDate: totalPallets,
      truckConfiguration: palletRecommendation.allOptions?.[0]?.trucks || [],
      utilization: actualUtilization,
      estimatedCost: truckCost,
      penaltyCost,
      totalCostWithPenalties,
      estimatedTime: (palletRecommendation.totalTime || 0) + (waitDays * 24),
      isOnTime: penaltyCost === 0,
      delayDays: penaltyCost > 0 ? Math.ceil(penaltyCost / (totalPallets * CONSOLIDATION_RULES.penaltyCostPerPalletPerDay)) : 0,
      recommendations: [
        `💰 Lowest total cost: $${totalCostWithPenalties.toFixed(2)}`,
        `🚚 Maximum consolidation: ${totalPallets} pallets`,  
        `📊 High utilization: ${palletRecommendation.utilization || 0}%`,
        penaltyCost > 0 ? `⚠️ Trade-off: $${penaltyCost.toFixed(2)} penalty for ${Math.ceil(penaltyCost / (totalPallets * CONSOLIDATION_RULES.penaltyCostPerPalletPerDay))} day delay` : `✅ No delivery penalties`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [], // Remove as requested
      palletOptimization: palletRecommendation,
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, penaltyCost === 0, palletRecommendation.utilization || 0, palletRecommendation.totalTime || 20)
    };
  }

  // Create alternative schedule configurations for comparison
  createAlternativeScheduleConfigurations(group) {
    const scenarios = [];
    const totalPallets = group.orders.reduce((sum, o) => sum + o.standardEquivalent, 0);
    
    // Only create alternatives for substantial shipments
    if (totalPallets < 20) return scenarios;
    
    // Alternative 1: Split into multiple smaller dispatches for speed
    const speedOptimizedScenario = this.createSpeedOptimizedCompleteSchedule(group, totalPallets);
    if (speedOptimizedScenario) scenarios.push(speedOptimizedScenario);
    
    return scenarios;
  }

  // Alternative: Multiple smaller dispatches for faster processing
  createSpeedOptimizedCompleteSchedule(group, totalPallets) {
    const today = moment();
    const transitTime = 2;
    
    // Split orders into 2-3 smaller dispatches for faster loading/unloading
    const maxPalletsPerDispatch = 20; // Optimal for MR trucks
    const numDispatches = Math.ceil(totalPallets / maxPalletsPerDispatch);
    
    const dispatchPlan = [];
    let totalCost = 0;
    let totalPenalty = 0;
    
    // Create smaller dispatch groups
    for (let i = 0; i < numDispatches; i++) {
      const startIndex = i * Math.ceil(group.orders.length / numDispatches);
      const endIndex = Math.min((i + 1) * Math.ceil(group.orders.length / numDispatches), group.orders.length);
      const dispatchOrders = group.orders.slice(startIndex, endIndex);
      const dispatchPallets = dispatchOrders.reduce((sum, o) => sum + o.standardEquivalent, 0);
      
      const dispatchDate = today.clone().add(i, 'days'); // Stagger dispatches
      const recommendation = palletOptimizationService.getBestTruckRecommendation(dispatchOrders);
      const penalty = this.calculatePenaltyCost(dispatchOrders, dispatchDate, transitTime);
      
      dispatchPlan.push({
        date: dispatchDate.format('MMM DD'),
        pallets: dispatchPallets,
        orders: dispatchOrders.length,
        trucks: recommendation.allOptions?.[0]?.trucks || [],
        cost: recommendation.totalCost || 0,
        penalty: penalty
      });
      
      totalCost += recommendation.totalCost || 0;
      totalPenalty += penalty;
    }
    
    const totalCostWithPenalties = totalCost + totalPenalty;
    const avgTime = 18; // Faster with multiple smaller trucks
    
    return {
      id: `speed-optimized-${group.routeKey}`,
      type: 'speed-optimized',
      name: `Speed Optimized - ALL ${totalPallets} Pallets`,
      description: `${numDispatches} smaller dispatches across consecutive days for faster processing`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchPlan: dispatchPlan,
      totalPalletsOnDate: totalPallets,
      truckConfiguration: dispatchPlan.flatMap(p => p.trucks),
      utilization: 85, // Good utilization with smaller trucks
      estimatedCost: totalCost,
      penaltyCost: totalPenalty,
      totalCostWithPenalties,
      estimatedTime: avgTime,
      isOnTime: totalPenalty === 0,
      delayDays: 0,
      recommendations: [
        `⚡ Fastest processing: ${numDispatches} consecutive dispatches`,
        `🚚 Efficient loading: Multiple smaller trucks`,
        `💰 Total cost: $${totalCostWithPenalties.toFixed(2)}`,
        `⏱️ Reduced waiting time at loading docks`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [], // Remove as requested
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, totalPenalty === 0, 85, avgTime)
    };
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
        score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, isOnTime, utilization, palletRecommendation.totalTime || 20)
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

  // Calculate score prioritizing BUSINESS VALUE: Cost → Time → Utilization
  calculateDeadlineOptimizedScore(totalCost, isOnTime, utilization, estimatedTime = 20) {
    let score = 0; // Start fresh
    
    // 1. COST (70% of score) - HIGHEST PRIORITY for business
    // Use exponential inverse scoring: cheaper costs get exponentially higher scores
    const baseCost = 5000; // Reference cost
    const costScore = Math.max(0, 700 * Math.exp(-(totalCost - baseCost) / 3000)); // Exponential decay for cost
    score += costScore;
    
    // 2. TIME (20% of score) - Second priority 
    // Lower time = higher score with reasonable scaling
    const timeScore = Math.max(0, 200 - (estimatedTime * 5)); // Less aggressive time penalty
    score += timeScore;
    
    // 3. ON-TIME DELIVERY (8% of score) - Important but cost-adjusted
    if (isOnTime) {
      score += 80; // Moderate bonus for on-time
    } else {
      score -= 40; // Moderate penalty for late delivery
    }
    
    // 4. UTILIZATION (2% of score) - MINIMAL impact on business value
    const utilizationBonus = Math.min(20, utilization / 5); // Very small utilization bonus
    score += utilizationBonus;
    
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

    // Focus only on comprehensive weekly scheduling that handles ALL pallets
    if (routeGroups.length > 1) {
      // OPTION A: Cross-route consolidation scenarios (ALL pallets together)
      scenarios.push(...this.createCrossRouteConsolidationScenarios(routeGroups));
      
      // OPTION B: Multi-route coordination scenarios (comprehensive weekly dispatch plans)
      scenarios.push(...this.createMultiRouteCoordinationScenarios(routeGroups));
    } else {
      // Single route: create comprehensive weekly schedule
      const group = routeGroups[0];
      const weeklyScenarios = this.createComprehensiveWeeklySchedule(group);
      scenarios.push(...weeklyScenarios);
    }

    return scenarios;
  }

  // Create scenarios that consolidate across ALL routes (handles all pallets together)
  createCrossRouteConsolidationScenarios(routeGroups) {
    const scenarios = [];
    const allOrders = routeGroups.flatMap(group => group.orders);
    const totalPallets = allOrders.reduce((sum, order) => sum + order.standardEquivalent, 0);
    
    if (totalPallets === 0) return scenarios;

    // Create a mega-group that includes all orders across all routes
    const megaGroup = {
      routeKey: 'multi-route',
      sourceCity: 'Multiple',
      destinationCity: 'Multiple',
      orders: allOrders,
      totalVolume: allOrders.reduce((sum, o) => sum + o.totalVolume, 0),
      totalWeight: allOrders.reduce((sum, o) => sum + o.totalWeight, 0),
      totalStandardPallets: totalPallets,
      urgentOrders: allOrders.filter(o => o.urgency === 'urgent').length,
      earliestPickup: allOrders.reduce((earliest, o) => !earliest || o.pickupDate.isBefore(earliest) ? o.pickupDate : earliest, null),
      latestDelivery: allOrders.reduce((latest, o) => !latest || o.deliveryDate.isAfter(latest) ? o.deliveryDate : latest, null)
    };

    // Generate ONE comprehensive weekly schedule for ALL pallets
    const weeklySchedule = this.createOptimizedDispatchSchedule(megaGroup, totalPallets);
    
    if (weeklySchedule) {
      weeklySchedule.id = `cross-route-weekly-${totalPallets}`;
      weeklySchedule.type = 'multi-route-weekly';
      weeklySchedule.name = `Weekly Schedule - ALL ${totalPallets} Pallets (Multi-Route)`;
      weeklySchedule.description = `Consolidated weekly dispatch for ${routeGroups.length} routes`;
      weeklySchedule.isCrossRoute = true;
      
      // Add route breakdown to show which routes are consolidated
      const routeBreakdown = routeGroups.map(group => 
        `${group.orders.length} orders (${group.totalStandardPallets} pallets) to ${group.destinationCity}`
      ).join(', ');
      
      weeklySchedule.recommendations.unshift(`🗺️ Multi-route consolidation: ${routeBreakdown}`);
      
      scenarios.push(weeklySchedule);
    }

    return scenarios;
  }

  // Create comprehensive weekly schedule for single route
  createComprehensiveWeeklySchedule(group) {
    const scenarios = [];
    const allOrders = group.orders;
    const totalPallets = allOrders.reduce((sum, order) => sum + order.standardEquivalent, 0);
    
    if (totalPallets === 0) return scenarios;

    // Create weekly dispatch schedule optimized for ALL pallets
    const weeklySchedule = this.createOptimizedDispatchSchedule(group, totalPallets);
    
    // Focus only on the best comprehensive schedule
    if (weeklySchedule) {
      weeklySchedule.id = `weekly-schedule-${group.routeKey}`;
      weeklySchedule.type = 'weekly-schedule';
      weeklySchedule.name = `Weekly Schedule - ${totalPallets} Pallets`;
      weeklySchedule.description = `Optimized weekly dispatch plan for all ${totalPallets} pallets`;
      weeklySchedule.isWeeklySchedule = true;
      
      scenarios.push(weeklySchedule);
    }

    return scenarios;
  }

  // Create multi-route coordination scenarios (different trucks, different days, ensures ALL pallets handled)
  createMultiRouteCoordinationScenarios(routeGroups) {
    const scenarios = [];
    const allOrders = routeGroups.flatMap(group => group.orders);
    const totalPallets = allOrders.reduce((sum, order) => sum + order.standardEquivalent, 0);
    
    if (totalPallets === 0 || routeGroups.length === 0) return scenarios;

    // Create ONE optimal multi-route coordination scenario (deadline-driven for best business value)
    const optimalScenario = this.createDeadlineDrivenDispatchScenario(routeGroups, totalPallets);
    
    if (optimalScenario) {
      // Update the scenario to be clearly identified as the optimal weekly coordination
      optimalScenario.id = `optimal-coordination-${totalPallets}`;
      optimalScenario.name = `Optimal Weekly Coordination - ALL ${totalPallets} Pallets`;
      optimalScenario.description = `Best multi-route dispatch plan balancing cost, deadlines, and efficiency`;
      
      scenarios.push(optimalScenario);
    }

    return scenarios;
  }

  // Parallel dispatch: All routes handled simultaneously
  createParallelDispatchScenario(routeGroups, totalPallets) {
    const today = moment();
    const routeDispatchPlans = [];
    let totalCost = 0;
    let totalPenalty = 0;
    let maxTime = 0;
    
    routeGroups.forEach((group, index) => {
      const recommendation = palletOptimizationService.getBestTruckRecommendation(group.orders);
      const dispatchDate = group.earliestPickup || today;
      const penalty = this.calculatePenaltyCost(group.orders, dispatchDate, 2);
      
      routeDispatchPlans.push({
        routeIndex: index + 1,
        route: `${group.sourceCity} → ${group.destinationCity}`,
        date: dispatchDate.format('MMM DD'),
        pallets: group.totalStandardPallets,
        orders: group.orders.length,
        trucks: recommendation.allOptions?.[0]?.trucks || [],
        cost: recommendation.totalCost || 0,
        penalty: penalty,
        utilization: this.calculateActualUtilization(recommendation, group.totalStandardPallets)
      });
      
      totalCost += recommendation.totalCost || 0;
      totalPenalty += penalty;
      maxTime = Math.max(maxTime, recommendation.totalTime || 20);
    });

    const totalCostWithPenalties = totalCost + totalPenalty;

    return {
      id: `parallel-dispatch-multi-route`,
      type: 'parallel-coordination',
      name: `Parallel Dispatch - ALL ${totalPallets} Pallets`,
      description: `Simultaneous dispatch of ${routeGroups.length} routes using ${routeDispatchPlans.reduce((sum, p) => sum + p.trucks.length, 0)} trucks`,
      routeDispatchPlans: routeDispatchPlans,
      totalPalletsOnDate: totalPallets,
      truckConfiguration: routeDispatchPlans.flatMap(p => p.trucks),
      utilization: Math.round(routeDispatchPlans.reduce((sum, p) => sum + p.utilization, 0) / routeDispatchPlans.length),
      estimatedCost: totalCost,
      penaltyCost: totalPenalty,
      totalCostWithPenalties,
      estimatedTime: maxTime,
      isOnTime: totalPenalty === 0,
      recommendations: [
        `🚚 ${routeGroups.length} simultaneous routes with ${routeDispatchPlans.reduce((sum, p) => sum + p.trucks.length, 0)} trucks total`,
        `💰 Total cost: $${totalCostWithPenalties.toFixed(2)} (base: $${totalCost.toFixed(2)} + penalties: $${totalPenalty.toFixed(2)})`,
        ...routeDispatchPlans.map(plan => `📍 Route ${plan.routeIndex}: ${plan.pallets} pallets (${plan.trucks.length} truck${plan.trucks.length !== 1 ? 's' : ''}) on ${plan.date}`),
        totalPenalty === 0 ? `✅ All deliveries on time` : `⚠️ Some routes have penalties`
      ],
      isMultiRoute: true,
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, totalPenalty === 0, 
        Math.round(routeDispatchPlans.reduce((sum, p) => sum + p.utilization, 0) / routeDispatchPlans.length), maxTime)
    };
  }

  // Sequential dispatch: Routes handled in optimal sequence
  createSequentialDispatchScenario(routeGroups, totalPallets) {
    const today = moment();
    const sortedGroups = [...routeGroups].sort((a, b) => {
      // Sort by urgency and then by earliest pickup date
      const urgencyDiff = b.urgentOrders - a.urgentOrders;
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.earliestPickup.diff(b.earliestPickup);
    });

    const sequentialPlans = [];
    let totalCost = 0;
    let totalPenalty = 0;
    let currentDate = today;
    
    sortedGroups.forEach((group, index) => {
      const recommendation = palletOptimizationService.getBestTruckRecommendation(group.orders);
      const dispatchDate = moment.max(currentDate, group.earliestPickup);
      const penalty = this.calculatePenaltyCost(group.orders, dispatchDate, 2);
      
      sequentialPlans.push({
        day: index + 1,
        route: `${group.sourceCity} → ${group.destinationCity}`,
        date: dispatchDate.format('MMM DD'),
        pallets: group.totalStandardPallets,
        orders: group.orders.length,
        trucks: recommendation.allOptions?.[0]?.trucks || [],
        cost: recommendation.totalCost || 0,
        penalty: penalty,
        utilization: this.calculateActualUtilization(recommendation, group.totalStandardPallets)
      });
      
      totalCost += recommendation.totalCost || 0;
      totalPenalty += penalty;
      currentDate = dispatchDate.clone().add(1, 'day'); // Next route dispatches next day
    });

    const totalCostWithPenalties = totalCost + totalPenalty;
    const avgTime = 18; // Sequential dispatch is more manageable

    return {
      id: `sequential-dispatch-multi-route`,
      type: 'sequential-coordination', 
      name: `Sequential Dispatch - ALL ${totalPallets} Pallets`,
      description: `Staged dispatch over ${sequentialPlans.length} days for optimal resource management`,
      sequentialDispatchPlans: sequentialPlans,
      totalPalletsOnDate: totalPallets,
      truckConfiguration: sequentialPlans.flatMap(p => p.trucks),
      utilization: Math.round(sequentialPlans.reduce((sum, p) => sum + p.utilization, 0) / sequentialPlans.length),
      estimatedCost: totalCost,
      penaltyCost: totalPenalty,
      totalCostWithPenalties,
      estimatedTime: avgTime,
      isOnTime: totalPenalty === 0,
      recommendations: [
        `📅 ${sequentialPlans.length}-day sequential dispatch plan`,
        `🚚 Total: ${sequentialPlans.reduce((sum, p) => sum + p.trucks.length, 0)} trucks across all days`,
        `💰 Total cost: $${totalCostWithPenalties.toFixed(2)}`,
        ...sequentialPlans.map(plan => `Day ${plan.day}: ${plan.pallets} pallets to ${plan.route.split(' → ')[1]} on ${plan.date}`),
        `⚡ Reduced loading dock congestion with staged dispatch`
      ],
      isMultiRoute: true,
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, totalPenalty === 0, 
        Math.round(sequentialPlans.reduce((sum, p) => sum + p.utilization, 0) / sequentialPlans.length), avgTime)
    };
  }

  // Deadline-driven dispatch: Prioritized by delivery deadlines
  createDeadlineDrivenDispatchScenario(routeGroups, totalPallets) {
    const today = moment();
    const sortedGroups = [...routeGroups].sort((a, b) => {
      // Sort by earliest delivery deadline
      return a.latestDelivery.diff(b.latestDelivery);
    });

    const deadlinePlans = [];
    let totalCost = 0;
    let totalPenalty = 0;
    
    sortedGroups.forEach((group, index) => {
      const recommendation = palletOptimizationService.getBestTruckRecommendation(group.orders);
      // Dispatch to meet the deadline (2 days transit time)
      const requiredDispatchDate = group.latestDelivery.clone().subtract(2, 'days');
      const dispatchDate = moment.max(requiredDispatchDate, group.earliestPickup, today);
      const penalty = this.calculatePenaltyCost(group.orders, dispatchDate, 2);
      
      deadlinePlans.push({
        priority: index + 1,
        route: `${group.sourceCity} → ${group.destinationCity}`,
        date: dispatchDate.format('MMM DD'),
        deadline: group.latestDelivery.format('MMM DD'),
        pallets: group.totalStandardPallets,
        orders: group.orders.length,
        trucks: recommendation.allOptions?.[0]?.trucks || [],
        cost: recommendation.totalCost || 0,
        penalty: penalty,
        isUrgent: group.urgentOrders > 0,
        utilization: this.calculateActualUtilization(recommendation, group.totalStandardPallets)
      });
      
      totalCost += recommendation.totalCost || 0;
      totalPenalty += penalty;
    });

    const totalCostWithPenalties = totalCost + totalPenalty;
    const avgTime = 20;

    return {
      id: `deadline-driven-multi-route`,
      type: 'deadline-coordination',
      name: `Deadline-Driven Dispatch - ALL ${totalPallets} Pallets`,
      description: `Priority dispatch based on delivery deadlines to minimize penalties`,
      deadlineDispatchPlans: deadlinePlans,
      totalPalletsOnDate: totalPallets,
      truckConfiguration: deadlinePlans.flatMap(p => p.trucks),
      utilization: Math.round(deadlinePlans.reduce((sum, p) => sum + p.utilization, 0) / deadlinePlans.length),
      estimatedCost: totalCost,
      penaltyCost: totalPenalty,
      totalCostWithPenalties,
      estimatedTime: avgTime,
      isOnTime: totalPenalty === 0,
      recommendations: [
        `🎯 Deadline-optimized dispatch sequence`,
        `⏰ Priority order: ${deadlinePlans.map(p => `${p.route.split(' → ')[1]} (${p.deadline})`).join(' → ')}`,
        `💰 Total cost: $${totalCostWithPenalties.toFixed(2)} with ${totalPenalty === 0 ? 'no' : '$' + totalPenalty.toFixed(2)} penalties`,
        ...deadlinePlans.map(plan => `Priority ${plan.priority}: ${plan.pallets} pallets by ${plan.deadline}${plan.isUrgent ? ' (URGENT)' : ''}`),
        totalPenalty === 0 ? `✅ All deadlines met` : `⚠️ Optimized penalty management`
      ],
      isMultiRoute: true,
      score: this.calculateDeadlineOptimizedScore(totalCostWithPenalties, totalPenalty === 0, 
        Math.round(deadlinePlans.reduce((sum, p) => sum + p.utilization, 0) / deadlinePlans.length), avgTime)
    };
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
        score: this.calculateConsolidationScore(totalCostWithPenalties, waitDays, utilization, delayDays, palletRecommendation.totalTime || 20),
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

  // Calculate score for consolidation scenarios - Business Value Priority: Cost → Time → Utilization
  calculateConsolidationScore(totalCost, waitDays, utilization, delayDays, estimatedTime = 20) {
    let score = 0; // Start fresh
    
    // 1. COST EFFICIENCY (75% of score) - HIGHEST PRIORITY
    // Use exponential inverse scoring for dramatic cost preference
    const baseCost = 5000; // Reference cost
    const costScore = Math.max(0, 750 * Math.exp(-(totalCost - baseCost) / 3000)); // Exponential cost preference
    score += costScore;
    
    // 2. TIME EFFICIENCY (20% of score) - Secondary priority
    // Penalize wait time and delivery delays, but less aggressively than cost
    const timeScore = Math.max(0, 200 - (waitDays * 25) - (delayDays * 50) - ((estimatedTime - 15) * 3));
    score += timeScore;
    
    // 3. ON-TIME DELIVERY BONUS (3% of score)
    if (delayDays === 0) {
      score += 30; // Smaller on-time bonus
    }
    
    // 4. UTILIZATION (2% of score) - MINIMAL consideration
    const utilizationBonus = Math.min(20, utilization / 5); // Very small utilization bonus
    score += utilizationBonus;
    
    return Math.max(0, score);
  }

  // Create alternative truck configuration scenarios to show different options
  createAlternativeTruckConfigurations(group) {
    const scenarios = [];
    const today = moment();
    const transitTime = 2;
    const totalPallets = group.totalStandardPallets;
    
    // Only create alternatives if we have a reasonable number of pallets
    if (totalPallets < 15 || totalPallets > 50) return scenarios;
    
    const dispatchDate = moment.max(group.earliestPickup, today);
    const penaltyCost = this.calculatePenaltyCost(group.orders, dispatchDate, transitTime);
    const delayDays = this.calculateDelayDays(group.orders, dispatchDate, transitTime);
    
    // Alternative 1: Maximum efficiency (B-Double if viable)
    if (totalPallets >= 25) {
      const bDoubleScenario = this.createBDoubleScenario(group, dispatchDate, penaltyCost, delayDays);
      if (bDoubleScenario) scenarios.push(bDoubleScenario);
    }
    
    // Alternative 2: Speed optimized (Multiple smaller trucks)
    if (totalPallets >= 20) {
      const speedScenario = this.createSpeedOptimizedScenario(group, dispatchDate, penaltyCost, delayDays);
      if (speedScenario) scenarios.push(speedScenario);
    }
    
    // Alternative 3: Cost optimized (Mix of truck sizes)
    const mixedScenario = this.createMixedTruckScenario(group, dispatchDate, penaltyCost, delayDays);
    if (mixedScenario) scenarios.push(mixedScenario);
    
    return scenarios;
  }

  createBDoubleScenario(group, dispatchDate, penaltyCost, delayDays) {
    const totalPallets = group.totalStandardPallets;
    
    // Calculate B-Double configuration
    const bDoubleCapacity = 36;
    const bDoublesNeeded = Math.ceil(totalPallets / bDoubleCapacity);
    
    if (bDoublesNeeded > 2) return null; // Not practical for very large loads
    
    const truckConfiguration = [];
    let remainingPallets = totalPallets;
    
    for (let i = 0; i < bDoublesNeeded; i++) {
      const pallets = Math.min(remainingPallets, bDoubleCapacity);
      truckConfiguration.push({
        type: 'B_DOUBLE',
        pallets,
        capacity: bDoubleCapacity,
        utilization: Math.round((pallets / bDoubleCapacity) * 100)
      });
      remainingPallets -= pallets;
    }
    
    const avgUtilization = Math.round((totalPallets / (bDoublesNeeded * bDoubleCapacity)) * 100);
    const estimatedCost = bDoublesNeeded * 3600; // B-Double cost estimation
    const totalCostWithPenalties = estimatedCost + penaltyCost;
    
    return {
      id: `b-double-${group.routeKey}`,
      type: 'efficiency-optimized',
      name: `Maximum Efficiency - ${totalPallets} Pallets (B-Double)`,
      description: `${bDoublesNeeded}x B-Double truck${bDoublesNeeded !== 1 ? 's' : ''} for maximum highway efficiency`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchDate: dispatchDate.format('YYYY-MM-DD'),
      waitTime: Math.max(0, dispatchDate.diff(moment(), 'days')),
      totalPalletsOnDate: totalPallets,
      truckConfiguration,
      utilization: avgUtilization,
      estimatedCost,
      penaltyCost,
      totalCostWithPenalties,
      estimatedTime: 16 + (bDoublesNeeded * 2), // B-Doubles are faster on highways
      isOnTime: delayDays === 0,
      delayDays,
      recommendations: [
        avgUtilization >= 70 ? `✅ Good ${avgUtilization}% B-Double utilization` : `⚠️ Low ${avgUtilization}% B-Double utilization`,
        `🚚 Truck cost: $${estimatedCost.toFixed(2)}`,
        penaltyCost > 0 ? `⚠️ Late penalty: $${penaltyCost.toFixed(2)}` : `✅ No delivery penalties`,
        `🛣️ Optimized for long-distance highway transport`,
        `⏱️ Faster highway transit with fewer loading points`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [],
      score: this.calculateAlternativeScore(totalCostWithPenalties, avgUtilization, delayDays, 'efficiency', 16 + (bDoublesNeeded * 2))
    };
  }

  createSpeedOptimizedScenario(group, dispatchDate, penaltyCost, delayDays) {
    const totalPallets = group.totalStandardPallets;
    
    // Use multiple smaller trucks for faster loading/unloading
    const mrCapacity = 10;
    const mrTrucksNeeded = Math.ceil(totalPallets / mrCapacity);
    
    if (mrTrucksNeeded > 6) return null; // Too many trucks becomes impractical
    
    const truckConfiguration = [];
    let remainingPallets = totalPallets;
    
    for (let i = 0; i < mrTrucksNeeded; i++) {
      const pallets = Math.min(remainingPallets, mrCapacity);
      truckConfiguration.push({
        type: 'MR',
        pallets,
        capacity: mrCapacity,
        utilization: Math.round((pallets / mrCapacity) * 100)
      });
      remainingPallets -= pallets;
    }
    
    const avgUtilization = Math.round((totalPallets / (mrTrucksNeeded * mrCapacity)) * 100);
    const estimatedCost = mrTrucksNeeded * 2080; // MR truck cost estimation
    const totalCostWithPenalties = estimatedCost + penaltyCost;
    
    return {
      id: `speed-${group.routeKey}`,
      type: 'speed-optimized',
      name: `Speed Optimized - ${totalPallets} Pallets (Multi-MR)`,
      description: `${mrTrucksNeeded}x Medium Rigid trucks for fastest loading and delivery flexibility`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchDate: dispatchDate.format('YYYY-MM-DD'),
      waitTime: Math.max(0, dispatchDate.diff(moment(), 'days')),
      totalPalletsOnDate: totalPallets,
      truckConfiguration,
      utilization: avgUtilization,
      estimatedCost,
      penaltyCost,
      totalCostWithPenalties,
      estimatedTime: 14 + (mrTrucksNeeded * 1.5), // Parallel loading reduces time
      isOnTime: delayDays === 0,
      delayDays,
      recommendations: [
        `🚀 Fastest loading: ${mrTrucksNeeded} trucks can load simultaneously`,
        `🚚 Truck cost: $${estimatedCost.toFixed(2)}`,
        penaltyCost > 0 ? `⚠️ Late penalty: $${penaltyCost.toFixed(2)}` : `✅ No delivery penalties`,
        `📍 Best for multiple delivery points or tight access areas`,
        avgUtilization >= 80 ? `✅ Good ${avgUtilization}% utilization per truck` : `⚠️ Higher cost due to multiple trucks`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [],
      score: this.calculateAlternativeScore(totalCostWithPenalties, avgUtilization, delayDays, 'speed', 14 + (mrTrucksNeeded * 1.5))
    };
  }

  createMixedTruckScenario(group, dispatchDate, penaltyCost, delayDays) {
    const totalPallets = group.totalStandardPallets;
    
    // Optimize with mixed truck sizes for best cost/efficiency balance
    const truckConfiguration = [];
    let remainingPallets = totalPallets;
    
    // Use B-Double for bulk
    if (remainingPallets >= 30) {
      const pallets = Math.min(remainingPallets, 36);
      truckConfiguration.push({
        type: 'B_DOUBLE',
        pallets,
        capacity: 36,
        utilization: Math.round((pallets / 36) * 100)
      });
      remainingPallets -= pallets;
    }
    
    // Use SEMI for medium loads
    while (remainingPallets >= 15) {
      const pallets = Math.min(remainingPallets, 22);
      truckConfiguration.push({
        type: 'SEMI',
        pallets,
        capacity: 22,
        utilization: Math.round((pallets / 22) * 100)
      });
      remainingPallets -= pallets;
    }
    
    // Use MR for remaining
    if (remainingPallets > 0) {
      truckConfiguration.push({
        type: 'MR',
        pallets: remainingPallets,
        capacity: 10,
        utilization: Math.round((remainingPallets / 10) * 100)
      });
    }
    
    if (truckConfiguration.length === 0) return null;
    
    // Calculate costs
    const estimatedCost = truckConfiguration.reduce((total, truck) => {
      const costs = { B_DOUBLE: 3600, SEMI: 2880, MR: 2080 };
      return total + costs[truck.type];
    }, 0);
    
    const totalCapacity = truckConfiguration.reduce((sum, t) => sum + t.capacity, 0);
    const avgUtilization = Math.round((totalPallets / totalCapacity) * 100);
    const totalCostWithPenalties = estimatedCost + penaltyCost;
    
    return {
      id: `mixed-${group.routeKey}`,
      type: 'cost-optimized',
      name: `Balanced Mix - ${totalPallets} Pallets (Mixed Trucks)`,
      description: `Optimized mix of ${truckConfiguration.length} trucks for best cost-efficiency balance`,
      routeGroup: { ...group },
      availableOrders: group.orders,
      dispatchDate: dispatchDate.format('YYYY-MM-DD'),
      waitTime: Math.max(0, dispatchDate.diff(moment(), 'days')),
      totalPalletsOnDate: totalPallets,
      truckConfiguration,
      utilization: avgUtilization,
      estimatedCost,
      penaltyCost,
      totalCostWithPenalties,
      estimatedTime: 18 + (truckConfiguration.length * 1.5),
      isOnTime: delayDays === 0,
      delayDays,
      recommendations: [
        `⚖️ Balanced approach: ${truckConfiguration.map(t => t.type).join(' + ')}`,
        `🚚 Truck cost: $${estimatedCost.toFixed(2)}`,
        penaltyCost > 0 ? `⚠️ Late penalty: $${penaltyCost.toFixed(2)}` : `✅ No delivery penalties`,
        `📊 Overall ${avgUtilization}% utilization`,
        `💰 Optimized for cost-efficiency balance`
      ],
      deadlineRisk: this.assessDeadlineRisk(group.orders),
      truckCompanies: [],
      score: this.calculateAlternativeScore(totalCostWithPenalties, avgUtilization, delayDays, 'balanced', 18 + (truckConfiguration.length * 1.5))
    };
  }

  calculateAlternativeScore(totalCost, utilization, delayDays, type, estimatedTime = 18) {
    let score = 0; // Start fresh
    
    // 1. COST EFFICIENCY (80% of score) - ABSOLUTE PRIORITY for business value
    // Exponential cost preference - dramatic difference for cost savings
    const baseCost = 5000; // Reference cost
    const costScore = Math.max(0, 800 * Math.exp(-(totalCost - baseCost) / 3000)); // Exponential cost preference
    score += costScore;
    
    // 2. TIME EFFICIENCY (15% of score) - Secondary business value
    const timeScore = Math.max(0, 150 - (estimatedTime * 5) - (delayDays * 75));
    score += timeScore;
    
    // 3. TYPE-SPECIFIC BUSINESS BONUSES (3% of score)
    if (type === 'speed' && estimatedTime <= 16) score += 20; // Smaller speed bonus
    if (type === 'efficiency' && totalCost <= 6000) score += 25; // Cost bonus for efficiency
    if (type === 'balanced' && utilization >= 70 && totalCost <= 7000) score += 15; // Smaller balanced bonus
    
    // 4. ON-TIME DELIVERY (1% of score)  
    if (delayDays === 0) score += 10; // Very small on-time bonus
    
    // 5. UTILIZATION (1% of score) - MINIMAL consideration
    const utilizationBonus = Math.min(10, utilization / 10); // Tiny utilization impact
    score += utilizationBonus;
    
    return Math.max(0, score);
  }

  // Helper function to calculate actual truck utilization - fixes 0% utilization issue
  calculateActualUtilization(palletRecommendation, totalPallets) {
    // First try to get from recommendation
    if (palletRecommendation.utilization && palletRecommendation.utilization > 0) {
      return Math.round(palletRecommendation.utilization);
    }
    
    // Fallback: calculate from truck configuration
    if (palletRecommendation.allOptions && palletRecommendation.allOptions.length > 0) {
      const bestOption = palletRecommendation.allOptions[0];
      if (bestOption.trucks && bestOption.trucks.length > 0) {
        // Calculate average utilization across all trucks
        const totalCapacity = bestOption.trucks.reduce((sum, truck) => sum + (truck.capacity || truck.spec?.maxPallets || 10), 0);
        const actualPallets = bestOption.trucks.reduce((sum, truck) => sum + truck.pallets, 0);
        return Math.round((actualPallets / totalCapacity) * 100);
      }
      
      // Use overall utilization from best option
      if (bestOption.utilization && bestOption.utilization.overall > 0) {
        return Math.round(bestOption.utilization.overall);
      }
    }
    
    // Final fallback: estimate based on truck types
    const trucks = palletRecommendation.allOptions?.[0]?.trucks || [];
    if (trucks.length > 0) {
      let totalUtilization = 0;
      trucks.forEach(truck => {
        const capacity = this.getTruckCapacity(truck.type);
        const utilization = (truck.pallets / capacity) * 100;
        totalUtilization += utilization;
      });
      return Math.round(totalUtilization / trucks.length);
    }
    
    // Last resort: conservative estimate
    return Math.min(95, Math.round((totalPallets / this.estimateRequiredCapacity(totalPallets)) * 100));
  }

  // Helper to get truck capacity by type
  getTruckCapacity(truckType) {
    const capacities = {
      'HR': 2,
      'MR': 10, 
      'SEMI': 22,
      'B_DOUBLE': 36,
      'B-Double': 36
    };
    return capacities[truckType] || 10;
  }
  
  // Helper to estimate required capacity for fallback calculation
  estimateRequiredCapacity(totalPallets) {
    if (totalPallets <= 2) return 2;      // HR
    if (totalPallets <= 10) return 10;    // MR
    if (totalPallets <= 22) return 22;    // Semi
    return Math.ceil(totalPallets / 36) * 36; // B-Double(s)
  }

  // Calculate utilization for dispatch plan - fixes 0% issue
  calculateDispatchPlanUtilization(dispatchPlan, totalPallets) {
    if (!dispatchPlan || dispatchPlan.length === 0) {
      return Math.min(95, Math.round((totalPallets / this.estimateRequiredCapacity(totalPallets)) * 100));
    }

    let totalUtilization = 0;
    let validPlans = 0;

    dispatchPlan.forEach(plan => {
      if (plan.trucks && plan.trucks.length > 0) {
        let planUtilization = 0;
        plan.trucks.forEach(truck => {
          const capacity = truck.capacity || this.getTruckCapacity(truck.type);
          if (capacity > 0) {
            planUtilization += (truck.pallets / capacity) * 100;
          }
        });
        totalUtilization += planUtilization / plan.trucks.length;
        validPlans++;
      }
    });

    if (validPlans > 0) {
      return Math.round(totalUtilization / validPlans);
    }

    // Fallback calculation
    return Math.min(95, Math.round((totalPallets / this.estimateRequiredCapacity(totalPallets)) * 100));
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
    // Skip truck company recommendations as requested by user
    scenario.truckCompanies = [];
    
    // Calculate overall score
    scenario.score = this.calculateScenarioScore(scenario);
    
    // Add detailed analysis
    scenario.analysis = this.generateScenarioAnalysis(scenario);
    
    return scenario;
  }

  recommendTruckCompanies(scenario) {
    // Skip truck company recommendations for multi-route scenarios
    if (scenario.isMultiRoute || scenario.isCrossRoute || 
        scenario.routeGroup?.sourceCity === 'Multiple' ||
        scenario.routeGroup?.destinationCity === 'Multiple' ||
        scenario.type?.includes('multi-route') ||
        scenario.type?.includes('parallel') ||
        scenario.type?.includes('sequential') ||
        scenario.type?.includes('deadline-coordination')) {
      return [];
    }
    
    const truckConfig = scenario.truckConfiguration || [];
    const routeGroup = scenario.routeGroup || {};
    
    const criteria = {
      truckType: truckConfig.length > 0 ? truckConfig[0].type : 'SEMI',
      sourceLocation: routeGroup.sourceCity || 'Multiple Locations',
      destinationLocation: routeGroup.destinationCity || 'Multiple Destinations',
      urgency: (routeGroup.urgentOrders && routeGroup.urgentOrders > 0) ? 'urgent' : 'standard',
      prioritizeBy: scenario.type === 'immediate' ? 'time' : 'cost'
    };

    try {
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
    } catch (error) {
      console.error('Error recommending truck companies:', error);
      return []; // Return empty array on error
    }
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