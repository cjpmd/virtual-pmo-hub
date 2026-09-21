import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route=createFileRoute("/programmes")({component:()=> <Outlet/>});