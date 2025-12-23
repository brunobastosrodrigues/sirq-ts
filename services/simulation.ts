import { Agent, AgentType, Charger, StationState, SimulationConfig, HistoricalDataPoint, MicroDataPoint } from '../types';

// Helper to generate random ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// Scientific Profiles
const TRUCK_PROFILES = {
  [AgentType.CRITICAL]: {
    votRange: [150.0, 300.0],
    priceSensitivity: 0.1,
    maxPriceTolerance: 5.00,
    patience: 240, // minutes
  },
  [AgentType.STANDARD]: {
    votRange: [50.0, 80.0],
    priceSensitivity: 0.5,
    maxPriceTolerance: 1.50,
    patience: 120, // minutes
  },
  [AgentType.ECONOMY]: {
    votRange: [15.0, 30.0],
    priceSensitivity: 0.9,
    maxPriceTolerance: 0.80,
    patience: 45, // minutes
  },
};

export class SimulationEngine {
  fifoState: StationState;
  sirqState: StationState;
  config: SimulationConfig;
  tickCount: number;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.tickCount = 0;
    this.fifoState = this.initializeState('FIFO');
    this.sirqState = this.initializeState('SIRQ');
  }

  private initializeState(strategy: 'FIFO' | 'SIRQ'): StationState {
    return {
      strategy,
      chargers: Array.from({ length: this.config.numChargers }, (_, i) => ({
        id: i,
        status: 'idle',
        currentAgent: null,
        timeRemaining: 0,
      })),
      queue: [],
      processedCount: 0,
      balkedCount: 0,
      revenue: 0,
      currentPrice: this.config.baseGridPrice,
      avgWaitTime: 0,
      // Granular
      avgWaitTimeCritical: 0,
      avgWaitTimeStandard: 0,
      avgWaitTimeEconomy: 0,
      processedCritical: 0,
      processedStandard: 0,
      processedEconomy: 0,
    };
  }

  // Generate a random agent based on Traffic Mix probabilities
  private generateAgent(currentTick: number): Agent {
    const rand = Math.random();
    let type = AgentType.ECONOMY;
    
    const pCrit = this.config.probCritical;
    const pStd = this.config.probStandard;
    
    if (rand < pCrit) {
        type = AgentType.CRITICAL;
    } else if (rand < pCrit + pStd) {
        type = AgentType.STANDARD;
    } else {
        type = AgentType.ECONOMY;
    }

    const profile = TRUCK_PROFILES[type];
    const vot = Math.floor(
        Math.random() * (profile.votRange[1] - profile.votRange[0]) + profile.votRange[0]
    );

    return {
      id: generateId(),
      type,
      vot,
      arrivalTime: currentTick,
      bid: 0, 
      patience: profile.patience,
      maxPriceTolerance: profile.maxPriceTolerance,
      status: 'queueing',
      energyDelivered: 0
    };
  }

  private updatePrice(state: StationState) {
    if (!this.config.smartPricing) {
      state.currentPrice = this.config.baseGridPrice;
      return;
    }
    
    const busyChargers = state.chargers.filter(c => c.status === 'busy').length;
    const utilization = busyChargers / state.chargers.length;
    const queueFactor = Math.min(state.queue.length / (state.chargers.length * 2), 1.0);

    let surgeMultiplier = 1 + (utilization * this.config.surgeSensitivity) + (queueFactor * this.config.surgeSensitivity);
    let price = this.config.baseGridPrice * surgeMultiplier;
    
    if (price > this.config.maxPriceCap) price = this.config.maxPriceCap;
    state.currentPrice = parseFloat(price.toFixed(2));
  }

  private calculateBid(agent: Agent, currentPricePerKwh: number, queueLength: number): number {
    const energyCost = currentPricePerKwh * this.config.batteryCapacity;
    const baseCost = energyCost + this.config.baseServiceFee;
    const chargeDuration = (this.config.batteryCapacity / this.config.chargerPower) * 60;
    const expectedWaitMinutes = (queueLength / this.config.numChargers) * chargeDuration;
    const timeValue = (agent.vot / 60) * expectedWaitMinutes;
    return parseFloat((baseCost + timeValue).toFixed(2));
  }

  private updateProfileStats(state: StationState, type: AgentType, waitTime: number) {
      if (type === AgentType.CRITICAL) {
          state.avgWaitTimeCritical = ((state.avgWaitTimeCritical * state.processedCritical) + waitTime) / (state.processedCritical + 1);
          state.processedCritical++;
      } else if (type === AgentType.STANDARD) {
          state.avgWaitTimeStandard = ((state.avgWaitTimeStandard * state.processedStandard) + waitTime) / (state.processedStandard + 1);
          state.processedStandard++;
      } else {
          state.avgWaitTimeEconomy = ((state.avgWaitTimeEconomy * state.processedEconomy) + waitTime) / (state.processedEconomy + 1);
          state.processedEconomy++;
      }
  }

  // New Physics: Calculate Charge Speed based on SoC (State of Charge)
  private getChargeRate(currentEnergy: number, capacity: number, maxPower: number): number {
      const soc = currentEnergy / capacity;
      
      // Fast charging curve logic:
      // 0% - 80%: Full speed (1.0 factor)
      // 80% - 100%: Linear decay to 10% speed
      
      if (soc < 0.8) {
          return maxPower; 
      } else {
          // Slope from 1.0 down to 0.1 over the range 0.8 to 1.0
          // formula: rate = 1.0 - ((soc - 0.8) / 0.2) * 0.9
          const decay = ((soc - 0.8) / 0.2) * 0.9;
          const factor = 1.0 - decay;
          // Ensure we don't stall completely, min 5kW
          return Math.max(maxPower * factor, 5.0);
      }
  }

  private processStation(state: StationState, newAgent: Agent | null): MicroDataPoint[] {
    const microUpdates: MicroDataPoint[] = [];

    // 1. Update Pricing
    this.updatePrice(state);

    // 2. Handle New Arrival
    if (newAgent) {
      const agent = { ...newAgent };
      if (state.currentPrice > agent.maxPriceTolerance) {
        state.balkedCount++;
        // Record balking micro-data? Not for now, mainly completed ones for charts
      } else {
        if (state.strategy === 'SIRQ') {
            agent.bid = this.calculateBid(agent, state.currentPrice, state.queue.length);
        }
        state.queue.push(agent);
      }
    }

    // 3. Queue Management
    state.queue = state.queue.filter(a => {
        const waited = this.tickCount - a.arrivalTime;
        if (waited > a.patience) {
            state.balkedCount++;
            return false;
        }
        return true;
    });

    if (state.strategy === 'SIRQ') {
        state.queue.sort((a, b) => {
            if (b.bid !== a.bid) return b.bid - a.bid;
            return a.arrivalTime - b.arrivalTime;
        });
    } else {
        state.queue.sort((a, b) => a.arrivalTime - b.arrivalTime);
    }

    // 4. Charger Logic (Preemption & Charging)
    // Removed fixed duration calculation, now dynamic based on SoC

    // PREEMPTION
    if (state.strategy === 'SIRQ' && state.queue.length > 0) {
        const topCandidate = state.queue[0];
        let lowestBidCharger: Charger | null = null;
        let minBid = Infinity;

        state.chargers.forEach(c => {
            if (c.status === 'busy' && c.currentAgent) {
                if (c.currentAgent.bid < minBid) {
                    minBid = c.currentAgent.bid;
                    lowestBidCharger = c;
                }
            } else if (c.status === 'idle') {
                minBid = -1; 
            }
        });

        if (minBid !== -1 && lowestBidCharger && lowestBidCharger.currentAgent) {
            if (topCandidate.bid > minBid * this.config.preemptionPremium) {
                const evictedAgent = lowestBidCharger.currentAgent;
                evictedAgent.status = 'preempted';
                state.queue.push(evictedAgent); 
                state.queue.shift(); 
                lowestBidCharger.currentAgent = topCandidate;
                lowestBidCharger.currentAgent.status = 'charging';
                lowestBidCharger.currentAgent.enteredChargingAt = this.tickCount;
                // timeRemaining is now calculated dynamically
            }
        }
    }

    // Standard Processing
    state.chargers.forEach(charger => {
      if (charger.status === 'busy' && charger.currentAgent) {
         
         // Non-Linear Charging Physics
         const currentRateKw = this.getChargeRate(
             charger.currentAgent.energyDelivered, 
             this.config.batteryCapacity, 
             this.config.chargerPower
         );
         
         const kwhPerTick = currentRateKw / 60;
         charger.currentAgent.energyDelivered += kwhPerTick;
         
         // Visual estimation of time remaining (for UI only, not strict logic control)
         // Estimate: Remaining kWh / Current Rate
         const remainingKwh = this.config.batteryCapacity - charger.currentAgent.energyDelivered;
         charger.timeRemaining = (remainingKwh / kwhPerTick);

        if (charger.currentAgent.energyDelivered >= this.config.batteryCapacity) {
           charger.status = 'idle';
           if (charger.currentAgent) {
               state.processedCount++;
               let revenue = 0;
               let pricePaid = 0;

               if (state.strategy === 'SIRQ') {
                   revenue = charger.currentAgent.bid;
                   pricePaid = revenue / this.config.batteryCapacity; // Effective rate
               } else {
                   revenue = (state.currentPrice * this.config.batteryCapacity) + this.config.baseServiceFee;
                   pricePaid = state.currentPrice;
               }
               state.revenue += revenue;

               const waitTime = (charger.currentAgent.enteredChargingAt || this.tickCount) - charger.currentAgent.arrivalTime;
               
               // Global average
               state.avgWaitTime = ((state.avgWaitTime * (state.processedCount - 1)) + waitTime) / state.processedCount;
               
               // Profile specific average
               this.updateProfileStats(state, charger.currentAgent.type, waitTime);

               // Add to micro data
               microUpdates.push({
                   tick: this.tickCount,
                   strategy: state.strategy,
                   type: charger.currentAgent.type,
                   vot: charger.currentAgent.vot,
                   bid: charger.currentAgent.bid,
                   waitTime,
                   pricePaid
               });
           }
           charger.currentAgent = null;
        }
      }

      if (charger.status === 'idle' && state.queue.length > 0) {
        const nextAgent = state.queue.shift();
        if (nextAgent) {
            charger.status = 'busy';
            charger.currentAgent = nextAgent;
            charger.currentAgent.status = 'charging';
            charger.currentAgent.enteredChargingAt = this.tickCount;
            // timeRemaining is dynamic now
        }
      }
    });

    return microUpdates;
  }

  public tick(): { fifo: StationState, sirq: StationState, historical: HistoricalDataPoint, microData: MicroDataPoint[] } {
    this.tickCount++;

    let newAgent: Agent | null = null;
    if (Math.random() < this.config.arrivalRate) {
      newAgent = this.generateAgent(this.tickCount);
    }

    const fifoMicro = this.processStation(this.fifoState, newAgent);
    const sirqMicro = this.processStation(this.sirqState, newAgent);

    return {
        fifo: this.fifoState,
        sirq: this.sirqState,
        microData: [...fifoMicro, ...sirqMicro],
        historical: {
            tick: this.tickCount,
            fifoRevenue: this.fifoState.revenue,
            sirqRevenue: this.sirqState.revenue,
            fifoBalked: this.fifoState.balkedCount,
            sirqBalked: this.sirqState.balkedCount,
            
            fifoWaitCritical: this.fifoState.avgWaitTimeCritical,
            sirqWaitCritical: this.sirqState.avgWaitTimeCritical,
            
            fifoWaitEconomy: this.fifoState.avgWaitTimeEconomy,
            sirqWaitEconomy: this.sirqState.avgWaitTimeEconomy,
            
            price: this.fifoState.currentPrice
        }
    };
  }
}