"use client";
// Digit roll technique adapted from the open animate-digits component on 21st.dev (credited in docs/CREDITS.md).
const COLUMN = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function DigitRoll({ value }: { value: string }) {
  return (
    <span className="digits" aria-label={value}>
      {value.split("").map((ch, i) => {
        const n = ch >= "0" && ch <= "9" ? Number(ch) : -1;
        if (n < 0) return <span key={i} aria-hidden>{ch}</span>;
        return (
          <span key={i} className="digit" aria-hidden>
            <span className="digit__col" style={{ transform: `translateY(${-n * 1.1}em)` }}>
              {COLUMN.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
