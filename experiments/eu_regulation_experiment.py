"""
EU Driving Regulation Arrival Model for SIRQ.

Models truck arrivals based on EU Regulation EC 561/2006:
- Max 4.5h continuous driving, then 45min mandatory rest
- Daily driving limit: 9h (extendable to 10h twice/week)
- Trucks depart depots early morning (4-6 AM)
- First charging need: ~4.5h after departure -> peak 08:30-10:30
- After rest+charging (~1-1.5h), second driving block -> peak 14:00-16:30
- Reduced overnight traffic

Compares SIRQ performance under EPFL (passenger EV) vs EU-regulation
(truck-specific) arrival patterns.
"""

import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List
from simulation import (
    SimulationConfig, ChargingStation, SimulationResults,
    load_epfl_calibration, run_multi_strategy_experiment
)

# ── EU Regulation Arrival Model ──────────────────────────────────

def get_eu_regulation_calibration(scale_factor: float = 5.0) -> Dict:
    """
    Generate arrival calibration based on EU driving hour regulations.

    EU Regulation EC 561/2006:
    - 4.5h max continuous driving, then 45min mandatory rest
    - Daily limit: 9h driving (10h twice per week)
    - Weekly limit: 56h

    Arrival pattern logic:
    - Trucks depart depots 04:00-06:00 (uniformly distributed)
    - First charging stop after ~4.5h driving: peaks 08:30-10:30
    - Rest + charging takes ~1-1.5h
    - Second driving block: ~4.5h -> arrivals peak 14:00-16:30
    - Some trucks have 3rd short block -> evening arrivals 19:00-21:00
    - Minimal overnight traffic (depot charging, emergencies)
    """
    # Hourly arrival probabilities (per-minute probability before scaling)
    # Based on superposition of departure waves
    hourly_prob = {
        0: 0.0005,   # 00:00 - minimal
        1: 0.0005,   # 01:00 - minimal
        2: 0.0005,   # 02:00 - minimal
        3: 0.0008,   # 03:00 - early departures starting
        4: 0.0010,   # 04:00 - some early arrivals
        5: 0.0015,   # 05:00 - increasing
        6: 0.0020,   # 06:00 - moderate (short-haul first stops)
        7: 0.0035,   # 07:00 - building toward first peak
        8: 0.0070,   # 08:00 - first peak begins (4.5h after 03:30 departures)
        9: 0.0090,   # 09:00 - FIRST PEAK (4.5h after 04:30 departures)
        10: 0.0085,  # 10:00 - first peak continues
        11: 0.0060,  # 11:00 - declining from first peak
        12: 0.0040,  # 12:00 - lunch / transition
        13: 0.0045,  # 13:00 - building toward second peak
        14: 0.0075,  # 14:00 - second peak begins
        15: 0.0085,  # 15:00 - SECOND PEAK (4.5h after first rest ends ~10:30)
        16: 0.0070,  # 16:00 - second peak continues
        17: 0.0050,  # 17:00 - declining
        18: 0.0035,  # 18:00 - some third-block arrivals
        19: 0.0025,  # 19:00 - evening arrivals
        20: 0.0020,  # 20:00 - winding down
        21: 0.0015,  # 21:00 - late arrivals
        22: 0.0010,  # 22:00 - minimal
        23: 0.0008,  # 23:00 - minimal
    }

    # Day-of-week multipliers (EU freight patterns)
    # Monday: high (restocked after weekend)
    # Tuesday-Thursday: peak freight days
    # Friday: high (pre-weekend deliveries)
    # Saturday: reduced (some deliveries)
    # Sunday: minimal (driving ban in many EU countries)
    dow_multiplier = {
        0: 1.10,  # Monday
        1: 1.15,  # Tuesday
        2: 1.15,  # Wednesday
        3: 1.10,  # Thursday
        4: 1.20,  # Friday (highest)
        5: 0.60,  # Saturday (reduced)
        6: 0.30,  # Sunday (driving bans)
    }

    return {
        'hourly_prob': hourly_prob,
        'dow_multiplier': dow_multiplier,
        'scale_factor': scale_factor,
        'model': 'eu_regulation',
        'description': 'EU EC 561/2006 driving hour regulations'
    }


def results_to_dict(r: SimulationResults, strategy: str, model: str) -> Dict:
    """Convert results to dict for DataFrame."""
    return {
        'arrival_model': model,
        'strategy': strategy,
        'processed': r.processed_count,
        'balked': r.balked_count,
        'revenue': r.total_revenue,
        'wait_critical_mean': r.avg_wait_critical,
        'wait_standard_mean': r.avg_wait_standard,
        'wait_economy_mean': r.avg_wait_economy,
        'wait_critical_std': r.std_wait_critical,
        'wait_standard_std': r.std_wait_standard,
        'wait_economy_std': r.std_wait_economy,
        'gini_overall': r.gini_coefficient,
        'sla_violations': r.sla_violations,
        'preemptions': r.preemptions,
    }


