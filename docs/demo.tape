Output docs/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 14
Set Width 900
Set Height 700
Set Padding 20
Set Shell zsh

Hide
Type "cd /tmp/demo-fresh"
Enter
Sleep 300ms
Show

Type "agents-sync init ."
Sleep 500ms
Enter
Sleep 23s

Type "ls"
Sleep 400ms
Enter
Sleep 1500ms

Type "cat .cursorrules"
Sleep 400ms
Enter
Sleep 3500ms

Type "bash add-dep.sh && mkdir workers && touch workers/email-worker.ts"
Sleep 400ms
Enter
Sleep 500ms

Type "agents-sync drift ."
Sleep 400ms
Enter
Sleep 2500ms
