const moment = require('moment');

// Australian peak hours configuration
const PEAK_HOURS = [
  {
    name: 'MORNING_PEAK',
    label: 'Morning Peak',
    start: '07:30',
    end: '10:00',
    multiplier: 1.35,
    description: 'Morning commute - High traffic congestion'
  },
  {
    name: 'AFTERNOON_PEAK',
    label: 'Afternoon Peak', 
    start: '14:30',
    end: '16:00',
    multiplier: 1.25,
    description: 'School pickup and early commute - Moderate traffic'
  },
  {
    name: 'EVENING_PEAK',
    label: 'Evening Peak',
    start: '17:00',
    end: '19:00',
    multiplier: 1.40,
    description: 'Evening commute - Severe traffic congestion'
  }
];

// Time slots that should be avoided for optimal delivery
const TIME_SLOT_PREFERENCES = {
  'early-morning': { start: '06:00', end: '08:00', preference: 'good' },
  'morning': { start: '08:00', end: '12:00', preference: 'fair' },
  'afternoon': { start: '12:00', end: '17:00', preference: 'good' },
  'evening': { start: '17:00', end: '20:00', preference: 'poor' }
};

class PeakHoursService {
  constructor() {
    // Cache current peak hours status
    this.lastCheck = null;
    this.cachedStatus = null;
  }

  calculatePeakHoursImpact(pickupDate, pickupTime, deliveryDate, deliveryTime) {
    try {
      let totalDelay = 0;
      const impacts = [];

      // Analyze pickup time impact
      if (pickupDate && pickupTime) {
        const pickupImpact = this.analyzeTimeSlotImpact(pickupDate, pickupTime, 'pickup');
        if (pickupImpact.delay > 0) {
          totalDelay += pickupImpact.delay;
          impacts.push(pickupImpact);
        }
      }

      // Analyze delivery time impact
      if (deliveryDate && deliveryTime) {
        const deliveryImpact = this.analyzeTimeSlotImpact(deliveryDate, deliveryTime, 'delivery');
        if (deliveryImpact.delay > 0) {
          totalDelay += deliveryImpact.delay;
          impacts.push(deliveryImpact);
        }
      }

      // Estimate transit impact based on time of travel
      const transitImpact = this.estimateTransitPeakImpact(pickupDate, pickupTime);
      if (transitImpact.delay > 0) {
        totalDelay += transitImpact.delay;
        impacts.push(transitImpact);
      }

      return {
        totalDelay: Math.round(totalDelay * 10) / 10,
        impacts,
        recommendations: this.generateRecommendations(impacts)
      };

    } catch (error) {
      console.error('Peak hours calculation error:', error);
      return {
        totalDelay: 0,
        impacts: [],
        recommendations: []
      };
    }
  }

  analyzeTimeSlotImpact(date, timeSlot, type) {
    // Convert time slot to actual hours for analysis
    let timeRange;
    switch (timeSlot) {
      case 'early-morning':
        timeRange = { start: 6, end: 8 };
        break;
      case 'morning':
        timeRange = { start: 8, end: 12 };
        break;
      case 'afternoon':
        timeRange = { start: 12, end: 17 };
        break;
      case 'evening':
        timeRange = { start: 17, end: 20 };
        break;
      default:
        return { delay: 0, peakPeriod: null };
    }

    // Check if time range overlaps with peak hours
    let maxDelay = 0;
    let peakPeriod = null;

    PEAK_HOURS.forEach(peak => {
      const peakStart = this.timeToHours(peak.start);
      const peakEnd = this.timeToHours(peak.end);

      // Check for overlap
      if (this.hasTimeOverlap(timeRange.start, timeRange.end, peakStart, peakEnd)) {
        const overlapDuration = this.calculateOverlapDuration(
          timeRange.start, timeRange.end, peakStart, peakEnd
        );
        const delay = overlapDuration * (peak.multiplier - 1) * 0.5; // Factor in the delay
        
        if (delay > maxDelay) {
          maxDelay = delay;
          peakPeriod = peak;
        }
      }
    });

    return {
      delay: maxDelay,
      peakPeriod,
      type,
      timeSlot,
      date
    };
  }

  estimateTransitPeakImpact(pickupDate, pickupTime) {
    if (!pickupDate || !pickupTime) {
      return { delay: 0, peakPeriod: null };
    }

    // Estimate that transit will occur 2-4 hours after pickup
    const timeRange = this.getTimeSlotRange(pickupTime);
    if (!timeRange) return { delay: 0, peakPeriod: null };

    // Estimate transit time window (2-4 hours after pickup)
    const transitStart = timeRange.start + 2;
    const transitEnd = timeRange.start + 4;

    let maxDelay = 0;
    let peakPeriod = null;

    PEAK_HOURS.forEach(peak => {
      const peakStart = this.timeToHours(peak.start);
      const peakEnd = this.timeToHours(peak.end);

      if (this.hasTimeOverlap(transitStart, transitEnd, peakStart, peakEnd)) {
        const overlapDuration = this.calculateOverlapDuration(
          transitStart, transitEnd, peakStart, peakEnd
        );
        const delay = overlapDuration * (peak.multiplier - 1) * 0.8; // Transit delay factor
        
        if (delay > maxDelay) {
          maxDelay = delay;
          peakPeriod = peak;
        }
      }
    });

    return {
      delay: maxDelay,
      peakPeriod,
      type: 'transit',
      estimatedWindow: `${this.hoursToTime(transitStart)}-${this.hoursToTime(transitEnd)}`
    };
  }

