const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

// Test the specific frontend integration issues
const testFrontendIntegration = async () => {
  console.log('🔧 TESTING FRONTEND INTEGRATION ISSUES');
  console.log('='.repeat(60));
  console.log('Issues to verify:');
  console.log('1. Consolidation showing partial solutions instead of total 40 pallets');
  console.log('2. Select button not redirecting to truck company websites\n');

  // Test exact scenario: 15+7+18 = 40 pallets
  const orders = [
    {
      source: 'Melbourne',
      destination: 'Sydney',
      pallets: 15,
      palletSize: 'standard',
      pickupDate: '2024-09-01',
      deliveryDate: '2024-09-05',
      urgency: 'standard'
    },
    {
      source: 'Melbourne', 
      destination: 'Sydney',
      pallets: 7,
      palletSize: 'standard',
      pickupDate: '2024-09-01',
      deliveryDate: '2024-09-05',
      urgency: 'standard'
    },
    {
      source: 'Melbourne',
      destination: 'Sydney', 
      pallets: 18,
      palletSize: 'standard',
      pickupDate: '2024-09-01',
      deliveryDate: '2024-09-05',
      urgency: 'standard'
    }
  ];

  try {
    console.log('🧪 STEP 1: Testing API Response (Backend)');
    console.log('-'.repeat(40));
    
    const response = await axios.post(`${API_BASE_URL}/consolidate-orders`, {
      orders: orders
    });

    const result = response.data;
    const scenarios = result.scenarios || [];

    console.log(`✅ API Response: ${scenarios.length} scenarios`);
    console.log(`📊 Total Pallets Expected: 40`);

    scenarios.forEach((scenario, i) => {
      console.log(`\nScenario ${i+1}: "${scenario.name}"`);
      console.log(`  Pallets: ${scenario.totalPalletsOnDate}/40`);
      console.log(`  Truck Companies: ${scenario.truckCompanies?.length || 0}`);
      console.log(`  Scenario ID: ${scenario.id}`);
      
      if (scenario.truckCompanies?.length > 0) {
        const topCompany = scenario.truckCompanies[0];
        console.log(`  Top Company: ${topCompany.companyName || topCompany.name}`);
        console.log(`  Booking URL: ${topCompany.contact?.bookingUrl || 'MISSING'}`);
        console.log(`  Company Code: ${topCompany.companyCode || topCompany.code || 'MISSING'}`);
      } else {
        console.log(`  ❌ NO TRUCK COMPANIES - This would cause booking failure!`);
      }
    });

    // ISSUE 1: Check for consolidation problems
    console.log('\n🔍 CONSOLIDATION ANALYSIS:');
    console.log('-'.repeat(40));
    
    const fullConsolidationScenarios = scenarios.filter(s => s.totalPalletsOnDate >= 40);
    const partialConsolidationScenarios = scenarios.filter(s => s.totalPalletsOnDate < 40);
    
    console.log(`✅ Full consolidation scenarios (40 pallets): ${fullConsolidationScenarios.length}`);
    console.log(`⚠️ Partial consolidation scenarios (<40 pallets): ${partialConsolidationScenarios.length}`);
    
    if (fullConsolidationScenarios.length === 0) {
      console.log('❌ CONSOLIDATION ISSUE CONFIRMED: No scenarios handle all 40 pallets');
      console.log('   The user should see scenarios for ALL pallets, not partial ones');
    } else {
      console.log('✅ CONSOLIDATION WORKING: Scenarios handle all 40 pallets');
    }

    // ISSUE 2: Check for booking integration problems
    console.log('\n🔗 BOOKING INTEGRATION ANALYSIS:');
    console.log('-'.repeat(40));
    
    const scenariosWithBooking = scenarios.filter(s => 
      s.truckCompanies?.length > 0 && 
      s.truckCompanies[0].contact?.bookingUrl
    );
    
    console.log(`✅ Scenarios with booking URLs: ${scenariosWithBooking.length}/${scenarios.length}`);
    
    if (scenariosWithBooking.length === 0) {
      console.log('❌ BOOKING ISSUE CONFIRMED: No scenarios have booking URLs');
      console.log('   The Select button would fail to redirect to truck company websites');
    } else {
      console.log('✅ BOOKING INTEGRATION WORKING: Scenarios have booking URLs');
      
      // Test the exact booking URLs
      console.log('\n📋 BOOKING URLS TO TEST:');
      scenariosWithBooking.forEach((scenario, i) => {
        const company = scenario.truckCompanies[0];
        console.log(`${i+1}. ${company.companyName}: ${company.contact.bookingUrl}`);
      });
    }

    // FRONTEND JAVASCRIPT VALIDATION
    console.log('\n🖥️ FRONTEND JAVASCRIPT VALIDATION:');
    console.log('-'.repeat(40));
    
    // Simulate the frontend selectScenario function call
    const testScenario = scenarios[0];
    if (testScenario) {
      console.log(`Testing selectScenario('${testScenario.id}')`);
      
      const topCompany = testScenario.truckCompanies?.[0];
      if (topCompany?.contact?.bookingUrl) {
        console.log(`✅ Would redirect to: ${topCompany.contact.bookingUrl}`);
        console.log(`✅ Company: ${topCompany.companyName}`);
      } else {
        console.log(`❌ Would show fallback modal (no booking URL)`);
      }
    }

    // EXPECTED TRUCK CONFIGURATIONS
    console.log('\n🚚 EXPECTED OPTIMAL TRUCK CONFIGURATIONS:');
    console.log('-'.repeat(40));
    console.log('For 40 pallets, optimal configurations should include:');
    console.log('1. 2x SEMI (22+18 or 20+20) - Good utilization');
    console.log('2. 1x B-Double + 1x Small truck (36+4) - Maximum efficiency'); 
    console.log('3. Multiple MR trucks (only if needed for timing)');
    
    fullConsolidationScenarios.forEach((scenario, i) => {
      if (scenario.truckConfiguration) {
        const config = scenario.truckConfiguration.map(t => `${t.type}(${t.pallets})`).join(' + ');
        const totalPallets = scenario.truckConfiguration.reduce((sum, t) => sum + t.pallets, 0);
        console.log(`Scenario ${i+1}: ${config} = ${totalPallets} pallets, ${scenario.utilization}% util`);
      }
    });

    // SUMMARY
    console.log('\n' + '='.repeat(60));
    console.log('🏆 INTEGRATION TEST SUMMARY:');
    console.log('='.repeat(60));
    
    const issues = [];
    
    if (fullConsolidationScenarios.length === 0) {
      issues.push('❌ Consolidation not showing all 40 pallets together');
    }
    
    if (scenariosWithBooking.length === 0) {
      issues.push('❌ Booking URLs missing - Select button won\'t work');
    }
    
    if (issues.length === 0) {
      console.log('🎉 ALL INTEGRATION TESTS PASSED!');
      console.log('✅ Consolidation shows full 40-pallet scenarios');
      console.log('✅ Booking URLs present for truck company redirection');
      console.log('\n💡 If user still sees issues, it might be:');
      console.log('   - Browser caching old JavaScript');
      console.log('   - Frontend not refreshing after backend changes');
      console.log('   - CSP blocking redirects to external websites');
    } else {
      console.log('⚠️ ISSUES IDENTIFIED:');
      issues.forEach(issue => console.log(issue));
    }

  } catch (error) {
    console.error('❌ Integration test failed:', error.response?.data || error.message);
  }
};

// Run the integration test
testFrontendIntegration();