
export function SkeletonLoader() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10 pt-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-gray-800 rounded-lg"></div>
          <div className="h-4 w-32 bg-gray-800/50 rounded-lg mt-2"></div>
        </div>
        <div className="h-10 w-32 bg-gray-800 rounded-xl"></div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 p-6 h-[160px]">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="h-5 w-24 bg-gray-800 rounded mb-4"></div>
            <div className="h-10 w-36 bg-gray-800 rounded mb-2"></div>
            <div className="h-4 w-20 bg-gray-800/50 rounded"></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 p-6 h-[200px]">
             <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 bg-gray-800 rounded-xl"></div>
              <div>
                <div className="h-5 w-32 bg-gray-800 rounded mb-2"></div>
                <div className="h-4 w-24 bg-gray-800/50 rounded"></div>
              </div>
            </div>
            <div className="h-10 w-48 bg-gray-800 rounded mb-4"></div>
            <div className="h-3 w-full bg-gray-800 rounded-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
