Set WshShell = CreateObject("WScript.Shell")
strStartMenu = WshShell.SpecialFolders("Programs")
strProjectDir = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".")

' Create Start Menu Shortcut pointing directly to Electron executable
Set objShortcut = WshShell.CreateShortcut(strStartMenu & "\WinLocker.lnk")
objShortcut.TargetPath = strProjectDir & "\node_modules\electron\dist\electron.exe"
objShortcut.Arguments = """" & strProjectDir & """"
objShortcut.WorkingDirectory = strProjectDir
objShortcut.Description = "WinLocker - Stealth Vault Application"
objShortcut.WindowStyle = 1
objShortcut.Save

WScript.Echo "Start Menu Shortcut Updated: " & strStartMenu & "\WinLocker.lnk"
