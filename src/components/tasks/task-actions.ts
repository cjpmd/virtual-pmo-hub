export type Actions = {
  open: (id: string) => void;
  cut: (id: string) => void;
  copy: (id: string) => void;
  paste: (id: string) => void;
  insertAbove: (id: string) => void;
  remove: (id: string) => void;
  link: (id: string) => void;
  addDep: (id: string, dep: string) => void;
  removeDep: (id: string, dep: string) => void;
  toggle: (id: string) => void;
  canPaste: boolean;
  addSub: (id: string) => void;
  demote: (id: string) => void;
  promote: (id: string) => void;
  canDemote: (id: string) => boolean;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
};
