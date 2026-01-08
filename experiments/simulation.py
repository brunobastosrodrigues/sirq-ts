"""
High-performance SIRQ simulation engine in Python.

Optimized for batch experiments and statistical analysis.
Supports multiple strategies: FIFO, SIRQ, EDF, FCFS_R, POSTED_PRICE, PRIORITY_QUEUE, SURGE_PRICING

Extended with:
- Bidding deviation analysis (bounded rationality)
- Individual-level outcome tracking for Pareto analysis
- Surge pricing baseline (congestion-based dynamic pricing without auctions)
"""

import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Tuple


class AgentType(Enum):
    CRITICAL = 0
    STANDARD = 1
    ECONOMY = 2


class BiddingBehavior(Enum):
    """Bidding strategy for bounded rationality experiments."""
    RATIONAL = 0      # Bid true value (VOT-based)
    AGGRESSIVE = 1    # Overbid by deviation factor
    CONSERVATIVE = 2  # Underbid by deviation factor
    NOISY = 3         # Random deviation around true value


@dataclass
class AgentOutcome:
    """Individual-level outcome for Pareto analysis."""
    agent_id: int
    agent_type: AgentType
    vot: float
    arrival_time: int
    strategy: str
    status: str  # 'completed', 'balked', 'deadline_missed'
    wait_time: float
    charging_time: float
    energy_delivered: float
    bid: float
    price_paid: float
    compensation_received: float
    preempted_count: int
    deadline_met: bool
    # Counterfactual: what would have happened under FIFO?
    fifo_wait_estimate: float = 0.0


@dataclass
class Agent:
    id: int
    agent_type: AgentType
    vot: float  # Value of Time ($/hr)
    arrival_time: int
    bid: float = 0.0
    patience: int = 60
    max_price_tolerance: float = 2.0
    energy_delivered: float = 0.0
    has_reservation: bool = False
    entered_charging_at: int = -1
    preempted_count: int = 0
    compensation_received: float = 0.0
    # New: deadline for EDF (arrival_time + patience)
    deadline: int = 0
    # Bidding behavior for bounded rationality experiments
    bidding_behavior: BiddingBehavior = BiddingBehavior.RATIONAL

    def __post_init__(self):
        if self.deadline == 0:
            self.deadline = self.arrival_time + self.patience


@dataclass
class SimulationConfig:
    # Physics
    charger_power: float = 150.0  # kW
    battery_capacity: float = 500.0  # kWh (truck)

    # Economics
    base_grid_price: float = 0.50
    base_service_fee: float = 10.0
    auction_increment: float = 5.0
    preemption_premium: float = 1.2

    # Pricing
    smart_pricing: bool = True
    surge_sensitivity: float = 0.5
    max_price_cap: float = 2.0

    # Traffic mix
    prob_critical: float = 0.20
    prob_standard: float = 0.60
    prob_economy: float = 0.20

    # Agent profiles
    profiles: Dict = field(default_factory=lambda: {
        AgentType.CRITICAL: {'min_vot': 150, 'max_vot': 300, 'patience': 240, 'max_price': 5.0},
        AgentType.STANDARD: {'min_vot': 50, 'max_vot': 80, 'patience': 120, 'max_price': 1.5},
        AgentType.ECONOMY: {'min_vot': 15, 'max_vot': 30, 'patience': 45, 'max_price': 0.8},
    })

    # Simulation
    num_chargers: int = 4
    arrival_rate: float = 0.10
    reservation_prob: float = 0.15

    # MCT/RCI parameters (for SIRQ)
    mct: int = 30  # Minimum Charging Time (minutes)
    rci: int = 30  # Reservation Check Interval (minutes)

    # EPFL calibration
    use_epfl_calibration: bool = False
    epfl_scale_factor: float = 1.0

    # Bidding behavior parameters (bounded rationality experiments)
    bidding_behavior: BiddingBehavior = BiddingBehavior.RATIONAL
    bidding_deviation: float = 0.0  # % deviation from rational bid (0.0 = rational, 0.2 = 20% over/under)
    bidding_noise_std: float = 0.0  # Standard deviation for noisy bidding

    # Individual outcome tracking
    track_individual_outcomes: bool = True


