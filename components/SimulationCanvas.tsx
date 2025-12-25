import React, { useEffect, useState } from 'react';
import { Agent, AgentType, StationState, SimulationConfig } from '../types';
import { BatteryCharging, Truck, DollarSign, Clock, AlertTriangle, Info, List, CalendarCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { AgentInspector } from './AgentInspector';

interface SimulationCanvasProps {
  title: string;
  state: StationState;
  config: SimulationConfig;
}

const AgentCard: React.FC<{ agent: Agent; isQueue?: boolean; onClick: () => void }> = ({ agent, isQueue, onClick }) => {
  // Scientific visual profiles
  const getStyles = (type: AgentType) => {
    switch (type) {
      case AgentType.CRITICAL: 
        return { backgroundColor: '#ff4b4b', color: '#fff', borderColor: '#b71c1c' };
      case AgentType.STANDARD: 
        return { backgroundColor: '#3498db', color: '#fff', borderColor: '#2980b9' };
      case AgentType.ECONOMY: 
        return { backgroundColor: '#95a5a6', color: '#fff', borderColor: '#7f8c8d' };
    }
  };

  const style = getStyles(agent.type);

  return (
    <div 
      onClick={onClick}
      className={clsx(
        "relative flex items-center p-2 rounded-md border-l-4 text-xs shadow-sm transition-all duration-300 cursor-pointer hover:scale-[1.02]",
        isQueue ? "w-full mb-2 justify-between" : "w-full h-full justify-center flex-col text-center"
      )}
      style={{ 
          backgroundColor: `${style.backgroundColor}20`, // 20% opacity background
          borderColor: style.backgroundColor,
          color: 'var(--card-text-color)' // Dynamic color set by parent style or class
      }}
    >
        {/* Dark Mode Color Override Logic handled via CSS vars or specific classes */}
        <div className="absolute inset-0 rounded-md pointer-events-none" style={{ backgroundColor: 'currentColor', opacity: 0.05 }}></div>

      <div className="flex items-center gap-2 relative z-10">
        <Truck size={16} style={{ color: style.backgroundColor }} />
        <div className="flex flex-col items-start">
            <span className="font-bold leading-none dark:text-white/90 text-slate-900" style={{ color: undefined }}>
                {agent.type === AgentType.STANDARD ? 'STD' : agent.type.substring(0, 4)}
            </span>
            {agent.hasReservation && (
                <span className="text-[9px] flex items-center gap-0.5 text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-100 dark:bg-indigo-900/50 px-1 rounded mt-0.5">
                    <CalendarCheck size={8} /> RSV
                </span>
            )}
        </div>
      </div>
      
      <div className={clsx("flex relative z-10 dark:text-slate-300 text-slate-600", isQueue ? "items-center gap-4" : "flex-col mt-1")}>
         {agent.status === 'preempted' && (
             <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-bold">
                 <AlertTriangle size={12}/> KICKED
             </span>
         )}
         <div className="text-[10px] opacity-75">
            <span className="font-mono">VOT:{agent.vot}</span>
         </div>
         {agent.bid > 0 && !agent.hasReservation && (
             <div className="font-bold text-slate-800 dark:text-slate-900 bg-white/70 dark:bg-white/90 px-1 rounded">
                 ${agent.bid.toFixed(0)}
             </div>
         )}
      </div>
    </div>
  );
};

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ title, state, config }) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <>
    <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 overflow-hidden h-full">
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
            {title}
            <span className={clsx("text-xs px-2 py-0.5 rounded-full", title.includes("SIRQ") ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300")}>
               {state.strategy}
            </span>
          </h3>
          <div className="flex gap-4 mt-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1"><DollarSign size={12}/> Rev: ${(state.revenue / 1000).toFixed(1)}k</span>
            <span className="flex items-center gap-1"><Clock size={12}/> Wait: {state.avgWaitTime.toFixed(0)}m</span>
            <span className="flex items-center gap-1 text-red-500 dark:text-red-400">Lost: {state.balkedCount}</span>
            {/* Feature 2: SLA Monitor */}
            <span className={clsx(
                "flex items-center gap-1 font-bold",
                state.slaViolations === 0 ? "text-green-500" : (state.slaViolations < 5 ? "text-yellow-500" : "text-red-500")
            )}>
                 <AlertTriangle size={12}/> SLA: {state.slaViolations}
            </span>
          </div>
        </div>
        <div className="text-right">
           <div className="text-2xl font-bold text-slate-900 dark:text-white">${state.currentPrice.toFixed(2)}</div>
           <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rate / kWh</div>
        </div>
      </div>

      {/* Main Visual Area */}
      <div className="flex flex-1 overflow-hidden relative flex-col md:flex-row">
        
        {/* Main Simulation View */}
        <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 bg-slate-50/50 dark:bg-slate-950/50 overflow-hidden">
            {/* Queue Lane - Road View */}
            <div className="w-full md:w-1/3 flex flex-col relative h-1/2 md:h-auto">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 flex justify-between items-center shrink-0">
                    <span>Queue ({state.queue.length})</span>
                    {state.strategy === 'SIRQ' && <span className="text-indigo-600 dark:text-indigo-400 text-[10px]">Highest Bid First</span>}
                </h4>

                {/* Road Container */}
                <div className="flex-1 overflow-y-auto pr-2 pb-32 space-y-2 relative bg-slate-200 dark:bg-slate-800 rounded-lg p-2 border-x-4 border-dashed border-slate-300 dark:border-slate-700 shadow-inner">
                    {state.queue.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs italic">
                           <div className="flex flex-col items-center gap-2">
                               <div className="w-1 h-8 bg-slate-300 dark:bg-slate-700"></div>
                               <span>Lane Empty</span>
                               <div className="w-1 h-8 bg-slate-300 dark:bg-slate-700"></div>
                           </div>
                        </div>
                    )}
                    {state.queue.map((agent) => (
                        <AgentCard key={agent.id} agent={agent} isQueue onClick={() => setSelectedAgent(agent)} />
                    ))}
                </div>
            </div>

            {/* Chargers Grid */}
            <div className="w-full md:w-2/3 flex flex-col h-1/2 md:h-auto">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 shrink-0">Charging Bays ({config.chargerPower}kW)</h4>
            <div className="grid grid-cols-2 gap-3 auto-rows-min overflow-y-auto">
                {state.chargers.map((charger) => (
                <div key={charger.id} className={clsx(
                    "h-24 rounded-lg border-2 flex items-center justify-center p-2 transition-colors duration-500 relative overflow-hidden",
                    charger.status === 'busy'
                        ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                )}>
                    {charger.status === 'busy' && charger.currentAgent ? (
                    <div className="w-full h-full flex items-center gap-3 relative z-10">
                        <AgentCard agent={charger.currentAgent} onClick={() => charger.currentAgent && setSelectedAgent(charger.currentAgent)} />
                        <div className="h-full w-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex flex-col justify-end border border-slate-300 dark:border-slate-600">
                            <div 
                                className="w-full bg-green-500 dark:bg-green-400 transition-all duration-300 animate-charge-flow"
                                style={{ height: `${(charger.currentAgent.energyDelivered / config.batteryCapacity) * 100}%` }}
                            />
                        </div>
                    </div>
                    ) : (
                    <div className="text-slate-300 dark:text-slate-600 flex flex-col items-center">
                        <BatteryCharging size={24} />
                        <span className="text-xs mt-1">Idle</span>
                    </div>
                    )}
                </div>
                ))}
            </div>
            </div>
        </div>

        {/* Explainability Sidebar (Legend & Logs) */}
        <div className="w-full md:w-48 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col text-xs shrink-0 h-48 md:h-auto">
            
            {/* Legend */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 hidden md:block">
                <h5 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-2">
                    <Info size={12} /> Legend
                </h5>
                <div className="space-y-2 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#ff4b4b]"></div>
                        <div className="leading-none">
                            <span className="block font-medium dark:text-slate-300">Critical</span>
                            <span className="text-[9px] opacity-70">High VOT</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#3498db]"></div>
                        <div className="leading-none">
                            <span className="block font-medium dark:text-slate-300">Standard</span>
                            <span className="text-[9px] opacity-70">Med VOT</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#95a5a6]"></div>
                        <div className="leading-none">
                            <span className="block font-medium dark:text-slate-300">Economy</span>
                            <span className="text-[9px] opacity-70">Low VOT</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-indigo-600 dark:text-indigo-400"><CalendarCheck size={14}/></div>
                        <div className="leading-none">
                            <span className="block font-medium dark:text-slate-300">Reservation</span>
                            <span className="text-[9px] opacity-70">Guaranteed</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Event Log */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
                <h5 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 p-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0">
                    <List size={12} /> Live Events
                </h5>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {state.recentLogs.length === 0 && (
                        <p className="text-center text-slate-400 dark:text-slate-600 italic mt-4">No major events...</p>
                    )}
                    {state.recentLogs.map((log, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800 shadow-sm text-[10px] leading-tight text-slate-600 dark:text-slate-400 animate-in fade-in slide-in-from-right-4 duration-300">
                            {log}
                        </div>
                    ))}
                    {/* Spacer for scrolling */}
                    <div className="h-4"></div>
                </div>
            </div>
        </div>
      </div>
    </div>

    {/* Inspector Modal */}
    {selectedAgent && (
        <AgentInspector agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
    )}
    </>
  );
};
