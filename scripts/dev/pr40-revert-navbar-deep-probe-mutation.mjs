/**
 * Restore HomeNavbarTheme.tsx after pr40-apply-navbar-deep-probe-mutation.mjs.
 */
import { execSync } from "node:child_process";

execSync("git checkout HEAD -- src/components/home/HomeNavbarTheme.tsx", {
  stdio: "inherit",
  cwd: process.cwd(),
});
console.log("Reverted navbar deep-probe mutation");
