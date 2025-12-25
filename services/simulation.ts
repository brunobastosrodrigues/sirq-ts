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

  // Energy & Demand Tracking
  fifoCumulativeEnergy: number;
  sirqCumulativeEnergy: number;

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

    this.fifoCumulativeEnergy = 0;
    this.sirqCumulativeEnergy = 0;
    
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
      balkedPrice: 0,
      balkedWait: 0,
      revenue: 0,
      currentPrice: this.config.baseGridPrice,
      recentLogs: [],

      slaViolations: 0,
      currentGridLoad: 0,
      peakGridLoad: 0,

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

  private calculateCurrentLoad(state: StationState): number {
    let load = 0;
    state.chargers.forEach(c => {
        if (c.status === 'busy' && c.currentAgent) {
            load += this.getChargeRate(
                c.currentAgent.energyDelivered,
                this.config.batteryCapacity,
                this.config.chargerPower
            );
        }
    });
    return load;
  }

  private updatePrice(state: StationState): number {
    if (!this.config.smartPricing) {
      state.currentPrice = this.config.baseGridPrice;
      return 1.0;
    }
    
    const busyChargers = state.chargers.filter(c => c.status === 'busy').length;
    const utilization = busyChargers / state.chargers.length;
    const queueFactor = Math.min(state.queue.length / (state.chargers.length * 2), 1.0);

    // Feature 5: Price-Responsive Demand (VPP)
    let gridFactor = 0;
    if (this.config.enableGridAwareness && this.config.transformerLimit > 0) {
        // Recalculate load to ensure we have the latest instantaneous value for pricing
        const currentLoad = this.calculateCurrentLoad(state);
        const gridStressIndex = currentLoad / this.config.transformerLimit;

        // Simple linear factor: if Load > 80%, start increasing price aggressively
        if (gridStressIndex > 0.8) {
             gridFactor = (gridStressIndex - 0.8) * this.config.gridStressSensitivity;
        }

        if (gridStressIndex > 0.95) {
             this.addLog(state, `⚠️ GRID ALERT: Load at ${(gridStressIndex * 100).toFixed(0)}%`);
        }
    }
    // Fallback to legacy gridConnectionLimit if enableGridAwareness is not set but gridConnectionLimit is used
    else if (this.config.gridConnectionLimit > 0) {
         const gridStressIndex = state.currentGridLoad / this.config.gridConnectionLimit;
         if (gridStressIndex > 0.8) {
             gridFactor = (gridStressIndex - 0.8) * 2.0;
         }
    }

    let surgeMultiplier = 1 + (utilization * this.config.surgeSensitivity) + (queueFactor * this.config.surgeSensitivity) + gridFactor;
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

  private getInconvenienceCost(type: AgentType): number {
      switch (type) {
          case AgentType.ECONOMY: return 5.00;
          case AgentType.STANDARD: return 20.00;
          case AgentType.CRITICAL: return 5000.00;
          default: return 10.00;
      }
  }

  private performSwap(state: StationState, charger: Charger, newAgent: Agent) {
      if (!charger.currentAgent) return;

      const evictedAgent = charger.currentAgent;
      evictedAgent.status = 'preempted';
      evictedAgent.preemptedCount = (evictedAgent.preemptedCount || 0) + 1;

      state.queue.push(evictedAgent);
      // Note: The main processStation logic will re-sort the queue next tick
      // but we need to remove the newAgent from the queue immediately
      state.queue.shift(); // Remove topCandidate (which is newAgent)

      charger.currentAgent = newAgent;
      charger.currentAgent.status = 'charging';
      charger.currentAgent.enteredChargingAt = this.tickCount;
  }

  private processStation(state: StationState, newAgent: Agent | null): MicroDataPoint[] {
    const microUpdates: MicroDataPoint[] = [];

    // Feature 4: Grid Impact & Load Profiling
    let instantaneousLoad = 0;

    // 1. Update Pricing
    this.updatePrice(state);

    // 2. Handle New Arrival
    if (newAgent) {
      const agent = { ...newAgent };
      if (state.currentPrice > agent.maxPriceTolerance && !agent.hasReservation) {
        state.balkedCount++;
        state.balkedPrice++; // Feature 3: Lost Demand Segmentation
        
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

        // Feature 2: Fleet SLA Monitor
        if (a.type === AgentType.CRITICAL && waited > 15 && !a.hasReservation) {
             // We just count violations, we don't necessarily kick them unless they hit patience
             // However, checking violations every tick might overcount?
             // The request says "trigger a violation event whenever a CRITICAL agent waits longer than ... 15 mins".
             // If we count 1 per tick, it's cumulative duration.
             // Let's assume we count it once when they cross the threshold? Or just number of people currently violating?
             // "SLA Violations counter". Let's assume it's a cumulative event counter.
             // To avoid double counting, we might need a flag on the agent.
             // But simpler: just count # of agents currently violating SLA in the queue.
             // Or actually, the request says "Contract Health ... based on violation rate".
             // Let's count +1 if `waited === 15`.
             if (waited === 15) {
                 state.slaViolations++;
                 this.addLog(state, `SLA WARN: Critical agent wait > 15m`);
             }
        }

        if (waited > a.patience && !a.hasReservation) {
            state.balkedCount++;
            state.balkedWait++; // Feature 3
            
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
            // Priority 2: Previously Preempted (High Priority)
            if (a.status === 'preempted' && b.status !== 'preempted') return -1;
            if (a.status !== 'preempted' && b.status === 'preempted') return 1;
            // Priority 3: Highest Bid
            if (b.bid !== a.bid) return b.bid - a.bid;
            // Priority 4: Arrival Time
            return a.arrivalTime - b.arrivalTime;
        });
    } else {
        state.queue.sort((a, b) => a.arrivalTime - b.arrivalTime);
    }

    // 4. Charger Logic
    if (state.strategy === 'SIRQ' && state.queue.length > 0) {
        const topCandidate = state.queue[0];
        let bestTargetCharger: Charger | null = null;
        let lowestWTA = Infinity;
        let hasFreeSpot = false;

        // Find best target (Lowest WTA) or check for free spots
        state.chargers.forEach(c => {
            if (c.status === 'idle') {
                hasFreeSpot = true;
            } else if (c.status === 'busy' && c.currentAgent && !c.currentAgent.hasReservation) {
                // Calculate WTA for this agent
                const agent = c.currentAgent;
                const remainingKwh = this.config.batteryCapacity - agent.energyDelivered;
                const valueOfCharge = remainingKwh * state.currentPrice;
                const wta = valueOfCharge + this.getInconvenienceCost(agent.type);

                // Track lowest WTA
                if (wta < lowestWTA) {
                    lowestWTA = wta;
                    bestTargetCharger = c;
                }
            }
        });

        if (!hasFreeSpot && bestTargetCharger && bestTargetCharger.currentAgent) {
            const victim = bestTargetCharger.currentAgent;
            const attacker = topCandidate;
            
            // Check Grace Period (Safety Rule)
            const soc = victim.energyDelivered / this.config.batteryCapacity;
            const timeCharging = this.tickCount - (victim.enteredChargingAt || 0);
            const inGracePeriod = soc > 0.85 || timeCharging < 15;

            if (attacker.hasReservation && !victim.hasReservation) {
                this.addLog(state, `RESERVATION: ${attacker.type} claimed spot from ${victim.type}`);
                this.performSwap(state, bestTargetCharger, attacker);
            }
            else if (!inGracePeriod && !victim.hasReservation) {
                 // Interactive Negotiation Protocol
                 const wta = lowestWTA; // Already calculated

                 // 2. Calculate Platform Requirement
                 const cpoMargin = 0.10;
                 const requiredBid = wta * (1 + cpoMargin);

                 // 3. Evaluate the Deal
                 if (attacker.bid >= requiredBid) {
                     // Accept
                     victim.compensationBalance += wta;
                     const surplus = attacker.bid - wta;
                     this.cumulativeSirqSurplus += surplus; // CPO keeps surplus

                     this.addLog(state, `🤝 DEAL: ${attacker.type} bought out ${victim.type} for $${attacker.bid.toFixed(0)}`);
                     this.cumulativePreemptions++;

                     this.performSwap(state, bestTargetCharger, attacker);
                 } else {
                     // Reject
                     // Only log periodically or if bid is reasonably close to avoid spamming?
                     // Prompt request: Log: "⛔ REJECTED..."
                     // I will log it.
                     // To avoid spam, maybe only log if it hasn't been logged recently for this pair?
                     // Or just log.
                     // For now, let's log it but maybe we should check if the attacker actually *wants* to bid?
                     // In SIRQ, the agent's bid is their WTP. They auto-bid.
                     this.addLog(state, `⛔ REJECTED: ${victim.type} refused buyout (Bid $${attacker.bid.toFixed(0)} < Req $${requiredBid.toFixed(0)})`);
                 }
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
         
         instantaneousLoad += currentRateKw;

         const kwhPerTick = currentRateKw / 60;
         charger.currentAgent.energyDelivered += kwhPerTick;
         
         // Accumulate energy delivered globally for Cost analysis
         if (state.strategy === 'FIFO') this.fifoCumulativeEnergy += kwhPerTick;
         else this.sirqCumulativeEnergy += kwhPerTick;

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

    // Update Grid Load Stats
    state.currentGridLoad = instantaneousLoad;
    if (instantaneousLoad > state.peakGridLoad) {
        state.peakGridLoad = instantaneousLoad;
    }

    return microUpdates;
  }

  // Calculate dynamic arrival rate based on time of day (Rush Hours)
  private getCurrentArrivalRate(tick: number): { rate: number, multiplier: number, timeOfDayMinutes: number } {
     // Assume Tick 0 = 06:00 AM (start of day shift)
     // 1 Tick = 1 Minute
     const startOfDayMinutes = 6 * 60; // 360
     const timeOfDayMinutes = (startOfDayMinutes + tick) % 1440; // 0-1440

     if (!this.config.enableRushHours) {
         return { rate: this.config.arrivalRate, multiplier: 1.0, timeOfDayMinutes };
     }

     // Define Peaks:
     // Morning Peak: 07:00 - 09:00 (Peak at 08:00) => Minutes 420 - 540
     // Evening Peak: 16:00 - 19:00 (Peak at 17:30) => Minutes 960 - 1140

     let multiplier = 1.0;

     // Morning Rush (Gaussian-ish)
     if (timeOfDayMinutes >= 420 && timeOfDayMinutes <= 540) {
         const peak = 480; // 08:00
         const sigma = 30;
         const val = Math.exp(-Math.pow(timeOfDayMinutes - peak, 2) / (2 * Math.pow(sigma, 2)));
         multiplier += (this.config.rushHourMultiplier - 1) * val;
     }

     // Evening Rush
     if (timeOfDayMinutes >= 960 && timeOfDayMinutes <= 1140) {
         const peak = 1050; // 17:30
         const sigma = 45;
         const val = Math.exp(-Math.pow(timeOfDayMinutes - peak, 2) / (2 * Math.pow(sigma, 2)));
         multiplier += (this.config.rushHourMultiplier - 1) * val;
     }

     return {
         rate: this.config.arrivalRate * multiplier,
         multiplier,
         timeOfDayMinutes
     };
  }

  public tick(): {
      fifo: StationState,
      sirq: StationState,
      historical: HistoricalDataPoint,
      microData: MicroDataPoint[],
      simTime: number,
      trafficMultiplier: number
  } {
    this.tickCount++;

    const { rate, multiplier, timeOfDayMinutes } = this.getCurrentArrivalRate(this.tickCount);

    let newAgent: Agent | null = null;
    if (Math.random() < rate) {
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

    // Feature 1: Financial Calculations
    const fifoEnergyCost = this.fifoCumulativeEnergy * this.config.electricityCostPerKwh;
    const sirqEnergyCost = this.sirqCumulativeEnergy * this.config.electricityCostPerKwh;

    const fifoDemandPenalty = this.fifoState.peakGridLoad * this.config.peakDemandCharge;
    const sirqDemandPenalty = this.sirqState.peakGridLoad * this.config.peakDemandCharge;

    return {
        fifo: this.fifoState,
        sirq: this.sirqState,
        microData: [...fifoMicro, ...sirqMicro],
        simTime: timeOfDayMinutes,
        trafficMultiplier: multiplier,
        historical: {
            tick: this.tickCount,
            fifoRevenue: this.fifoState.revenue,
            sirqRevenue: this.sirqState.revenue,

            fifoEnergyCost,
            sirqEnergyCost,
            fifoDemandPenalty,
            sirqDemandPenalty,

            fifoBalked: this.fifoState.balkedCount,
            sirqBalked: this.sirqState.balkedCount,
            fifoBalkedPrice: this.fifoState.balkedPrice,
            sirqBalkedPrice: this.sirqState.balkedPrice,
            fifoBalkedWait: this.fifoState.balkedWait,
            sirqBalkedWait: this.sirqState.balkedWait,
            
            fifoWaitCritical: this.fifoState.avgWaitTimeCritical,
            sirqWaitCritical: this.sirqState.avgWaitTimeCritical,
            
            // New Split Metrics
            fifoFailureRate,
            sirqFailureRate,

            fifoSlaViolations: this.fifoState.slaViolations,
            sirqSlaViolations: this.sirqState.slaViolations,
            
            fifoWaitEconomy: this.fifoState.avgWaitTimeEconomy,
            sirqWaitEconomy: this.sirqState.avgWaitTimeEconomy,
            
            fifoGridLoad: this.fifoState.currentGridLoad,
            sirqGridLoad: this.sirqState.currentGridLoad,

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
