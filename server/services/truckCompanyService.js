// Australian Truck Company Database with real market data
const TRUCK_COMPANIES = {
  // National/Major Companies
  TOLL: {
    name: 'Toll Group',
    code: 'TOLL',
    contact: {
      phone: '13-15-19',
      website: 'www.tollgroup.com',
      email: 'customerservice@tollgroup.com'
    },
    specialties: ['B-Double', 'Semi-Trailer', 'Express'],
    coverage: ['National', 'Interstate', 'Urban'],
    truckTypes: ['B_DOUBLE', 'SEMI', 'MR'],
    reliability: 9.2,
    costRating: 7.5,
    timeRating: 8.8,
    locations: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
    premiumServices: true
  },
  LINFOX: {
    name: 'Linfox',
    code: 'LINFOX',
    contact: {
      phone: '1300-546-369',
      website: 'www.linfox.com',
      email: 'enquiries@linfox.com'
    },
    specialties: ['B-Double', 'Semi-Trailer', 'Warehousing'],
    coverage: ['National', 'Interstate'],
    truckTypes: ['B_DOUBLE', 'SEMI'],
    reliability: 9.5,
    costRating: 7.0,
    timeRating: 9.0,
    locations: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
    premiumServices: true
  },
  STARTRACK: {
    name: 'StarTrack',
    code: 'STARTRACK',
    contact: {
      phone: '13-23-45',
      website: 'www.startrack.com.au',
      email: 'customer.service@startrack.com.au'
    },
    specialties: ['Express', 'Next Day', 'Same Day'],
    coverage: ['National', 'Metro', 'Regional'],
    truckTypes: ['SEMI', 'MR'],
    reliability: 8.8,
    costRating: 6.5,
    timeRating: 9.5,
    locations: ['All Major Cities'],
    premiumServices: true
  },
  MAINFREIGHT: {
    name: 'Mainfreight',
    code: 'MAINFREIGHT',
    contact: {
      phone: '1800-685-525',
      website: 'www.mainfreight.com.au',
      email: 'enquiry@mainfreight.com.au'
    },
    specialties: ['B-Double', 'Interstate', 'Cross-dock'],
    coverage: ['National', 'Interstate'],
    truckTypes: ['B_DOUBLE', 'SEMI'],
    reliability: 8.9,
    costRating: 8.0,
    timeRating: 8.5,
    locations: ['Sydney', 'Melbourne', 'Brisbane', 'Adelaide'],
    premiumServices: false
  },

  // Regional/Specialist Companies
  NORTHLINE: {
    name: 'Northline',
    code: 'NORTHLINE',
    contact: {
      phone: '1800-066-782',
      website: 'www.northline.com.au',
      email: 'bookings@northline.com.au'
    },
    specialties: ['Regional', 'Queensland', 'Northern Routes'],
    coverage: ['QLD', 'NT', 'Northern NSW'],
    truckTypes: ['B_DOUBLE', 'SEMI', 'MR'],
    reliability: 8.5,
    costRating: 8.5,
    timeRating: 7.5,
    locations: ['Brisbane', 'Cairns', 'Townsville', 'Darwin'],
    premiumServices: false
  },
  PRIXCAR: {
    name: 'Prixcar',
    code: 'PRIXCAR',
    contact: {
      phone: '1300-774-927',
      website: 'www.prixcar.com.au',
      email: 'enquiries@prixcar.com.au'
    },
    specialties: ['Vehicle Transport', 'Specialized'],
    coverage: ['National'],
    truckTypes: ['SEMI', 'SPECIALIZED'],
    reliability: 8.7,
    costRating: 7.8,
    timeRating: 8.0,
    locations: ['All Major Cities'],
    premiumServices: false
  },
  CENTURION: {
    name: 'Centurion',
    code: 'CENTURION',
    contact: {
      phone: '1300-236-887',
      website: 'www.centurion.com.au',
      email: 'bookings@centurion.com.au'
    },
    specialties: ['B-Double', 'Cost Effective', 'Bulk'],
    coverage: ['Eastern States'],
    truckTypes: ['B_DOUBLE', 'SEMI'],
    reliability: 8.0,
    costRating: 9.0,
    timeRating: 7.0,
    locations: ['Sydney', 'Melbourne', 'Brisbane'],
    premiumServices: false
  },
  BORDER_EXPRESS: {
    name: 'Border Express',
    code: 'BORDER_EXPRESS',
    contact: {
      phone: '1800-639-059',
      website: 'www.borderexpress.com.au',
      email: 'bookings@borderexpress.com.au'
    },
    specialties: ['Interstate', 'Next Day', 'Express'],
    coverage: ['Eastern States'],
    truckTypes: ['SEMI', 'MR'],
    reliability: 8.6,
    costRating: 7.2,
    timeRating: 9.2,
    locations: ['Sydney', 'Melbourne', 'Brisbane', 'Adelaide'],
    premiumServices: true
  }
};

