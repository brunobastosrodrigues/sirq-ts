#!/usr/bin/env python3
"""
Publication-quality figures for IEEE T-ITS paper.

This script generates all figures needed for the SIRQ paper,
following IEEE style guidelines with proper sizing and formatting.
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.ticker import MaxNLocator
import seaborn as sns
from pathlib import Path
from scipy import stats

# IEEE T-ITS style settings
plt.rcParams.update({
    'font.family': 'serif',
    'font.serif': ['Times New Roman', 'DejaVu Serif'],
    'font.size': 9,
    'axes.labelsize': 9,
    'axes.titlesize': 10,
    'legend.fontsize': 8,
    'xtick.labelsize': 8,
    'ytick.labelsize': 8,
    'figure.figsize': (3.5, 2.5),  # Single column width for IEEE
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.02,
    'axes.grid': True,
    'grid.alpha': 0.3,
    'grid.linewidth': 0.5,
    'lines.linewidth': 1.2,
    'lines.markersize': 4,
    'axes.linewidth': 0.8,
    'xtick.major.width': 0.8,
    'ytick.major.width': 0.8,
    'axes.spines.top': False,
    'axes.spines.right': False,
})

# Professional color palette (colorblind-friendly)
COLORS = {
    'FIFO': '#4477AA',      # Blue
    'SIRQ': '#EE6677',      # Red
    'EDF': '#228833',       # Green
    'FCFS_R': '#CCBB44',    # Yellow
    'CRITICAL': '#AA3377',  # Purple
    'STANDARD': '#66CCEE',  # Cyan
    'ECONOMY': '#BBBBBB',   # Gray
}

MARKERS = {
    'FIFO': 'o',
    'SIRQ': 's',
    'EDF': '^',
    'FCFS_R': 'D',
}

ALL_STRATEGIES = ['FIFO', 'SIRQ', 'EDF', 'FCFS_R']
STRATEGY_LABELS = {
    'FIFO': 'FIFO',
    'SIRQ': 'SIRQ (ours)',
    'EDF': 'EDF',
    'FCFS_R': 'FCFS+R',
}

OUTPUT_DIR = Path('/home/rodrigues/IEEE-ITS-SIRQ/figures')


def load_results():
    """Load experiment results."""
    results_dir = Path('/home/rodrigues/sirq-ts/experiments/results')
    results = {}
    for f in results_dir.glob('*.parquet'):
        results[f.stem] = pd.read_parquet(f)
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


def fig_urgency_patience_correlation():
    """
    Figure 1: Illustrate the urgency-patience inverse correlation (EDF paradox).
    This is a conceptual figure showing why EDF fails.
    """
    fig, ax = plt.subplots(figsize=(3.5, 2.8))

    # Agent types with their characteristics
    agent_types = {
        'Critical': {'urgency': 0.9, 'patience': 0.85, 'color': COLORS['CRITICAL']},
        'Standard': {'urgency': 0.5, 'patience': 0.5, 'color': COLORS['STANDARD']},
        'Economy': {'urgency': 0.15, 'patience': 0.2, 'color': COLORS['ECONOMY']},
    }

    # Plot each agent type
    for name, props in agent_types.items():
        ax.scatter(props['patience'], props['urgency'],
                   s=200, c=props['color'], label=name,
                   edgecolors='black', linewidths=0.8, zorder=5)

    # Add trend line showing inverse correlation
    x_trend = np.linspace(0.1, 0.95, 100)
    y_trend = 0.95 - 0.8 * x_trend + 0.1 * np.random.randn(100) * 0
    ax.plot(x_trend, y_trend, 'k--', alpha=0.5, linewidth=1, label='Inverse correlation')

    # Annotations
    ax.annotate('High urgency,\nhigh patience', xy=(0.85, 0.9), fontsize=7,
                ha='center', va='bottom')
    ax.annotate('Low urgency,\nlow patience', xy=(0.2, 0.15), fontsize=7,
                ha='center', va='top')

    # Add arrow showing EDF direction (wrong!)
    ax.annotate('', xy=(0.15, 0.5), xytext=(0.85, 0.5),
                arrowprops=dict(arrowstyle='->', color='red', lw=1.5))
    ax.text(0.5, 0.55, 'EDF priority direction', ha='center', fontsize=7, color='red')

    ax.set_xlabel('Patience (normalized)')
    ax.set_ylabel('Urgency (normalized)')
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend(loc='upper right', framealpha=0.9, fontsize=7)
    ax.set_title('Urgency-Patience Inverse Correlation', fontsize=10)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'urgency_patience.pdf')
    plt.savefig(OUTPUT_DIR / 'urgency_patience.png')
    plt.close()
    print("Saved urgency_patience.pdf")


def fig_main_results_bar():
    """
    Figure 2: Main comparison bar chart - wait times by agent type.
    """
    results = load_results()
    if 'main_comparison' not in results:
        print("No main_comparison data")
        return

    df = results['main_comparison']
    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, axes = plt.subplots(1, 3, figsize=(7.16, 2.2))  # Double column width

    metrics = [
        ('wait_critical_mean', 'Critical Agents'),
        ('wait_standard_mean', 'Standard Agents'),
        ('wait_economy_mean', 'Economy Agents'),
    ]

    x = np.arange(len(strategies))
    width = 0.7

    for ax, (metric, title) in zip(axes, metrics):
        grouped = df.groupby('strategy')[metric].agg(['mean', 'std']).reindex(strategies)

        bars = ax.bar(x, grouped['mean'], width, yerr=grouped['std'],
                      capsize=2, color=[COLORS[s] for s in strategies],
                      edgecolor='black', linewidth=0.5, error_kw={'linewidth': 0.8})

        # Add significance stars vs FIFO
        fifo_vals = df[df['strategy'] == 'FIFO'][metric].values
        for i, strategy in enumerate(strategies):
            if strategy == 'FIFO':
                continue
            strategy_vals = df[df['strategy'] == strategy][metric].values
            _, p = stats.ttest_ind(fifo_vals, strategy_vals, equal_var=False)
            sig = get_significance_stars(p)
            if sig:
                y_pos = grouped.loc[strategy, 'mean'] + grouped.loc[strategy, 'std'] + 5
                ax.text(i, y_pos, sig, ha='center', va='bottom', fontsize=8, fontweight='bold')

        ax.set_xticks(x)
        ax.set_xticklabels([STRATEGY_LABELS[s] for s in strategies], rotation=30, ha='right')
        ax.set_ylabel('Wait Time (min)')
        ax.set_title(title, fontsize=9)
        ax.set_ylim(bottom=0)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'main_results_waittime.pdf')
    plt.savefig(OUTPUT_DIR / 'main_results_waittime.png')
    plt.close()
    print("Saved main_results_waittime.pdf")


def fig_revenue_fairness_tradeoff():
    """
    Figure 3: Revenue vs Fairness tradeoff scatter.
    Shows the Pareto frontier between efficiency and equity.
    """
    results = load_results()
    if 'main_comparison' not in results:
        return

    df = results['main_comparison']
    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, ax = plt.subplots(figsize=(3.5, 2.8))

    for strategy in strategies:
        s_df = df[df['strategy'] == strategy]
        rev_mean = s_df['revenue'].mean() / 1000
        rev_std = s_df['revenue'].std() / 1000
        gini_mean = s_df['gini_overall'].mean()
        gini_std = s_df['gini_overall'].std()

        ax.errorbar(gini_mean, rev_mean, xerr=gini_std, yerr=rev_std,
                    marker=MARKERS[strategy], markersize=8, capsize=3,
                    color=COLORS[strategy], label=STRATEGY_LABELS[strategy],
                    linewidth=1, markeredgecolor='black', markeredgewidth=0.5)

    # Add arrow showing tradeoff direction
    ax.annotate('', xy=(0.72, 50), xytext=(0.45, 30),
                arrowprops=dict(arrowstyle='->', color='gray', lw=1.5,
                               connectionstyle='arc3,rad=0.2'))
    ax.text(0.58, 42, 'Efficiency-Fairness\nTradeoff', ha='center', fontsize=7,
            color='gray', style='italic')

    ax.set_xlabel('Gini Coefficient (higher = less fair)')
    ax.set_ylabel('Revenue (\\$k/week)')
    ax.legend(loc='lower right', framealpha=0.9)
    ax.set_title('Efficiency-Fairness Tradeoff', fontsize=10)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'revenue_fairness_tradeoff.pdf')
    plt.savefig(OUTPUT_DIR / 'revenue_fairness_tradeoff.png')
    plt.close()
    print("Saved revenue_fairness_tradeoff.pdf")


def fig_edf_paradox():
    """
    Figure 4: EDF paradox visualization - shows why EDF fails.
    Compares wait time reduction by strategy and agent type.
    """
    results = load_results()
    if 'main_comparison' not in results:
        return

    df = results['main_comparison']

    # Compute percent change vs FIFO
    fifo = df[df['strategy'] == 'FIFO']

    fig, ax = plt.subplots(figsize=(3.5, 2.8))

    strategies = ['SIRQ', 'EDF', 'FCFS_R']
    agent_types = ['Critical', 'Standard', 'Economy']
    metrics = ['wait_critical_mean', 'wait_standard_mean', 'wait_economy_mean']

    x = np.arange(len(agent_types))
    width = 0.25

    for i, strategy in enumerate(strategies):
        s_df = df[df['strategy'] == strategy]
        pct_changes = []

        for metric in metrics:
            fifo_mean = fifo[metric].mean()
            s_mean = s_df[metric].mean()
            pct = (s_mean - fifo_mean) / fifo_mean * 100
            pct_changes.append(pct)

        bars = ax.bar(x + i * width - width, pct_changes, width,
                      label=STRATEGY_LABELS[strategy], color=COLORS[strategy],
                      edgecolor='black', linewidth=0.5)

    ax.axhline(y=0, color='black', linewidth=0.8, linestyle='-')
    ax.set_xticks(x)
    ax.set_xticklabels(agent_types)
    ax.set_ylabel('Wait Time Change vs FIFO (%)')
    ax.set_xlabel('Agent Type')
    ax.legend(loc='upper right', framealpha=0.9)
    ax.set_title('EDF Paradox: Wrong Priorities', fontsize=10)

    # Annotate the paradox
    ax.annotate('EDF helps\nEconomy,\nnot Critical!',
                xy=(0, 0), xytext=(0.5, -50),
                fontsize=7, ha='center', color='red',
                arrowprops=dict(arrowstyle='->', color='red', lw=1))

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'edf_paradox.pdf')
    plt.savefig(OUTPUT_DIR / 'edf_paradox.png')
    plt.close()
    print("Saved edf_paradox.pdf")


def fig_sensitivity_chargers():
    """
    Figure 5: Sensitivity to number of chargers.
    """
    results = load_results()
    if 'charger_sweep' not in results:
        print("No charger_sweep data")
        return

    df = results['charger_sweep']
    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, axes = plt.subplots(1, 2, figsize=(7.16, 2.5))

    # Critical wait time
    ax = axes[0]
    for strategy in strategies:
        subset = df[df['strategy'] == strategy]
        grouped = subset.groupby('num_chargers')['wait_critical_mean'].agg(['mean', 'std'])
        ax.errorbar(grouped.index, grouped['mean'], yerr=grouped['std'],
                    marker=MARKERS[strategy], label=STRATEGY_LABELS[strategy],
                    color=COLORS[strategy], capsize=2, linewidth=1.2,
                    markeredgecolor='black', markeredgewidth=0.3)

    ax.set_xlabel('Number of Chargers')
    ax.set_ylabel('Critical Wait Time (min)')
    ax.legend(loc='upper right', framealpha=0.9, fontsize=7)
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_title('(a) Critical Agent Wait Time', fontsize=9)

    # Revenue
    ax = axes[1]
    for strategy in strategies:
        subset = df[df['strategy'] == strategy]
        grouped = subset.groupby('num_chargers')['revenue'].agg(['mean', 'std'])
        ax.errorbar(grouped.index, grouped['mean']/1000, yerr=grouped['std']/1000,
                    marker=MARKERS[strategy], label=STRATEGY_LABELS[strategy],
                    color=COLORS[strategy], capsize=2, linewidth=1.2,
                    markeredgecolor='black', markeredgewidth=0.3)

    ax.set_xlabel('Number of Chargers')
    ax.set_ylabel('Revenue (\\$k/week)')
    ax.legend(loc='lower right', framealpha=0.9, fontsize=7)
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_title('(b) Operator Revenue', fontsize=9)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'sensitivity_chargers.pdf')
    plt.savefig(OUTPUT_DIR / 'sensitivity_chargers.png')
    plt.close()
    print("Saved sensitivity_chargers.pdf")


def fig_sensitivity_traffic():
    """
    Figure 6: Sensitivity to traffic intensity.
    """
    results = load_results()
    if 'traffic_sweep' not in results:
        print("No traffic_sweep data")
        return

    df = results['traffic_sweep']
    strategies = [s for s in ALL_STRATEGIES if s in df['strategy'].unique()]

    fig, axes = plt.subplots(1, 2, figsize=(7.16, 2.5))

    # Critical wait time
    ax = axes[0]
    for strategy in strategies:
        subset = df[df['strategy'] == strategy]
        grouped = subset.groupby('epfl_scale_factor')['wait_critical_mean'].agg(['mean', 'std'])
        ax.errorbar(grouped.index, grouped['mean'], yerr=grouped['std'],
                    marker=MARKERS[strategy], label=STRATEGY_LABELS[strategy],
                    color=COLORS[strategy], capsize=2, linewidth=1.2,
                    markeredgecolor='black', markeredgewidth=0.3)

    ax.set_xlabel('Traffic Scale Factor')
    ax.set_ylabel('Critical Wait Time (min)')
    ax.legend(loc='upper left', framealpha=0.9, fontsize=7)
    ax.set_title('(a) Critical Agent Wait Time', fontsize=9)

    # Gini coefficient
    ax = axes[1]
    for strategy in strategies:
        subset = df[df['strategy'] == strategy]
        grouped = subset.groupby('epfl_scale_factor')['gini_overall'].agg(['mean', 'std'])
        ax.errorbar(grouped.index, grouped['mean'], yerr=grouped['std'],
                    marker=MARKERS[strategy], label=STRATEGY_LABELS[strategy],
                    color=COLORS[strategy], capsize=2, linewidth=1.2,
                    markeredgecolor='black', markeredgewidth=0.3)

    ax.set_xlabel('Traffic Scale Factor')
    ax.set_ylabel('Gini Coefficient')
    ax.legend(loc='upper left', framealpha=0.9, fontsize=7)
    ax.set_title('(b) Fairness (Gini)', fontsize=9)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'sensitivity_traffic.pdf')
    plt.savefig(OUTPUT_DIR / 'sensitivity_traffic.png')
    plt.close()
    print("Saved sensitivity_traffic.pdf")


def fig_effect_sizes():
    """
    Figure 7: Effect size visualization (forest plot style).
    """
    results = load_results()
    if 'main_comparison' not in results:
        return

    df = results['main_comparison']
    fifo = df[df['strategy'] == 'FIFO']

    fig, ax = plt.subplots(figsize=(3.5, 3.5))

    strategies = ['SIRQ', 'EDF', 'FCFS_R']
    metrics = [
        ('wait_critical_mean', 'Critical Wait'),
        ('wait_standard_mean', 'Standard Wait'),
        ('revenue', 'Revenue'),
        ('gini_overall', 'Gini'),
    ]

    y_positions = []
    y = 0

    for metric, label in metrics:
        for i, strategy in enumerate(strategies):
            s_df = df[df['strategy'] == strategy]

            fifo_vals = fifo[metric].values
            s_vals = s_df[metric].values

            pooled_std = np.sqrt((np.var(fifo_vals) + np.var(s_vals)) / 2)
            d = (np.mean(s_vals) - np.mean(fifo_vals)) / pooled_std if pooled_std > 0 else 0

            # Compute 95% CI for Cohen's d (approximate)
            se = np.sqrt(2/30 + d**2/(2*30))
            ci_low = d - 1.96 * se
            ci_high = d + 1.96 * se

            ax.errorbar(d, y, xerr=[[d - ci_low], [ci_high - d]],
                        marker=MARKERS[strategy], color=COLORS[strategy],
                        capsize=3, markersize=6, linewidth=1,
                        markeredgecolor='black', markeredgewidth=0.3)

            y_positions.append((y, f"{label} ({STRATEGY_LABELS[strategy]})"))
            y += 1
        y += 0.5  # Gap between metrics

    ax.axvline(x=0, color='black', linewidth=1, linestyle='-')
    ax.axvline(x=-0.8, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)
    ax.axvline(x=0.8, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)

    ax.set_xlabel("Cohen's d (effect size vs FIFO)")
    ax.set_yticks([p[0] for p in y_positions])
    ax.set_yticklabels([p[1] for p in y_positions], fontsize=7)
    ax.set_title('Effect Sizes vs FIFO Baseline', fontsize=10)

    # Add interpretation zones
    ax.text(-2, y + 0.5, 'Large\nnegative', ha='center', fontsize=6, color='gray')
    ax.text(2, y + 0.5, 'Large\npositive', ha='center', fontsize=6, color='gray')

    ax.set_xlim(-4, 8)
    ax.invert_yaxis()

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'effect_sizes_forest.pdf')
    plt.savefig(OUTPUT_DIR / 'effect_sizes_forest.png')
    plt.close()
    print("Saved effect_sizes_forest.pdf")


def generate_all():
    """Generate all publication figures."""
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("Generating publication-quality figures...")
    print("=" * 50)

    fig_urgency_patience_correlation()
    fig_main_results_bar()
    fig_revenue_fairness_tradeoff()
    fig_edf_paradox()
    fig_sensitivity_chargers()
    fig_sensitivity_traffic()
    fig_effect_sizes()

    print("=" * 50)
    print(f"All figures saved to {OUTPUT_DIR}")


if __name__ == '__main__':
    generate_all()
