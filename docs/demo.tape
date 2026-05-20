Output docs/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 14
Set Width 900
Set Height 600
Set Padding 20
Set Shell zsh

Hide
Type "cd /tmp/demo-app"
Enter
Sleep 300ms
Show

Type "npx @googlarz/agents-sync scan ."
Sleep 800ms
Enter
Sleep 12s

Type "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npx @googlarz/agents-sync init ."
Sleep 800ms
Enter
Sleep 40s

Type "ls"
Sleep 400ms
Enter
Sleep 1000ms

Type "head -20 AGENTS.md"
Sleep 400ms
Enter
Sleep 1500ms