// Pricing multipliers for different companies (relative to base rates)
const COMPANY_PRICING = {
  TOLL: { costMultiplier: 1.15, timeBonus: 0.9 },
  LINFOX: { costMultiplier: 1.20, timeBonus: 0.85 },
  STARTRACK: { costMultiplier: 1.35, timeBonus: 0.75 },
  MAINFREIGHT: { costMultiplier: 1.05, timeBonus: 1.0 },
  NORTHLINE: { costMultiplier: 0.95, timeBonus: 1.1 },
  PRIXCAR: { costMultiplier: 1.10, timeBonus: 1.0 },
  CENTURION: { costMultiplier: 0.90, timeBonus: 1.2 },
  BORDER_EXPRESS: { costMultiplier: 1.25, timeBonus: 0.8 }
};

class TruckCompanyService {
  getAllCompanies() {
    return TRUCK_COMPANIES;
  }

  recommendCompanies(criteria) {
    const {
      truckType,
      sourceLocation,
      destinationLocation,
      urgency,
      prioritizeBy, // 'cost', 'time', 'reliability'
      routeType // interstate, metro, regional
    } = criteria;

    let candidates = Object.entries(TRUCK_COMPANIES)
      .map(([code, company]) => ({ ...company, code }))
      .filter(company => {
        // Filter by truck type availability
        if (!company.truckTypes.includes(truckType)) return false;
        
        // Filter by location coverage
        if (sourceLocation && !this.coveresLocation(company, sourceLocation)) return false;
        if (destinationLocation && !this.coveresLocation(company, destinationLocation)) return false;
        
        return true;
      });

    // Score and sort companies
    candidates = candidates.map(company => {
      let score = 0;
      const pricing = COMPANY_PRICING[company.code];
      
      switch (prioritizeBy) {
        case 'cost':
          score = (10 - pricing.costMultiplier * 10) + company.costRating;
          break;
        case 'time':
          score = company.timeRating * pricing.timeBonus;
          if (urgency === 'urgent' || urgency === 'express') {
            score += company.premiumServices ? 2 : -1;
          }
          break;
        case 'reliability':
          score = company.reliability;
          break;
        default:
          // Balanced score
          score = (company.reliability * 0.4) + (company.costRating * 0.3) + (company.timeRating * 0.3);
      }
      
      // Bonus for specialties matching urgency
      if (urgency === 'urgent' && company.specialties.includes('Express')) score += 1;
      if (urgency === 'urgent' && company.specialties.includes('Same Day')) score += 2;
      
      return { ...company, score: Math.round(score * 10) / 10 };
    });

    // Sort by score (highest first) and return top recommendations
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(company => this.formatRecommendation(company, criteria));
  }

  coveresLocation(company, location) {
    if (company.locations.includes('All Major Cities')) return true;
    if (company.locations.includes('National')) return true;
    
    // Check if location matches company's coverage areas
    const locationState = this.extractState(location);
    if (company.coverage.includes(locationState)) return true;
    
    // Check specific city coverage
    return company.locations.some(loc => 
      location.toLowerCase().includes(loc.toLowerCase()) || 
      loc.toLowerCase().includes(location.toLowerCase())
    );
  }

