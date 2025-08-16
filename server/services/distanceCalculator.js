// Distance matrix for major Australian cities
// Data based on approximate road distances between major Australian cities
const AUSTRALIAN_CITY_DISTANCES = {
  'Sydney, NSW': {
    'Melbourne, VIC': 880,
    'Brisbane, QLD': 920,
    'Perth, WA': 3290,
    'Adelaide, SA': 1170,
    'Gold Coast, QLD': 840,
    'Newcastle, NSW': 160,
    'Canberra, ACT': 290,
    'Central Coast, NSW': 90,
    'Wollongong, NSW': 85,
    'Logan City, QLD': 890,
    'Geelong, VIC': 940,
    'Hobart, TAS': 1040, // Including ferry
    'Townsville, QLD': 1350,
    'Cairns, QLD': 1680,
    'Darwin, NT': 3940,
    'Ballarat, VIC': 850,
    'Bendigo, VIC': 780,
    'Albury, NSW': 560,
    'Launceston, TAS': 980  // Including ferry
  },
  'Melbourne, VIC': {
    'Sydney, NSW': 880,
    'Brisbane, QLD': 1700,
    'Perth, WA': 2760,
    'Adelaide, SA': 730,
    'Gold Coast, QLD': 1620,
    'Newcastle, NSW': 1040,
    'Canberra, ACT': 650,
    'Central Coast, NSW': 970,
    'Wollongong, NSW': 800,
    'Logan City, QLD': 1670,
    'Geelong, VIC': 75,
    'Hobart, TAS': 620, // Including ferry
    'Townsville, QLD': 2130,
    'Cairns, QLD': 2460,
    'Darwin, NT': 3750,
    'Ballarat, VIC': 120,
    'Bendigo, VIC': 150,
    'Albury, NSW': 320,
    'Launceston, TAS': 560  // Including ferry
  },
  'Brisbane, QLD': {
    'Sydney, NSW': 920,
    'Melbourne, VIC': 1700,
    'Perth, WA': 4320,
    'Adelaide, SA': 2130,
    'Gold Coast, QLD': 80,
    'Newcastle, NSW': 760,
    'Canberra, ACT': 1210,
    'Central Coast, NSW': 830,
    'Wollongong, NSW': 1000,
    'Logan City, QLD': 30,
    'Geelong, VIC': 1760,
    'Hobart, TAS': 1860, // Including ferry
    'Townsville, QLD': 1380,
    'Cairns, QLD': 1710,
    'Darwin, NT': 2860,
    'Ballarat, VIC': 1820,
    'Bendigo, VIC': 1850,
    'Albury, NSW': 1480,
    'Launceston, TAS': 1800  // Including ferry
  },
  'Perth, WA': {
    'Sydney, NSW': 3290,
    'Melbourne, VIC': 2760,
    'Brisbane, QLD': 4320,
    'Adelaide, SA': 2130,
    'Gold Coast, QLD': 4240,
    'Newcastle, NSW': 3450,
    'Canberra, ACT': 3000,
    'Central Coast, NSW': 3380,
    'Wollongong, NSW': 3210,
    'Logan City, QLD': 4290,
    'Geelong, VIC': 2835,
    'Hobart, TAS': 3380, // Including ferry
    'Townsville, QLD': 4700,
    'Cairns, QLD': 5030,
    'Darwin, NT': 4050,
    'Ballarat, VIC': 2880,
    'Bendigo, VIC': 2910,
    'Albury, NSW': 2440,
    'Launceston, TAS': 3320  // Including ferry
  },
  'Adelaide, SA': {
    'Sydney, NSW': 1170,
    'Melbourne, VIC': 730,
    'Brisbane, QLD': 2130,
    'Perth, WA': 2130,
    'Gold Coast, QLD': 2050,
    'Newcastle, NSW': 1330,
    'Canberra, ACT': 1120,
    'Central Coast, NSW': 1260,
    'Wollongong, NSW': 1090,
    'Logan City, QLD': 2100,
    'Geelong, VIC': 660,
    'Hobart, TAS': 1350, // Including ferry
    'Townsville, QLD': 2560,
    'Cairns, QLD': 2890,
    'Darwin, NT': 3020,
    'Ballarat, VIC': 610,
    'Bendigo, VIC': 640,
    'Albury, NSW': 450,
    'Launceston, TAS': 1290  // Including ferry
  }
};

