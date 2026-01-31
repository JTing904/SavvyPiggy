
import React, { useState } from 'react';
import { PiggyBank } from '../types';

interface CreateGoalProps {
  onCancel: () => void;
  onCreate: (goal: Partial<PiggyBank>) => void;
}

const ICONS = ['directions_car', 'flight', 'home', 'shopping_bag', 'restaurant', 'devices', 'pets', 'fitness_center', 'movie', 'Celebration', 'School', 'Medical_Services'];

const CreateGoal: React.FC<CreateGoalProps> = ({ onCancel, onCreate }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(ICONS[2]); // Default to 'home'

  const handleSubmit = () => {
    if (name && amount) {
      onCreate({
        name,
        targetAmount: parseFloat(amount),
        icon: selectedIcon
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      {/* Header */}
      <div className="flex items-center px-6 py-4 justify-between sticky top-0 bg-bg-dark/80 backdrop-blur-md z-20">
        <button 
          className="size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform" 
          onClick={onCancel}
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-lg font-bold tracking-tight">New Piggy Bank</h2>
        <div className="size-10"></div> {/* Spacer for alignment */}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
        <div className="mb-8">
          <h1 className="text-white text-4xl font-black tracking-tight mb-2">Create Goal</h1>
          <p className="text-slate-500 font-medium">What are you saving up for?</p>
        </div>

        <div className="space-y-8">
          {/* Goal Name Input */}
          <div className="space-y-3">
            <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">Goal Name</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-16 px-6 rounded-3xl surface border border-white/5 text-xl font-bold focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-700 text-white shadow-xl" 
              placeholder="e.g. Dream Wedding" 
              type="text"
            />
          </div>

          {/* Target Amount Input */}
          <div className="space-y-3">
            <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">Target Amount</label>
            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-600">$</span>
              <input 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-20 pl-12 pr-6 rounded-3xl surface border border-white/5 text-3xl font-black focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-700 text-white shadow-xl" 
                placeholder="0.00" 
                type="number"
              />
            </div>
          </div>

          {/* Icon Selection */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Select Icon</label>
              <span className="text-primary text-[10px] font-black uppercase tracking-widest">Category: Fun</span>
            </div>
            <div className="grid grid-cols-4 gap-4 pb-2">
              {ICONS.map((icon) => (
                <button 
                  key={icon}
                  onClick={() => setSelectedIcon(icon)}
                  className={`flex items-center justify-center aspect-square rounded-[2rem] border-2 transition-all duration-300 ${
                    selectedIcon === icon 
                    ? 'bg-primary border-primary text-black shadow-lg shadow-primary/20 scale-105' 
                    : 'surface border-white/5 text-slate-500 hover:border-white/10'
                  }`}
                >
                  <span className="material-symbols-rounded text-3xl font-medium">{icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Settings Toggle */}
          <div className="surface rounded-3xl p-6 border border-white/5 flex items-center justify-between shadow-xl">
            <div className="flex flex-col gap-1">
              <p className="font-bold text-white text-base">Automatic Split</p>
              <p className="text-xs text-slate-500 font-medium">Include this in daily distributions</p>
            </div>
            <div className="relative inline-flex h-8 w-14 items-center rounded-full bg-primary/20 cursor-pointer">
              <span className="inline-block h-6 w-6 translate-x-7 transform rounded-full bg-primary transition-transform shadow-lg shadow-primary/30"></span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="p-6 pb-12 safe-pb">
        <button 
          onClick={handleSubmit}
          disabled={!name || !amount}
          className={`w-full h-18 py-5 rounded-[2rem] font-black text-xl transition-all shadow-2xl ${
            name && amount 
            ? 'bg-primary text-black shadow-primary/20 active:scale-95' 
            : 'bg-white/5 text-slate-700 cursor-not-allowed'
          }`}
        >
          Confirm Goal
        </button>
      </div>
    </div>
  );
};

export default CreateGoal;
