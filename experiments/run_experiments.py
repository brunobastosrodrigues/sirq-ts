"""
Batch experiment runner for SIRQ simulation.

Generates data for scientific analysis and plots.
Supports 7 strategies: FIFO, SIRQ, EDF, FCFS_R, POSTED_PRICE, PRIORITY_QUEUE, SURGE_PRICING

Extended experiments:
- Bidding deviation sensitivity (bounded rationality)
- Extended simulation duration (4 weeks)
- Individual-level outcome analysis
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
from dataclasses import asdict
import json
from pathlib import Path
import time
from scipy import stats

from simulation import (
    SimulationConfig, ChargingStation, SimulationResults,
    load_epfl_calibration, AgentType, run_multi_strategy_experiment,
    BiddingBehavior, AgentOutcome
)

# All strategies to compare (including new SURGE_PRICING baseline)
ALL_STRATEGIES = ['FIFO', 'SIRQ', 'EDF', 'POSTED_PRICE', 'PRIORITY_QUEUE', 'SURGE_PRICING']


def run_single_experiment(
    config: SimulationConfig,
    ticks: int,
    seed: int,
    strategies: List[str] = None,
    calibration=None
) -> Dict[str, SimulationResults]:
    """Run single experiment with given seed for all strategies."""
    if strategies is None:
        strategies = ALL_STRATEGIES

    return run_multi_strategy_experiment(config, ticks, strategies, calibration, seed)


def results_to_dict(r: SimulationResults, strategy: str) -> Dict:
    """Convert SimulationResults to dictionary for DataFrame."""
    return {
        'strategy': strategy,
        'processed': r.processed_count,
        'balked': r.balked_count,
        'revenue': r.total_revenue,
        'wait_critical_mean': r.avg_wait_critical,
        'wait_standard_mean': r.avg_wait_standard,
        'wait_economy_mean': r.avg_wait_economy,
        # Wait time standard deviations (for variance reporting)
        'wait_critical_std': r.std_wait_critical,
        'wait_standard_std': r.std_wait_standard,
        'wait_economy_std': r.std_wait_economy,
        'sla_violations': r.sla_violations,
        'preemptions': r.preemptions,
        'wait_critical_samples': len(r.wait_times_critical),
        'wait_standard_samples': len(r.wait_times_standard),
        'wait_economy_samples': len(r.wait_times_economy),
        # Fairness metrics
        'gini_overall': r.gini_coefficient,
        'gini_critical': r.gini_critical,
        'gini_standard': r.gini_standard,
        'gini_economy': r.gini_economy,
        'missed_deadlines': r.missed_deadlines,
        'deadline_miss_rate': r.deadline_miss_rate,
        # Pareto violation metrics (individual-level)
        'pareto_violations_critical': r.pareto_violations_critical,
        'pareto_violations_standard': r.pareto_violations_standard,
        'pareto_violations_economy': r.pareto_violations_economy,
        'pareto_violation_rate': r.pareto_violation_rate,
        # Auction metrics (SIRQ only)
        'auction_attempts': r.auction_attempts,
        'auction_successes': r.auction_successes,
        'auction_success_rate': r.auction_success_rate,
        'total_bid_value': r.total_bid_value,
        'winning_bid_value': r.winning_bid_value,
    }


def run_batch_experiments(
    base_config: SimulationConfig,
    ticks: int = 10080,  # 1 week
    num_runs: int = 30,
    strategies: List[str] = None,
    calibration=None
) -> pd.DataFrame:
    """Run multiple experiments for statistical analysis."""
    if strategies is None:
        strategies = ALL_STRATEGIES

    results = []

    for run in range(num_runs):
        strategy_results = run_single_experiment(
            base_config, ticks, seed=run, strategies=strategies, calibration=calibration
        )

        for strategy, r in strategy_results.items():
            row = results_to_dict(r, strategy)
            row['run'] = run
            results.append(row)

        if (run + 1) % 10 == 0:
            print(f"  Completed {run + 1}/{num_runs} runs")

    return pd.DataFrame(results)


def run_parameter_sweep(
    base_config: SimulationConfig,
    param_name: str,
    param_values: List,
    ticks: int = 10080,
    num_runs: int = 10,
    strategies: List[str] = None,
    calibration=None
) -> pd.DataFrame:
    """Sweep a parameter and collect results."""
    if strategies is None:
        strategies = ALL_STRATEGIES

    all_results = []

    for value in param_values:
        print(f"Testing {param_name}={value}")

        # Create config copy with modified parameter
        config_dict = {
            'charger_power': base_config.charger_power,
            'battery_capacity': base_config.battery_capacity,
            'base_grid_price': base_config.base_grid_price,
            'base_service_fee': base_config.base_service_fee,
            'auction_increment': base_config.auction_increment,
            'preemption_premium': base_config.preemption_premium,
            'smart_pricing': base_config.smart_pricing,
            'surge_sensitivity': base_config.surge_sensitivity,
            'max_price_cap': base_config.max_price_cap,
            'prob_critical': base_config.prob_critical,
            'prob_standard': base_config.prob_standard,
            'prob_economy': base_config.prob_economy,
            'num_chargers': base_config.num_chargers,
            'arrival_rate': base_config.arrival_rate,
            'reservation_prob': base_config.reservation_prob,
            'use_epfl_calibration': base_config.use_epfl_calibration,
            'epfl_scale_factor': base_config.epfl_scale_factor,
            'mct': base_config.mct,
            'rci': base_config.rci,
        }
        config_dict[param_name] = value
        config = SimulationConfig(**{k: v for k, v in config_dict.items() if k != 'profiles'})

        df = run_batch_experiments(config, ticks, num_runs, strategies, calibration)
        df[param_name] = value
        all_results.append(df)

    return pd.concat(all_results, ignore_index=True)


def compute_statistics(df: pd.DataFrame) -> pd.DataFrame:
    """Compute summary statistics by strategy."""
    metrics = [
        'processed', 'balked', 'revenue',
        'wait_critical_mean', 'wait_standard_mean', 'wait_economy_mean',
        'sla_violations', 'preemptions',
        'gini_overall', 'gini_critical',
        'missed_deadlines', 'deadline_miss_rate',
        'auction_attempts', 'auction_successes', 'auction_success_rate',
    ]

    # Filter to metrics that exist in the dataframe
    metrics = [m for m in metrics if m in df.columns]

    stats = df.groupby('strategy').agg({m: ['mean', 'std'] for m in metrics})
    stats.columns = ['_'.join(col) for col in stats.columns]
    return stats


def compute_effect_sizes(df: pd.DataFrame, baseline: str = 'FIFO') -> pd.DataFrame:
    """Compute Cohen's d effect sizes relative to baseline."""
    baseline_df = df[df['strategy'] == baseline]
    results = []

    for strategy in df['strategy'].unique():
        if strategy == baseline:
            continue

        strategy_df = df[df['strategy'] == strategy]

        for metric in ['wait_critical_mean', 'wait_standard_mean', 'wait_economy_mean',
                       'revenue', 'sla_violations', 'gini_overall']:
            if metric not in df.columns:
                continue

            baseline_vals = baseline_df[metric].values
            strategy_vals = strategy_df[metric].values

            # Cohen's d
            pooled_std = np.sqrt((np.var(baseline_vals) + np.var(strategy_vals)) / 2)
            if pooled_std > 0:
                d = (np.mean(strategy_vals) - np.mean(baseline_vals)) / pooled_std
            else:
                d = 0

            # Welch's t-test
            t_stat, p_val = stats.ttest_ind(baseline_vals, strategy_vals, equal_var=False)

            # Percent change
            pct_change = ((np.mean(strategy_vals) - np.mean(baseline_vals)) /
                          max(1, abs(np.mean(baseline_vals)))) * 100

            results.append({
                'strategy': strategy,
                'metric': metric,
                'baseline_mean': np.mean(baseline_vals),
                'baseline_std': np.std(baseline_vals),
                'strategy_mean': np.mean(strategy_vals),
                'strategy_std': np.std(strategy_vals),
                'cohens_d': d,
                'p_value': p_val,
                'pct_change': pct_change,
                'significant': p_val < 0.05,
            })

    return pd.DataFrame(results)


