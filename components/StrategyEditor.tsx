
import React, { useState } from 'react';
import { PiggyBank } from '../types';

interface StrategyEditorProps {
  banks: PiggyBank[];
  onUpdateBanks: (banks: PiggyBank[]) => void;
  onDeleteBank: (id: string) => void;
}

const StrategyEditor: React.FC<StrategyEditorProps> = ({ banks, onUpdateBanks, onDeleteBank }) => {
  const [localBanks, setLocalBanks] = useState(banks);

  const totalAllocation = localBanks.reduce((sum, b) => sum + b.splitPercentage, 0);
  const isValid = totalAllocation === 100;

  const handlePercentageChange = (id: string, newVal: number) => {
    setLocalBanks(prev => prev.map(b => b.id === id ? { ...b, splitPercentage: newVal } : b));
  };

  const handleSave = () => {
    if (isValid) {
      onUpdateBanks(localBanks);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this piggy bank? This will not return funds already saved.')) {
      onDeleteBank(id);
      setLocalBanks(prev => prev.filter(b => b.id !== id));
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-52 safe-pt">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-white text-3xl font-black tracking-tight">Strategy</h2>
        <p className="text-slate-500 text-sm font-medium mt-1">Configure your automated savings distribution.</p>
      </div>

      <div className="mt-6 px-6 space-y-4">
        {localBanks.length === 0 ? (
          <div className="surface border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-rounded text-4xl text-slate-700 mb-4">account_balance_wallet</span>
            <p className="text-slate-500 font-bold">No piggy banks yet</p>
            <p className="text-slate-600 text-xs mt-1">Add one using the + button below</p>
          </div>
        ) : (
          localBanks.map((bank) => (
            <div key={bank.id} className="surface border border-white/5 rounded-[2rem] p-6 space-y-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-rounded text-2xl">{bank.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-white font-bold">{bank.name}</h4>
                    <p className="text-slate-500 text-xs">Current split</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleDelete(bank.id)}
                    className="size-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 active:scale-90 transition-transform"
                  >
                    <span className="material-symbols-rounded text-xl">delete</span>
                  </button>
                  <button 
                    onClick={() => setLocalBanks(prev => prev.map(b => b.id === bank.id ? {...b, isLocked: !b.isLocked} : b))}
                    className={`size-10 rounded-full flex items-center justify-center transition-colors ${bank.isLocked ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-slate-500'}`}
                  >
                    <span className="material-symbols-rounded text-xl">{bank.isLocked ? 'lock' : 'lock_open'}</span>
                  </button>
                  <div className="bg-primary/10 px-3 py-1 rounded-full ml-1">
                    <span className="text-primary text-xl font-black">{bank.splitPercentage}%</span>
                  </div>
                </div>
              </div>

              <div className="relative pt-2">
                <input 
                  type="range"
                  min="0"
                  max="100"
                  disabled={bank.isLocked}
                  value={bank.splitPercentage}
                  onChange={(e) => handlePercentageChange(bank.id, parseInt(e.target.value))}
                  className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-primary disabled:opacity-30"
                />
                <div 
                  className="absolute top-2.5 h-1 bg-primary rounded-full pointer-events-none shadow-[0_0_10px_rgba(74,222,128,0.4)]"
                  style={{ width: `${bank.splitPercentage}%` }}
                ></div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 pointer-events-none safe-pb">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="glass rounded-[2.5rem] p-6 space-y-4 border border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Allocation</p>
                <p className={`text-2xl font-black ${isValid ? 'text-primary' : 'text-red-400'}`}>{totalAllocation}%</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Target</p>
                <p className="text-2xl text-white font-black">100%</p>
              </div>
            </div>
            <button 
              onClick={handleSave}
              disabled={!isValid || localBanks.length === 0}
              className={`w-full h-16 rounded-2xl font-black text-lg transition-all shadow-xl ${isValid && localBanks.length > 0 ? 'bg-primary text-black shadow-primary/20 active:scale-95' : 'bg-white/5 text-slate-600 cursor-not-allowed'}`}
            >
              {localBanks.length === 0 ? 'Add a Goal' : isValid ? 'Update Strategy' : 'Allocation Mismatch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyEditor;
