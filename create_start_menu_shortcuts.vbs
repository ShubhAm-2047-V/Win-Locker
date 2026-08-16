Set WshShell = CreateObject("WScript.Shell")
strStartMenu = WshShell.SpecialFolders("Programs")
strDesktop = WshShell.SpecialFolders("Desktop")
strProjectDir = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".")

Dim names(2)
names(0) = "Magic Cal"
names(1) = "Magic Call"
names(2) = "Magic Calculator"

For Each name In names
    ' Start Menu Shortcut
    Set sc1 = WshShell.CreateShortcut(strStartMenu & "\" & name & ".lnk")
    sc1.TargetPath = "wscript.exe"
    sc1.Arguments = """" & strProjectDir & "\WinLocker.vbs"""
    sc1.WorkingDirectory = strProjectDir
    sc1.Description = "Magic Cal - Stealth Vault Application"
    sc1.IconLocation = strProjectDir & "\src\assets\icon.ico, 0"
    sc1.WindowStyle = 1
    sc1.Save

    ' Desktop Shortcut
    Set sc2 = WshShell.CreateShortcut(strDesktop & "\" & name & ".lnk")
    sc2.TargetPath = "wscript.exe"
    sc2.Arguments = """" & strProjectDir & "\WinLocker.vbs"""
    sc2.WorkingDirectory = strProjectDir
    sc2.Description = "Magic Cal - Stealth Vault Application"
    sc2.IconLocation = strProjectDir & "\src\assets\icon.ico, 0"
    sc2.WindowStyle = 1
    sc2.Save
Next

WScript.Echo "Magic Cal shortcuts created in Start Menu and Desktop!"
