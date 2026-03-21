"use client";

import { useEffect, useRef } from "react";
import {
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";
import {
  FileText,
  MessageCircle,
  Mail,
  Highlighter,
  Quote,
} from "lucide-react";

interface DashboardStatsProps {
  stats: {
    paperCount: number;
    threadCount: number;
    messageCount: number;
    annotationCount: number;
    citationCount: number;
    categoryCount: number;
  };
}

function AnimatedCounter({ value }: { value: number }) {
  const prefersReduced = useReducedMotion();
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prefersReduced) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: [0.25, 0.46, 0.45, 0.94],
    });
    return () => controls.stop();
  }, [value, motionValue, prefersReduced]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => {
      if (ref.current) ref.current.textContent = String(v);
    });
    return () => unsubscribe();
  }, [rounded]);

  return (
    <span ref={ref} className="tabular-nums font-semibold text-foreground">
      {value}
    </span>
  );
}

const statItems = [
  { key: "paperCount" as const, label: "Papers", icon: FileText },
  { key: "threadCount" as const, label: "Chats", icon: MessageCircle },
  { key: "messageCount" as const, label: "Messages", icon: Mail },
  { key: "annotationCount" as const, label: "Notes", icon: Highlighter },
  { key: "citationCount" as const, label: "Citations", icon: Quote },
];

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {statItems.map(({ key, label, icon: Icon }) => (
        <div
          key={key}
          className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/60 px-3.5 py-1.5 text-sm backdrop-blur-sm"
        >
          <Icon className="h-3.5 w-3.5 text-primary/60" />
          <AnimatedCounter value={stats[key]} />
          <span className="text-muted-foreground/70">{label}</span>
        </div>
      ))}
    </div>
  );
}
