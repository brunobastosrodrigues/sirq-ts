/**
 * EPFL EV Charging Dataset Loader
 *
 * Provides calibration data based on the EPFL EV charging dataset.
 * Uses embedded default values for browser compatibility.
 *
 * Source: https://github.com/DESL-EPFL/Level-3-EV-charging-dataset
 */

export interface EPFLCalibration {
  metadata: {
    source: string;
    location: string;
    period: string;
    total_sessions: number;
    charger_type: string;
    num_chargers: number;
  };
  arrival: {
    hourly_probability: Record<string, number>;
    day_of_week_multiplier: Record<string, number>;
    description: string;
  };
  session: {
    duration_mean: number;
    duration_std: number;
    duration_median: number;
    duration_p25: number;
    duration_p75: number;
  };
  energy: {
    energy_mean_kwh: number;
    energy_std_kwh: number;
    energy_median_kwh: number;
  };
  soc: {
    soc_arrival_mean: number;
    soc_arrival_std: number;
    soc_arrival_median: number;
  };
  battery: {
    capacity_mean_kwh: number;
    capacity_std_kwh: number;
    capacity_median_kwh: number;
  };
  derived: {
    mean_arrivals_per_day: number;
    avg_arrival_rate_per_minute: number;
    peak_hours: number[];
    rush_hour_multiplier: number;
  };
}

export interface EPFLSession {
  arrival_minutes: number;
  arrival_dow: number;
  duration_min: number;
  energy_kwh: number;
  soc_arrival: number | null;
  soc_departure: number | null;
  battery_capacity_kwh: number | null;
}

// Cached calibration data
let cachedCalibration: EPFLCalibration | null = null;
let cachedSessions: EPFLSession[] | null = null;

/**
 * Load calibration data (uses embedded defaults for browser compatibility)
 */
export function loadCalibration(): EPFLCalibration {
  if (cachedCalibration) return cachedCalibration;
  cachedCalibration = getDefaultCalibration();
  return cachedCalibration;
}

/**
 * Load session data (returns empty array for browser compatibility)
 */
export function loadSessions(): EPFLSession[] {
  if (cachedSessions) return cachedSessions;
  cachedSessions = [];
  return cachedSessions;
}

/**
 * Get the calibration data (alias for loadCalibration)
 */
export function getEPFLCalibration(): EPFLCalibration {
  return loadCalibration();
}

/**
 * Get arrival probability for a specific time
 */
export function getArrivalProbability(
  timeOfDayMinutes: number,
  dayOfWeek: number = 0,
  scaleFactor: number = 1.0
): number {
  const calibration = loadCalibration();
  const hour = Math.floor(timeOfDayMinutes / 60) % 24;
  const baseProb = calibration.arrival.hourly_probability[hour.toString()] || 0.002;
  const dowMultiplier = calibration.arrival.day_of_week_multiplier[dayOfWeek.toString()] || 1.0;

  return baseProb * dowMultiplier * scaleFactor;
}

/**
 * Generate a realistic value from normal distribution
 */
function normalRandom(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

/**
 * Generate a realistic session duration based on calibration data
 */
export function generateSessionDuration(): number {
  const cal = loadCalibration();
  const duration = normalRandom(cal.session.duration_mean, cal.session.duration_std);
  return Math.round(Math.max(5, Math.min(120, duration)));
}

/**
 * Generate a realistic battery capacity
 */
export function generateBatteryCapacity(isTruck: boolean = false): number {
  const cal = loadCalibration();
  let capacity = normalRandom(cal.battery.capacity_mean_kwh, cal.battery.capacity_std_kwh);
  capacity = Math.max(30, Math.min(150, capacity));

  if (isTruck) {
    capacity = capacity * 7; // Scale for trucks
    capacity = Math.max(300, Math.min(800, capacity));
  }

  return Math.round(capacity);
}

/**
 * Generate a realistic SOC at arrival
 */
export function generateArrivalSOC(): number {
  const cal = loadCalibration();
  const soc = normalRandom(cal.soc.soc_arrival_mean, cal.soc.soc_arrival_std);
  return Math.round(Math.max(5, Math.min(80, soc)));
}

/**
 * Get hourly arrival rate array for visualization
 */
export function getHourlyArrivalRates(): number[] {
  const cal = loadCalibration();
  const rates: number[] = [];
  for (let h = 0; h < 24; h++) {
    rates.push(cal.arrival.hourly_probability[h.toString()] || 0);
  }
  return rates;
}

/**
 * Default calibration if file not found
 */
function getDefaultCalibration(): EPFLCalibration {
  return {
    metadata: {
      source: "Default (EPFL-based estimates)",
      location: "Generic",
      period: "N/A",
      total_sessions: 0,
      charger_type: "DC Fast Charger",
      num_chargers: 2
    },
    arrival: {
      hourly_probability: {
        "0": 0.0005, "1": 0.0005, "2": 0.0003, "3": 0.0002, "4": 0.0002, "5": 0.0005,
        "6": 0.001, "7": 0.0015, "8": 0.0025, "9": 0.004, "10": 0.004, "11": 0.005,
        "12": 0.005, "13": 0.0045, "14": 0.0048, "15": 0.0057, "16": 0.0054, "17": 0.0055,
        "18": 0.0058, "19": 0.0042, "20": 0.003, "21": 0.0033, "22": 0.0018, "23": 0.001
      },
      day_of_week_multiplier: {
        "0": 0.9, "1": 1.1, "2": 1.0, "3": 1.0, "4": 1.15, "5": 1.0, "6": 0.9
      },
      description: "Default arrival probabilities per minute"
    },
    session: { duration_mean: 33, duration_std: 18, duration_median: 30, duration_p25: 20, duration_p75: 42 },
    energy: { energy_mean_kwh: 32, energy_std_kwh: 19, energy_median_kwh: 29 },
    soc: { soc_arrival_mean: 34, soc_arrival_std: 19, soc_arrival_median: 31 },
    battery: { capacity_mean_kwh: 70, capacity_std_kwh: 30, capacity_median_kwh: 73 },
    derived: { mean_arrivals_per_day: 4.2, avg_arrival_rate_per_minute: 0.003, peak_hours: [11, 12, 15, 16, 17, 18], rush_hour_multiplier: 2.5 }
  };
}

/**
 * Clear cached data (useful for testing with different files)
 */
export function clearCache(): void {
  cachedCalibration = null;
  cachedSessions = null;
}
