import React from 'react';
import { Agent, AgentType } from '../types';
import { X, Truck, Clock, DollarSign, Battery, Zap, AlertTriangle, CalendarCheck } from 'lucide-react';
import { clsx } from 'clsx';

interface AgentInspectorProps {
  agent: Agent;
  onClose: () => void;
}

export const AgentInspector: React.FC<AgentInspectorProps> = ({ agent, onClose }) => {
  if (!agent) return null;

  const getProfileColor = (type: AgentType) => {
    switch (type) {
      case AgentType.CRITICAL: return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
      case AgentType.STANDARD: return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      case AgentType.ECONOMY: return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const profileStyle = getProfileColor(agent.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
           <button
             onClick={onClose}
             className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
           >
             <X size={20} />
           </button>

           <div className="flex items-center gap-4">
              <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center border", profileStyle)}>
                  <Truck size={24} />
              </div>
              <div>
                  <h3 className="font-bold text-xl text-slate-900 dark:text-white flex items-center gap-2">
                      Agent {agent.id.substring(0, 6)}
                      {agent.hasReservation && (
                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                            <CalendarCheck size={10} /> Reserved
                        </span>
                      )}
                  </h3>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{agent.type} Priority</span>
              </div>
           </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <DollarSign size={12} /> Value of Time
                    </div>
                    <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-200">
                        ${agent.vot.toFixed(0)}<span className="text-xs text-slate-400 font-normal">/hr</span>
                    </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Zap size={12} /> Current Bid
                    </div>
                    <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-200">
                        ${agent.bid.toFixed(2)}
                    </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Clock size={12} /> Patience
                    </div>
                    <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-200">
                        {agent.patience} <span className="text-xs text-slate-400 font-normal">ticks</span>
                    </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Battery size={12} /> Delivered
                    </div>
                    <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-200">
                        {agent.energyDelivered.toFixed(1)} <span className="text-xs text-slate-400 font-normal">kWh</span>
                    </div>
                </div>
            </div>

            {/* Status Section */}
            <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Current Status</h4>
                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className={clsx(
                        "w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]",
                        agent.status === 'charging' ? "text-emerald-500 bg-emerald-500" :
                        agent.status === 'queueing' ? "text-amber-500 bg-amber-500" :
                        agent.status === 'preempted' ? "text-red-500 bg-red-500" :
                        "text-slate-400 bg-slate-400"
                    )} />
                    <div className="flex-1">
                        <div className="font-medium text-slate-900 dark:text-white capitalize">
                            {agent.status}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {agent.status === 'charging' ? 'Currently receiving power' :
                             agent.status === 'queueing' ? 'Waiting for available slot' :
                             agent.status === 'preempted' ? 'Displaced by higher bidder' : 'Processing'}
                        </div>
                    </div>
                    {agent.status === 'preempted' && <AlertTriangle className="text-red-500" size={20} />}
                </div>
            </div>

            <div className="pt-2 text-[10px] text-slate-400 text-center font-mono">
                ID: {agent.id}
            </div>

        </div>
      </div>
    </div>
  );
};
