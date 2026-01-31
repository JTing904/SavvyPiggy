
import React, { useState, useEffect, useMemo } from 'react';
import { Tab, PiggyBank, Activity } from './types';
import Dashboard from './components/Dashboard';
import StrategyEditor from './components/StrategyEditor';
import ActivityLog from './components/ActivityLog';
import CreateGoal from './components/CreateGoal';
import Navigation from './components/Navigation';

const INITIAL_BANKS: PiggyBank[] = [
  {
    id: '1',
    name: 'Vacation',
    targetAmount: 5000,
    currentAmount: 2400,
    splitPercentage: 30,
    icon: 'beach_access',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDNM69jsELtnrDuNJhd_baMWtzGld3PtbrkTViR7EenacbbJ4rW4eb3_jOuJYiRu9hKftPIBtVN0JSYgKz24h-9OO7vsAoGU0J19ZttQX80Xy0LLJ1pEZ3RJg74drKQ6I4hN56FXMG83mfmjp4v8qjw2E2HKYeX7ML_EjK8p5W4UBN-zOjpiRbI7N6WFB51Aff3CuGNiRubX3WJxGyCRoxRkVIYPmQuP1fdxp_b1m_F_IPJq9tj3slMFCnt0JM1F233fPvoo8SWnAmy',
    isLocked: false
  },
  {
    id: '2',
    name: 'Emergency Fund',
    targetAmount: 10000,
    currentAmount: 5000,
    splitPercentage: 50,
    icon: 'shield_with_heart',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBAkw2UsROKqcLbETUjKBsZeGr2tW3dNIAYaV_lCZ4pdxyoHCPo39GQPOiXgvnsoGLxF9U8C7gkinzHsXbBj4Ep2aX-VDtyA76YtsdnLoMOnft7_tirmcDraCTzOIOVd_qkwJ6aXKGrxiaagoJVOpOFgBcJ0mNZRJIQ1e84tFgQGPbdmycjP_Fle2KO5fCnYFqwMwLvqyheilp0exVBBwW0REp4sx6P2urehInJZvVOsvYwGAjH3zd6xDvXsj5L8LEWyJfmeA7t0s6W',
    isLocked: false
  },
  {
    id: '3',
    name: 'New Tech',
    targetAmount: 2000,
    currentAmount: 800,
    splitPercentage: 20,
    icon: 'devices',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDctDpHgBUWY-Qu5p9jBy35t4iElmjJYa9mRoDLsLhHjIHK0v8Oqf7r6Gtu18XMX6HH-1ZXJJh_4SSxIlA_D3CgVSgEL7aeOVvimksVnFI1u2_6quHF0EFXCyXF1QP8yNHN7xcr0_YGAdqYVNYJKdbTOPtxvW6FgkmeAodf-ah493FfUEiRVmkV7chWIilUE3_o6iFALTNLTAVD5WCMNhsgo8UVuveLnHdEEkaIUDsGyAuUNkXoB-XxNCzy1TLKSZwNfiAAL5OVB3Ef',
    isLocked: true
  }
];