def run_arrival_model_comparison(
    num_runs: int = 30,
    ticks: int = 10080,  # 1 week
    scale_factor: float = 5.0
):
    """
    Compare SIRQ performance under EPFL vs EU-regulation arrival patterns.
    """
    strategies = ['FIFO', 'SIRQ', 'EDF', 'FCFS_R']

    # ── Model 1: EPFL calibration (baseline) ──
    print("=" * 60)
    print("Model 1: EPFL Passenger EV Arrival Patterns (scaled)")
    print("=" * 60)

    epfl_cal = load_epfl_calibration()
    config_epfl = SimulationConfig(
        use_epfl_calibration=True,
        epfl_scale_factor=scale_factor,
    )

    epfl_results = []
    for run in range(num_runs):
        strat_results = run_multi_strategy_experiment(
            config_epfl, ticks, strategies, epfl_cal, seed=run
        )
        for strategy, r in strat_results.items():
            row = results_to_dict(r, strategy, 'EPFL')
            row['run'] = run
            epfl_results.append(row)
        if (run + 1) % 10 == 0:
            print(f"  EPFL: Completed {run + 1}/{num_runs} runs")

    # ── Model 2: EU Regulation calibration ──
    print("\n" + "=" * 60)
    print("Model 2: EU Driving Regulation Arrival Patterns")
    print("=" * 60)

    eu_cal = get_eu_regulation_calibration(scale_factor)
    config_eu = SimulationConfig(
        use_epfl_calibration=True,  # Use calibration mode
        epfl_scale_factor=scale_factor,
    )

    eu_results = []
    for run in range(num_runs):
        strat_results = run_multi_strategy_experiment(
            config_eu, ticks, strategies, eu_cal, seed=run
        )
        for strategy, r in strat_results.items():
            row = results_to_dict(r, strategy, 'EU_Regulation')
            row['run'] = run
            eu_results.append(row)
        if (run + 1) % 10 == 0:
            print(f"  EU Reg: Completed {run + 1}/{num_runs} runs")

    # ── Combine and analyze ──
    df = pd.DataFrame(epfl_results + eu_results)
    return df


def analyze_results(df: pd.DataFrame):
    """Print comparison analysis."""
    from scipy import stats as sp_stats

    print("\n" + "=" * 70)
    print("ARRIVAL MODEL COMPARISON: EPFL vs EU Regulation")
    print("=" * 70)

    for model in ['EPFL', 'EU_Regulation']:
        print(f"\n{'─' * 50}")
        print(f"  {model} Arrival Model")
        print(f"{'─' * 50}")

        model_df = df[df['arrival_model'] == model]

        for strategy in ['FIFO', 'SIRQ', 'EDF', 'FCFS_R']:
            s = model_df[model_df['strategy'] == strategy]
            print(f"\n  {strategy}:")
            print(f"    Critical Wait: {s['wait_critical_mean'].mean():.1f} ± {s['wait_critical_mean'].std() * 1.96:.1f} min")
            print(f"    Standard Wait: {s['wait_standard_mean'].mean():.1f} ± {s['wait_standard_mean'].std() * 1.96:.1f} min")
            print(f"    Economy Wait:  {s['wait_economy_mean'].mean():.1f} ± {s['wait_economy_mean'].std() * 1.96:.1f} min")
            print(f"    Throughput:    {s['processed'].mean():.1f} trucks/wk")
            print(f"    Revenue:       ${s['revenue'].mean() / 1000:.1f}k/wk")

    # ── SIRQ improvement comparison ──
    print(f"\n{'=' * 70}")
    print("SIRQ IMPROVEMENT vs FIFO (Critical Wait Time)")
    print(f"{'=' * 70}")

    for model in ['EPFL', 'EU_Regulation']:
        model_df = df[df['arrival_model'] == model]
        fifo_crit = model_df[model_df['strategy'] == 'FIFO']['wait_critical_mean']
        sirq_crit = model_df[model_df['strategy'] == 'SIRQ']['wait_critical_mean']
        edf_crit = model_df[model_df['strategy'] == 'EDF']['wait_critical_mean']

        fifo_mean = fifo_crit.mean()
        sirq_mean = sirq_crit.mean()
        edf_mean = edf_crit.mean()

        # Cohen's d
        pooled_std = np.sqrt((fifo_crit.std()**2 + sirq_crit.std()**2) / 2)
        cohens_d = (sirq_mean - fifo_mean) / pooled_std if pooled_std > 0 else 0

        # t-test
        t_stat, p_val = sp_stats.ttest_ind(sirq_crit, fifo_crit)

        pct_change_sirq = ((sirq_mean - fifo_mean) / fifo_mean) * 100
        pct_change_edf = ((edf_mean - fifo_mean) / fifo_mean) * 100

        print(f"\n  {model}:")
        print(f"    FIFO critical wait:  {fifo_mean:.1f} min")
        print(f"    SIRQ critical wait:  {sirq_mean:.1f} min ({pct_change_sirq:+.1f}%)")
        print(f"    EDF  critical wait:  {edf_mean:.1f} min ({pct_change_edf:+.1f}%)")
        print(f"    Cohen's d (SIRQ):    {cohens_d:.2f}")
        print(f"    p-value (SIRQ):      {p_val:.6f}")

    # ── Cross-model robustness ──
    print(f"\n{'=' * 70}")
    print("ROBUSTNESS: Does SIRQ's advantage persist across arrival models?")
    print(f"{'=' * 70}")

    for model in ['EPFL', 'EU_Regulation']:
        model_df = df[df['arrival_model'] == model]
        fifo = model_df[model_df['strategy'] == 'FIFO']['wait_critical_mean'].mean()
        sirq = model_df[model_df['strategy'] == 'SIRQ']['wait_critical_mean'].mean()
        pct = ((sirq - fifo) / fifo) * 100
        print(f"  {model:15s}: SIRQ reduces critical wait by {abs(pct):.1f}%")


if __name__ == '__main__':
    print("SIRQ Arrival Model Robustness Experiment")
    print("Comparing EPFL (passenger EV) vs EU Regulation (truck-specific)")
    print()

    df = run_arrival_model_comparison(num_runs=30, scale_factor=5.0)

    # Save raw data
    output_path = Path(__file__).parent / 'results' / 'arrival_model_comparison.csv'
    output_path.parent.mkdir(exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"\nRaw data saved to: {output_path}")

    analyze_results(df)
