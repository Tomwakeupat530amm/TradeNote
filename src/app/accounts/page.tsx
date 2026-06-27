"use client";

import { useState } from "react";
import { useAccountStore, Account } from "@/store/useAccountStore";
import { PlusCircle, Save } from "lucide-react";

type AccountStatus = "Challenge" | "Funded";
type DrawdownMode = "End of Day" | "Intraday";

export default function AccountsPage() {
  const { accounts, addAccount, updateAccount, deleteAccount, activeAccountId, setActiveAccount } = useAccountStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [initialBalance, setInitialBalance] = useState("50000");
  const [status, setStatus] = useState<AccountStatus>("Challenge");
  
  // Rule State
  const [profitTarget, setProfitTarget] = useState("1500");
  const [maxPositions, setMaxPositions] = useState("20");
  const [consistencyPercent, setConsistencyPercent] = useState("50");
  const [trailingMaxDrawdown, setTrailingMaxDrawdown] = useState("1000");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>("End of Day");
  const [maxDailyLoss, setMaxDailyLoss] = useState("500");
  const [maxDailyLossType, setMaxDailyLossType] = useState<"%" | "$">("$");

  const handleAddNew = () => {
    setName("");
    setPlatform("");
    setInitialBalance("50000");
    setStatus("Challenge");
    setProfitTarget("1500");
    setMaxPositions("20");
    setConsistencyPercent("50");
    setTrailingMaxDrawdown("1000");
    setDrawdownMode("End of Day");
    setMaxDailyLoss("500");
    setMaxDailyLossType("$");
    setEditingAccountId(null);
    setIsAdding(true);
  };

  const handleEdit = (account: Account) => {
    setName(account.name);
    const [plat, stat] = account.type.split(" - ");
    setPlatform(plat || "");
    setStatus((stat as AccountStatus) || "Challenge");
    setInitialBalance(account.initialBalance.toString());
    
    setProfitTarget(account.rules.profitTarget?.toString() || "");
    setMaxPositions(account.rules.maxPositions?.toString() || "");
    setConsistencyPercent(account.rules.consistencyPercent?.toString() || "");
    setTrailingMaxDrawdown(account.rules.trailingMaxDrawdown?.toString() || "");
    setDrawdownMode(account.rules.drawdownMode || "End of Day");
    setMaxDailyLoss(account.rules.maxDailyLoss?.toString() || "");
    setMaxDailyLossType(account.rules.maxDailyLossType || "$");
    
    setEditingAccountId(account.id);
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const accountData = {
      name,
      type: `${platform} - ${status}`,
      initialBalance: Number(initialBalance),
      rules: {
        profitTarget: Number(profitTarget),
        maxPositions: Number(maxPositions),
        consistencyPercent: Number(consistencyPercent),
        trailingMaxDrawdown: Number(trailingMaxDrawdown),
        drawdownMode,
        maxDailyLoss: maxDailyLoss ? Number(maxDailyLoss) : undefined,
        maxDailyLossType,
      },
    };

    if (editingAccountId) {
      updateAccount(editingAccountId, accountData);
    } else {
      addAccount(accountData);
    }
    setIsAdding(false);
    setEditingAccountId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
            Accounts
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Manage your prop firm challenges and funded accounts.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleAddNew}
            className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <PlusCircle className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            New Account
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-gray-900 shadow-sm ring-1 ring-gray-800 sm:rounded-xl p-6">
          <h3 className="text-lg font-medium leading-6 text-white mb-4">{editingAccountId ? "Edit Account" : "Add New Account"}</h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium leading-6 text-white">Account Name (e.g. Topstep 50k)</label>
              <div className="mt-2">
                <input type="text" name="name" id="name" required value={name} onChange={e => setName(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
              </div>
            </div>
            
            <div className="sm:col-span-2">
              <label htmlFor="platform" className="block text-sm font-medium leading-6 text-white">Platform (Tradovate, NT8)</label>
              <div className="mt-2">
                <input type="text" name="platform" id="platform" required value={platform} onChange={e => setPlatform(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="balance" className="block text-sm font-medium leading-6 text-white">Initial Balance ($)</label>
              <div className="mt-2">
                <input type="number" name="balance" id="balance" required value={initialBalance} onChange={e => setInitialBalance(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
              </div>
            </div>
            
            <div className="sm:col-span-2">
              <label htmlFor="status" className="block text-sm font-medium leading-6 text-white">Status</label>
              <div className="mt-2">
                <select id="status" name="status" value={status} onChange={e => setStatus(e.target.value as AccountStatus)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3">
                  <option className="bg-gray-800" value="Challenge">Challenge</option>
                  <option className="bg-gray-800" value="Funded">Funded</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-gray-800 pt-8">
            <h3 className="text-lg font-medium leading-6 text-white mb-4">Rules & Limits</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              
              <div className="sm:col-span-2">
                <label htmlFor="profitTarget" className="block text-sm font-medium leading-6 text-white">Profit Target ($)</label>
                <div className="mt-2">
                  <input type="number" name="profitTarget" id="profitTarget" required value={profitTarget} onChange={e => setProfitTarget(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="maxPositions" className="block text-sm font-medium leading-6 text-white">Max Positions (Micros)</label>
                <div className="mt-2">
                  <input type="number" name="maxPositions" id="maxPositions" required value={maxPositions} onChange={e => setMaxPositions(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="consistency" className="block text-sm font-medium leading-6 text-white">Consistency Rule (%)</label>
                <div className="mt-2">
                  <input type="number" name="consistency" id="consistency" required value={consistencyPercent} onChange={e => setConsistencyPercent(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="trailingMaxDrawdown" className="block text-sm font-medium leading-6 text-white">Trailing Max Drawdown ($)</label>
                <div className="mt-2">
                  <input type="number" name="trailingMaxDrawdown" id="trailingMaxDrawdown" required value={trailingMaxDrawdown} onChange={e => setTrailingMaxDrawdown(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="drawdownMode" className="block text-sm font-medium leading-6 text-white">Drawdown Mode</label>
                <div className="mt-2">
                  <select id="drawdownMode" name="drawdownMode" value={drawdownMode} onChange={e => setDrawdownMode(e.target.value as DrawdownMode)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3">
                    <option className="bg-gray-800" value="End of Day">End of Day</option>
                    <option className="bg-gray-800" value="Intraday">Intraday</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="maxDailyLoss" className="block text-sm font-medium leading-6 text-white">Max Daily Loss</label>
                <div className="mt-2 flex rounded-md shadow-sm">
                  <select
                    value={maxDailyLossType}
                    onChange={(e) => setMaxDailyLossType(e.target.value as "%" | "$")}
                    className="inline-flex items-center rounded-l-md border-0 bg-white/5 py-1.5 pl-3 pr-8 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6"
                  >
                    <option className="bg-gray-800" value="$">Amount ($)</option>
                    <option className="bg-gray-800" value="%">Percent (%)</option>
                  </select>
                  <input
                    type="number"
                    name="maxDailyLoss"
                    id="maxDailyLoss"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(e.target.value)}
                    className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-0 bg-white/5 py-1.5 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>

            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-x-6">
            <button type="button" onClick={() => { setIsAdding(false); setEditingAccountId(null); }} className="text-sm font-semibold leading-6 text-white">
              Cancel
            </button>
            <button type="submit" className="inline-flex justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
              <Save className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              Save Account
            </button>
          </div>
        </form>
      )}

      {/* Account List */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <div key={account.id} className={`bg-gray-900 rounded-xl border p-6 flex flex-col ${activeAccountId === account.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-800'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">{account.name}</h3>
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${account.type.includes('Challenge') ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20' : 'bg-green-500/10 text-green-400 ring-green-500/20'}`}>
                {account.type}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 flex-1">
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">Balance</dt>
                <dd className="mt-1 text-sm text-white">${account.initialBalance.toLocaleString()}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">Drawdown</dt>
                <dd className="mt-1 text-sm text-white">${account.rules.trailingMaxDrawdown.toLocaleString()} ({account.rules.drawdownMode})</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">Consistency</dt>
                <dd className="mt-1 text-sm text-white">{account.rules.consistencyPercent}%</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">Platform</dt>
                <dd className="mt-1 text-sm text-white">{account.type.split(' - ')[0]}</dd>
              </div>
            </dl>
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setActiveAccount(account.id)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold shadow-sm ${activeAccountId === account.id ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {activeAccountId === account.id ? 'Active' : 'Set Active'}
              </button>
              <button 
                onClick={() => handleEdit(account)}
                className="rounded-md bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20"
              >
                Edit
              </button>
              <button 
                onClick={() => deleteAccount(account.id)}
                className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && !isAdding && (
          <div className="col-span-full border-2 border-dashed border-gray-700 rounded-xl p-12 text-center">
            <h3 className="mt-2 text-sm font-semibold text-white">No accounts</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by creating a new prop firm account.</p>
            <div className="mt-6">
              <button onClick={handleAddNew} type="button" className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
                <PlusCircle className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                New Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
