# SIRQ: System for Interactive Reservation and Queueing

Same idea of the Python-based repo https://github.com/brunobastosrodrigues/sirq-simulator, but "interpreted" by Google AI.

This project simulates rational economic agents with heterogeneous Value of Time (VOT) to demonstrate allocative efficiency in constrained infrastructure. The idea is to benchmark SIRQ Auctions against FIFO (First-In, First-Out) for electric truck charging infrastructure. The core hypothesis: Replacing FIFO with an auction mechanism maximizes economic efficiency and protects critical supply chains (e.g., medical/perishable logistics) without requiring physical infrastructure expansion.

## 🐳 Docker Deployment (Recommended)

The easiest way to run SIRQ is using Docker. This method automatically handles all dependency installations and builds a production-ready container.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### Instructions

1. **Start the Application**
   Run the following command in the project root:
   ```bash
   docker-compose up -d --build
   ```
   *Note: The `--build` flag ensures that the container installs all dependencies (`npm install`) and recompiles the application if you have made changes.*

2. **Access the Dashboard**
   Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

3. **Stop the Application**
   ```bash
   docker-compose down
   ```

---

## 🚀 Quick Start (Local Installation)

If you prefer running it without Docker (e.g., for development):

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Open in Browser**
   Navigate to `http://localhost:5173`.

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
Click the **Analytics** tab to view real-time generated plots:
- **Efficiency:** Revenue & Throughput.
- **Reliability:** Wait times for Critical agents.
- **Rationality:** Bidding behavior scatter plots.
- **Equity:** The gap between service levels for rich vs. poor agents.

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