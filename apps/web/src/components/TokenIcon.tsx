"use client";
import { useState } from "react";

export function TokenIcon({ src, symbol, size = 36 }: { src: string | null | undefined; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="ticon--mono" style={{ width: size, height: size }} aria-hidden>
        {symbol.replace(/x$/, "").slice(0, 3)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ticon" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setFailed(true)} />;
}
