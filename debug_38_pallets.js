const axios = require('axios');
const moment = require('moment');

const API_BASE_URL = 'http://localhost:5000/api';

// Test the user's exact scenario: 17+8+13 = 38 pallets
const debug38PalletsScenario = async () => {
  console.log('🧪 DEBUGGING: 17+8+13 = 38 Pallets Consolidation Issue');
  console.log('User Report: Only showing solution for first truck, not total consolidation');
  console.log('Expected: Solutions that handle ALL 38 pallets together\n');

  const orders = [
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 17,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    },
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 8,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    },
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 13,
      palletSize: 'standard',
      pickupDate: '2024-09-01', // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    }
  ];

  try {
    console.log('📋 INPUT ORDERS:');
    orders.forEach((order, i) => {
      console.log(`${i+1}. Order: ${order.pallets} pallets | Route: ${order.source} → ${order.destination}`);
      console.log(`   Dates: ${order.pickupDate} → ${order.deliveryDate}`);
    });
    
    const totalPallets = orders.reduce((sum, o) => sum + o.pallets, 0);
    console.log(`\n📊 TOTAL EXPECTED: ${totalPallets} pallets`);
    console.log(`🛣️ Same Route: ${orders.every(o => o.source === orders[0].source && o.destination === orders[0].destination) ? 'YES' : 'NO'}`);
    console.log(`📅 Same Dates: ${orders.every(o => o.pickupDate === orders[0].pickupDate && o.deliveryDate === orders[0].deliveryDate) ? 'YES' : 'NO'}\n`);

    const response = await axios.post(`${API_BASE_URL}/consolidate-orders`, {
      orders: orders
    });

    const result = response.data;
    const scenarios = result.scenarios || [];
    
    console.log(`✅ API RETURNED ${scenarios.length} SCENARIOS:\n`);

    // Analyze each scenario in detail
    scenarios.forEach((scenario, index) => {
      console.log(`--- SCENARIO ${index + 1}: "${scenario.name}" ---`);
      console.log(`ID: ${scenario.id}`);
      console.log(`Type: ${scenario.type}`);
      console.log(`Pallets Dispatched: ${scenario.totalPalletsOnDate}/${totalPallets}`);
      
      if (scenario.totalPalletsOnDate !== totalPallets) {
        console.log(`❌ PROBLEM: Only handling ${scenario.totalPalletsOnDate} pallets instead of all ${totalPallets}!`);
      } else {
        console.log(`✅ GOOD: Handling all ${totalPallets} pallets`);
      }
      
      console.log(`Utilization: ${scenario.utilization || 'N/A'}%`);
      console.log(`Dispatch Date: ${scenario.dispatchDate}`);
      
      if (scenario.truckConfiguration && scenario.truckConfiguration.length > 0) {
        console.log(`Truck Config: ${scenario.truckConfiguration.map(t => `${t.type}(${t.pallets})`).join(' + ')}`);
        const configTotalPallets = scenario.truckConfiguration.reduce((sum, t) => sum + t.pallets, 0);
        console.log(`Truck Config Total: ${configTotalPallets} pallets`);
      } else {
        console.log(`Truck Config: MISSING!`);
      }
      
      // Check route group info
      if (scenario.routeGroup) {
        console.log(`Route: ${scenario.routeGroup.sourceCity} → ${scenario.routeGroup.destinationCity}`);
        console.log(`Orders in Route Group: ${scenario.routeGroup.orders?.length || 'N/A'}`);
        console.log(`Available Orders: ${scenario.availableOrders?.length || 'N/A'}`);
        
        if (scenario.availableOrders) {
          const availablePallets = scenario.availableOrders.reduce((sum, o) => sum + o.pallets, 0);
          console.log(`Available Orders Pallets: ${availablePallets}`);
        }
      } else {
        console.log(`Route Group: MISSING!`);
      }
      
      console.log(`Score: ${scenario.score?.toFixed(1) || 'N/A'}`);
      console.log('');
    });

    // CONSOLIDATION ANALYSIS
    console.log('🔍 CONSOLIDATION ANALYSIS:');
    console.log('-'.repeat(50));
    
    const fullConsolidationScenarios = scenarios.filter(s => s.totalPalletsOnDate >= totalPallets);
    const partialScenarios = scenarios.filter(s => s.totalPalletsOnDate < totalPallets);
    
    console.log(`✅ Full consolidation scenarios (${totalPallets} pallets): ${fullConsolidationScenarios.length}`);
    console.log(`❌ Partial scenarios (<${totalPallets} pallets): ${partialScenarios.length}`);
    
    if (partialScenarios.length > 0) {
      console.log('\n❌ PARTIAL SCENARIOS DETECTED:');
      partialScenarios.forEach((s, i) => {
        console.log(`  ${i+1}. "${s.name}": ${s.totalPalletsOnDate} pallets (missing ${totalPallets - s.totalPalletsOnDate})`);
      });
    }
    
    if (fullConsolidationScenarios.length === 0) {
      console.log('\n🚨 ROOT CAUSE ANALYSIS:');
      console.log('❌ NO scenarios handle all 38 pallets together!');
      console.log('🔍 This indicates the consolidation algorithm is not properly grouping orders.');
      console.log('🔧 Possible causes:');
      console.log('   1. Orders not being grouped by route correctly');
      console.log('   2. Route key generation issue');
      console.log('   3. Date/timing constraints preventing consolidation');
      console.log('   4. Order processing splitting orders incorrectly');
    }

    // EXPECTED OPTIMAL CONFIGURATIONS
    console.log('\n💡 EXPECTED OPTIMAL CONFIGURATIONS FOR 38 PALLETS:');
    console.log('1. 2x SEMI trucks (22+16 or 19+19) = 86% utilization');
    console.log('2. 1x B-Double + 1x Small (36+2) = 94% utilization');
    console.log('3. 1x SEMI + Multiple MR (22+10+6) = Mixed utilization');

    // RAW DATA INSPECTION
    console.log('\n🔍 RAW SCENARIO DATA (First scenario):');
    if (scenarios[0]) {
      console.log(JSON.stringify(scenarios[0], null, 2));
    }

  } catch (error) {
    console.error('❌ Debug test failed:', error.response?.data || error.message);
  }
};

// Run the debug test
debug38PalletsScenario();