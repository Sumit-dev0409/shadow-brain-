"use client";

/** Glass-styled shimmering placeholder bar, used while async content is loading. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-md overflow-hidden relative ${className}`}
      style={{ background: "var(--bg-hover)", ...style }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
          backgroundSize: "200% 100%",
          animation: "shimmer-text 1.4s linear infinite",
        }}
      />
    </div>
  );
}

/** Skeleton stand-in for a Sidebar session row while conversations are loading. */
export function SessionRowSkeleton() {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <Skeleton className="w-2 h-2 rounded-full mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton className="h-3 w-[70%]" />
        <Skeleton className="h-2 w-[40%]" />
      </div>
    </div>
  );
}
