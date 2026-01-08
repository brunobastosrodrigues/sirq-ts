"""
Scientific plotting module for SIRQ paper.

Generates publication-quality figures for IEEE T-ITS.
Supports 4 strategies: FIFO, SIRQ, EDF, FCFS_R
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.ticker import MaxNLocator
import seaborn as sns
from pathlib import Path
from scipy import stats
from typing import Optional, Tuple, List


# IEEE T-ITS style settings
plt.rcParams.update({
    'font.family': 'serif',
    'font.size': 10,
    'axes.labelsize': 10,
    'axes.titlesize': 11,
    'legend.fontsize': 9,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'figure.figsize': (3.5, 2.5),  # Single column width
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'axes.grid': True,
    'grid.alpha': 0.3,
    'lines.linewidth': 1.5,
    'lines.markersize': 5,
})

# Color scheme for all strategies
COLORS = {
    'FIFO': '#1f77b4',     # Blue
    'SIRQ': '#ff7f0e',     # Orange
    'EDF': '#2ca02c',      # Green
    'FCFS_R': '#9467bd',   # Purple
    'CRITICAL': '#d62728', # Red
    'STANDARD': '#17becf', # Cyan
    'ECONOMY': '#bcbd22',  # Yellow-green
}

ALL_STRATEGIES = ['FIFO', 'SIRQ', 'EDF', 'FCFS_R']


def load_results(results_dir: str = '/home/rodrigues/sirq-ts/experiments/results') -> dict:
    """Load all experiment results."""
    path = Path(results_dir)
    results = {}

    for f in path.glob('*.parquet'):
        results[f.stem] = pd.read_parquet(f)

    return results


def compute_effect_size(group1: np.ndarray, group2: np.ndarray) -> Tuple[float, str]:
    """Compute Cohen's d effect size."""
    n1, n2 = len(group1), len(group2)
    var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)

    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
    if pooled_std == 0:
        return 0, 'negligible'

    d = (np.mean(group1) - np.mean(group2)) / pooled_std

    # Interpret
    if abs(d) < 0.2:
        interpretation = 'negligible'
    elif abs(d) < 0.5:
        interpretation = 'small'
    elif abs(d) < 0.8:
        interpretation = 'medium'
    else:
        interpretation = 'large'

    return d, interpretation


def statistical_comparison(df: pd.DataFrame, metric: str, baseline: str = 'FIFO') -> dict:
    """Perform statistical comparison against baseline."""
    results = {'baseline': baseline}

    baseline_vals = df[df['strategy'] == baseline][metric].values
    results['baseline_mean'] = np.mean(baseline_vals)
    results['baseline_std'] = np.std(baseline_vals)

    for strategy in df['strategy'].unique():
        if strategy == baseline:
            continue

        strategy_vals = df[df['strategy'] == strategy][metric].values

        # Welch's t-test
        t_stat, p_value = stats.ttest_ind(baseline_vals, strategy_vals, equal_var=False)

        # Effect size
        d, d_interp = compute_effect_size(strategy_vals, baseline_vals)

        # Percent change
        pct_change = (np.mean(strategy_vals) - np.mean(baseline_vals)) / abs(np.mean(baseline_vals)) * 100 if np.mean(baseline_vals) != 0 else 0

        results[strategy] = {
            'mean': np.mean(strategy_vals),
            'std': np.std(strategy_vals),
            't_statistic': t_stat,
            'p_value': p_value,
            'cohens_d': d,
            'effect_interpretation': d_interp,
            'percent_change': pct_change,
        }

    return results


def get_significance_stars(p_value: float) -> str:
    """Get significance stars for p-value."""
    if p_value < 0.001:
        return '***'
    elif p_value < 0.01:
        return '**'
    elif p_value < 0.05:
        return '*'
    return ''