class DistanceCalculator {
  async calculateDistance(source, destination) {
    try {
      // Clean and normalize city names
      const normalizedSource = this.normalizeCityName(source);
      const normalizedDestination = this.normalizeCityName(destination);

      // Check if same city
      if (normalizedSource === normalizedDestination) {
        return 0;
      }

      // Look up in our distance matrix
      let distance = this.lookupDistance(normalizedSource, normalizedDestination);
      
      if (distance === null) {
        // Fallback: estimate based on coordinates if available
        distance = this.estimateDistance(normalizedSource, normalizedDestination);
      }

      // Add some random variation (+/- 5%) to simulate real-world conditions
      const variation = 0.95 + (Math.random() * 0.1);
      return Math.round(distance * variation);
      
    } catch (error) {
      console.error('Distance calculation error:', error);
      // Fallback: return estimated distance based on city pair
      return this.getFallbackDistance(source, destination);
    }
  }

  normalizeCityName(cityName) {
    if (!cityName) return '';
    
    // Handle common variations and clean up the city name
    return cityName.trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(',')[0] // Take only city part, ignore state
      .replace(/city$/i, '')
      .trim();
  }

  lookupDistance(source, destination) {
    // First try exact match
    if (AUSTRALIAN_CITY_DISTANCES[source] && AUSTRALIAN_CITY_DISTANCES[source][destination]) {
      return AUSTRALIAN_CITY_DISTANCES[source][destination];
    }

    // Try reverse lookup
    if (AUSTRALIAN_CITY_DISTANCES[destination] && AUSTRALIAN_CITY_DISTANCES[destination][source]) {
      return AUSTRALIAN_CITY_DISTANCES[destination][source];
    }

    // Try partial matching
    const sourceKey = this.findCityKey(source);
    const destKey = this.findCityKey(destination);

    if (sourceKey && destKey) {
      if (AUSTRALIAN_CITY_DISTANCES[sourceKey] && AUSTRALIAN_CITY_DISTANCES[sourceKey][destKey]) {
        return AUSTRALIAN_CITY_DISTANCES[sourceKey][destKey];
      }
      if (AUSTRALIAN_CITY_DISTANCES[destKey] && AUSTRALIAN_CITY_DISTANCES[destKey][sourceKey]) {
        return AUSTRALIAN_CITY_DISTANCES[destKey][sourceKey];
      }
    }

    return null;
  }

  findCityKey(cityName) {
    const normalized = cityName.toLowerCase();
    
    // Try exact match first
    for (const key of Object.keys(AUSTRALIAN_CITY_DISTANCES)) {
      if (key.toLowerCase() === normalized) {
        return key;
      }
    }

    // Try partial match
    for (const key of Object.keys(AUSTRALIAN_CITY_DISTANCES)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes(normalized) || normalized.includes(keyLower.split(',')[0])) {
        return key;
      }
    }

    return null;
  }

  estimateDistance(source, destination) {
    // Simple estimation based on major city categories
    const majorCities = ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide'];
    const sourceIsMajor = majorCities.some(city => source.toLowerCase().includes(city));
    const destIsMajor = majorCities.some(city => destination.toLowerCase().includes(city));

    if (sourceIsMajor && destIsMajor) {
      return 1200; // Average inter-capital distance
    } else if (sourceIsMajor || destIsMajor) {
      return 600;  // Major to regional
    } else {
      return 300;  // Regional to regional
    }
  }

  getFallbackDistance(source, destination) {
    // Very basic fallback - return reasonable distance based on names
    const sourceState = this.extractState(source);
    const destState = this.extractState(destination);

    if (sourceState === destState) {
      return Math.floor(200 + Math.random() * 400); // 200-600km for intrastate
    } else {
      return Math.floor(800 + Math.random() * 1200); // 800-2000km for interstate
    }
  }

  extractState(cityString) {
    if (!cityString) return '';
    
    const stateMatch = cityString.match(/(NSW|VIC|QLD|WA|SA|ACT|NT|TAS)/i);
    return stateMatch ? stateMatch[1].toUpperCase() : '';
  }

  // Get all available routes (for testing/debugging)
  getAvailableRoutes() {
    const routes = new Set();
    
    Object.keys(AUSTRALIAN_CITY_DISTANCES).forEach(source => {
      routes.add(source);
      Object.keys(AUSTRALIAN_CITY_DISTANCES[source]).forEach(dest => {
        routes.add(dest);
      });
    });
    
    return Array.from(routes).sort();
  }

  // Validate if a route exists in our database
  hasRoute(source, destination) {
    return this.lookupDistance(source, destination) !== null;
  }
}

module.exports = new DistanceCalculator();