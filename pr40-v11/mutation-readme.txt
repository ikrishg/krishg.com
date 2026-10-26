Cursor-collapse mutation proof (not shipped):
- Apply: node scripts/dev/pr40-apply-cursor-collapse-mutation.mjs
  (reverts footerMeasureRect to raw getBoundingClientRect; display:contents footer collapse)
- Rebuild + restart PR preview, then run verify/prove.
- Revert: node scripts/dev/pr40-revert-cursor-collapse-mutation.mjs

Logs mutation-verify-fail.log and mutation-prove-fail.log were captured with mutation applied.
