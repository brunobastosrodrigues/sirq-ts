import { Agent, AgentType, Charger, StationState, SimulationConfig, HistoricalDataPoint, MicroDataPoint, SimulationSnapshot } from '../types';

// Helper to generate random ID
const generateId = () => Math.random().toString(36).substr(2, 9);

export class SimulationEngine {
  fifoState: StationState;
  sirqState: StationState;
  config: SimulationConfig;
  tickCount: number;
  
  // Advanced Stats Tracking - Split by Strategy where necessary for comparison
  fifoCumulativeCriticalArrivals: number;
  fifoCumulativeCriticalFailures: number;
  
  sirqCumulativeCriticalArrivals: number;
  sirqCumulativeCriticalFailures: number;

  cumulativeSirqSurplus: number; // Subsidy Pool
  cumulativePreemptions: number;
  allWaitTimes: number[]; // For Gini

  constructor(config: SimulationConfig) {
    this.config = config;
    this.tickCount = 0;
    
    this.fifoCumulativeCriticalArrivals = 0;
    this.fifoCumulativeCriticalFailures = 0;
    this.sirqCumulativeCriticalArrivals = 0;
    this.sirqCumulativeCriticalFailures = 0;

    this.cumulativeSirqSurplus = 0;
    this.cumulativePreemptions = 0;
    this.allWaitTimes = [];
    
    this.fifoState = this.initializeState('FIFO');
    this.sirqState = this.initializeState('SIRQ');
  }

  // --- Snapshot / Restore Logic ---
  public getSnapshot(): SimulationSnapshot {
      return {
          tickCount: this.tickCount,
          // Deep copy states to prevent reference issues
          fifoState: JSON.parse(JSON.stringify(this.fifoState)),
          sirqState: JSON.parse(JSON.stringify(this.sirqState)),
          
          fifoCumulativeCriticalArrivals: this.fifoCumulativeCriticalArrivals,
          fifoCumulativeCriticalFailures: this.fifoCumulativeCriticalFailures,
          sirqCumulativeCriticalArrivals: this.sirqCumulativeCriticalArrivals,
          sirqCumulativeCriticalFailures: this.sirqCumulativeCriticalFailures,

          cumulativeSirqSurplus: this.cumulativeSirqSurplus,
          cumulativePreemptions: this.cumulativePreemptions,
          allWaitTimes: [...this.allWaitTimes]
      };
  }

