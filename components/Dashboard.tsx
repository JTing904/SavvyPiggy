
import React, { useState } from 'react';
import { PiggyBank, Activity } from '../types';

interface DashboardProps {
  totalBalance: number;
  savingsToday: number;
  banks: PiggyBank[];
  activities: Activity[];
  onDeposit: (amount: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ totalBalance, savingsToday, banks, activities, onDeposit }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const handleConfirmDeposit = () => {
    const numAmount = parseFloat(amount);
    if (!isNaN(numAmount) && numAmount > 0) {
      onDeposit(numAmount);
      setAmount('');
      setIsModalOpen(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-40 safe-pt relative">
      {/* App Bar */}
      <div className="flex items-center px-6 py-4 justify-between">
        <div>
          <h4 className="text-slate-500 text-xs font-bold uppercase tracking-widest">Good Morning</h4>
          <h2 className="text-white text-xl font-extrabold">Savvy Saver</h2>
        </div>
        <div className="flex gap-3">
          <button className="size-10 rounded-full glass flex items-center justify-center text-slate-300">
            <span className="material-symbols-rounded">search</span>
          </button>
          <button className="size-10 rounded-full glass flex items-center justify-center text-slate-300">
            <span className="material-symbols-rounded">notifications</span>
          </button>
        </div>
      </div>

      {/* Hero Balance Card */}
      <div className="px-6 py-2">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-accent p-8 shadow-2xl shadow-primary/20">
          <div className="absolute -right-12 -top-12 size-48 bg-white/20 rounded-full blur-3xl"></div>
          <div className="absolute -left-12 -bottom-12 size-48 bg-black/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <p className="text-black/60 font-bold text-xs uppercase tracking-widest mb-1">Total Savings</p>
            <h1 className="text-black text-5xl font-extrabold tracking-tight mb-6">
              ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h1>
            
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-black/50 text-[10px] font-bold uppercase">Daily Goal</p>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-rounded text-black text-sm">trending_up</span>
                  <p className="text-black font-bold">+${savingsToday.toFixed(2)}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-black text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-lg active:scale-95 transition-transform"
              >
                Deposit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Deposit Button Overlay */}
      <div className="px-6 mt-6">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl active:scale-95 transition-transform group"
        >
          <div className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <span className="material-symbols-rounded font-black">add_circle</span>
          </div>
          Add New Deposit
        </button>
      </div>

      {/* Horizontal Goals */}
      <div className="mt-8">
        <div className="flex items-center justify-between px-6 mb-4">
          <h3 className="text-white text-lg font-bold">Your Piggy Banks</h3>
          <button className="text-primary text-sm font-bold">View All</button>
        </div>
        
        <div className="flex overflow-x-auto no-scrollbar gap-5 px-6 pb-4">
          {banks.length === 0 ? (
            <div className="min-w-full text-center py-10 opacity-30 italic">No piggy banks created yet.</div>
          ) : (
            banks.map((bank) => (
              <div key={bank.id} className="min-w-[260px] flex flex-col gap-4 rounded-3xl surface p-4 border border-white/5 shadow-xl">
                <div 
                  className="w-full aspect-[4/3] rounded-2xl bg-cover bg-center relative overflow-hidden group"
                  style={{ backgroundImage: `url("${bank.imageUrl}")` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg glass flex items-center justify-center text-primary">
                        <span className="material-symbols-rounded text-lg">{bank.icon}</span>
                      </div>
                      <span className="text-white font-bold text-sm">{bank.name}</span>
                    </div>
                    <span className="bg-primary text-black text-[10px] font-black px-2 py-1 rounded-md uppercase">
                      {bank.splitPercentage}%
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-slate-400 text-xs font-bold">${bank.currentAmount.toLocaleString()} saved</p>
                    <p className="text-white text-sm font-black">
                      {Math.round((bank.currentAmount / bank.targetAmount) * 100)}%
                    </p>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(74,222,128,0.5)] transition-all duration-700" 
                      style={{ width: `${Math.min(100, (bank.currentAmount / bank.targetAmount) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity List */}
      <div className="mt-8 px-6">
        <h3 className="text-white text-lg font-bold mb-4">Recent Deposits</h3>
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-sm">No recent activity.</div>
          ) : (
            activities.slice(0, 4).map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-4 rounded-2xl glass transition-all active:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`size-12 rounded-2xl flex items-center justify-center ${activity.type === 'auto-save' ? 'bg-primary/10 text-primary' : 'bg-blue-400/10 text-blue-400'}`}>
                    <span className="material-symbols-rounded">
                      {activity.type === 'auto-save' ? 'magic_button' : 'person'}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">
                      {activity.type === 'auto-save' ? 'Auto-split Deposit' : 'Manual Deposit'}
                    </p>
                    <p className="text-slate-500 text-[10px] font-medium">
                      {new Date(activity.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <p className="text-white font-black">
                  +${activity.amount.toFixed(2)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Deposit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm px-4 pb-10">
          <div 
            className="w-full max-w-md surface rounded-[3rem] p-8 space-y-8 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white text-2xl font-black">Deposit Funds</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="size-10 rounded-full glass flex items-center justify-center text-slate-500"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">Enter Amount</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-slate-600">$</span>
                <input 
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-24 pl-14 pr-6 rounded-3xl bg-white/5 border border-white/10 text-4xl font-black text-white focus:outline-none focus:border-primary transition-all placeholder:text-slate-800"
                />
              </div>
              <p className="text-slate-500 text-[10px] text-center mt-2 font-medium">
                This amount will be split between all your active piggy banks.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[10, 25, 50, 100].map((val) => (
                <button 
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="py-3 rounded-2xl glass border border-white/5 text-white font-bold text-sm active:scale-90 transition-transform"
                >
                  +${val}
                </button>
              ))}
            </div>

            <button 
              onClick={handleConfirmDeposit}
              className="w-full h-18 py-5 rounded-[2rem] bg-primary text-black font-black text-xl shadow-2xl shadow-primary/20 active:scale-95 transition-all"
            >
              Confirm Deposit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