const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: 'a1',
    type: 'auto-save',
    date: new Date().toISOString(),
    amount: 45.20,
    distributions: [
      { bankId: '1', amount: 13.56, percentage: 30 },
      { bankId: '2', amount: 22.60, percentage: 50 },
      { bankId: '3', amount: 9.04, percentage: 20 },
    ]
  },
  {
    id: 'a2',
    type: 'manual',
    date: new Date(Date.now() - 86400000).toISOString(),
    amount: 20.20,
    distributions: [
        { bankId: '2', amount: 20.20, percentage: 100 }
    ]
  }
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [banks, setBanks] = useState<PiggyBank[]>(INITIAL_BANKS);
  const [activities, setActivities] = useState<Activity[]>(INITIAL_ACTIVITIES);
  const [showCreateGoal, setShowCreateGoal] = useState(false);

  const totalBalance = useMemo(() => banks.reduce((sum, bank) => sum + bank.currentAmount, 0), [banks]);
  const savingsToday = useMemo(() => {
    const today = new Date().toLocaleDateString();
    return activities
      .filter(a => new Date(a.date).toLocaleDateString() === today)
      .reduce((sum, a) => sum + a.amount, 0);
  }, [activities]);

  const handleDeposit = (amount: number) => {
    const newActivity: Activity = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'manual',
      date: new Date().toISOString(),
      amount,
      distributions: banks.map(b => ({
        bankId: b.id,
        amount: (amount * b.splitPercentage) / 100,
        percentage: b.splitPercentage
      }))
    };

    setActivities([newActivity, ...activities]);
    setBanks(prev => prev.map(bank => {
      const dist = newActivity.distributions.find(d => d.bankId === bank.id);
      return dist ? { ...bank, currentAmount: bank.currentAmount + dist.amount } : bank;
    }));
  };

  const handleCreateGoal = (newGoal: Partial<PiggyBank>) => {
    const goal: PiggyBank = {
      id: Math.random().toString(36).substr(2, 9),
      name: newGoal.name || 'New Goal',
      targetAmount: newGoal.targetAmount || 1000,
      currentAmount: 0,
      splitPercentage: 0,
      icon: newGoal.icon || 'savings',
      imageUrl: 'https://picsum.photos/400/300',
      isLocked: false
    };
    setBanks([...banks, goal]);
    setShowCreateGoal(false);
    setActiveTab(Tab.BANKS);
  };

  const handleDeleteBank = (id: string) => {
    setBanks(prev => prev.filter(b => b.id !== id));
  };

  const handleDeleteActivity = (id: string) => {
    const activityToDelete = activities.find(a => a.id === id);
    if (!activityToDelete) return;

    setBanks(prev => prev.map(bank => {
      const dist = activityToDelete.distributions.find(d => d.bankId === bank.id);
      return dist ? { ...bank, currentAmount: Math.max(0, bank.currentAmount - dist.amount) } : bank;
    }));
    setActivities(prev => prev.filter(a => a.id !== id));
  };

  const handleEditActivity = (id: string, newAmount: number) => {
    const activityToEdit = activities.find(a => a.id === id);
    if (!activityToEdit) return;

    const oldDistributions = activityToEdit.distributions;
    const newDistributions = oldDistributions.map(dist => ({
      ...dist,
      amount: (newAmount * dist.percentage) / 100
    }));

    setBanks(prev => prev.map(bank => {
      const oldDist = oldDistributions.find(d => d.bankId === bank.id);
      const newDist = newDistributions.find(d => d.bankId === bank.id);
      
      let amountDiff = 0;
      if (oldDist && newDist) amountDiff = newDist.amount - oldDist.amount;
      else if (newDist) amountDiff = newDist.amount;
      else if (oldDist) amountDiff = -oldDist.amount;

      return { ...bank, currentAmount: Math.max(0, bank.currentAmount + amountDiff) };
    }));

    setActivities(prev => prev.map(a => a.id === id ? { ...a, amount: newAmount, distributions: newDistributions } : a));
  };

  const renderContent = () => {
    if (showCreateGoal) {
        return <CreateGoal onCancel={() => setShowCreateGoal(false)} onCreate={handleCreateGoal} />;
    }

    switch (activeTab) {
      case Tab.HOME:
        return <Dashboard 
                  totalBalance={totalBalance} 
                  savingsToday={savingsToday} 
                  banks={banks} 
                  activities={activities}
                  onDeposit={handleDeposit}
                />;
      case Tab.BANKS:
        return <StrategyEditor banks={banks} onUpdateBanks={setBanks} onDeleteBank={handleDeleteBank} />;
      case Tab.LOG:
        return <ActivityLog activities={activities} banks={banks} onDeleteActivity={handleDeleteActivity} onEditActivity={handleEditActivity} />;
      default:
        return <div className="flex items-center justify-center h-full text-white/50">Feature coming soon</div>;
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-bg-dark overflow-hidden">
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        {renderContent()}
      </main>
      
      {!showCreateGoal && (
        <Navigation 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            onAddClick={() => setShowCreateGoal(true)}
        />
      )}
    </div>
  );
};

export default App;
