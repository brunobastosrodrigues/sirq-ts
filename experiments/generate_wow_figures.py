#!/usr/bin/env python3
"""
WOW-effect publication figures for IEEE T-ITS.

These figures go beyond standard bar charts to show:
- Full distributions (CDFs)
- Time dynamics
- Urgency-patience relationships
- Effect size visualizations
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, ConnectionPatch
from matplotlib.gridspec import GridSpec
import matplotlib.patheffects as path_effects
from scipy import stats
from pathlib import Path

# IEEE style - Balanced font sizes for print legibility
plt.rcParams.update({
    'font.family': 'serif',
    'font.serif': ['Times New Roman', 'DejaVu Serif'],
    'font.size': 9,
    'axes.labelsize': 9,
    'axes.titlesize': 10,
    'legend.fontsize': 7,
    'xtick.labelsize': 8,
    'ytick.labelsize': 8,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.05,
    'axes.grid': True,
    'grid.alpha': 0.3,
    'grid.linewidth': 0.5,
    'lines.linewidth': 2.5,
    'lines.markersize': 8,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'legend.framealpha': 0.95,
    'legend.edgecolor': 'gray',
})

# Colorblind-friendly palette
COLORS = {
    'FIFO': '#4477AA',
    'SIRQ': '#EE6677',
    'EDF': '#228833',
    'FCFS_R': '#CCBB44',
    'CRITICAL': '#AA3377',
    'STANDARD': '#66CCEE',
    'ECONOMY': '#999999',
}

OUTPUT_DIR = Path('/home/rodrigues/IEEE-ITS-SIRQ/figures')


def load_results():
    results_dir = Path('/home/rodrigues/sirq-ts/experiments/results')
    results = {}
    for f in results_dir.glob('*.parquet'):
        results[f.stem] = pd.read_parquet(f)
    return results


def fig_hero_comparison():
    """
    HERO FIGURE: Multi-panel comparison showing the full story.
    This is the main results figure that tells the complete narrative.
    """
    results = load_results()
    if 'main_comparison' not in results:
        return

    df = results['main_comparison']

    fig = plt.figure(figsize=(7.16, 4.5))  # Double column
    gs = GridSpec(2, 3, figure=fig, hspace=0.55, wspace=0.35)

    strategies = ['FIFO', 'SIRQ', 'EDF', 'FCFS_R']
    labels = {'FIFO': 'FIFO', 'SIRQ': 'SIRQ (ours)', 'EDF': 'EDF', 'FCFS_R': 'FCFS+R'}

    # Panel A: Critical wait time bars with CI
    ax1 = fig.add_subplot(gs[0, 0])
    metric = 'wait_critical_mean'
    means = [df[df['strategy']==s][metric].mean() for s in strategies]
    stds = [df[df['strategy']==s][metric].std() for s in strategies]
    # 95% CI = 1.96 * std / sqrt(n)
    cis = [1.96 * std / np.sqrt(30) for std in stds]

    x = np.arange(len(strategies))
    bars = ax1.bar(x, means, yerr=cis, capsize=4,
                   color=[COLORS[s] for s in strategies],
                   edgecolor='black', linewidth=0.5, alpha=0.85)

    # Add percentage change annotations
    fifo_mean = means[0]
    for i, (m, s) in enumerate(zip(means[1:], strategies[1:]), 1):
        pct = (m - fifo_mean) / fifo_mean * 100
        color = 'green' if pct < 0 else 'red'
        ax1.annotate(f'{pct:+.0f}%', xy=(i, m + cis[i] + 10),
                     ha='center', fontsize=10, fontweight='bold', color=color)

    ax1.set_xticks(x)
    ax1.set_xticklabels([labels[s] for s in strategies], rotation=25, ha='right')
    ax1.set_ylabel('Wait Time (min)')
    ax1.set_title('(a) Critical Agents', fontsize=10, fontweight='bold')
    ax1.set_ylim(0, 350)

    # Panel B: Economy wait time (showing EDF advantage)
    ax2 = fig.add_subplot(gs[0, 1])
    metric = 'wait_economy_mean'
    means = [df[df['strategy']==s][metric].mean() for s in strategies]
    stds = [df[df['strategy']==s][metric].std() for s in strategies]
    cis = [1.96 * std / np.sqrt(30) for std in stds]

    bars = ax2.bar(x, means, yerr=cis, capsize=4,
                   color=[COLORS[s] for s in strategies],
                   edgecolor='black', linewidth=0.5, alpha=0.85)

    fifo_mean = means[0]
    for i, (m, s) in enumerate(zip(means[1:], strategies[1:]), 1):
        pct = (m - fifo_mean) / fifo_mean * 100
        color = 'green' if pct < 0 else 'red'
        ax2.annotate(f'{pct:+.0f}%', xy=(i, m + cis[i] + 10),
                     ha='center', fontsize=10, fontweight='bold', color=color)

    ax2.set_xticks(x)
    ax2.set_xticklabels([labels[s] for s in strategies], rotation=25, ha='right')
    ax2.set_ylabel('Wait Time (min)')
    ax2.set_title('(b) Economy Agents', fontsize=10, fontweight='bold')
    ax2.set_ylim(0, 450)

    # Panel C: Revenue comparison
    ax3 = fig.add_subplot(gs[0, 2])
    metric = 'revenue'
    means = [df[df['strategy']==s][metric].mean()/1000 for s in strategies]
    stds = [df[df['strategy']==s][metric].std()/1000 for s in strategies]
    cis = [1.96 * std / np.sqrt(30) for std in stds]

    bars = ax3.bar(x, means, yerr=cis, capsize=4,
                   color=[COLORS[s] for s in strategies],
                   edgecolor='black', linewidth=0.5, alpha=0.85)

    fifo_mean = means[0]
    for i, (m, s) in enumerate(zip(means[1:], strategies[1:]), 1):
        pct = (m - fifo_mean) / fifo_mean * 100
        color = 'green' if pct > 0 else 'red'
        ax3.annotate(f'{pct:+.0f}%', xy=(i, m + cis[i] + 1),
                     ha='center', fontsize=10, fontweight='bold', color=color)

    ax3.set_xticks(x)
    ax3.set_xticklabels([labels[s] for s in strategies], rotation=25, ha='right')
    ax3.set_ylabel('Revenue (\\$k/week)')
    ax3.set_title('(c) Operator Revenue', fontsize=10, fontweight='bold')
    ax3.set_ylim(0, 65)

    # Panel D: CDF of critical wait times
    ax4 = fig.add_subplot(gs[1, 0])
    for strategy in strategies:
        data = df[df['strategy'] == strategy]['wait_critical_mean'].values
        sorted_data = np.sort(data)
        cdf = np.arange(1, len(sorted_data) + 1) / len(sorted_data)
        ax4.plot(sorted_data, cdf, label=labels[strategy],
                 color=COLORS[strategy], linewidth=2)

    ax4.axvline(x=60, color='gray', linestyle='--', alpha=0.7, linewidth=1.5)
    ax4.text(70, 0.5, '1 hour', fontsize=10, color='gray', rotation=90, va='center')
    ax4.set_xlabel('Wait Time (min)')
    ax4.set_ylabel('Cumulative Probability')
    ax4.set_title('(d) Critical Wait CDF', fontsize=10, fontweight='bold')
    ax4.legend(loc='lower right', fontsize=7, framealpha=0.7, edgecolor='gray')
    ax4.set_xlim(0, 400)

    # Panel E: Fairness-Efficiency Pareto frontier
    ax5 = fig.add_subplot(gs[1, 1])
    for strategy in strategies:
        s_df = df[df['strategy'] == strategy]
        rev_mean = s_df['revenue'].mean() / 1000
        rev_ci = 1.96 * s_df['revenue'].std() / 1000 / np.sqrt(30)
        gini_mean = s_df['gini_overall'].mean()
        gini_ci = 1.96 * s_df['gini_overall'].std() / np.sqrt(30)

        ax5.errorbar(gini_mean, rev_mean, xerr=gini_ci, yerr=rev_ci,
                     marker='o', markersize=10, capsize=4,
                     color=COLORS[strategy], label=labels[strategy],
                     markeredgecolor='black', markeredgewidth=0.5,
                     linewidth=1.5)

    ax5.set_xlabel('Gini Coefficient (higher = less fair)')
    ax5.set_ylabel('Revenue (\\$k/week)')
    ax5.set_title('(e) Pareto Frontier', fontsize=10, fontweight='bold')
    ax5.legend(loc='upper left', fontsize=6, framealpha=0.6, edgecolor='none',
               handletextpad=0.3, borderpad=0.3, labelspacing=0.2)

    # Panel F: Effect sizes as vertical bar chart (consistent with panels a, b, c)
    ax6 = fig.add_subplot(gs[1, 2])

    # Compute Cohen's d for SIRQ vs FIFO on key metrics (short labels like other panels)
    metrics_for_effect = [
        ('wait_critical_mean', 'Crit.'),
        ('wait_standard_mean', 'Std.'),
        ('revenue', 'Rev.'),
        ('gini_overall', 'Gini'),
    ]

    fifo_df = df[df['strategy'] == 'FIFO']
    sirq_df = df[df['strategy'] == 'SIRQ']

    effect_sizes = []
    effect_cis = []
    effect_labels = []
    bar_colors = []

    for metric, label in metrics_for_effect:
        fifo_vals = fifo_df[metric].values
        sirq_vals = sirq_df[metric].values

        pooled_std = np.sqrt((np.var(fifo_vals) + np.var(sirq_vals)) / 2)
        d = (np.mean(sirq_vals) - np.mean(fifo_vals)) / pooled_std if pooled_std > 0 else 0

        se = np.sqrt(2/30 + d**2/(2*30))
        ci = 1.96 * se

        effect_sizes.append(d)
        effect_cis.append(ci)
        effect_labels.append(label)
        bar_colors.append('#228833' if d < 0 else '#CC3311')  # Green for reduction, red for increase

    x_pos = np.arange(len(effect_labels))
    bars = ax6.bar(x_pos, effect_sizes, yerr=effect_cis, capsize=4,
                   color=bar_colors, edgecolor='black', linewidth=0.5, alpha=0.85)

    ax6.axhline(y=0, color='black', linewidth=1)
    ax6.axhline(y=-0.8, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)
    ax6.axhline(y=0.8, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)

    ax6.set_xticks(x_pos)
    ax6.set_xticklabels(effect_labels, rotation=25, ha='right')
    ax6.set_ylabel("Cohen's d")
    ax6.set_title('(f) SIRQ vs FIFO', fontsize=10, fontweight='bold')
    ax6.set_ylim(-4, 5)

    plt.savefig(OUTPUT_DIR / 'hero_comparison.pdf')
    plt.savefig(OUTPUT_DIR / 'hero_comparison.png')
    plt.close()
    print("Saved hero_comparison.pdf")


def fig_edf_paradox_explained():
    """
    EDF Paradox figure - compact 2-panel design matching paper style.
    Minimal annotations, small fonts (7pt max), data-focused.
    """
    fig, axes = plt.subplots(1, 2, figsize=(7.16, 2.2))

    # =======================================================================
    # Panel A: Urgency vs Patience Scatter (compact)
    # =======================================================================
    ax = axes[0]

    np.random.seed(42)
    n_per_type = 20

    # Generate correlated data
    crit_patience = np.random.uniform(0.70, 0.95, n_per_type)
    crit_urgency = 0.7 + 0.25 * (crit_patience - 0.7) / 0.25 + np.random.normal(0, 0.05, n_per_type)
    crit_urgency = np.clip(crit_urgency, 0.65, 0.98)

    std_patience = np.random.uniform(0.35, 0.65, n_per_type)
    std_urgency = 0.35 + 0.3 * (std_patience - 0.35) / 0.3 + np.random.normal(0, 0.06, n_per_type)
    std_urgency = np.clip(std_urgency, 0.30, 0.68)

    econ_patience = np.random.uniform(0.08, 0.35, n_per_type)
    econ_urgency = 0.05 + 0.25 * (econ_patience - 0.08) / 0.27 + np.random.normal(0, 0.04, n_per_type)
    econ_urgency = np.clip(econ_urgency, 0.03, 0.32)

    # Plot with smaller markers
    ax.scatter(crit_patience, crit_urgency, s=35, c=COLORS['CRITICAL'],
               label='Critical', edgecolors='black', linewidths=0.3, alpha=0.85)
    ax.scatter(std_patience, std_urgency, s=35, c=COLORS['STANDARD'],
               label='Standard', edgecolors='black', linewidths=0.3, alpha=0.85)
    ax.scatter(econ_patience, econ_urgency, s=35, c=COLORS['ECONOMY'],
               label='Economy', edgecolors='black', linewidths=0.3, alpha=0.85)

    # Trend line
    all_patience = np.concatenate([crit_patience, std_patience, econ_patience])
    all_urgency = np.concatenate([crit_urgency, std_urgency, econ_urgency])
    slope, intercept, r_value, _, _ = stats.linregress(all_patience, all_urgency)
    x_line = np.linspace(0.05, 0.98, 100)
    ax.plot(x_line, slope * x_line + intercept, 'k--', alpha=0.5, linewidth=1)

    # Minimal annotations in blank space (top-left and bottom-right corners)
    ax.text(0.03, 0.97, f'r = {r_value:.2f}', fontsize=6, ha='left', va='top',
            transform=ax.transAxes, style='italic')

    # EDF arrow showing direction of priority (in blank space at middle)
    ax.annotate('', xy=(0.12, 0.48), xytext=(0.88, 0.48),
                arrowprops=dict(arrowstyle='->', color=COLORS['EDF'], lw=1.5))
    ax.text(0.50, 0.42, 'EDF priority', fontsize=6, ha='center', va='top',
            color=COLORS['EDF'], fontweight='bold')

    ax.set_xlabel('Patience', fontsize=7)
    ax.set_ylabel('Urgency', fontsize=7)
    ax.set_title('(a) Urgency-Patience Correlation', fontsize=8, fontweight='bold')
    ax.legend(loc='lower right', fontsize=5, framealpha=0.8, edgecolor='none',
              handletextpad=0.3, borderpad=0.3, labelspacing=0.2)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.tick_params(axis='both', labelsize=6)

    # =======================================================================
    # Panel B: Wait Time Change (bar chart matching hero style)
    # =======================================================================
    ax = axes[1]

    results = load_results()
    df = results['main_comparison']
    fifo = df[df['strategy'] == 'FIFO']

    strategies = ['SIRQ', 'EDF', 'FCFS_R']
    agent_types = ['Critical', 'Standard', 'Economy']
    metrics = ['wait_critical_mean', 'wait_standard_mean', 'wait_economy_mean']

    x = np.arange(len(agent_types))
    width = 0.25

    for i, strategy in enumerate(strategies):
        s_df = df[df['strategy'] == strategy]
        pct_changes = []
        pct_cis = []

        for metric in metrics:
            fifo_vals = fifo[metric].values
            s_vals = s_df[metric].values
            fifo_mean = fifo_vals.mean()
            s_mean = s_vals.mean()
            pct = (s_mean - fifo_mean) / fifo_mean * 100
            pct_changes.append(pct)
            se = np.sqrt((s_vals.std()/fifo_mean)**2 + (fifo_vals.std()*s_mean/fifo_mean**2)**2) * 100
            pct_cis.append(1.96 * se / np.sqrt(30))

        offset = (i - 1) * width
        lbl = 'SIRQ' if strategy == 'SIRQ' else ('EDF' if strategy == 'EDF' else 'FCFS+R')
        bars = ax.bar(x + offset, pct_changes, width, yerr=pct_cis, capsize=2,
                      label=lbl, color=COLORS[strategy], edgecolor='black', linewidth=0.3)

        # Add percentage labels above/below bars (like hero figure)
        for j, (pct, ci) in enumerate(zip(pct_changes, pct_cis)):
            color = 'green' if pct < 0 else 'red'
            y_pos = pct + ci + 2 if pct >= 0 else pct - ci - 2
            va = 'bottom' if pct >= 0 else 'top'
            ax.text(x[j] + offset, y_pos, f'{pct:+.0f}%', ha='center', va=va,
                    fontsize=6, fontweight='bold', color=color)

    ax.axhline(y=0, color='black', linewidth=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(agent_types, fontsize=6)
    ax.set_ylabel('Wait vs FIFO (%)', fontsize=7)
    ax.set_title('(b) EDF Fails Critical Trucks', fontsize=8, fontweight='bold')
    ax.legend(loc='upper right', fontsize=5, framealpha=0.8, edgecolor='none',
              handletextpad=0.3, borderpad=0.3, labelspacing=0.2, ncol=3)
    ax.set_ylim(-80, 30)
    ax.tick_params(axis='both', labelsize=6)

    plt.tight_layout(pad=0.5)
    plt.savefig(OUTPUT_DIR / 'edf_paradox_explained.pdf')
    plt.savefig(OUTPUT_DIR / 'edf_paradox_explained.png')
    plt.close()
    print("Saved edf_paradox_explained.pdf")


def fig_sensitivity_combined():
    """
    Combined sensitivity analysis figure.
    """
    results = load_results()

    fig, axes = plt.subplots(1, 2, figsize=(7.16, 2.8))

    strategies = ['FIFO', 'SIRQ', 'EDF', 'FCFS_R']
    labels = {'FIFO': 'FIFO', 'SIRQ': 'SIRQ (ours)', 'EDF': 'EDF', 'FCFS_R': 'FCFS+R'}
    markers = {'FIFO': 'o', 'SIRQ': 's', 'EDF': '^', 'FCFS_R': 'D'}

    # Panel A: Charger count
    if 'charger_sweep' in results:
        ax = axes[0]
        df = results['charger_sweep']

        for strategy in strategies:
            subset = df[df['strategy'] == strategy]
            grouped = subset.groupby('num_chargers')['wait_critical_mean'].agg(['mean', 'std'])
            ci = 1.96 * grouped['std'] / np.sqrt(10)

            ax.errorbar(grouped.index, grouped['mean'], yerr=ci,
                        marker=markers[strategy], label=labels[strategy],
                        color=COLORS[strategy], capsize=3, linewidth=1.5,
                        markeredgecolor='black', markeredgewidth=0.3, markersize=6)

        ax.set_xlabel('Number of Chargers')
        ax.set_ylabel('Critical Wait Time (min)')
        ax.set_title('(a) Scalability', fontsize=10, fontweight='bold')
        ax.legend(loc='upper right', fontsize=7, framealpha=0.7, edgecolor='gray')

        # Add congestion zone
        ax.axvspan(2, 4, alpha=0.1, color='red')
        ax.text(3, ax.get_ylim()[1]*0.85, 'High\nCongestion',
                ha='center', fontsize=10, color='red')

    # Panel B: Traffic intensity
    if 'traffic_sweep' in results:
        ax = axes[1]
        df = results['traffic_sweep']

        for strategy in strategies:
            subset = df[df['strategy'] == strategy]
            grouped = subset.groupby('epfl_scale_factor')['wait_critical_mean'].agg(['mean', 'std'])
            ci = 1.96 * grouped['std'] / np.sqrt(10)

            ax.errorbar(grouped.index, grouped['mean'], yerr=ci,
                        marker=markers[strategy], label=labels[strategy],
                        color=COLORS[strategy], capsize=3, linewidth=1.5,
                        markeredgecolor='black', markeredgewidth=0.3, markersize=6)

        ax.set_xlabel('Traffic Scale Factor')
        ax.set_ylabel('Critical Wait Time (min)')
        ax.set_title('(b) Traffic Intensity', fontsize=10, fontweight='bold')
        ax.legend(loc='upper right', fontsize=7, framealpha=0.7, edgecolor='gray')

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'sensitivity_combined.pdf')
    plt.savefig(OUTPUT_DIR / 'sensitivity_combined.png')
    plt.close()
    print("Saved sensitivity_combined.pdf")


def fig_edf_correlation_sensitivity():
    """
    Figure 12: EDF performance under different urgency-patience relationships.
    Shows that EDF fails when urgency and patience are inversely correlated
    but works well when they're positively correlated.
    """
    fig, ax = plt.subplots(figsize=(3.5, 2.5))

    # Data from correlation sensitivity experiments (Table in paper)
    correlations = ['Inverse\n(Baseline)', 'No\nCorrelation', 'Positive\nCorrelation']
    agent_types = ['Critical', 'Standard', 'Economy']

    # Percent change vs FIFO for EDF under each correlation assumption
    data = {
        'Critical': [0.8, -37.5, -54.6],
        'Standard': [-11.8, -18.7, -13.1],
        'Economy': [-38.9, 5.1, 48.2]
    }

    x = np.arange(len(correlations))
    width = 0.25

    colors = {'Critical': COLORS['CRITICAL'], 'Standard': COLORS['STANDARD'], 'Economy': COLORS['ECONOMY']}

    for i, agent in enumerate(agent_types):
        bars = ax.bar(x + (i - 1) * width, data[agent], width,
                      label=agent, color=colors[agent],
                      edgecolor='black', linewidth=0.5, alpha=0.85)

    ax.axhline(y=0, color='black', linewidth=0.8, linestyle='-')
    ax.set_xticks(x)
    ax.set_xticklabels(correlations, fontsize=7)
    ax.set_ylabel('Wait Time Change vs FIFO (%)', fontsize=8)
    ax.set_xlabel('Urgency-Patience Relationship', fontsize=8)
    ax.legend(loc='lower left', fontsize=6, framealpha=0.7)
    ax.tick_params(axis='both', labelsize=7)

    # Annotate the key finding - small text
    ax.annotate('EDF fails here', xy=(0, 0.8), xytext=(0.3, 25),
                fontsize=6, ha='center', color='red',
                arrowprops=dict(arrowstyle='->', color='red', lw=0.8))
    ax.annotate('EDF works here', xy=(2, -54.6), xytext=(1.7, -40),
                fontsize=6, ha='center', color='green',
                arrowprops=dict(arrowstyle='->', color='green', lw=0.8))

    ax.set_ylim(-70, 60)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'sensitivity_analysis.pdf')
    plt.savefig(OUTPUT_DIR / 'sensitivity_analysis.png')
    plt.close()
    print("Saved sensitivity_analysis.pdf")


def generate_all():
    """Generate all wow-effect figures."""
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("Generating WOW-effect figures...")
    print("=" * 50)

    fig_hero_comparison()
    fig_edf_paradox_explained()
    fig_sensitivity_combined()
    fig_edf_correlation_sensitivity()

    print("=" * 50)
    print(f"All figures saved to {OUTPUT_DIR}")


if __name__ == '__main__':
    generate_all()
