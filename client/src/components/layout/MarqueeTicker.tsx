import { useMemo } from "react";

interface MarqueeTickerProps {
  messages: string[];
  speed?: number;
  className?: string;
}

export function MarqueeTicker({ messages, speed = 80, className = "" }: MarqueeTickerProps) {
  const text = messages.length === 0
    ? "نظام الحسابات العامة - المستشفى"
    : messages.join("          ✦          ");

  const duration = useMemo(() => {
    const chars = text.length;
    return Math.max(12, chars * (100 / speed));
  }, [text, speed]);

  return (
    <div className={`overflow-hidden whitespace-nowrap relative w-full ${className}`}>
      <style>{`
        @keyframes news-ticker {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100vw); }
        }
      `}</style>
      <span
        className="inline-block"
        style={{ animation: `news-ticker ${duration}s linear infinite` }}
      >
        {text}
      </span>
    </div>
  );
}