def plot_main_comparison(df: pd.DataFrame, output_dir: str = '/home/rodrigues/sirq-ts/experiments/figures'):
    """Generate main comparison bar plots for all 4 strategies."""
    Path(output_dir).mkdir(exist_ok=True)

    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    # Metrics to plot
    metrics = [
        ('wait_critical_mean', 'Critical Wait Time (min)'),
        ('wait_standard_mean', 'Standard Wait Time (min)'),
        ('wait_economy_mean', 'Economy Wait Time (min)'),
        ('processed', 'Throughput (trucks/wk)'),
        ('revenue', 'Revenue ($)'),
        ('gini_overall', 'Gini Coefficient'),
    ]

    fig, axes = plt.subplots(2, 3, figsize=(10, 6))
    axes = axes.flatten()

    for idx, (metric, label) in enumerate(metrics):
        ax = axes[idx]

        # Group data
        grouped = df.groupby('strategy')[metric].agg(['mean', 'std']).reindex(strategies)

        x = np.arange(len(strategies))
        colors = [COLORS[s] for s in strategies]
        bars = ax.bar(x, grouped['mean'], yerr=grouped['std'], capsize=3,
                      color=colors, alpha=0.8)

        ax.set_xticks(x)
        ax.set_xticklabels(strategies, rotation=45, ha='right')
        ax.set_ylabel(label)

        # Add significance stars vs FIFO for non-FIFO strategies
        fifo_vals = df[df['strategy'] == 'FIFO'][metric].values
        for i, strategy in enumerate(strategies):
            if strategy == 'FIFO':
                continue
            strategy_vals = df[df['strategy'] == strategy][metric].values
            _, p_value = stats.ttest_ind(fifo_vals, strategy_vals, equal_var=False)
            sig = get_significance_stars(p_value)
            if sig:
                y_pos = grouped.loc[strategy, 'mean'] + grouped.loc[strategy, 'std'] + (ax.get_ylim()[1] - ax.get_ylim()[0]) * 0.02
                ax.text(i, y_pos, sig, ha='center', va='bottom', fontsize=8)

    plt.tight_layout()
    plt.savefig(f'{output_dir}/main_comparison.pdf')
    plt.savefig(f'{output_dir}/main_comparison.png')
    plt.close()
    print(f"Saved main_comparison.pdf/png")


def plot_wait_time_distribution(df: pd.DataFrame, output_dir: str = '/home/rodrigues/sirq-ts/experiments/figures'):
    """Plot wait time distributions as box plots for all strategies."""
    Path(output_dir).mkdir(exist_ok=True)

    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, axes = plt.subplots(1, 3, figsize=(10, 3.5))

    agent_types = [
        ('wait_critical_mean', 'Critical Agents'),
        ('wait_standard_mean', 'Standard Agents'),
        ('wait_economy_mean', 'Economy Agents'),
    ]

    for ax, (metric, title) in zip(axes, agent_types):
        data = [df[df['strategy'] == s][metric].values for s in strategies]
        bp = ax.boxplot(data, labels=strategies, patch_artist=True)

        for patch, strategy in zip(bp['boxes'], strategies):
            patch.set_facecolor(COLORS[strategy])
            patch.set_alpha(0.7)

        ax.set_ylabel('Wait Time (min)')
        ax.set_title(title)
        ax.tick_params(axis='x', rotation=45)

    plt.tight_layout()
    plt.savefig(f'{output_dir}/wait_time_distribution.pdf')
    plt.savefig(f'{output_dir}/wait_time_distribution.png')
    plt.close()
    print(f"Saved wait_time_distribution.pdf/png")


