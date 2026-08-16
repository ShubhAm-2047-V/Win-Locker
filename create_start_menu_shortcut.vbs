Set WshShell = CreateObject("WScript.Shell")
strStartMenu = WshShell.SpecialFolders("Programs")
strProjectDir = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".")

' Create Start Menu Shortcut pointing to Magic Cal
Set objShortcut = WshShell.CreateShortcut(strStartMenu & "\Magic Cal.lnk")
objShortcut.TargetPath = "wscript.exe"
objShortcut.Arguments = """" & strProjectDir & "\WinLocker.vbs"""
objShortcut.WorkingDirectory = strProjectDir
objShortcut.Description = "Magic Cal - Stealth Vault Application"
objShortcut.IconLocation = strProjectDir & "\src\assets\icon.ico, 0"
objShortcut.WindowStyle = 1
objShortcut.Save

WScript.Echo "Start Menu Shortcut Updated: " & strStartMenu & "\Magic Cal.lnk"
