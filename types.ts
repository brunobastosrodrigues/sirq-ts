
export enum AgentType {
  CRITICAL = 'CRITICAL', // JIT / Perishable
  STANDARD = 'STANDARD', // FMCG / Corp Fleet
  ECONOMY = 'ECONOMY',   // Bulk / Owner-Operator
}

export interface AgentProfile {
  minVot: number;
  maxVot: number;
  patience: number;
  priceSensitivity: number;
  maxPriceTolerance: number;
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
  hasReservation: boolean; // Thesis Ch 3.5: Route planning guarantee
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
  
  // Profiles (Editable)
  profiles: Record<AgentType, AgentProfile>;

  // Simulation
  numChargers: number;
  arrivalRate: number; // Prob per tick
  simulationSpeed: number;
}

export interface HistoricalDataPoint {
  tick: number;
  // Efficiency
  fifoRevenue: number;
  sirqRevenue: number;
  fifoBalked: number;
  sirqBalked: number;
  
  // Reliability
  fifoWaitCritical: number;
  sirqWaitCritical: number;
  
  // Split Failure Rates for Comparison
  fifoFailureRate: number; 
  sirqFailureRate: number;

  preemptions: number; // Count of auction swaps
  
  // Pricing & Sensitivity
  price: number;
  utilization: number; // 0.0 to 1.0
  queueLength: number;
  surgeMultiplier: number; 
  
  // Equity
  fifoWaitEconomy: number;
  sirqWaitEconomy: number;
  giniCoefficient: number; // 0.0 to 1.0 (Wait time inequality)
  subsidyPool: number; // $ Accumulated surplus from auctions
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

export interface SimulationSnapshot {
  tickCount: number;
  fifoState: StationState;
  sirqState: StationState;
  // Separate counters for proper resumption
  fifoCumulativeCriticalArrivals: number;
  fifoCumulativeCriticalFailures: number;
  sirqCumulativeCriticalArrivals: number;
  sirqCumulativeCriticalFailures: number;
  cumulativeSirqSurplus: number;
  cumulativePreemptions: number;
  allWaitTimes: number[];
}
