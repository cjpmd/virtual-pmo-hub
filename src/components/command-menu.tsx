import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, FolderKanban, Layers3, ListTodo, Search, ShieldAlert, UsersRound } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { getProjects, getProgrammes } from "@/services/pmo";

export function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const navigate = useNavigate();
  const projects = getProjects();
  const programmes = getProgrammes();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/" }))}>
            <BriefcaseBusiness className="mr-2 h-4 w-4" />
            <span>Portfolio Overview</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/programmes" }))}>
            <Layers3 className="mr-2 h-4 w-4" />
            <span>View All Programmes</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/projects" }))}>
            <FolderKanban className="mr-2 h-4 w-4" />
            <span>View All Projects</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Programmes">
          {programmes.slice(0, 5).map((p) => (
            <CommandItem
              key={p.id}
              onSelect={() => runCommand(() => navigate({ to: "/programmes/$programmeId", params: { programmeId: p.id } }))}
            >
              <Layers3 className="mr-2 h-4 w-4" />
              <span>{p.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Projects">
          {projects.slice(0, 5).map((p) => (
            <CommandItem
              key={p.id}
              onSelect={() => runCommand(() => navigate({ to: "/projects/$projectId", params: { projectId: p.id } }))}
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              <span>{p.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/requests" }))}>
            <ListTodo className="mr-2 h-4 w-4" />
            <span>Requests</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/resources" }))}>
            <UsersRound className="mr-2 h-4 w-4" />
            <span>Resources</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/risks" }))}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            <span>Risks</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
