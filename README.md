# SIRQ: System for Interactive Reservation and Queueing

Same idea of the Python-based repo https://github.com/brunobastosrodrigues/sirq-simulator, but "interpreted" by Google AI.

This project simulates rational economic agents with heterogeneous Value of Time (VOT) to demonstrate allocative efficiency in constrained infrastructure. The idea is to benchmark SIRQ Auctions against FIFO (First-In, First-Out) for electric truck charging infrastructure. The core hypothesis: Replacing FIFO with an auction mechanism maximizes economic efficiency and protects critical supply chains (e.g., medical/perishable logistics) without requiring physical infrastructure expansion.

## 🚀 Quick Start (Local Installation)

This project uses **React** with **TypeScript** and **Vite** (implied structure).

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sirq-simulator
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Development Server**
   ```bash
   npm start
   # OR
   npm run dev
   ```

4. **Open in Browser**
   Navigate to `http://localhost:5173` (or the port shown in your terminal).

---

## 🔬 How to Use the Simulator

### 1. Digital Twin (Visualization)
The main view shows two parallel universes:
- **Control Group (FIFO):** Standard first-come-first-served logic.
- **Experimental (SIRQ):** Highest-bidder-first logic with preemption.
- **Visuals:**
  - **Red Trucks:** Critical Urgency (High Value of Time).
  - **Blue Trucks:** Standard Urgency.
  - **Grey Trucks:** Economy (Low Value of Time).
- **Interpreting Events:** Watch the **Live Event Feed** on the right side of the canvas. It will narrate when a high-priority truck "skips" the queue or "preempts" (kicks out) a charging truck.

### 2. Analytics (Results)
Click the **Analytics** tab to view real-time generated plots for the 4 Research Questions (RQs):
- **RQ1 Efficiency:** Revenue & Throughput.
- **RQ2 Reliability:** Wait times for Critical agents.
- **RQ3 Rationality:** Bidding behavior scatter plots.
- **RQ4 Equity:** The gap between service levels for rich vs. poor agents.

### 3. Lab Config
Click the **Lab Config** tab to modify simulation parameters:
- Change the number of chargers.
- Adjust the "Smart Pricing" sensitivity.
- Alter the Traffic Mix (e.g., simulate a disaster scenario with 80% Critical traffic).

---

## 🛠 Project Structure

- `src/services/simulation.ts`: The core discrete-event simulation engine. Contains the physics (charging curves) and economic logic (bidding/auctions).
- `src/components/SimulationCanvas.tsx`: The visual renderer for the Digital Twin.
- `src/components/AnalyticsPanel.tsx`: Recharts-based plotting suite.
- `src/components/ModelDocs.tsx`: Documentation of the mathematical formulas used.

## 📄 License
Academic Use Only.
Institute of Computer Science in Vorarlberg (ICV-HSG) | Embedded Systems Group (ESG)
