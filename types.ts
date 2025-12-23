
export enum AgentType {
  CRITICAL = 'CRITICAL', // JIT / Perishable
  STANDARD = 'STANDARD', // FMCG / Corp Fleet
  ECONOMY = 'ECONOMY',   // Bulk / Owner-Operator
}

export interface Agent {
  id: string;
  type: AgentType;
  vot: number; // Value of Time ($/hr)
  arrivalTime: number;
  bid: number; // Total Willingness to Pay ($)
  patience: number; // Max wait time in ticks
  maxPriceTolerance: number; // $/kWh
  status: 'queueing' | 'charging' | 'balked' | 'completed' | 'preempted';
  enteredChargingAt?: number;
  energyDelivered: number; // kWh
}

export interface Charger {
  id: number;
  status: 'idle' | 'busy';
  currentAgent: Agent | null;
  timeRemaining: number;
}

export interface StationState {
  strategy: 'FIFO' | 'SIRQ';
  chargers: Charger[];
  queue: Agent[];
  processedCount: number;
  balkedCount: number;
  revenue: number;
  currentPrice: number; // $/kWh
  recentLogs: string[]; // For Explainability: text log of events
  
  // Granular Stats for RQs
  avgWaitTime: number;
  avgWaitTimeCritical: number;
  avgWaitTimeStandard: number;
  avgWaitTimeEconomy: number;
  
  processedCritical: number;
  processedStandard: number;
  processedEconomy: number;
}

export interface SimulationConfig {
  // Physics
  chargerPower: number; // kW
  batteryCapacity: number; // kWh
  
  // Economics
  baseGridPrice: number; // $/kWh
  baseServiceFee: number; // $
  auctionIncrement: number; // $
  preemptionPremium: number; // Multiplier (e.g. 1.2)
  
  // Smart Pricing
  smartPricing: boolean;
  surgeSensitivity: number; // 0.5
  maxPriceCap: number; // $/kWh
  
  // Traffic Mix (Probabilities)
  probCritical: number;
  probStandard: number;
  probEconomy: number;
  
  // Simulation
  numChargers: number;
  arrivalRate: number; // Prob per tick
  simulationSpeed: number;
}

export interface HistoricalDataPoint {
  tick: number;
  // RQ1 Efficiency
  fifoRevenue: number;
  sirqRevenue: number;
  fifoBalked: number;
  sirqBalked: number;
  // RQ2 Reliability
  fifoWaitCritical: number;
  sirqWaitCritical: number;
  // RQ3 Pricing
  price: number;
  // RQ4 Equity
  fifoWaitEconomy: number;
  sirqWaitEconomy: number;
}

export interface MicroDataPoint {
  tick: number;
  strategy: 'FIFO' | 'SIRQ';
  type: AgentType;
  vot: number;
  bid: number;
  waitTime: number;
  pricePaid: number; // $/kWh effective
}