def plot_fairness_comparison(df: pd.DataFrame, output_dir: str = '/home/rodrigues/sirq-ts/experiments/figures'):
    """Plot Gini coefficient comparison for fairness analysis."""
    Path(output_dir).mkdir(exist_ok=True)

    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, axes = plt.subplots(1, 2, figsize=(8, 3.5))

    # Overall Gini
    ax = axes[0]
    grouped = df.groupby('strategy')['gini_overall'].agg(['mean', 'std']).reindex(strategies)
    x = np.arange(len(strategies))
    colors = [COLORS[s] for s in strategies]
    ax.bar(x, grouped['mean'], yerr=grouped['std'], capsize=3, color=colors, alpha=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(strategies, rotation=45, ha='right')
    ax.set_ylabel('Gini Coefficient')
    ax.set_title('Overall Wait Time Inequality')
    ax.axhline(y=0.3, color='red', linestyle='--', alpha=0.5, label='High inequality')
    ax.legend(fontsize=8)

    # Gini by agent type
    ax = axes[1]
    width = 0.2
    gini_metrics = ['gini_critical', 'gini_standard', 'gini_economy']
    agent_labels = ['Critical', 'Standard', 'Economy']

    for i, (metric, label) in enumerate(zip(gini_metrics, agent_labels)):
        if metric in df.columns:
            grouped = df.groupby('strategy')[metric].mean().reindex(strategies)
            offset = (i - 1) * width
            ax.bar(x + offset, grouped.values, width, label=label, alpha=0.8)

    ax.set_xticks(x)
    ax.set_xticklabels(strategies, rotation=45, ha='right')
    ax.set_ylabel('Gini Coefficient')
    ax.set_title('Inequality by Agent Type')
    ax.legend(fontsize=8)

    plt.tight_layout()
    plt.savefig(f'{output_dir}/fairness_comparison.pdf')
    plt.savefig(f'{output_dir}/fairness_comparison.png')
    plt.close()
    print(f"Saved fairness_comparison.pdf/png")


def plot_auction_efficiency(df: pd.DataFrame, output_dir: str = '/home/rodrigues/sirq-ts/experiments/figures'):
    """Plot SIRQ auction efficiency metrics."""
    Path(output_dir).mkdir(exist_ok=True)

    # Only SIRQ has auction metrics
    sirq_df = df[df['strategy'] == 'SIRQ']

    if sirq_df.empty or 'auction_attempts' not in sirq_df.columns:
        print("No auction data available")
        return

    fig, axes = plt.subplots(1, 3, figsize=(10, 3))

    # Auction success rate
    ax = axes[0]
    success_rate = sirq_df['auction_success_rate'].values
    ax.hist(success_rate, bins=15, color=COLORS['SIRQ'], alpha=0.8, edgecolor='black')
    ax.axvline(np.mean(success_rate), color='red', linestyle='--', label=f'Mean: {np.mean(success_rate):.1%}')
    ax.set_xlabel('Auction Success Rate')
    ax.set_ylabel('Frequency')
    ax.set_title('Auction Success Distribution')
    ax.legend(fontsize=8)

    # Preemptions vs Revenue scatter
    ax = axes[1]
    ax.scatter(sirq_df['preemptions'], sirq_df['revenue'], alpha=0.6, color=COLORS['SIRQ'])
    ax.set_xlabel('Number of Preemptions')
    ax.set_ylabel('Revenue ($)')
    ax.set_title('Preemptions vs Revenue')

    # Revenue comparison (FIFO vs SIRQ)
    ax = axes[2]
    fifo_rev = df[df['strategy'] == 'FIFO']['revenue'].values
    sirq_rev = sirq_df['revenue'].values
    bp = ax.boxplot([fifo_rev, sirq_rev], labels=['FIFO', 'SIRQ'], patch_artist=True)
    bp['boxes'][0].set_facecolor(COLORS['FIFO'])
    bp['boxes'][1].set_facecolor(COLORS['SIRQ'])
    for box in bp['boxes']:
        box.set_alpha(0.7)
    ax.set_ylabel('Revenue ($)')
    ax.set_title('Revenue Comparison')

    # Add significance
    _, p = stats.ttest_ind(fifo_rev, sirq_rev, equal_var=False)
    sig = get_significance_stars(p)
    y_max = max(np.max(fifo_rev), np.max(sirq_rev)) * 1.05
    ax.plot([1, 1, 2, 2], [y_max, y_max * 1.02, y_max * 1.02, y_max], 'k-', lw=0.8)
    ax.text(1.5, y_max * 1.04, sig, ha='center', fontsize=10)

    plt.tight_layout()
    plt.savefig(f'{output_dir}/auction_efficiency.pdf')
    plt.savefig(f'{output_dir}/auction_efficiency.png')
    plt.close()
    print(f"Saved auction_efficiency.pdf/png")


def plot_parameter_sweep(df: pd.DataFrame, param_name: str, param_label: str,
                         output_dir: str = '/home/rodrigues/sirq-ts/experiments/figures'):
    """Plot parameter sweep results for all strategies."""
    Path(output_dir).mkdir(exist_ok=True)

    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, axes = plt.subplots(1, 3, figsize=(10, 3))

    metrics = [
        ('wait_critical_mean', 'Critical Wait Time (min)'),
        ('processed', 'Throughput'),
        ('gini_overall', 'Gini Coefficient'),
    ]

    for ax, (metric, ylabel) in zip(axes, metrics):
        if metric not in df.columns:
            continue

        for strategy in strategies:
            subset = df[df['strategy'] == strategy]
            grouped = subset.groupby(param_name)[metric].agg(['mean', 'std'])

            ax.errorbar(grouped.index, grouped['mean'], yerr=grouped['std'],
                        marker='o', label=strategy, color=COLORS[strategy], capsize=3)

        ax.set_xlabel(param_label)
        ax.set_ylabel(ylabel)
        ax.legend(fontsize=8)
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))

    plt.tight_layout()
    plt.savefig(f'{output_dir}/{param_name}_sweep.pdf')
    plt.savefig(f'{output_dir}/{param_name}_sweep.png')
    plt.close()
    print(f"Saved {param_name}_sweep.pdf/png")