def calculate_gini(values: List[float]) -> float:
    """Calculate Gini coefficient for a list of values."""
    if not values or len(values) < 2:
        return 0.0

    sorted_vals = np.array(sorted(values))
    n = len(sorted_vals)
    total = np.sum(sorted_vals)

    # Handle edge case where all values are zero
    if total == 0:
        return 0.0

    cumulative = np.cumsum(sorted_vals)
    return (2 * np.sum((np.arange(1, n + 1) * sorted_vals))) / (n * total) - (n + 1) / n


@dataclass
class SimulationResults:
    """Results from a simulation run."""
    ticks: int
    strategy: str

    # Throughput
    processed_count: int = 0
    balked_count: int = 0

    # Wait times by type
    wait_times_critical: List[float] = field(default_factory=list)
    wait_times_standard: List[float] = field(default_factory=list)
    wait_times_economy: List[float] = field(default_factory=list)

    # Revenue
    total_revenue: float = 0.0

    # SLA
    sla_violations: int = 0

    # Deadline metrics (for EDF comparison)
    missed_deadlines: int = 0
    deadline_slack_total: float = 0.0  # Sum of (deadline - completion_time) for met deadlines

    # Preemptions (SIRQ only)
    preemptions: int = 0

    # Auction efficiency metrics (SIRQ only)
    auction_attempts: int = 0
    auction_successes: int = 0
    total_bid_value: float = 0.0
    winning_bid_value: float = 0.0
    bid_values: List[float] = field(default_factory=list)

    # Individual-level outcomes for Pareto analysis
    agent_outcomes: List[AgentOutcome] = field(default_factory=list)

    # Pareto violation tracking (agents worse off than under FIFO)
    pareto_violations_critical: int = 0
    pareto_violations_standard: int = 0
    pareto_violations_economy: int = 0

    @property
    def avg_wait_critical(self) -> float:
        return np.mean(self.wait_times_critical) if self.wait_times_critical else 0

    @property
    def avg_wait_standard(self) -> float:
        return np.mean(self.wait_times_standard) if self.wait_times_standard else 0

    @property
    def avg_wait_economy(self) -> float:
        return np.mean(self.wait_times_economy) if self.wait_times_economy else 0

    @property
    def all_wait_times(self) -> List[float]:
        return self.wait_times_critical + self.wait_times_standard + self.wait_times_economy

    @property
    def gini_coefficient(self) -> float:
        """Calculate Gini coefficient of wait times (fairness metric)."""
        return calculate_gini(self.all_wait_times)

    @property
    def gini_critical(self) -> float:
        return calculate_gini(self.wait_times_critical)

    @property
    def gini_standard(self) -> float:
        return calculate_gini(self.wait_times_standard)

    @property
    def gini_economy(self) -> float:
        return calculate_gini(self.wait_times_economy)

    @property
    def auction_success_rate(self) -> float:
        return self.auction_successes / max(1, self.auction_attempts)

    @property
    def avg_bid_premium(self) -> float:
        """Average % premium of winning bids over losing bids."""
        if not self.bid_values or len(self.bid_values) < 2:
            return 0.0
        return (self.winning_bid_value / max(1, self.auction_successes)) / (
            self.total_bid_value / max(1, len(self.bid_values))) - 1

    @property
    def critical_failure_rate(self) -> float:
        total = len(self.wait_times_critical)
        return 0 if total == 0 else self.sla_violations / max(1, total)

    @property
    def deadline_miss_rate(self) -> float:
        total = len(self.all_wait_times)
        return 0 if total == 0 else self.missed_deadlines / max(1, total)

    @property
    def pareto_violation_rate(self) -> float:
        """Fraction of agents worse off than under FIFO baseline."""
        total = self.pareto_violations_critical + self.pareto_violations_standard + self.pareto_violations_economy
        processed = len(self.all_wait_times)
        return total / max(1, processed)

    @property
    def std_wait_critical(self) -> float:
        return float(np.std(self.wait_times_critical)) if self.wait_times_critical else 0

    @property
    def std_wait_standard(self) -> float:
        return float(np.std(self.wait_times_standard)) if self.wait_times_standard else 0

    @property
    def std_wait_economy(self) -> float:
        return float(np.std(self.wait_times_economy)) if self.wait_times_economy else 0


