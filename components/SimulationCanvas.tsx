import React from 'react';
import { Agent, AgentType, StationState } from '../types';
import { BatteryCharging, Truck, DollarSign, Clock, AlertTriangle, Info, List } from 'lucide-react';
import { clsx } from 'clsx';

interface SimulationCanvasProps {
  title: string;
  state: StationState;
}

const AgentCard: React.FC<{ agent: Agent; isQueue?: boolean }> = ({ agent, isQueue }) => {
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
      className={clsx(
        "relative flex items-center p-2 rounded-md border-l-4 text-xs shadow-sm transition-all duration-300",
        isQueue ? "w-full mb-2 justify-between" : "w-full h-full justify-center flex-col text-center"
      )}
      style={{ 
          backgroundColor: `${style.backgroundColor}20`, // 20% opacity background
          borderColor: style.backgroundColor,
          color: '#1e293b' // Dark text for readability
      }}
    >
      <div className="flex items-center gap-2">
        <Truck size={16} style={{ color: style.backgroundColor }} />
        <span className="font-bold" style={{ color: style.borderColor }}>
            {agent.type === AgentType.STANDARD ? 'STD' : agent.type.substring(0, 4)}
        </span>
      </div>
      
      <div className={clsx("flex", isQueue ? "items-center gap-4" : "flex-col mt-1")}>
         {agent.status === 'preempted' && (
             <span className="text-amber-600 flex items-center gap-1 font-bold">
                 <AlertTriangle size={12}/> KICKED
             </span>
         )}
         <div className="text-[10px] opacity-75">
            <span className="font-mono">VOT:{agent.vot}</span>
         </div>
         {agent.bid > 0 && (
             <div className="font-bold text-slate-800 bg-white/50 px-1 rounded">
                 ${agent.bid.toFixed(0)}
             </div>
         )}
      </div>
    </div>
  );
};

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ title, state }) => {
  const chargeDuration = 200; // Hardcoded tick duration for visual bar

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden h-full">
      {/* Header */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            {title}
            <span className={clsx("text-xs px-2 py-0.5 rounded-full", title.includes("SIRQ") ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700")}>
               {state.strategy}
            </span>
          </h3>
          <div className="flex gap-4 mt-2 text-xs text-slate-600">
            <span className="flex items-center gap-1"><DollarSign size={12}/> Rev: ${(state.revenue / 1000).toFixed(1)}k</span>
            <span className="flex items-center gap-1"><Clock size={12}/> Wait: {state.avgWaitTime.toFixed(0)}m</span>
            <span className="flex items-center gap-1 text-red-500">Lost: {state.balkedCount}</span>
          </div>
        </div>
        <div className="text-right">
           <div className="text-2xl font-bold text-slate-900">${state.currentPrice.toFixed(2)}</div>
           <div className="text-xs text-slate-500 uppercase tracking-wider">Rate / kWh</div>
        </div>
      </div>

      {/* Main Visual Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Main Simulation View */}
        <div className="flex-1 flex p-4 gap-4 bg-slate-50/50 overflow-hidden">
            {/* Queue Lane */}
            <div className="w-1/3 flex flex-col">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex justify-between">
                <span>Queue ({state.queue.length})</span>
                {state.strategy === 'SIRQ' && <span className="text-indigo-600 text-[10px]">Highest Bid First</span>}
            </h4>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 border-r border-slate-200 border-dashed">
                {state.queue.length === 0 && (
                    <div className="text-center text-slate-400 py-10 text-xs italic">Lane Empty</div>
                )}
                {state.queue.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} isQueue />
                ))}
            </div>
            </div>

            {/* Chargers Grid */}
            <div className="w-2/3 flex flex-col">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Charging Bays (150kW)</h4>
            <div className="grid grid-cols-2 gap-3 auto-rows-min">
                {state.chargers.map((charger) => (
                <div key={charger.id} className={clsx(
                    "h-24 rounded-lg border-2 flex items-center justify-center p-2 transition-colors duration-500",
                    charger.status === 'busy' ? "border-green-500 bg-green-50" : "border-slate-200 bg-white"
                )}>
                    {charger.status === 'busy' && charger.currentAgent ? (
                    <div className="w-full h-full flex items-center gap-3">
                        <AgentCard agent={charger.currentAgent} />
                        <div className="h-full w-1.5 bg-slate-200 rounded-full overflow-hidden flex flex-col justify-end">
                            <div 
                            className="w-full bg-green-500 transition-all duration-300"
                            style={{ height: `${((chargeDuration - charger.timeRemaining) / chargeDuration) * 100}%` }}
                            />
                        </div>
                    </div>
                    ) : (
                    <div className="text-slate-300 flex flex-col items-center">
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
        <div className="w-48 border-l border-slate-200 bg-white flex flex-col text-xs">
            
            {/* Legend */}
            <div className="p-3 border-b border-slate-100">
                <h5 className="font-bold text-slate-700 flex items-center gap-1 mb-2">
                    <Info size={12} /> Legend
                </h5>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#ff4b4b]"></div>
                        <div className="leading-none">
                            <span className="block font-medium">Critical</span>
                            <span className="text-[9px] text-slate-400">High VOT ($150+)</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#3498db]"></div>
                        <div className="leading-none">
                            <span className="block font-medium">Standard</span>
                            <span className="text-[9px] text-slate-400">Med VOT (~$50)</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#95a5a6]"></div>
                        <div className="leading-none">
                            <span className="block font-medium">Economy</span>
                            <span className="text-[9px] text-slate-400">Low VOT (~$20)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Event Log */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                <h5 className="font-bold text-slate-700 flex items-center gap-1 p-3 pb-2 border-b border-slate-100 bg-white">
                    <List size={12} /> Live Events
                </h5>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {state.recentLogs.length === 0 && (
                        <p className="text-center text-slate-400 italic mt-4">No major events...</p>
                    )}
                    {state.recentLogs.map((log, i) => (
                        <div key={i} className="bg-white p-2 rounded border border-slate-100 shadow-sm text-[10px] leading-tight text-slate-600 animate-in fade-in slide-in-from-right-4 duration-300">
                            {log}
                        </div>
                    ))}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};
