Output docs/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 14
Set Width 900
Set Height 700
Set Padding 20
Set Shell zsh

# ─── setup (hidden) ───────────────────────────────────────────────────────────

Hide
Type "cd /tmp/demo-existing"
Enter
Sleep 200ms
Show

# ─── scene 1: project already has AGENTS.md — load-context ───────────────────

Type "agents-sync load-context ."
Sleep 300ms
Enter
Sleep 2500ms

Sleep 2s

Type "clear"
Enter
Sleep 200ms

# ─── scene 2: fresh project — init generates everything ──────────────────────

Type "cd /tmp/demo-fresh"
Enter
Sleep 400ms

Type "agents-sync derive ."
Sleep 300ms
Enter
Sleep 3s

Sleep 1s

Type "ls -A"
Enter
Sleep 2s

Sleep 2s

Type "clear"
Enter
Sleep 200ms

# ─── scene 3: drift detection ─────────────────────────────────────────────────

Type "bash add-dep.sh"
Sleep 300ms
Enter
Sleep 600ms

Type "agents-sync drift ."
Sleep 300ms
Enter
Sleep 2500ms
