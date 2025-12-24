# SIRQ: System for Interactive Reservation and Queueing

Same idea of the Python-based repo https://github.com/brunobastosrodrigues/sirq-simulator, but "interpreted" by Google AI.

<img width="889" height="674" alt="sirq-landpage1" src="https://github.com/user-attachments/assets/80eaad0d-e2c4-499f-98b5-f412562fdbc2" />


This project simulates rational economic agents with heterogeneous Value of Time (VOT) to demonstrate allocative efficiency in constrained infrastructure. The idea is to benchmark SIRQ Auctions against FIFO (First-In, First-Out) for electric truck charging infrastructure. The core hypothesis: Replacing FIFO with an auction mechanism maximizes economic efficiency and protects critical supply chains (e.g., medical/perishable logistics) without requiring physical infrastructure expansion.

## 🐳 Docker Deployment (Recommended)

The easiest way to run SIRQ is using Docker. This method automatically handles all dependency installations and builds a production-ready container.

> Quick note: the provided `docker-compose.yml` maps container port `80` to host port `8080` (so the app will be available at `http://localhost:8080`).

### Using Docker Compose CLI (recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/brunobastosrodrigues/sirq-ts.git
   cd sirq-ts
   ```

2. **Build & start the service (detached)**
   ```bash
   docker compose up -d --build
   ```

3. **View logs**
   ```bash
   docker compose logs -f sirq-app
   ```

4. **Stop and remove containers**
   ```bash
   docker compose down
   ```

### Troubleshooting & tips

- If port 8080 is already in use, map to a different host port (for example `-p 8081:80`), or update `docker-compose.yml`.
- To run without building (if no source changes were made since the last build) omit `--build`.
- Use the Docker Compose V2 CLI (`docker compose` — no hyphen), e.g. `docker compose up -d --build`; this is the recommended syntax on recent Docker versions.

---

## 🚀 Quick Start (Local Installation)

If you prefer running it without Docker (e.g., for development):

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Git

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/brunobastosrodrigues/sirq-ts.git
   cd sirq-ts
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Open in Browser**
   Navigate to `http://localhost:5173`.

---

## 🔬 How to Use the Simulator

### 1. Simulation
<img width="1257" height="686" alt="image" src="https://github.com/user-attachments/assets/c7d695c3-bfbb-497b-a309-3bd26a19d186" />

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

<img width="1251" height="647" alt="sirq-analytics" src="https://github.com/user-attachments/assets/8ff5257e-557a-4c04-a66c-40e3b3561667" />

- **Efficiency:** Revenue & Throughput.
- **Reliability:** Wait times for Critical agents.
- **Rationality:** Bidding behavior scatter plots.
- **Equity:** The gap between service levels for rich vs. poor agents.

### 3. Lab Config

<img width="695" height="674" alt="sirq-config" src="https://github.com/user-attachments/assets/47aa302c-c315-4f10-af8e-4c11f849eb6b" />

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
