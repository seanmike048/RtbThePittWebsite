import { createContext, useContext } from 'react';

/** Shell actions every page header can call (the one primary action per page). */
export const ShellContext = createContext<{ openImport: () => void }>({ openImport: () => undefined });
export const useShell = () => useContext(ShellContext);
