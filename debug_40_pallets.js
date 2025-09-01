const axios = require('axios');
const moment = require('moment');

const API_BASE_URL = 'http://localhost:5000/api';

// Test the exact user scenario: 15+7+18 = 40 pallets
const test40PalletsScenario = async () => {
  console.log('🧪 DEBUGGING: 15+7+18 = 40 Pallets Scenario');
  console.log('Expected: Solutions to dispatch ALL 40 pallets optimally');
  console.log('Issue: Currently only showing partial solutions (15 or 22 pallets)\n');

  const orders = [
    {
      source: 'Melbourne',
      destination: 'Sydney', 
      pallets: 15,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    },
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 7, 
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    },
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 18,
      palletSize: 'standard', 
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    }
  ];

  try {
    console.log('📋 INPUT ORDERS:');
    orders.forEach((order, i) => {
      console.log(`${i+1}. ${order.pallets} pallets | ${order.source} → ${order.destination} | Due: ${order.deliveryDate}`);
    });
    console.log(`Total Pallets: ${orders.reduce((sum, o) => sum + o.pallets, 0)}`);
    console.log(`Same Route: ${orders.every(o => o.source === orders[0].source && o.destination === orders[0].destination) ? 'YES' : 'NO'}`);
    console.log(`Same Timeline: ${orders.every(o => o.pickupDate === orders[0].pickupDate && o.deliveryDate === orders[0].deliveryDate) ? 'YES' : 'NO'}\n`);

    const response = await axios.post(`${API_BASE_URL}/consolidate-orders`, {
      orders: orders
    });

    const result = response.data;
    const scenarios = result.scenarios || [];
    
    console.log(`✅ RECEIVED ${scenarios.length} SCENARIOS:\n`);

    // Analyze each scenario
    scenarios.forEach((scenario, index) => {
      console.log(`--- SCENARIO ${index + 1}: ${scenario.name} ---`);
      console.log(`Pallets Dispatched: ${scenario.totalPalletsOnDate}/40 (${(scenario.totalPalletsOnDate/40*100).toFixed(1)}%)`);
      console.log(`Utilization: ${scenario.utilization || 'N/A'}%`);
      console.log(`Total Cost: $${(scenario.totalCostWithPenalties || scenario.estimatedCost || 0).toFixed(2)}`);
      console.log(`Truck Config: ${scenario.truckConfiguration?.map(t => `${t.type}(${t.pallets})`).join(', ') || 'N/A'}`);
      console.log(`Route: ${scenario.routeGroup?.sourceCity || 'N/A'} → ${scenario.routeGroup?.destinationCity || 'N/A'}`);
      
      // Check if it handles all orders
      const ordersInScenario = scenario.availableOrders?.length || scenario.routeGroup?.orders?.length || 0;
      console.log(`Orders Included: ${ordersInScenario}/3`);
      
      if (scenario.truckCompanies?.length > 0) {
        console.log(`Truck Companies: ${scenario.truckCompanies.length} available`);
        console.log(`Top Company: ${scenario.truckCompanies[0].companyName || scenario.truckCompanies[0].name}`);
        console.log(`Booking URL: ${scenario.truckCompanies[0].contact?.bookingUrl || 'MISSING'}`);
      } else {
        console.log(`Truck Companies: ❌ NONE - This is the booking issue!`);
      }
      
      console.log('');
    });

    // Analysis
    console.log('🔍 ISSUE ANALYSIS:');
    console.log('-'.repeat(50));
    
    const fullConsolidationScenarios = scenarios.filter(s => s.totalPalletsOnDate === 40);
    const partialScenarios = scenarios.filter(s => s.totalPalletsOnDate < 40);
    
    console.log(`✅ Full consolidation scenarios (40 pallets): ${fullConsolidationScenarios.length}`);
    console.log(`⚠️ Partial scenarios (<40 pallets): ${partialScenarios.length}`);
    
    if (fullConsolidationScenarios.length === 0) {
      console.log(`❌ PROBLEM IDENTIFIED: No scenarios handle all 40 pallets together!`);
      console.log(`   This means the consolidation logic is not properly grouping same-route orders.`);
    }
    
    const scenariosWithCompanies = scenarios.filter(s => s.truckCompanies?.length > 0);
    console.log(`🔗 Scenarios with truck companies: ${scenariosWithCompanies.length}/${scenarios.length}`);
    
    if (scenariosWithCompanies.length === 0) {
      console.log(`❌ BOOKING PROBLEM IDENTIFIED: No scenarios have truck companies assigned!`);
      console.log(`   This means the evaluateScenario() function is not calling recommendTruckCompanies()`);
    }

    // Show optimal truck configurations for 40 pallets
    console.log('\n💡 EXPECTED OPTIMAL CONFIGURATIONS FOR 40 PALLETS:');
    console.log('1. 2x SEMI trucks (22+18 pallets) = 91% utilization');
    console.log('2. 1x B-DOUBLE + 1x MR (36+4 pallets) = 83% utilization'); 
    console.log('3. 1x B-DOUBLE + 1x SEMI (36+4 pallets, need smaller SEMI)');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
};

// Run the test
test40PalletsScenario();