def plot_epfl_arrival_pattern(output_dir: str = '/home/rodrigues/sirq-ts/experiments/figures'):
    """Plot EPFL arrival pattern for methodology section."""
    Path(output_dir).mkdir(exist_ok=True)

    # Load calibration
    cal = np.load('/home/rodrigues/sirq-ts/epfl_calibration.npz')
    hourly_prob = cal['hourly_prob']

    fig, ax = plt.subplots(figsize=(5, 2.5))

    hours = np.arange(24)
    ax.bar(hours, hourly_prob * 1000, color=COLORS['SIRQ'], alpha=0.8)  # Scale for visibility

    ax.set_xlabel('Hour of Day')
    ax.set_ylabel('Arrival Rate (×10⁻³/min)')
    ax.set_title('Arrival Pattern from EPFL Dataset')
    ax.set_xticks([0, 6, 12, 18, 23])
    ax.set_xticklabels(['00:00', '06:00', '12:00', '18:00', '23:00'])

    # Add peak annotation
    peak_hour = np.argmax(hourly_prob)
    ax.annotate(f'Peak: {peak_hour}:00', xy=(peak_hour, hourly_prob[peak_hour] * 1000),
                xytext=(peak_hour + 3, hourly_prob[peak_hour] * 1000 * 1.2),
                arrowprops=dict(arrowstyle='->', color='black'),
                fontsize=8)

    plt.tight_layout()
    plt.savefig(f'{output_dir}/epfl_arrival_pattern.pdf')
    plt.savefig(f'{output_dir}/epfl_arrival_pattern.png')
    plt.close()
    print(f"Saved epfl_arrival_pattern.pdf/png")


def generate_latex_table(df: pd.DataFrame, output_path: str):
    """Generate LaTeX comparison table with all 4 strategies."""
    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    # Compute stats for each strategy
    table_rows = []
    for strategy in strategies:
        s_df = df[df['strategy'] == strategy]

        # Get effect size vs FIFO
        if strategy != 'FIFO':
            fifo_df = df[df['strategy'] == 'FIFO']
            _, p_crit = stats.ttest_ind(fifo_df['wait_critical_mean'], s_df['wait_critical_mean'], equal_var=False)
            _, p_rev = stats.ttest_ind(fifo_df['revenue'], s_df['revenue'], equal_var=False)
            sig_crit = get_significance_stars(p_crit)
            sig_rev = get_significance_stars(p_rev)
        else:
            sig_crit = sig_rev = ''

        row = {
            'strategy': strategy,
            'wait_critical': f"{s_df['wait_critical_mean'].mean():.1f} $\\pm$ {s_df['wait_critical_mean'].std():.1f}{sig_crit}",
            'wait_standard': f"{s_df['wait_standard_mean'].mean():.1f} $\\pm$ {s_df['wait_standard_mean'].std():.1f}",
            'wait_economy': f"{s_df['wait_economy_mean'].mean():.1f} $\\pm$ {s_df['wait_economy_mean'].std():.1f}",
            'throughput': f"{s_df['processed'].mean():.1f} $\\pm$ {s_df['processed'].std():.1f}",
            'revenue': f"{s_df['revenue'].mean()/1000:.1f}k $\\pm$ {s_df['revenue'].std()/1000:.1f}k{sig_rev}",
            'sla': f"{s_df['sla_violations'].mean():.1f} $\\pm$ {s_df['sla_violations'].std():.1f}",
            'gini': f"{s_df['gini_overall'].mean():.3f} $\\pm$ {s_df['gini_overall'].std():.3f}",
        }
        table_rows.append(row)

    # Generate LaTeX
    latex = r"""\begin{table}[t]
\centering
\caption{Performance Comparison: All Strategies ($n = 30$ runs, 1 week each). Statistical significance vs.\ FIFO: *** $p < 0.001$, ** $p < 0.01$, * $p < 0.05$.}
\label{tb:comparison}
\resizebox{\columnwidth}{!}{%
\begin{tabular}{l c c c c c c c}
\toprule
\textbf{Strategy} & \textbf{Critical} & \textbf{Standard} & \textbf{Economy} & \textbf{Throughput} & \textbf{Revenue} & \textbf{SLA} & \textbf{Gini} \\
 & (min) & (min) & (min) & (trucks/wk) & (\$/wk) & Viol. & \\
\midrule
"""

    for row in table_rows:
        latex += f"{row['strategy']} & {row['wait_critical']} & {row['wait_standard']} & {row['wait_economy']} & {row['throughput']} & {row['revenue']} & {row['sla']} & {row['gini']} \\\\\n"

    latex += r"""\bottomrule
\end{tabular}%
}
\end{table}
"""

    with open(output_path, 'w') as f:
        f.write(latex)
    print(f"Saved {output_path}")


