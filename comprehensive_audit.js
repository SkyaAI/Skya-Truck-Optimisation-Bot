const axios = require('axios');
const moment = require('moment');

const API_BASE_URL = 'http://localhost:5000/api';

// Comprehensive test simulating a real manufacturing company
const comprehensiveAudit = async () => {
  console.log('🏭 COMPREHENSIVE AUDIT: Manufacturing Logistics Optimization');
  console.log('='.repeat(70));
  console.log('Company: ABC Manufacturing - Multiple orders to different locations\n');

  // Real manufacturing scenario: Multiple orders to different Australian cities
  const manufacturingOrders = [
    // Order 1: Perth - Urgent automotive parts
    {
      source: 'Melbourne',
      destination: 'Perth',
      pallets: 8,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-04', // Customer needs by Sep 4 (3 days)
      urgency: 'standard'
    },
    // Order 2: Adelaide - Construction materials
    {
      source: 'Melbourne',
      destination: 'Adelaide', 
      pallets: 14,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Customer needs by Sep 5 (4 days)
      urgency: 'standard'
    },
    // Order 3: Brisbane - Electronics equipment
    {
      source: 'Melbourne',
      destination: 'Brisbane',
      pallets: 18,
      palletSize: 'standard', 
      pickupDate: '2024-09-02', // Stock available tomorrow
      deliveryDate: '2024-09-06', // Customer needs by Sep 6 (4 days from pickup)
      urgency: 'standard'
    },
    // Order 4: Sydney - Machinery parts (tight deadline)
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 12,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today  
      deliveryDate: '2024-09-03', // Customer needs by Sep 3 (2 days) - TIGHT!
      urgency: 'standard'
    },
    // Order 5: Canberra - Government supplies
    {
      source: 'Melbourne', 
      destination: 'Canberra',
      pallets: 6,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Customer needs by Sep 5 (4 days)
      urgency: 'standard'
    }
  ];

  try {
    console.log('📋 TESTING ORDERS:');
    manufacturingOrders.forEach((order, i) => {
      const daysToDeliver = moment(order.deliveryDate).diff(moment(order.pickupDate), 'days');
      console.log(`${i+1}. ${order.source} → ${order.destination}: ${order.pallets} pallets (${daysToDeliver} days to deliver)`);
    });
    
    const totalPallets = manufacturingOrders.reduce((sum, o) => sum + o.pallets, 0);
    console.log(`\nTotal Pallets: ${totalPallets} | Different Destinations: ${new Set(manufacturingOrders.map(o => o.destination)).size}`);
    console.log('\n' + '='.repeat(70));

    const response = await axios.post(`${API_BASE_URL}/consolidate-orders`, {
      orders: manufacturingOrders
    });

    const result = response.data;
    const scenarios = result.scenarios || [];
    
    console.log(`\n✅ RECEIVED ${scenarios.length} OPTIMIZATION SCENARIOS:\n`);

    // AUDIT GOAL 1: Deadline compliance and penalty system
    console.log('🎯 GOAL 1 AUDIT: Deadline Compliance & Penalty System ($0.50/pallet/day)');
    console.log('-'.repeat(70));
    
    const onTimeScenarios = scenarios.filter(s => s.isOnTime);
    const lateScenarios = scenarios.filter(s => !s.isOnTime && s.delayDays > 0);
    
    console.log(`✅ On-time delivery scenarios: ${onTimeScenarios.length}`);
    console.log(`⚠️ Late delivery scenarios: ${lateScenarios.length}`);
    
    if (lateScenarios.length > 0) {
      console.log(`📊 Penalty calculations present: ${lateScenarios.every(s => s.penaltyCost >= 0) ? 'YES' : 'NO'}`);
      lateScenarios.forEach(s => {
        if (s.penaltyCost > 0) {
          console.log(`   - "${s.name}": ${s.delayDays} days late, $${s.penaltyCost} penalty`);
        }
      });
    }
    
    const goal1Status = scenarios.some(s => s.penaltyCost !== undefined) ? '✅ MEETS GOAL' : '❌ MISSING';
    console.log(`GOAL 1 STATUS: ${goal1Status}\n`);

    // AUDIT GOAL 2: Consolidation with 60% minimum utilization
    console.log('🎯 GOAL 2 AUDIT: Consolidation with 60%+ Truck Utilization');
    console.log('-'.repeat(70));
    
    const wellUtilizedScenarios = scenarios.filter(s => s.utilization >= 60);
    const poorUtilizedScenarios = scenarios.filter(s => s.utilization < 60);
    
    console.log(`✅ Scenarios with 60%+ utilization: ${wellUtilizedScenarios.length}`);
    console.log(`⚠️ Scenarios with <60% utilization: ${poorUtilizedScenarios.length}`);
    
    wellUtilizedScenarios.slice(0, 3).forEach(s => {
      console.log(`   - "${s.name}": ${s.utilization}% utilization, ${s.totalPalletsOnDate} pallets`);
    });
    
    if (poorUtilizedScenarios.length > 0) {
      console.log(`📋 Low utilization scenarios (should recommend alternatives):`);
      poorUtilizedScenarios.slice(0, 2).forEach(s => {
        console.log(`   - "${s.name}": ${s.utilization}% utilization`);
      });
    }
    
    const goal2Status = wellUtilizedScenarios.length > 0 ? '✅ MEETS GOAL' : '❌ MISSING';
    console.log(`GOAL 2 STATUS: ${goal2Status}\n`);

    // AUDIT GOAL 3: Multi-location route optimization
    console.log('🎯 GOAL 3 AUDIT: Multi-Location Route Optimization');
    console.log('-'.repeat(70));
    
    const uniqueDestinations = new Set(manufacturingOrders.map(o => o.destination));
    const routeGroups = scenarios.filter(s => s.routeGroup && s.routeGroup.destinationCity);
    
    console.log(`📍 Unique destinations handled: ${uniqueDestinations.size} (${Array.from(uniqueDestinations).join(', ')})`);
    console.log(`🛣️ Route-specific scenarios: ${routeGroups.length}`);
    
    // Check if routes are properly separated/optimized
    const routeBreakdown = {};
    scenarios.forEach(s => {
      if (s.routeGroup?.destinationCity) {
        const route = `${s.routeGroup.sourceCity}-${s.routeGroup.destinationCity}`;
        routeBreakdown[route] = (routeBreakdown[route] || 0) + 1;
      }
    });
    
    console.log('📊 Route optimization breakdown:');
    Object.entries(routeBreakdown).forEach(([route, count]) => {
      console.log(`   - ${route}: ${count} scenarios`);
    });
    
    const goal3Status = Object.keys(routeBreakdown).length >= 2 ? '✅ MEETS GOAL' : '❌ MISSING';
    console.log(`GOAL 3 STATUS: ${goal3Status}\n`);

    // AUDIT GOAL 4: Multiple solution types with direct booking
    console.log('🎯 GOAL 4 AUDIT: Multiple Solutions (Fastest/Cost/Hybrid) + Direct Booking');
    console.log('-'.repeat(70));
    
    // Categorize scenarios by type
    const fastestScenarios = scenarios.filter(s => 
      s.type === 'immediate' || s.waitTime === 0 || s.name.includes('Immediate')
    );
    const costOptimizedScenarios = scenarios.filter(s => 
      s.type === 'consolidation' || s.name.includes('Consolidate') || s.utilization >= 80
    );
    const hybridScenarios = scenarios.filter(s => 
      s.type === 'deadline-optimized' || (s.utilization >= 60 && s.delayDays <= 1)
    );
    
    console.log(`🚀 Fastest solutions (immediate dispatch): ${fastestScenarios.length}`);
    console.log(`💰 Cost-optimized solutions (high utilization): ${costOptimizedScenarios.length}`);
    console.log(`⚖️ Hybrid solutions (balanced): ${hybridScenarios.length}`);
    
    // Check AI recommendations
    const aiRecommendedScenarios = scenarios.filter(s => 
      s.aiDecision?.recommend === true || s.recommendations?.some(r => r.includes('RECOMMEND'))
    );
    console.log(`🤖 AI-recommended scenarios: ${aiRecommendedScenarios.length}`);
    
    // Check for direct booking capability
    const bookingCapableScenarios = scenarios.filter(s => 
      s.truckCompanies || s.palletOptimization?.allOptions
    );
    console.log(`🔗 Scenarios with booking capability: ${bookingCapableScenarios.length}`);
    
    const goal4Status = scenarios.length >= 2 && fastestScenarios.length > 0 && costOptimizedScenarios.length > 0 ? '✅ MEETS GOAL' : '❌ MISSING';
    console.log(`GOAL 4 STATUS: ${goal4Status}\n`);

    // DETAILED SCENARIO ANALYSIS
    console.log('📋 DETAILED SCENARIO ANALYSIS:');
    console.log('='.repeat(70));
    
    scenarios.slice(0, 4).forEach((scenario, index) => {
      console.log(`\n--- SCENARIO ${index + 1}: ${scenario.name} ---`);
      console.log(`Type: ${scenario.type} | Score: ${scenario.score?.toFixed(1) || 'N/A'}`);
      console.log(`Dispatch: ${scenario.dispatchDate} | Wait: ${scenario.waitTime || 0} days`);
      console.log(`Pallets: ${scenario.totalPalletsOnDate} | Utilization: ${scenario.utilization || 'N/A'}%`);
      console.log(`Truck Cost: $${(scenario.estimatedCost || 0).toFixed(2)}`);
      console.log(`Penalty Cost: $${(scenario.penaltyCost || 0).toFixed(2)}`);
      console.log(`Total Cost: $${(scenario.totalCostWithPenalties || scenario.estimatedCost || 0).toFixed(2)}`);
      console.log(`On Time: ${scenario.isOnTime ? '✅' : '⚠️'} | Delay: ${scenario.delayDays || 0} days`);
      
      if (scenario.truckConfiguration?.length > 0) {
        console.log(`Trucks: ${scenario.truckConfiguration.map(t => `${t.type}(${t.pallets})`).join(', ')}`);
      }
      
      if (scenario.aiDecision) {
        const decision = scenario.aiDecision.recommend ? '✅ RECOMMENDED' : '⚠️ NOT RECOMMENDED';
        console.log(`AI Decision: ${decision} (${scenario.aiDecision.confidence} confidence)`);
      }
    });

    // OVERALL ASSESSMENT
    console.log('\n' + '='.repeat(70));
    console.log('🏆 OVERALL GOAL ASSESSMENT:');
    console.log('='.repeat(70));
    
    const goals = [
      { name: 'Goal 1: Deadline & Penalty System', status: goal1Status },
      { name: 'Goal 2: 60%+ Consolidation', status: goal2Status },
      { name: 'Goal 3: Multi-Location Routing', status: goal3Status },
      { name: 'Goal 4: Multiple Solutions + Booking', status: goal4Status }
    ];
    
    goals.forEach((goal, i) => {
      console.log(`${i+1}. ${goal.name}: ${goal.status}`);
    });
    
    const meetingGoals = goals.filter(g => g.status.includes('MEETS')).length;
    const overallStatus = meetingGoals === 4 ? '🎉 ALL GOALS MET' : 
                         meetingGoals >= 3 ? '✅ MOSTLY MEETS GOALS' : '⚠️ NEEDS IMPROVEMENT';
    
    console.log(`\nOVERALL STATUS: ${overallStatus} (${meetingGoals}/4 goals)`);

  } catch (error) {
    console.error('❌ Audit failed:', error.response?.data || error.message);
  }
};

// Run the comprehensive audit
comprehensiveAudit();