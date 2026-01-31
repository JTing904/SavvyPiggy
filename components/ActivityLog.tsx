
import React, { useState } from 'react';
import { Activity, PiggyBank } from '../types';

interface ActivityLogProps {
  activities: Activity[];
  banks: PiggyBank[];
  onDeleteActivity: (id: string) => void;
  onEditActivity: (id: string, newAmount: number) => void;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ activities, banks, onDeleteActivity, onEditActivity }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const startEdit = (activity: Activity) => {
    setEditingId(activity.id);
    setEditValue(activity.amount.toString());
  };

  const handleSaveEdit = (id: string) => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) {
      onEditActivity(id, val);
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Remove this deposit? This will also deduct the corresponding amounts from your piggy banks.')) {
      onDeleteActivity(id);
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-32 safe-pt">
      <div className="px-6 pt-6">
        <h2 className="text-white text-3xl font-black tracking-tight">History</h2>
        <p className="text-slate-500 text-sm font-medium mt-1">Tracking your financial growth.</p>
      </div>

      <div className="mt-8 px-6 space-y-4">
        {activities.length === 0 ? (
          <div className="surface border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-rounded text-4xl text-slate-700 mb-4">history</span>
            <p className="text-slate-500 font-bold">No activity yet</p>
            <p className="text-slate-600 text-xs mt-1">Your savings journey starts here</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="surface rounded-3xl p-5 border border-white/5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`size-12 rounded-2xl flex items-center justify-center ${activity.type === 'auto-save' ? 'bg-primary/10 text-primary' : 'bg-blue-400/10 text-blue-400'}`}>
                    <span className="material-symbols-rounded text-2xl">
                      {activity.type === 'auto-save' ? 'cycle' : 'person'}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-bold">{activity.type === 'auto-save' ? 'Automated Split' : 'One-time Deposit'}</p>
                    <p className="text-slate-500 text-xs font-medium">
                      {new Date(activity.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1 items-end">
                    <button 
                      onClick={() => startEdit(activity)}
                      className="size-8 rounded-full flex items-center justify-center bg-white/5 text-slate-500 active:scale-90"
                    >
                      <span className="material-symbols-rounded text-lg">edit</span>
                    </button>
                    <button 
                      onClick={() => handleDelete(activity.id)}
                      className="size-8 rounded-full flex items-center justify-center bg-red-500/5 text-red-500/40 active:scale-90"
                    >
                      <span className="material-symbols-rounded text-lg">delete</span>
                    </button>
                  </div>
                  <div className="text-right">
                    {editingId === activity.id ? (
                      <div className="flex flex-col items-end gap-2">
                        <input 
                          autoFocus
                          type="number" 
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 bg-white/10 border border-primary/30 rounded-lg px-2 py-1 text-white font-black text-right outline-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setEditingId(null)} className="text-[10px] text-slate-500 font-bold uppercase">Cancel</button>
                          <button onClick={() => handleSaveEdit(activity.id)} className="text-[10px] text-primary font-bold uppercase">Save</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-white text-xl font-black">+${activity.amount.toFixed(2)}</p>
                        <p className="text-primary text-[10px] font-bold uppercase tracking-widest">Complete</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/5 flex flex-wrap gap-2">
                {activity.distributions.map((dist) => {
                  const bank = banks.find(b => b.id === dist.bankId);
                  return bank ? (
                    <div key={dist.bankId} className="glass px-3 py-1.5 rounded-xl flex items-center gap-2">
                      <span className="material-symbols-rounded text-sm text-primary">{bank.icon}</span>
                      <span className="text-white/80 text-[10px] font-bold">${dist.amount.toFixed(2)}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
