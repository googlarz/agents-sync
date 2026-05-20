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
Sleep 42s

Type "ls"
Sleep 400ms
Enter
Sleep 1500ms

Type "cat .cursorrules"
Sleep 400ms
Enter
Sleep 3500ms

Type "node -e \"const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json'));p.dependencies['resend']='^3.0.0';fs.writeFileSync('package.json',JSON.stringify(p,null,2))\""
Sleep 400ms
Enter
Sleep 600ms

Type "mkdir workers && touch workers/email-worker.ts"
Sleep 400ms
Enter
Sleep 500ms

Type "agents-sync drift ."
Sleep 400ms
Enter
Sleep 2500ms
