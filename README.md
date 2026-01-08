# SIRQ: Smart Incentive-Compatible Resource Queue

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-Academic-green.svg)](#license)

Interactive simulation of **Vickrey auction-based queue management** for electric truck charging stations.

> **Paper**: *SIRQ: Auction-Based Queue Management for Electric Truck Charging*
> IEEE Transactions on Intelligent Transportation Systems (under review)

<p align="center">
  <img width="800" alt="SIRQ Simulator" src="https://github.com/user-attachments/assets/80eaad0d-e2c4-499f-98b5-f412562fdbc2" />
</p>

## Overview

SIRQ addresses a critical challenge in electric truck charging infrastructure: **how to efficiently allocate scarce charging slots among heterogeneous users with different time sensitivities**.

Traditional FIFO (First-In-First-Out) queues treat all vehicles equally, but this ignores the economic reality that some cargo (medical supplies, perishables) has much higher time value than others (bulk commodities).

### Key Innovation: Vickrey (Second-Price) Auction

SIRQ implements a **second-price sealed-bid auction** where:
- The **highest bidder wins** the charging slot
- But pays only the **second-highest bid**

This mechanism guarantees **truthful bidding is the dominant strategy**. Agents have no incentive to shade their bids - they simply report their true willingness-to-pay.

```
Theorem 1: In SIRQ's Vickrey auction, truthful bidding is optimal for all agent types.
```

## Features

- **4 Queue Strategies**: Compare FIFO, SIRQ (auction), Posted-Price, and Priority Queue
- **Vickrey Auction**: Second-price mechanism with incentive compatibility guarantees
- **Dynamic Pricing**: Surge pricing based on utilization and grid stress
- **Realistic Physics**: Non-linear battery charging curves (saturation above 80% SoC)
- **Comprehensive Analytics**: 8 dashboard tabs with exportable charts
- **Real-time Visualization**: Side-by-side comparison of strategies
- **Configurable Parameters**: Full control over station, pricing, and traffic settings

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/brunobastosrodrigues/sirq-ts.git
cd sirq-ts
docker compose up -d --build
```

Open http://localhost:8080

### Local Development

```bash
git clone https://github.com/brunobastosrodrigues/sirq-ts.git
cd sirq-ts
npm install
npm run dev
```

Open http://localhost:5173

## Usage Guide

### Digital Twin View

<p align="center">
  <img width="800" alt="Simulation View" src="https://github.com/user-attachments/assets/c7d695c3-bfbb-497b-a309-3bd26a19d186" />
</p>

The main view shows parallel simulations:
- **Left Panel (FIFO)**: Standard first-come-first-served baseline
- **Right Panel (SIRQ)**: Auction-based priority with preemption

**Agent Types**:
| Color | Type | VOT | Description |
|-------|------|-----|-------------|
| Red | Critical | $150-300/hr | JIT logistics, perishables |
| Blue | Standard | $50-80/hr | FMCG, corporate fleets |
| Grey | Economy | $15-30/hr | Bulk cargo, owner-operators |

### Analytics Dashboard

<p align="center">
  <img width="800" alt="Analytics Dashboard" src="https://github.com/user-attachments/assets/8ff5257e-557a-4c04-a66c-40e3b3561667" />
</p>

| Tab | Metrics |
|-----|---------|
| **Vickrey Auction** | Bid vs clearing price, consumer surplus, savings by type |
| **Strategy Comparison** | 4-way comparison across all strategies |
| **Efficiency** | Revenue, utilization, queue dynamics |
| **Reliability** | Critical cargo wait times and failure rates |
| **Equity** | Gini coefficient, Lorenz curves, subsidy pool |
| **Grid** | Power demand, transformer stress |
| **Sensitivity** | Parameter exploration |

### Configuration

Adjust simulation parameters in the **Lab Config** tab:
- Station capacity and charger power
- Pricing sensitivity and caps
- Traffic mix and arrival rates
- Agent behavior profiles

## Technical Details

### Bid Calculation

Agents bid their willingness-to-pay for immediate service:

```typescript
Bid = energyCost + serviceFee + (VOT / 60) × expectedWaitMinutes
```

### Vickrey Payment

Winners pay the second-highest bid (clearing price):

```typescript
clearingPrice = getSecondHighestBid(queue, winnerBid)
revenue = clearingPrice  // Not the winner's own bid
```

### Charging Physics

Realistic saturation curve above 80% State-of-Charge:

```typescript
if (soc < 0.8) return maxPower;  // Full power (150 kW)
else {
  const progress = (soc - 0.8) / 0.2;
  return maxPower * Math.pow(1 - progress, 2);  // Quadratic taper
}
```

## Project Structure

```
sirq-ts/
├── App.tsx                    # Main application
├── types.ts                   # TypeScript interfaces
├── services/
│   ├── simulation.ts          # Core engine (Vickrey auction)
│   └── epflDataLoader.ts      # Calibration data
├── components/
│   ├── SimulationCanvas.tsx   # Visual display
│   ├── AnalyticsPanel.tsx     # Charts dashboard
│   ├── AgentInspector.tsx     # Agent details
│   └── ModelDocs.tsx          # In-app documentation
└── experiments/               # Python scripts for paper figures
```

## Development

```bash
npm run dev          # Development server
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint
npm run format       # Prettier
```

## Citation

If you use SIRQ in your research, please cite:

```bibtex
@article{rodrigues2025sirq,
  title={SIRQ: Auction-Based Queue Management for Electric Truck Charging},
  author={Rodrigues, Bruno Bastos and others},
  journal={IEEE Transactions on Intelligent Transportation Systems},
  year={2025},
  institution={University of St. Gallen (HSG) and University of Zurich (UZH)},
  note={Under review}
}
```

## References

- Vickrey, W. (1961). Counterspeculation, auctions, and competitive sealed tenders. *Journal of Finance*, 16(1), 8-37.
- EPFL EV Charging Dataset: https://github.com/DESL-EPFL/Level-3-EV-charging-dataset

## License

Academic Use Only.

A collaboration between:
- **Embedded Sensing Group (ESG)** - University of St. Gallen (HSG)
- **Communication Systems Group (CSG)** - University of Zurich (UZH)
