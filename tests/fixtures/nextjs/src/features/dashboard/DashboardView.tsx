"use client";
import { useQuery } from "@tanstack/react-query";

export function DashboardView() {
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetch("/api/dashboard").then(r => r.json()) });
  return <div>{JSON.stringify(data)}</div>;
}
