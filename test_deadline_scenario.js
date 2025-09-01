const axios = require('axios');
const moment = require('moment');

const API_BASE_URL = 'http://localhost:5000/api';

// Test scenario: 5(due 3/9)+17(due 4/9)+18(due 5/9) pallets
const testScenario = async () => {
  console.log('🧪 Testing Deadline Optimization Scenario');
  console.log('Scenario: 5 pallets (due 3/9) + 17 pallets (due 4/9) + 18 pallets (due 5/9)');
  console.log('Expected: Multiple dispatch options with penalty cost analysis\n');

  const today = moment('2024-09-01'); // Assuming today is Sep 1, 2024
  
  const orders = [
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 5,
      palletSize: 'standard',
      pickupDate: today.format('YYYY-MM-DD'), // Stock available today
      deliveryDate: '2024-09-03', // Must arrive by Sep 3
      urgency: 'standard'
    },
    {
      source: 'Melbourne', 
      destination: 'Sydney',
      pallets: 17,
      palletSize: 'standard',
      pickupDate: today.format('YYYY-MM-DD'), // Stock available today
      deliveryDate: '2024-09-04', // Must arrive by Sep 4
      urgency: 'standard'
    },
    {
      source: 'Melbourne',
      destination: 'Sydney', 
      pallets: 18,
      palletSize: 'standard',
      pickupDate: today.format('YYYY-MM-DD'), // Stock available today
      deliveryDate: '2024-09-05', // Must arrive by Sep 5
      urgency: 'standard'
    }
  ];

  try {
    console.log('📋 Sending orders for consolidation analysis...');
    
    const response = await axios.post(`${API_BASE_URL}/consolidate-orders`, {
      orders: orders
    });

    const scenarios = response.data.scenarios || response.data;
    
    console.log(`\n✅ Received ${scenarios.length} consolidation scenarios:\n`);

    scenarios.forEach((scenario, index) => {
      console.log(`--- SCENARIO ${index + 1}: ${scenario.name} ---`);
      console.log(`Type: ${scenario.type}`);
      console.log(`Dispatch Date: ${scenario.dispatchDate}`);
      console.log(`Total Pallets: ${scenario.totalPalletsOnDate}`);
      console.log(`Truck Cost: $${scenario.estimatedCost?.toFixed(2) || 'N/A'}`);
      console.log(`Penalty Cost: $${scenario.penaltyCost?.toFixed(2) || '0.00'}`);
      console.log(`Total Cost (with penalties): $${scenario.totalCostWithPenalties?.toFixed(2) || 'N/A'}`);
      console.log(`Utilization: ${scenario.utilization || 'N/A'}%`);
      console.log(`Wait Time: ${scenario.waitTime || 0} days`);
      console.log(`Delay Days: ${scenario.delayDays || 0} days`);
      console.log(`On Time: ${scenario.isOnTime ? '✅' : '⚠️'}`);
      
      if (scenario.truckConfiguration && scenario.truckConfiguration.length > 0) {
        console.log(`Truck Config: ${scenario.truckConfiguration.map(t => `${t.type}(${t.pallets})`).join(', ')}`);
      }
      
      if (scenario.recommendations && scenario.recommendations.length > 0) {
        console.log('Recommendations:');
        scenario.recommendations.forEach(rec => console.log(`  • ${rec}`));
      }
      
      if (scenario.aiDecision) {
        console.log(`AI Recommendation: ${scenario.aiDecision.recommend ? '✅ RECOMMEND' : '❌ NOT RECOMMENDED'} (${scenario.aiDecision.confidence} confidence)`);
        if (scenario.aiDecision.reasons) {
          scenario.aiDecision.reasons.forEach(reason => console.log(`  • ${reason}`));
        }
      }
      
      console.log(`Score: ${scenario.score?.toFixed(1) || 'N/A'}\n`);
    });

    // Analyze the results
    console.log('🔍 ANALYSIS:');
    
    const deadlineCompliantScenarios = scenarios.filter(s => s.isOnTime);
    const consolidationScenarios = scenarios.filter(s => s.totalPalletsOnDate > 20);
    const lowestCostScenario = scenarios.reduce((min, s) => 
      (s.totalCostWithPenalties || Infinity) < (min.totalCostWithPenalties || Infinity) ? s : min
    );

    console.log(`• Deadline compliant scenarios: ${deadlineCompliantScenarios.length}`);
    console.log(`• Consolidation scenarios (>20 pallets): ${consolidationScenarios.length}`);
    console.log(`• Lowest cost scenario: "${lowestCostScenario.name}" at $${lowestCostScenario.totalCostWithPenalties?.toFixed(2)}`);
    
    // Check specific expected outcomes
    console.log('\n🎯 EXPECTED OUTCOMES CHECK:');
    
    const smallTruckEachDay = scenarios.find(s => 
      s.totalPalletsOnDate <= 22 && s.isOnTime && s.delayDays === 0
    );
    
    const consolidatedOption = scenarios.find(s => 
      s.totalPalletsOnDate >= 22 && s.delayDays <= 1
    );
    
    if (smallTruckEachDay) {
      console.log('✅ Found "smallest truck for each deadline" option (highest cost, on-time)');
    } else {
      console.log('❌ Missing "smallest truck for each deadline" option');
    }
    
    if (consolidatedOption) {
      console.log('✅ Found consolidation option (lower cost, potential minor delays)');
    } else {
      console.log('❌ Missing consolidation option');
    }

    const recommendedScenario = scenarios.find(s => s.aiDecision?.recommend === true);
    if (recommendedScenario) {
      console.log(`✅ AI recommends: "${recommendedScenario.name}"`);
      console.log(`   Balances cost ($${recommendedScenario.totalCostWithPenalties?.toFixed(2)}) vs delivery requirements`);
    } else {
      console.log('⚠️ No clear AI recommendation found');
    }

  } catch (error) {
    console.error('❌ Error testing scenario:', error.response?.data || error.message);
  }
};

// Run the test
testScenario();