  getTimeSlotRange(timeSlot) {
    return TIME_SLOT_PREFERENCES[timeSlot] ? {
      start: this.timeToHours(TIME_SLOT_PREFERENCES[timeSlot].start),
      end: this.timeToHours(TIME_SLOT_PREFERENCES[timeSlot].end)
    } : null;
  }

  hasTimeOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
  }

  calculateOverlapDuration(start1, end1, start2, end2) {
    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);
    return Math.max(0, overlapEnd - overlapStart);
  }

  timeToHours(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours + (minutes / 60);
  }

  hoursToTime(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  generateRecommendations(impacts) {
    const recommendations = [];

    // Analyze patterns and suggest improvements
    const hasPickupImpact = impacts.some(i => i.type === 'pickup');
    const hasDeliveryImpact = impacts.some(i => i.type === 'delivery');
    const hasTransitImpact = impacts.some(i => i.type === 'transit');

    if (hasPickupImpact) {
      recommendations.push({
        type: 'pickup',
        priority: 'high',
        title: 'Consider Earlier Pickup',
        description: 'Schedule pickup during early morning (6:00-7:30 AM) to avoid peak traffic'
      });
    }

    if (hasDeliveryImpact) {
      recommendations.push({
        type: 'delivery',
        priority: 'medium',
        title: 'Adjust Delivery Window',
        description: 'Consider mid-day delivery (12:00-2:30 PM) for optimal timing'
      });
    }

    if (hasTransitImpact) {
      recommendations.push({
        type: 'routing',
        priority: 'medium',
        title: 'Alternative Routing',
        description: 'Use highway routes during peak hours to minimize city traffic impact'
      });
    }

    // Add general recommendations
    if (impacts.length > 1) {
      recommendations.push({
        type: 'general',
        priority: 'high',
        title: 'Peak Hours Coordination',
        description: 'Multiple peak hour conflicts detected. Consider rescheduling for off-peak delivery'
      });
    }

    return recommendations;
  }

  getCurrentPeakHours() {
    const now = moment();
    const currentTime = now.format('HH:mm');
    const currentHour = this.timeToHours(currentTime);

    const activePeaks = PEAK_HOURS.filter(peak => {
      const peakStart = this.timeToHours(peak.start);
      const peakEnd = this.timeToHours(peak.end);
      return currentHour >= peakStart && currentHour <= peakEnd;
    });

    // Find next peak period
    const nextPeak = PEAK_HOURS.find(peak => {
      const peakStart = this.timeToHours(peak.start);
      return peakStart > currentHour;
    });

    return {
      current: activePeaks.length > 0 ? activePeaks[0] : null,
      next: nextPeak,
      currentTime,
      isCurrentlyPeak: activePeaks.length > 0,
      allPeakPeriods: PEAK_HOURS
    };
  }

  getOptimalDeliveryWindows(date) {
    const optimalWindows = [];

    // Early morning window (before morning peak)
    optimalWindows.push({
      name: 'Early Morning',
      start: '06:00',
      end: '07:30',
      preference: 'excellent',
      traffic: 'minimal',
      description: 'Minimal traffic, easy access, early business hours'
    });

    // Mid-morning window (after morning peak)
    optimalWindows.push({
      name: 'Mid Morning',
      start: '10:00',
      end: '12:00',
      preference: 'good',
      traffic: 'light',
      description: 'Light traffic, good business hours'
    });

    // Early afternoon window (before afternoon peak)
    optimalWindows.push({
      name: 'Early Afternoon',
      start: '12:00',
      end: '14:30',
      preference: 'very good',
      traffic: 'minimal',
      description: 'Lunch period, minimal traffic, good access'
    });

    // Late afternoon window (between peaks)
    optimalWindows.push({
      name: 'Late Afternoon',
      start: '16:00',
      end: '17:00',
      preference: 'fair',
      traffic: 'moderate',
      description: 'Building traffic, still acceptable'
    });

    return optimalWindows;
  }

  // Public method to get current status
  getPeakHoursStatus() {
    // Cache for 5 minutes to avoid excessive calculations
    const now = Date.now();
    if (this.lastCheck && (now - this.lastCheck) < 300000) {
      return this.cachedStatus;
    }

    this.cachedStatus = this.getCurrentPeakHours();
    this.lastCheck = now;
    
    return this.cachedStatus;
  }

  // Method to check if a specific time is during peak hours
  isTimeInPeakHours(time) {
    const hour = this.timeToHours(time);
    
    return PEAK_HOURS.some(peak => {
      const peakStart = this.timeToHours(peak.start);
      const peakEnd = this.timeToHours(peak.end);
      return hour >= peakStart && hour <= peakEnd;
    });
  }
}

module.exports = new PeakHoursService();