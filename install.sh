killall -9 Electron
killall -9 dock-switch
rm -rf /Applications/dock-switch.app/
cp -rf dist/mac/dock-switch.app /Applications/dock-switch.app
open -a dock-switch