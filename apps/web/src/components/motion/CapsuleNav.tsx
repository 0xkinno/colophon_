"use client";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const ITEMS = [
  { href: "/statement", label: "Statement" },
  { href: "/board", label: "Board" },
  { href: "/watch", label: "Watch" },
  { href: "/tour", label: "Tour" },
  { href: "/proof", label: "Proof" },
];

const MORE = [...ITEMS, { href: "/lab", label: "Lab" }, { href: "/testers", label: "Testers" }, { href: "/try", label: "Try it" }];

export function CapsuleNav() {
  const path = usePathname();
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 24));
  if (path === "/statement" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1") return null;

  return (
    <div className="capsule-wrap">
      <header className={`capsule ${solid ? "capsule--solid" : ""}`}>
        <Link href="/" className="capsule__brand" aria-label="Colophon home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/solana-logomark.svg" alt="" width={20} height={18} />
          <span className="capsule__x" aria-hidden>x</span>
          <img src="/brand/robinhood-logomark.svg" alt="" width={20} height={20} style={{ borderRadius: 6 }} />
          <span>Colophon</span>
        </Link>
        <nav aria-label="Primary">
          {ITEMS.map((it) => {
            const active = path.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} className="capsule__item" aria-current={active ? "page" : undefined}>
                {active && (
                  <motion.span layoutId="capsule-active" className="capsule__active" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <span className="capsule__label">{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/try" className="capsule__cta">
          Try it
        </Link>
        <button className="capsule__menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open && (
        <motion.div className="sheet-menu" style={{ pointerEvents: "auto" }} initial={{ y: 60, opacity: 0.001 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25 }}>
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} onClick={() => setOpen(false)}>
              {m.label}
            </Link>
          ))}
        </motion.div>
      )}
    </div>
  );
}