def run_main_experiment():
    """Run the main experiment for paper."""
    print("Loading EPFL calibration...")
    calibration = load_epfl_calibration()

    # Base configuration for truck charging
    config = SimulationConfig(
        num_chargers=4,
        battery_capacity=500.0,  # kWh (truck)
        charger_power=150.0,  # kW
        base_grid_price=0.50,
        prob_critical=0.20,
        prob_standard=0.60,
        prob_economy=0.20,
        use_epfl_calibration=True,
        epfl_scale_factor=5.0,  # Scale up for more traffic
        smart_pricing=True,
        surge_sensitivity=0.5,
        mct=30,  # 30 min minimum charging time
        rci=30,  # 30 min reservation check interval
    )

    output_dir = Path('/home/rodrigues/sirq-ts/experiments/results')
    output_dir.mkdir(exist_ok=True)

    # Experiment 1: Main comparison (1 week, 30 runs, all 4 strategies)
    print("\n=== EXPERIMENT 1: Main Comparison (4 strategies) ===")
    t0 = time.time()
    df_main = run_batch_experiments(config, ticks=10080, num_runs=30, calibration=calibration)
    print(f"Completed in {time.time()-t0:.1f}s")

    df_main.to_parquet(output_dir / 'main_comparison.parquet')

    print("\nSummary Statistics:")
    stats = compute_statistics(df_main)
    print(stats.to_string())

    print("\nEffect Sizes (vs FIFO):")
    effects = compute_effect_sizes(df_main, baseline='FIFO')
    print(effects.to_string())
    effects.to_csv(output_dir / 'effect_sizes.csv', index=False)

    # Experiment 2: Charger count sweep (scalability)
    print("\n=== EXPERIMENT 2: Charger Count Sweep (Scalability) ===")
    df_chargers = run_parameter_sweep(
        config, 'num_chargers', [2, 4, 8, 16],
        ticks=10080, num_runs=10, calibration=calibration
    )
    df_chargers.to_parquet(output_dir / 'charger_sweep.parquet')

    # Experiment 3: Traffic intensity sweep
    print("\n=== EXPERIMENT 3: Traffic Intensity Sweep ===")
    df_traffic = run_parameter_sweep(
        config, 'epfl_scale_factor', [1.0, 2.0, 5.0, 10.0],
        ticks=10080, num_runs=10, calibration=calibration
    )
    df_traffic.to_parquet(output_dir / 'traffic_sweep.parquet')

    # Experiment 4: Critical agent probability sweep
    print("\n=== EXPERIMENT 4: Critical Probability Sweep ===")
    df_critical = run_parameter_sweep(
        config, 'prob_critical', [0.10, 0.20, 0.30, 0.40],
        ticks=10080, num_runs=10, calibration=calibration
    )
    df_critical.to_parquet(output_dir / 'critical_sweep.parquet')

    # Experiment 5: MCT parameter sweep
    print("\n=== EXPERIMENT 5: MCT Parameter Sweep ===")
    df_mct = run_parameter_sweep(
        config, 'mct', [15, 30, 45, 60],
        ticks=10080, num_runs=10,
        strategies=['FIFO', 'SIRQ'],  # Only affects SIRQ
        calibration=calibration
    )
    df_mct.to_parquet(output_dir / 'mct_sweep.parquet')

    # Experiment 6: Reservation probability sweep
    print("\n=== EXPERIMENT 6: Reservation Probability Sweep ===")
    df_res = run_parameter_sweep(
        config, 'reservation_prob', [0.0, 0.15, 0.30, 0.50],
        ticks=10080, num_runs=10, calibration=calibration
    )
    df_res.to_parquet(output_dir / 'reservation_sweep.parquet')

    print("\n=== ALL EXPERIMENTS COMPLETE ===")
    print(f"Results saved to {output_dir}")

    return df_main, df_chargers, df_traffic, df_critical, df_mct, df_res


