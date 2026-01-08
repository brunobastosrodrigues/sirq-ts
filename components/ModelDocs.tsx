import React from 'react';
import { X } from 'lucide-react';

interface ModelDocsProps {
  onClose: () => void;
}

export const ModelDocs: React.FC<ModelDocsProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm overflow-y-auto text-slate-900 dark:text-slate-100 transition-colors">
      <div className="max-w-4xl mx-auto min-h-screen bg-white dark:bg-slate-900 shadow-2xl border-x border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex justify-between items-center z-10 transition-colors">
          <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Model Specifications & Formulas</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Mathematical Basis for SIRQ Simulation</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <X size={24} />
          </button>
        </div>

        <div className="px-8 py-12 space-y-16">
          
          {/* Section 1: Pricing */}
          <section>
            <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-serif text-slate-300 dark:text-slate-600 font-bold">01</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Smart Pricing Logic</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              The system implements dynamic pricing (Surge) based on station utilization. The goal is to signal scarcity to incoming agents, triggering rational balking behavior for low-value tasks.
            </p>
            
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 font-mono text-sm text-slate-800 dark:text-slate-200 overflow-x-auto">
                <div className="mb-4">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">P_t</span> = min( P_base * (1 + S * U_t), P_cap )
                </div>
                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>Where:</p>
                  <p>• P_t : Price at tick t ($/kWh)</p>
                  <p>• S : Surge Sensitivity (Configurable, default 0.5)</p>
                  <p>• U_t : Utilization Ratio ( (Active + Queued) / Capacity )</p>
                  <p>• P_cap : Regulatory Price Cap</p>
                </div>
            </div>
          </section>

          {/* Section 2: Bidding */}
          <section>
            <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-serif text-slate-300 dark:text-slate-600 font-bold">02</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Agent Bidding Strategy</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Agents act rationally to minimize their total generalized cost. In the SIRQ auction, agents place a bid representing their Willingness-To-Pay (WTP) to secure immediate service.
            </p>
            
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 font-mono text-sm text-slate-800 dark:text-slate-200 overflow-x-auto">
                <div className="mb-4">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">Bid_i</span> = C_energy + (VOT_i * E[W_fifo])
                </div>
                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>Where:</p>
                  <p>• C_energy : Expected Energy Cost (Price * Battery_Capacity)</p>
                  <p>• VOT_i : Value of Time for Agent i ($/hr)</p>
                  <p>• E[W_fifo] : Estimated Wait Time in a standard queue</p>
                </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 italic mt-4">
                *Note: Critical agents (VOT ~$150/hr) naturally outbid Economy agents (VOT ~$20/hr).
            </p>
          </section>

          {/* Section 3: Physics */}
          <section>
            <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-serif text-slate-300 dark:text-slate-600 font-bold">03</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Non-Linear Battery Physics</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              To simulate real-world conditions, charging power is not constant. It follows a saturation curve where power acceptance drops significantly after 80% State-of-Charge (SoC).
            </p>
            
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 font-mono text-sm text-slate-800 dark:text-slate-200 overflow-x-auto">
                <div className="mb-4">
                  If SoC &lt; 0.8: <span className="text-emerald-600 dark:text-emerald-400">Rate = Max_Power</span>
                </div>
                <div className="mb-4">
                  If SoC &gt;= 0.8: <span className="text-amber-600 dark:text-amber-400">Rate = Max_Power * (1.0 - Decay_Factor)</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                   Decay linearly reduces power to 10% capacity as SoC approaches 1.0.
                </div>
            </div>
          </section>

           {/* Section 4: Preemption */}
           <section>
            <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-serif text-slate-300 dark:text-slate-600 font-bold">04</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Preemption Logic (The Anti-Squatter)</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              The system solves the "Squatter Problem" (fully charged vehicles blocking spots) without physical policing. A high-priority incoming agent can displace an incumbent if the bid differential exceeds the premium threshold.
            </p>
            
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 font-mono text-sm text-slate-800 dark:text-slate-200 overflow-x-auto">
                <div className="mb-4">
                  Swap If: <span className="text-indigo-600 dark:text-indigo-400 font-bold">Bid_new &gt; Bid_incumbent * Premium</span>
                </div>
                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>• Premium: Configurable multiplier (default 1.2x)</p>
                  <p>• Condition: Incumbent is not Critical (Safety Lock)</p>
                  <p>• Result: Incumbent is returned to queue; New agent begins charging.</p>
                </div>
            </div>
          </section>

          {/* Section 5: Technical Feasibility */}
          <section className="bg-slate-900 dark:bg-indigo-950 text-slate-200 p-8 rounded-xl transition-colors">
            <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-serif text-indigo-400 font-bold">05</span>
                <h3 className="text-xl font-bold text-white">Technical Feasibility & Implementation</h3>
            </div>
            <p className="mb-6 leading-relaxed text-slate-300">
              This simulation is not merely theoretical; it is designed to be implementable today using existing industry standards. The logic provides the decision layer, while standard protocols handle the execution.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800 dark:bg-indigo-900/50 p-4 rounded border border-slate-700 dark:border-indigo-900/50">
                    <h4 className="font-bold text-indigo-400 mb-2">OCPP 2.0.1</h4>
                    <p className="text-sm text-slate-400 dark:text-slate-300">
                        The Open Charge Point Protocol (OCPP) version 2.0.1 natively supports <strong>dynamic tariffs</strong> and display messages. SIRQ uses this to push real-time auction prices to the charging terminal.
                    </p>
                </div>
                <div className="bg-slate-800 dark:bg-indigo-900/50 p-4 rounded border border-slate-700 dark:border-indigo-900/50">
                    <h4 className="font-bold text-indigo-400 mb-2">ISO 15118</h4>
                    <p className="text-sm text-slate-400 dark:text-slate-300">
                        "Plug & Charge" standard. It allows the vehicle to automatically identify itself (Agent ID) and settle payments (Bids) without manual driver interaction, enabling the seamless preemption logic.
                    </p>
                </div>
            </div>
          </section>

        </div>
        
        <div className="bg-slate-50 dark:bg-slate-800 p-8 border-t border-slate-200 dark:border-slate-700 text-center transition-colors">
            <button onClick={onClose} className="bg-slate-900 dark:bg-indigo-600 text-white px-8 py-3 rounded font-medium hover:bg-slate-800 dark:hover:bg-indigo-700 transition-colors">
                Return to Simulation
            </button>
        </div>

      </div>
    </div>
  );
};