  public restoreSnapshot(snapshot: SimulationSnapshot) {
      this.tickCount = snapshot.tickCount;
      this.fifoState = snapshot.fifoState;
      this.sirqState = snapshot.sirqState;
      
      this.fifoCumulativeCriticalArrivals = snapshot.fifoCumulativeCriticalArrivals;
      this.fifoCumulativeCriticalFailures = snapshot.fifoCumulativeCriticalFailures;
      this.sirqCumulativeCriticalArrivals = snapshot.sirqCumulativeCriticalArrivals;
      this.sirqCumulativeCriticalFailures = snapshot.sirqCumulativeCriticalFailures;

      this.cumulativeSirqSurplus = snapshot.cumulativeSirqSurplus;
      this.cumulativePreemptions = snapshot.cumulativePreemptions;
      this.allWaitTimes = snapshot.allWaitTimes || [];
  }
  // --------------------------------

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
      recentLogs: [],
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
        // Increment global counters for both strategies
        this.fifoCumulativeCriticalArrivals++;
        this.sirqCumulativeCriticalArrivals++;
    } else if (rand < pCrit + pStd) {
        type = AgentType.STANDARD;
    } else {
        type = AgentType.ECONOMY;
    }

    const profile = this.config.profiles[type];
    const vot = Math.floor(
        Math.random() * (profile.maxVot - profile.minVot) + profile.minVot
    );

    // Thesis Chapter 3.5: Reservations allow route planning guarantees.
    // We simulate that ~15% of arriving trucks pre-booked their spot.
    const hasReservation = Math.random() < 0.15; 

    return {
      id: generateId(),
      type,
      vot,
      arrivalTime: currentTick,
      bid: 0, 
      patience: profile.patience,
      maxPriceTolerance: profile.maxPriceTolerance,
      status: 'queueing',
      energyDelivered: 0,
      hasReservation
    };
  }

  private addLog(state: StationState, message: string) {
      state.recentLogs.unshift(message);
      if (state.recentLogs.length > 6) state.recentLogs.pop();
  }

  private calculateGiniCoefficient(values: number[]): number {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const n = sorted.length;
      let numerator = 0;
      for (let i = 0; i < n; i++) {
          numerator += (i + 1) * sorted[i];
      }
      const denominator = n * sorted.reduce((a, b) => a + b, 0);
      if (denominator === 0) return 0;
      return (2 * numerator) / denominator - (n + 1) / n;
  }

  private updatePrice(state: StationState): number {
    if (!this.config.smartPricing) {
      state.currentPrice = this.config.baseGridPrice;
      return 1.0;
    }
    
    const busyChargers = state.chargers.filter(c => c.status === 'busy').length;
    const utilization = busyChargers / state.chargers.length;
    const queueFactor = Math.min(state.queue.length / (state.chargers.length * 2), 1.0);

    let surgeMultiplier = 1 + (utilization * this.config.surgeSensitivity) + (queueFactor * this.config.surgeSensitivity);
    let price = this.config.baseGridPrice * surgeMultiplier;
    
    if (price > this.config.maxPriceCap) price = this.config.maxPriceCap;
    state.currentPrice = parseFloat(price.toFixed(2));
    
    return surgeMultiplier;
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

  private getChargeRate(currentEnergy: number, capacity: number, maxPower: number): number {
      const soc = currentEnergy / capacity;
      if (soc < 0.8) {
          return maxPower; 
      } else {
          const saturationProgress = (soc - 0.8) / 0.2; 
          const factor = Math.pow(1.0 - saturationProgress, 2);
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
      if (state.currentPrice > agent.maxPriceTolerance && !agent.hasReservation) {
        state.balkedCount++;
        
        // Count failure based on strategy
        if (agent.type === AgentType.CRITICAL) {
             if (state.strategy === 'FIFO') this.fifoCumulativeCriticalFailures++;
             else this.sirqCumulativeCriticalFailures++;
        }

        if (state.strategy === 'SIRQ') { 
             this.addLog(state, `${agent.type} agent balked (Price $${state.currentPrice.toFixed(2)} > Tolerance)`);
        }
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
        if (waited > a.patience && !a.hasReservation) {
            state.balkedCount++;
            
            // Count failure based on strategy
            if (a.type === AgentType.CRITICAL) {
                if (state.strategy === 'FIFO') this.fifoCumulativeCriticalFailures++;
                else this.sirqCumulativeCriticalFailures++;
            }

            this.addLog(state, `${a.type} agent left queue (Impatient)`);
            return false;
        }
        return true;
    });

    if (state.strategy === 'SIRQ') {
        state.queue.sort((a, b) => {
            // Priority 1: Reservations
            if (a.hasReservation && !b.hasReservation) return -1;
            if (!a.hasReservation && b.hasReservation) return 1;
            // Priority 2: Highest Bid
            if (b.bid !== a.bid) return b.bid - a.bid;
            // Priority 3: Arrival Time
            return a.arrivalTime - b.arrivalTime;
        });
    } else {
        state.queue.sort((a, b) => a.arrivalTime - b.arrivalTime);
    }

    // 4. Charger Logic
    if (state.strategy === 'SIRQ' && state.queue.length > 0) {
        const topCandidate = state.queue[0];
        let lowestBidCharger: Charger | null = null;
        let minBid = Infinity;
        let hasFreeSpot = false;

        state.chargers.forEach(c => {
            if (c.status === 'idle') {
                hasFreeSpot = true;
            } else if (c.status === 'busy' && c.currentAgent) {
                if (!c.currentAgent.hasReservation) {
                    if (c.currentAgent.bid < minBid) {
                        minBid = c.currentAgent.bid;
                        lowestBidCharger = c;
                    }
                }
            }
        });

        if (!hasFreeSpot && lowestBidCharger && lowestBidCharger.currentAgent) {
            let shouldSwap = false;
            
            if (topCandidate.hasReservation) {
                shouldSwap = true;
                this.addLog(state, `RESERVATION: ${topCandidate.type} claimed spot from ${lowestBidCharger.currentAgent.type}`);
            } 
            else if (topCandidate.bid > minBid * this.config.preemptionPremium) {
                shouldSwap = true;
                this.addLog(state, `AUCTION WON: ${topCandidate.type} ($${topCandidate.bid.toFixed(0)}) bought spot from ${lowestBidCharger.currentAgent.type}`);
                this.cumulativePreemptions++;
            }

            if (shouldSwap) {
                const evictedAgent = lowestBidCharger.currentAgent;
                evictedAgent.status = 'preempted';
                state.queue.push(evictedAgent); 
                state.queue.shift(); 
                lowestBidCharger.currentAgent = topCandidate;
                lowestBidCharger.currentAgent.status = 'charging';
                lowestBidCharger.currentAgent.enteredChargingAt = this.tickCount;
            }
        }
    }

    // Standard Processing
    state.chargers.forEach(charger => {
      if (charger.status === 'busy' && charger.currentAgent) {
         
         const currentRateKw = this.getChargeRate(
             charger.currentAgent.energyDelivered, 
             this.config.batteryCapacity, 
             this.config.chargerPower
         );
         
         const kwhPerTick = currentRateKw / 60;
         charger.currentAgent.energyDelivered += kwhPerTick;
         
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
                   pricePaid = revenue / this.config.batteryCapacity;
                   
                   const baseCost = (this.config.baseGridPrice * this.config.batteryCapacity) + this.config.baseServiceFee;
                   const surplus = Math.max(0, revenue - baseCost);
                   this.cumulativeSirqSurplus += surplus;

               } else {
                   revenue = (state.currentPrice * this.config.batteryCapacity) + this.config.baseServiceFee;
                   pricePaid = state.currentPrice;
               }
               state.revenue += revenue;

               const waitTime = (charger.currentAgent.enteredChargingAt || this.tickCount) - charger.currentAgent.arrivalTime;
               
               state.avgWaitTime = ((state.avgWaitTime * (state.processedCount - 1)) + waitTime) / state.processedCount;
               this.allWaitTimes.push(waitTime);

               this.updateProfileStats(state, charger.currentAgent.type, waitTime);

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
    
    // Utilization (SIRQ)
    const busyChargers = this.sirqState.chargers.filter(c => c.status === 'busy').length;
    const utilization = busyChargers / this.sirqState.chargers.length;
    
    const queueFactor = Math.min(this.sirqState.queue.length / (this.sirqState.chargers.length * 2), 1.0);
    const surgeMultiplier = 1 + (utilization * this.config.surgeSensitivity) + (queueFactor * this.config.surgeSensitivity);

    // Calculate rates separated
    const fifoFailureRate = this.fifoCumulativeCriticalArrivals > 0 
        ? (this.fifoCumulativeCriticalFailures / this.fifoCumulativeCriticalArrivals) 
        : 0;
    
    const sirqFailureRate = this.sirqCumulativeCriticalArrivals > 0
        ? (this.sirqCumulativeCriticalFailures / this.sirqCumulativeCriticalArrivals)
        : 0;

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
            
            // New Split Metrics
            fifoFailureRate,
            sirqFailureRate,
            
            fifoWaitEconomy: this.fifoState.avgWaitTimeEconomy,
            sirqWaitEconomy: this.sirqState.avgWaitTimeEconomy,
            
            price: this.fifoState.currentPrice,
            utilization: utilization,
            queueLength: this.sirqState.queue.length,
            surgeMultiplier: surgeMultiplier,
            
            giniCoefficient: this.calculateGiniCoefficient(this.allWaitTimes),
            subsidyPool: this.cumulativeSirqSurplus,
            preemptions: this.cumulativePreemptions
        }
    };
  }
}