def generate_latex_table(df: pd.DataFrame, output_path: Path):
    """Generate LaTeX comparison table with all strategies."""
    strategies = ['FIFO', 'SIRQ', 'EDF', 'POSTED_PRICE', 'PRIORITY_QUEUE']

    # Compute stats
    table_data = []
    for strategy in strategies:
        s_df = df[df['strategy'] == strategy]
        table_data.append({
            'strategy': strategy,
            'wait_critical': f"{s_df['wait_critical_mean'].mean():.1f} $\\pm$ {s_df['wait_critical_mean'].std():.1f}",
            'wait_standard': f"{s_df['wait_standard_mean'].mean():.1f} $\\pm$ {s_df['wait_standard_mean'].std():.1f}",
            'wait_economy': f"{s_df['wait_economy_mean'].mean():.1f} $\\pm$ {s_df['wait_economy_mean'].std():.1f}",
            'throughput': f"{s_df['processed'].mean():.1f} $\\pm$ {s_df['processed'].std():.1f}",
            'revenue': f"{s_df['revenue'].mean():.0f} $\\pm$ {s_df['revenue'].std():.0f}",
            'sla': f"{s_df['sla_violations'].mean():.1f} $\\pm$ {s_df['sla_violations'].std():.1f}",
            'gini': f"{s_df['gini_overall'].mean():.3f} $\\pm$ {s_df['gini_overall'].std():.3f}",
        })

    # Compute effect sizes vs FIFO
    fifo_df = df[df['strategy'] == 'FIFO']
    effects = {}
    for strategy in ['SIRQ', 'EDF', 'POSTED_PRICE', 'PRIORITY_QUEUE']:
        s_df = df[df['strategy'] == strategy]
        for metric in ['wait_critical_mean', 'revenue', 'gini_overall']:
            pooled_std = np.sqrt((fifo_df[metric].var() + s_df[metric].var()) / 2)
            d = (s_df[metric].mean() - fifo_df[metric].mean()) / pooled_std if pooled_std > 0 else 0
            _, p = stats.ttest_ind(fifo_df[metric], s_df[metric], equal_var=False)
            effects[(strategy, metric)] = (d, p)

    # Generate LaTeX
    latex = r"""\begin{table}[t]
\centering
\caption{Performance Comparison: All Strategies ($n = 30$ runs, 1 week each). Effect sizes (Cohen's $d$) computed vs.\ FIFO baseline. Statistical significance: *** $p < 0.001$, ** $p < 0.01$, * $p < 0.05$.}
\label{tb:comparison}
\begin{tabular}{l c c c c c c c}
\toprule
\textbf{Strategy} & \textbf{Critical Wait} & \textbf{Std Wait} & \textbf{Econ Wait} & \textbf{Throughput} & \textbf{Revenue} & \textbf{SLA Viol.} & \textbf{Gini} \\
 & (min) & (min) & (min) & (trucks/wk) & (\$/wk) & & \\
\midrule
"""

    for row in table_data:
        latex += f"{row['strategy']} & {row['wait_critical']} & {row['wait_standard']} & {row['wait_economy']} & {row['throughput']} & {row['revenue']} & {row['sla']} & {row['gini']} \\\\\n"

    latex += r"""\bottomrule
\end{tabular}
\end{table}
"""

    with open(output_path, 'w') as f:
        f.write(latex)