def generate_effect_size_table(df: pd.DataFrame, output_path: str):
    """Generate effect size table for all strategies vs FIFO."""
    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique() and s != 'FIFO']
    fifo_df = df[df['strategy'] == 'FIFO']

    rows = []
    metrics = [
        ('wait_critical_mean', 'Critical Wait'),
        ('wait_standard_mean', 'Standard Wait'),
        ('wait_economy_mean', 'Economy Wait'),
        ('revenue', 'Revenue'),
        ('gini_overall', 'Gini'),
    ]

    for strategy in strategies:
        s_df = df[df['strategy'] == strategy]
        row = {'strategy': strategy}

        for metric, label in metrics:
            if metric not in df.columns:
                continue

            fifo_vals = fifo_df[metric].values
            s_vals = s_df[metric].values

            pooled_std = np.sqrt((np.var(fifo_vals) + np.var(s_vals)) / 2)
            d = (np.mean(s_vals) - np.mean(fifo_vals)) / pooled_std if pooled_std > 0 else 0
            _, p = stats.ttest_ind(fifo_vals, s_vals, equal_var=False)

            sig = get_significance_stars(p)
            row[label] = f"{d:+.2f}{sig}"

        rows.append(row)

    # Generate LaTeX
    metric_labels = [m[1] for m in metrics if m[0] in df.columns]
    header = " & ".join(["\\textbf{Strategy}"] + [f"\\textbf{{{l}}}" for l in metric_labels])

    latex = f"""\\begin{{table}}[t]
\\centering
\\caption{{Cohen's $d$ Effect Sizes vs.\\ FIFO Baseline. Positive values indicate increase, negative indicate decrease.}}
\\label{{tb:effect_sizes}}
\\begin{{tabular}}{{l {'c ' * len(metric_labels)}}}
\\toprule
{header} \\\\
\\midrule
"""

    for row in rows:
        values = [row['strategy']] + [row.get(l, 'N/A') for l in metric_labels]
        latex += " & ".join(values) + " \\\\\n"

    latex += """\\bottomrule
\\end{tabular}
\\end{table}
"""

    with open(output_path, 'w') as f:
        f.write(latex)
    print(f"Saved {output_path}")


def generate_all_figures():
    """Generate all figures for the paper."""
    results = load_results()

    output_dir = '/home/rodrigues/sirq-ts/experiments/figures'
    Path(output_dir).mkdir(exist_ok=True)

    # EPFL arrival pattern
    plot_epfl_arrival_pattern(output_dir)

    if 'main_comparison' in results:
        df = results['main_comparison']
        plot_main_comparison(df, output_dir)
        plot_wait_time_distribution(df, output_dir)

        if 'gini_overall' in df.columns:
            plot_fairness_comparison(df, output_dir)

        if 'auction_attempts' in df.columns:
            plot_auction_efficiency(df, output_dir)

        # Generate LaTeX tables
        generate_latex_table(df, f'{output_dir}/comparison_table.tex')
        generate_effect_size_table(df, f'{output_dir}/effect_sizes_table.tex')

        # Print statistical summary
        print("\n=== STATISTICAL SUMMARY ===")
        for metric in ['wait_critical_mean', 'processed', 'revenue', 'gini_overall']:
            if metric not in df.columns:
                continue
            stats_result = statistical_comparison(df, metric)
            print(f"\n{metric}:")
            print(f"  FIFO: {stats_result['baseline_mean']:.2f} ± {stats_result['baseline_std']:.2f}")
            for strategy in ['SIRQ', 'EDF', 'FCFS_R']:
                if strategy in stats_result:
                    s = stats_result[strategy]
                    print(f"  {strategy}: {s['mean']:.2f} ± {s['std']:.2f} ({s['percent_change']:+.1f}%, d={s['cohens_d']:.2f}, p={s['p_value']:.4f})")

    # Parameter sweeps
    if 'charger_sweep' in results:
        plot_parameter_sweep(results['charger_sweep'], 'num_chargers', 'Number of Chargers', output_dir)

    if 'traffic_sweep' in results:
        plot_parameter_sweep(results['traffic_sweep'], 'epfl_scale_factor', 'Traffic Scale Factor', output_dir)

    if 'critical_sweep' in results:
        plot_parameter_sweep(results['critical_sweep'], 'prob_critical', 'P(Critical)', output_dir)

    if 'mct_sweep' in results:
        plot_parameter_sweep(results['mct_sweep'], 'mct', 'MCT (min)', output_dir)

    if 'reservation_sweep' in results:
        plot_parameter_sweep(results['reservation_sweep'], 'reservation_prob', 'Reservation Probability', output_dir)

    print(f"\n=== ALL FIGURES SAVED TO {output_dir} ===")


if __name__ == '__main__':
    generate_all_figures()