class ChargingStation:
    """Charging station simulation supporting multiple strategies."""

    # Added SURGE_PRICING: congestion-based dynamic pricing without auctions (baseline)
    STRATEGIES = ['FIFO', 'SIRQ', 'EDF', 'FCFS_R', 'POSTED_PRICE', 'PRIORITY_QUEUE', 'SURGE_PRICING']

    # Posted-Price tier pricing ($/kWh)
    POSTED_PRICES = {
        AgentType.CRITICAL: 1.50,   # Premium tier
        AgentType.STANDARD: 0.80,   # Standard tier
        AgentType.ECONOMY: 0.50,    # Economy tier
    }

    # Surge pricing multipliers (congestion-based, like Uber)
    SURGE_MULTIPLIERS = {
        0: 1.0,    # 0% utilization: base price
        25: 1.2,   # 25% utilization: 20% surge
        50: 1.5,   # 50% utilization: 50% surge
        75: 2.0,   # 75% utilization: 100% surge
        100: 2.5,  # 100% utilization: 150% surge
    }

    def __init__(self, config: SimulationConfig, strategy: str, calibration: Optional[np.lib.npyio.NpzFile] = None):
        if strategy not in self.STRATEGIES:
            raise ValueError(f"Unknown strategy: {strategy}. Must be one of {self.STRATEGIES}")

        self.config = config
        self.strategy = strategy
        self.calibration = calibration

        # State
        self.chargers = [None] * config.num_chargers  # Agent or None
        self.charger_time_remaining = [0.0] * config.num_chargers
        self.queue: List[Agent] = []
        self.current_price = config.base_grid_price

        # Counters
        self.tick_count = 0
        self.next_agent_id = 0

        # Results
        self.results = SimulationResults(ticks=0, strategy=strategy)

    def get_arrival_probability(self) -> float:
        """Get current arrival probability."""
        if self.config.use_epfl_calibration and self.calibration is not None:
            time_of_day = (self.tick_count + 360) % 1440  # Start at 6 AM
            hour = time_of_day // 60
            dow = (self.tick_count // 1440) % 7

            hourly_prob = self.calibration['hourly_prob']
            dow_mult = self.calibration['dow_multiplier']

            base = hourly_prob[hour] * dow_mult[dow]
            # Scale by charger count (EPFL had 2 chargers)
            charger_ratio = self.config.num_chargers / 2
            return base * charger_ratio * self.config.epfl_scale_factor

        return self.config.arrival_rate

    def generate_agent(self) -> Agent:
        """Generate a new agent."""
        rand = np.random.random()
        if rand < self.config.prob_critical:
            agent_type = AgentType.CRITICAL
        elif rand < self.config.prob_critical + self.config.prob_standard:
            agent_type = AgentType.STANDARD
        else:
            agent_type = AgentType.ECONOMY

        profile = self.config.profiles[agent_type]
        vot = np.random.uniform(profile['min_vot'], profile['max_vot'])

        agent = Agent(
            id=self.next_agent_id,
            agent_type=agent_type,
            vot=vot,
            arrival_time=self.tick_count,
            patience=profile['patience'],
            max_price_tolerance=profile['max_price'],
            has_reservation=np.random.random() < self.config.reservation_prob
        )
        self.next_agent_id += 1
        return agent

    def calculate_bid(self, agent: Agent) -> float:
        """Calculate agent's bid based on VOT and queue length, with bounded rationality."""
        energy_cost = self.current_price * self.config.battery_capacity
        base_cost = energy_cost + self.config.base_service_fee
        charge_duration = (self.config.battery_capacity / self.config.charger_power) * 60
        expected_wait = (len(self.queue) / self.config.num_chargers) * charge_duration
        time_value = (agent.vot / 60) * expected_wait
        rational_bid = base_cost + time_value

        # Apply bidding behavior deviation (bounded rationality)
        behavior = self.config.bidding_behavior
        deviation = self.config.bidding_deviation

        if behavior == BiddingBehavior.RATIONAL or deviation == 0.0:
            return rational_bid
        elif behavior == BiddingBehavior.AGGRESSIVE:
            # Overbid by deviation factor
            return rational_bid * (1 + deviation)
        elif behavior == BiddingBehavior.CONSERVATIVE:
            # Underbid by deviation factor
            return rational_bid * (1 - deviation)
        elif behavior == BiddingBehavior.NOISY:
            # Random deviation around true value (normal distribution)
            noise = np.random.normal(0, self.config.bidding_noise_std)
            return rational_bid * (1 + noise)

        return rational_bid

    def get_surge_multiplier(self) -> float:
        """Get surge pricing multiplier based on current utilization."""
        busy = sum(1 for c in self.chargers if c is not None)
        utilization_pct = int((busy / self.config.num_chargers) * 100)

        # Find appropriate surge tier
        for threshold in sorted(self.SURGE_MULTIPLIERS.keys(), reverse=True):
            if utilization_pct >= threshold:
                return self.SURGE_MULTIPLIERS[threshold]
        return 1.0

    def update_price(self):
        """Update dynamic pricing."""
        if not self.config.smart_pricing:
            self.current_price = self.config.base_grid_price
            return

        busy = sum(1 for c in self.chargers if c is not None)
        utilization = busy / self.config.num_chargers
        queue_factor = min(len(self.queue) / (self.config.num_chargers * 2), 1.0)

        surge = 1 + (utilization * self.config.surge_sensitivity) + (queue_factor * self.config.surge_sensitivity)
        self.current_price = min(self.config.base_grid_price * surge, self.config.max_price_cap)

    def get_charge_rate(self, energy_delivered: float) -> float:
        """Get charging rate considering battery saturation."""
        soc = energy_delivered / self.config.battery_capacity
        if soc < 0.8:
            return self.config.charger_power
        else:
            saturation = (soc - 0.8) / 0.2
            factor = (1.0 - saturation) ** 2
            return max(self.config.charger_power * factor, 5.0)

    def sort_queue(self):
        """Sort queue according to strategy."""
        if self.strategy == 'SIRQ':
            # SIRQ: preempted first, then reservations, then highest bid, then FIFO
            self.queue.sort(key=lambda a: (
                -a.preempted_count,
                -int(a.has_reservation),
                -a.bid,
                a.arrival_time
            ))
        elif self.strategy == 'EDF':
            # EDF: earliest deadline first, with reservations priority
            self.queue.sort(key=lambda a: (
                -int(a.has_reservation),  # Reservations first
                a.deadline,  # Then earliest deadline
                a.arrival_time  # FIFO tiebreaker
            ))
        elif self.strategy == 'FCFS_R':
            # FCFS_R: FIFO with reservations getting priority (no auctions)
            self.queue.sort(key=lambda a: (
                -int(a.has_reservation),  # Reservations first
                a.arrival_time  # Then FIFO
            ))
        elif self.strategy == 'POSTED_PRICE':
            # Posted-Price: Priority by tier (Critical > Standard > Economy), then FIFO
            # Like airline boarding: First Class, Business, Economy
            self.queue.sort(key=lambda a: (
                -int(a.has_reservation),  # Reservations first
                a.agent_type.value,  # Critical=0, Standard=1, Economy=2
                a.arrival_time  # FIFO within tier
            ))
        elif self.strategy == 'PRIORITY_QUEUE':
            # Priority Queue: Strict priority by type, no auctions or tier pricing
            # Pure priority scheduling without economic incentives
            self.queue.sort(key=lambda a: (
                -int(a.has_reservation),  # Reservations first
                a.agent_type.value,  # Critical=0, Standard=1, Economy=2
                a.arrival_time  # FIFO within tier
            ))
        elif self.strategy == 'SURGE_PRICING':
            # Surge Pricing: Congestion-based dynamic pricing, FIFO queue
            # Price varies with utilization but queue order is FIFO
            # This is the non-auction dynamic pricing baseline (like Uber/Tesla)
            self.queue.sort(key=lambda a: (
                -int(a.has_reservation),  # Reservations first
                a.arrival_time  # Then FIFO
            ))
        else:  # FIFO
            self.queue.sort(key=lambda a: a.arrival_time)

    def tick(self):
        """Execute one simulation tick (1 minute)."""
        self.tick_count += 1
        self.update_price()

        # Generate arrival
        if np.random.random() < self.get_arrival_probability():
            agent = self.generate_agent()

            # Check if balks due to price
            if self.current_price > agent.max_price_tolerance and not agent.has_reservation:
                self.results.balked_count += 1
            else:
                if self.strategy == 'SIRQ':
                    agent.bid = self.calculate_bid(agent)
                    self.results.bid_values.append(agent.bid)
                    self.results.total_bid_value += agent.bid
                self.queue.append(agent)

        # Process queue (remove impatient, check deadlines)
        new_queue = []
        for agent in self.queue:
            waited = self.tick_count - agent.arrival_time

            # SLA violation check (CRITICAL agents)
            if agent.agent_type == AgentType.CRITICAL and waited > 15:
                if waited == 16:  # Count once
                    self.results.sla_violations += 1

            # Deadline miss check (all agents)
            if self.tick_count > agent.deadline and agent.entered_charging_at < 0:
                self.results.missed_deadlines += 1

            if waited > agent.patience and not agent.has_reservation:
                self.results.balked_count += 1
            else:
                new_queue.append(agent)

        self.queue = new_queue

        # Sort queue according to strategy
        self.sort_queue()

        # Process chargers
        for i in range(self.config.num_chargers):
            agent = self.chargers[i]

            if agent is not None:
                # Charge
                rate = self.get_charge_rate(agent.energy_delivered)
                kwh_per_tick = rate / 60
                agent.energy_delivered += kwh_per_tick

                # Check if done
                if agent.energy_delivered >= self.config.battery_capacity:
                    wait_time = agent.entered_charging_at - agent.arrival_time
                    completion_time = self.tick_count

                    # Record wait times
                    if agent.agent_type == AgentType.CRITICAL:
                        self.results.wait_times_critical.append(wait_time)
                    elif agent.agent_type == AgentType.STANDARD:
                        self.results.wait_times_standard.append(wait_time)
                    else:
                        self.results.wait_times_economy.append(wait_time)

                    # Deadline slack (positive = met deadline with time to spare)
                    slack = agent.deadline - completion_time
                    if slack >= 0:
                        self.results.deadline_slack_total += slack

                    # Revenue calculation
                    if self.strategy == 'SIRQ':
                        revenue = agent.bid
                    elif self.strategy == 'POSTED_PRICE':
                        # Fixed tier pricing based on agent type
                        tier_price = self.POSTED_PRICES[agent.agent_type]
                        revenue = tier_price * self.config.battery_capacity + self.config.base_service_fee
                    elif self.strategy == 'SURGE_PRICING':
                        # Congestion-based surge pricing (like Uber/Tesla)
                        surge_mult = self.get_surge_multiplier()
                        surge_price = self.config.base_grid_price * surge_mult
                        revenue = surge_price * self.config.battery_capacity + self.config.base_service_fee
                    else:
                        # FIFO, EDF, FCFS_R, PRIORITY_QUEUE: dynamic pricing
                        revenue = self.current_price * self.config.battery_capacity + self.config.base_service_fee

                    self.results.total_revenue += revenue
                    self.results.processed_count += 1

                    # Track individual outcome if enabled
                    if self.config.track_individual_outcomes:
                        charging_time = self.tick_count - agent.entered_charging_at
                        outcome = AgentOutcome(
                            agent_id=agent.id,
                            agent_type=agent.agent_type,
                            vot=agent.vot,
                            arrival_time=agent.arrival_time,
                            strategy=self.strategy,
                            status='completed',
                            wait_time=wait_time,
                            charging_time=charging_time,
                            energy_delivered=agent.energy_delivered,
                            bid=agent.bid,
                            price_paid=revenue,
                            compensation_received=agent.compensation_received,
                            preempted_count=agent.preempted_count,
                            deadline_met=(slack >= 0)
                        )
                        self.results.agent_outcomes.append(outcome)

                    self.chargers[i] = None

            # Assign from queue
            if self.chargers[i] is None and self.queue:
                next_agent = self.queue.pop(0)
                next_agent.entered_charging_at = self.tick_count
                self.chargers[i] = next_agent

        # SIRQ preemption logic
        if self.strategy == 'SIRQ' and self.queue:
            self._handle_sirq_preemption()

    def _handle_sirq_preemption(self):
        """Handle SIRQ auction/preemption logic."""
        if not self.queue:
            return

        top_candidate = self.queue[0]

        # Determine if preemption should be attempted
        should_attempt = (
            top_candidate.has_reservation or
            top_candidate.bid > self.config.base_grid_price * self.config.battery_capacity * 1.5
        )

        if not should_attempt:
            return

        self.results.auction_attempts += 1

        # Find lowest bid charger to preempt (respecting MCT)
        min_bid = float('inf')
        min_idx = -1

        for i, agent in enumerate(self.chargers):
            if agent and not agent.has_reservation:
                soc = agent.energy_delivered / self.config.battery_capacity
                charge_time = self.tick_count - agent.entered_charging_at

                # Check MCT constraint
                if soc <= 0.85 and charge_time >= self.config.mct and agent.bid < min_bid:
                    min_bid = agent.bid
                    min_idx = i

        # Execute preemption if conditions met
        if min_idx >= 0 and (top_candidate.has_reservation or top_candidate.bid > min_bid * self.config.preemption_premium):
            evicted = self.chargers[min_idx]
            evicted.preempted_count += 1
            self.queue.append(evicted)
            self.queue.pop(0)  # Remove top candidate from queue
            top_candidate.entered_charging_at = self.tick_count
            self.chargers[min_idx] = top_candidate
            self.results.preemptions += 1
            self.results.auction_successes += 1
            self.results.winning_bid_value += top_candidate.bid

    def run(self, ticks: int) -> SimulationResults:
        """Run simulation for specified number of ticks."""
        for _ in range(ticks):
            self.tick()

        self.results.ticks = ticks
        return self.results


def run_experiment(config: SimulationConfig, ticks: int, calibration=None) -> Tuple[SimulationResults, SimulationResults]:
    """Run FIFO and SIRQ simulations with same arrivals."""
    np.random.seed(42)
    fifo = ChargingStation(config, 'FIFO', calibration)
    fifo_results = fifo.run(ticks)

    np.random.seed(42)
    sirq = ChargingStation(config, 'SIRQ', calibration)
    sirq_results = sirq.run(ticks)

    return fifo_results, sirq_results


def run_multi_strategy_experiment(
    config: SimulationConfig,
    ticks: int,
    strategies: List[str] = None,
    calibration=None,
    seed: int = 42
) -> Dict[str, SimulationResults]:
    """Run multiple strategies with same arrivals for fair comparison."""
    if strategies is None:
        strategies = ChargingStation.STRATEGIES

    results = {}
    for strategy in strategies:
        np.random.seed(seed)
        station = ChargingStation(config, strategy, calibration)
        results[strategy] = station.run(ticks)

    return results


def load_epfl_calibration(path: str = '/home/rodrigues/sirq-ts/epfl_calibration.npz'):
    """Load EPFL calibration data."""
    return np.load(path)


if __name__ == '__main__':
    # Quick test
    config = SimulationConfig(num_chargers=4, arrival_rate=0.1)
    calibration = load_epfl_calibration()

    config.use_epfl_calibration = True
    config.epfl_scale_factor = 2.0

    results = run_multi_strategy_experiment(config, ticks=1440, calibration=calibration)

    print(f"=== 1 DAY SIMULATION ===")
    for strategy, r in results.items():
        print(f"\n{strategy}:")
        print(f"  Processed: {r.processed_count}")
        print(f"  Balked: {r.balked_count}")
        print(f"  Avg Wait Critical: {r.avg_wait_critical:.1f} min")
        print(f"  Revenue: ${r.total_revenue:.2f}")
        print(f"  Gini Coefficient: {r.gini_coefficient:.3f}")
        if strategy == 'SIRQ':
            print(f"  Preemptions: {r.preemptions}")
            print(f"  Auction Success Rate: {r.auction_success_rate:.1%}")
