import React from 'react';
import { ArrowRight, FileText, Database, GitBranch, Scale, Sigma } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
  onOpenDocs: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart, onOpenDocs }) => {
  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-100 overflow-y-auto transition-colors duration-300">
      
      {/* Academic Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-8 py-6 transition-colors duration-300">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-slate-900 dark:bg-indigo-600 text-white flex items-center justify-center font-serif font-bold text-xl rounded">S</div>
             <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">SIRQ</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">v1.0.7-research // BUILD_ID: 2024-RC2</p>
             </div>
          </div>
          <div className="flex flex-col md:items-end text-sm font-medium text-slate-600 dark:text-slate-400">
             <span>Institute of Computer Science in Vorarlberg (ICV-HSG)</span>
             <span className="text-slate-400 dark:text-slate-500 text-xs">Embedded Systems Group (ESG)</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        
        {/* Abstract / Title Section */}
        <div className="mb-16 border-b border-slate-200 dark:border-slate-800 pb-12">
            <span className="text-indigo-600 dark:text-indigo-400 font-bold tracking-wider text-xs uppercase mb-2 block">Discrete-Event & Monte Carlo Simulation</span>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-10">
                <div className="md:col-span-2">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wide">Abstract</h3>
                    <p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed text-justify">
                        Traditional First-In-First-Out (FIFO) queuing mechanisms in electric vehicle charging infrastructure fail to account for the heterogeneous <strong>Value of Time (VOT)</strong> across commercial logistics sectors. This simulation introduces SIRQ (System for Interactive Reservation and Queueing), a market-based mechanism utilizing continuous double-sided auctions.
                        <br/><br/>
                        By internalizing the opportunity cost of waiting, the model demonstrates that dynamic priority allocation can maximize aggregate economic utility and protect critical supply chains (e.g., medical, perishable) without requiring physical infrastructure expansion.
                    </p>
                    
                    <div className="flex gap-4 mt-8">
                        <button onClick={onStart} className="bg-indigo-600 text-white px-6 py-3 rounded text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm">
                            Launch Simulation <ArrowRight size={16} />
                        </button>
                        <button onClick={onOpenDocs} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-6 py-3 rounded text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
                            View Model Specifications <FileText size={16} />
                        </button>
                    </div>
                </div>
                
                <div className="bg-slate-100 dark:bg-slate-900 p-6 rounded border border-slate-200 dark:border-slate-800 h-fit transition-colors">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 text-sm uppercase tracking-wide">Key Variables</h3>
                    <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                        <li className="flex items-start gap-2">
                            <Scale size={16} className="mt-0.5 text-indigo-600 dark:text-indigo-400" />
                            <span><strong>Mechanism:</strong> Highest-Bidder-First vs. FIFO</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <Sigma size={16} className="mt-0.5 text-indigo-600 dark:text-indigo-400" />
                            <span><strong>Pricing:</strong> Dynamic Surge ($/kWh) based on Utilization $\rho$</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <GitBranch size={16} className="mt-0.5 text-indigo-600 dark:text-indigo-400" />
                            <span><strong>Agents:</strong> Heterogeneous VOT (Critical, Standard, Economy)</span>
                        </li>
                         <li className="flex items-start gap-2">
                            <Database size={16} className="mt-0.5 text-indigo-600 dark:text-indigo-400" />
                            <span><strong>Physics:</strong> Non-linear charging curve (SoC decay)</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        {/* Methodology Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
             <div className="p-6 border-t-2 border-slate-900 dark:border-indigo-500">
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">1. Rational Agents</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                     Agents bid based on their economic profile. Critical agents (High VOT) bid aggressively to minimize dwell time, while Economy agents maximize for lowest cost.
                 </p>
             </div>
             <div className="p-6 border-t-2 border-slate-300 dark:border-slate-700">
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">2. The "Squatter" Solution</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                     As State-of-Charge (SoC) approaches 100%, marginal utility drops. The bid decreases, allowing new arrivals to mathematically <strong>preempt</strong> fully charged vehicles.
                 </p>
             </div>
             <div className="p-6 border-t-2 border-slate-300 dark:border-slate-700">
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">3. Non-Linear Physics</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Charging speed is not constant. We simulate the battery saturation curve ($0.8 &lt; SoC &lt; 1.0$), reducing power acceptance and increasing the "time cost" of topping off.
                 </p>
             </div>
             <div className="p-6 border-t-2 border-slate-300 dark:border-slate-700">
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">4. Reproducibility</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                     Full export/import capabilities for simulation datasets. Monte Carlo consistent random seeds (optional) and open parameter configuration.
                 </p>
             </div>
        </div>
        
        {/* Footer */}
        <div className="mt-24 pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <p>Generated by SIRQ Simulation Engine v1.0.6</p>
            <p>Institute of Computer Science in Vorarlberg (ICV-HSG) | Embedded Systems Group (ESG)</p>
        </div>

      </main>
    </div>
  );
};