def run_extended_experiments():
    """
    Run extended experiments to address PC reviewer concerns:
    1. Bidding deviation sensitivity (bounded rationality)
    2. Extended simulation duration (4 weeks)
    3. Dynamic pricing baseline comparison
    4. Individual-level Pareto analysis
    """
    print("Loading EPFL calibration...")
    calibration = load_epfl_calibration()

    # Base configuration
    config = SimulationConfig(
        num_chargers=4,
        battery_capacity=500.0,
        charger_power=150.0,
        base_grid_price=0.50,
        prob_critical=0.20,
        prob_standard=0.60,
        prob_economy=0.20,
        use_epfl_calibration=True,
        epfl_scale_factor=5.0,
        smart_pricing=True,
        surge_sensitivity=0.5,
        mct=30,
        rci=30,
        track_individual_outcomes=True,  # Enable individual tracking
    )

    output_dir = Path('/home/rodrigues/sirq-ts/experiments/results')
    output_dir.mkdir(exist_ok=True)

    # Experiment 7: Bidding Deviation Sensitivity (Bounded Rationality)
    print("\n=== EXPERIMENT 7: Bidding Deviation Sensitivity ===")
    print("Testing: How does SIRQ perform when agents deviate from rational bidding?")
    bidding_results = []

    for behavior_name, behavior in [
        ('RATIONAL', BiddingBehavior.RATIONAL),
        ('AGGRESSIVE_10', BiddingBehavior.AGGRESSIVE),
        ('AGGRESSIVE_20', BiddingBehavior.AGGRESSIVE),
        ('CONSERVATIVE_10', BiddingBehavior.CONSERVATIVE),
        ('CONSERVATIVE_20', BiddingBehavior.CONSERVATIVE),
    ]:
        deviation = 0.0 if behavior == BiddingBehavior.RATIONAL else (0.1 if '10' in behavior_name else 0.2)
        test_config = SimulationConfig(
            **{k: v for k, v in asdict(config).items()
               if k not in ['bidding_behavior', 'bidding_deviation', 'profiles']},
            profiles=config.profiles,
            bidding_behavior=behavior,
            bidding_deviation=deviation,
        )

        print(f"  Running {behavior_name} (deviation={deviation*100:.0f}%)...")
        df = run_batch_experiments(
            test_config, ticks=10080, num_runs=10,
            strategies=['FIFO', 'SIRQ'],  # Only SIRQ uses bidding
            calibration=calibration
        )
        df['bidding_behavior'] = behavior_name
        df['bidding_deviation'] = deviation
        bidding_results.append(df)

    df_bidding = pd.concat(bidding_results, ignore_index=True)
    df_bidding.to_parquet(output_dir / 'bidding_sensitivity.parquet')
    print(f"  Saved to bidding_sensitivity.parquet")

    # Experiment 8: Extended Duration (6 months)
    print("\n=== EXPERIMENT 8: Extended Duration (6 months) ===")
    print("Testing: Long-term steady-state behavior and seasonal variations")
    # 6 months = 26 weeks = 262080 minutes
    df_extended = run_batch_experiments(
        config, ticks=262080, num_runs=5,  # 6 months, fewer runs due to duration
        calibration=calibration
    )
    df_extended.to_parquet(output_dir / 'extended_duration_6months.parquet')
    print(f"  Saved to extended_duration_6months.parquet")

    # Experiment 9: SURGE_PRICING Baseline Comparison
    print("\n=== EXPERIMENT 9: Surge Pricing Baseline ===")
    print("Testing: How does SIRQ compare against non-auction dynamic pricing?")
    df_surge = run_batch_experiments(
        config, ticks=10080, num_runs=30,
        strategies=['FIFO', 'SIRQ', 'SURGE_PRICING'],
        calibration=calibration
    )
    df_surge.to_parquet(output_dir / 'surge_comparison.parquet')

    # Compute effect sizes vs SURGE_PRICING
    print("\nEffect Sizes (SIRQ vs SURGE_PRICING):")
    effects = compute_effect_sizes(df_surge, baseline='SURGE_PRICING')
    sirq_effects = effects[effects['strategy'] == 'SIRQ']
    print(sirq_effects.to_string())
    effects.to_csv(output_dir / 'surge_effect_sizes.csv', index=False)

    print("\n=== EXTENDED EXPERIMENTS COMPLETE ===")
    print(f"Results saved to {output_dir}")

    return df_bidding, df_extended, df_surge


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--extended':
        run_extended_experiments()
    else:
        run_main_experiment()
