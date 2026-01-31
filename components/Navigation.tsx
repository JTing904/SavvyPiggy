
import React from 'react';
import { Tab } from '../types';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onAddClick: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, onAddClick }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-6 pointer-events-none safe-pb">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div className="flex items-center justify-around glass rounded-[2.5rem] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
          <button 
            onClick={() => onTabChange(Tab.HOME)}
            className={`flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all ${activeTab === Tab.HOME ? 'text-primary' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className={`material-symbols-rounded ${activeTab === Tab.HOME ? 'fill-1' : ''}`}>home</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
          </button>
          
          <button 
            onClick={() => onTabChange(Tab.LOG)}
            className={`flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all ${activeTab === Tab.LOG ? 'text-primary' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className={`material-symbols-rounded ${activeTab === Tab.LOG ? 'fill-1' : ''}`}>history</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">History</span>
          </button>

          <button 
            onClick={onAddClick}
            className="size-14 -mt-12 flex items-center justify-center bg-primary rounded-full text-black shadow-2xl shadow-primary/40 border-4 border-bg-dark active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded text-3xl font-black">add</span>
          </button>

          <button 
            onClick={() => onTabChange(Tab.BANKS)}
            className={`flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all ${activeTab === Tab.BANKS ? 'text-primary' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className={`material-symbols-rounded ${activeTab === Tab.BANKS ? 'fill-1' : ''}`}>account_balance_wallet</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Strategy</span>
          </button>

          <button 
            onClick={() => onTabChange(Tab.SETTINGS)}
            className={`flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all ${activeTab === Tab.SETTINGS ? 'text-primary' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className={`material-symbols-rounded ${activeTab === Tab.SETTINGS ? 'fill-1' : ''}`}>settings</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Navigation;
