import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/governance/reports")({ component: () => <Outlet /> });
