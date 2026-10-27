/**
 * Gate proof only: restore 61f81f3 deep mobile nav probe in HomeNavbarTheme.tsx.
 */
import { execSync } from "node:child_process";

execSync("git checkout 61f81f3 -- src/components/home/HomeNavbarTheme.tsx", {
  stdio: "inherit",
  cwd: process.cwd(),
});
console.log("Applied navbar deep-probe mutation (61f81f3 HomeNavbarTheme.tsx)");