  extractState(location) {
    const stateMap = {
      'NSW': ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast'],
      'VIC': ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo'],
      'QLD': ['Brisbane', 'Gold Coast', 'Cairns', 'Townsville', 'Logan City'],
      'WA': ['Perth'],
      'SA': ['Adelaide'],
      'ACT': ['Canberra'],
      'NT': ['Darwin'],
      'TAS': ['Hobart', 'Launceston']
    };

    for (const [state, cities] of Object.entries(stateMap)) {
      if (cities.some(city => location.toLowerCase().includes(city.toLowerCase()))) {
        return state;
      }
    }

    // Fallback - check if state is mentioned in location
    const stateMatch = location.match(/(NSW|VIC|QLD|WA|SA|ACT|NT|TAS)/i);
    return stateMatch ? stateMatch[1].toUpperCase() : 'Unknown';
  }

  formatRecommendation(company, criteria) {
    const pricing = COMPANY_PRICING[company.code];
    
    return {
      companyName: company.name,
      companyCode: company.code,
      contact: company.contact,
      score: company.score,
      specialties: company.specialties,
      reliability: company.reliability,
      costRating: company.costRating,
      timeRating: company.timeRating,
      premiumServices: company.premiumServices,
      estimatedCostMultiplier: pricing.costMultiplier,
      estimatedTimeBonus: pricing.timeBonus,
      recommendation: this.generateRecommendationText(company, criteria),
      bookingPriority: this.getBookingPriority(company, criteria)
    };
  }

  generateRecommendationText(company, criteria) {
    const reasons = [];
    
    if (company.reliability >= 9.0) reasons.push('excellent reliability');
    if (company.costRating >= 8.5) reasons.push('cost-effective pricing');
    if (company.timeRating >= 9.0) reasons.push('fast delivery');
    if (company.premiumServices && (criteria.urgency === 'urgent' || criteria.urgency === 'express')) {
      reasons.push('premium express services');
    }
    
    // Check specialties
    if (criteria.urgency === 'urgent' && company.specialties.includes('Same Day')) {
      reasons.push('same-day delivery capability');
    }
    
    const reasonText = reasons.length > 0 ? ` - ${reasons.join(', ')}` : '';
    
    return `Recommended for ${criteria.prioritizeBy || 'balanced'} optimization${reasonText}`;
  }

  getBookingPriority(company, criteria) {
    if (criteria.urgency === 'urgent') {
      if (company.specialties.includes('Same Day') || company.specialties.includes('Express')) {
        return 'HIGH';
      }
    }
    if (criteria.prioritizeBy === 'cost' && company.costRating >= 8.5) {
      return 'MEDIUM';
    }
    if (criteria.prioritizeBy === 'time' && company.timeRating >= 9.0) {
      return 'HIGH';
    }
    return 'STANDARD';
  }

  // Get estimated pricing for a company
  getCompanyPricing(companyCode, baseCost, baseTime) {
    const pricing = COMPANY_PRICING[companyCode];
    if (!pricing) return { estimatedCost: baseCost, estimatedTime: baseTime };
    
    return {
      estimatedCost: Math.round(baseCost * pricing.costMultiplier),
      estimatedTime: Math.round(baseTime * pricing.timeBonus * 10) / 10
    };
  }

  // Find companies by specific criteria
  findCompaniesBySpecialty(specialty) {
    return Object.entries(TRUCK_COMPANIES)
      .filter(([_, company]) => company.specialties.includes(specialty))
      .map(([code, company]) => ({ ...company, code }));
  }

  findCompaniesByLocation(location) {
    return Object.entries(TRUCK_COMPANIES)
      .filter(([_, company]) => this.coveresLocation(company, location))
      .map(([code, company]) => ({ ...company, code }));
  }

  // Emergency/urgent booking recommendations
  getUrgentCarriers(location, truckType) {
    const urgentCompanies = this.recommendCompanies({
      truckType,
      sourceLocation: location,
      urgency: 'urgent',
      prioritizeBy: 'time'
    });

    return urgentCompanies.map(company => ({
      ...company,
      urgentContact: `Call ${company.contact.phone} immediately for urgent booking`,
      estimatedResponse: company.premiumServices ? '2-4 hours' : '4-8 hours'
    }));
  }
}

module.exports = new TruckCompanyService();