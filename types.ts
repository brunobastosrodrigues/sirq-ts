
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
  balkedPrice: number; // Breakdown of balked
  balkedWait: number;  // Breakdown of balked
  revenue: number;
  currentPrice: number; // $/kWh
  recentLogs: string[]; // For Explainability: text log of events

  // Operational Metrics
  slaViolations: number;
  currentGridLoad: number; // kW
  peakGridLoad: number; // kW
  
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
  electricityCostPerKwh: number; // Base energy cost to CPO
  peakDemandCharge: number; // $/kW for peak load
  auctionIncrement: number; // $
  preemptionPremium: number; // Multiplier (e.g. 1.2)
  
  // Grid Constraints
  gridConnectionLimit: number; // Physical limit (kW)

  // Smart Pricing
  smartPricing: boolean;
  surgeSensitivity: number; // 0.5
  maxPriceCap: number; // $/kWh
  
  // Traffic Mix (Probabilities)
  probCritical: number;
  probStandard: number;
  probEconomy: number;
  
  // Temporal Dynamics
  enableRushHours: boolean;
  rushHourMultiplier: number;

  // Profiles (Editable)
  profiles: Record<AgentType, AgentProfile>;

  // Simulation
  numChargers: number;
  arrivalRate: number; // Prob per tick
  simulationSpeed: number;
}

export interface HistoricalDataPoint {
  tick: number;
  // Efficiency & Financial
  fifoRevenue: number;
  sirqRevenue: number;
  fifoEnergyCost: number;
  sirqEnergyCost: number;
  fifoDemandPenalty: number;
  sirqDemandPenalty: number;

  fifoBalked: number;
  sirqBalked: number;
  fifoBalkedPrice: number;
  sirqBalkedPrice: number;
  fifoBalkedWait: number;
  sirqBalkedWait: number;
  
  // Reliability
  fifoWaitCritical: number;
  sirqWaitCritical: number;
  
  // Split Failure Rates for Comparison
  fifoFailureRate: number; 
  sirqFailureRate: number;

  fifoSlaViolations: number;
  sirqSlaViolations: number;

  preemptions: number; // Count of auction swaps
  
  // Grid
  fifoGridLoad: number;
  sirqGridLoad: number;

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
