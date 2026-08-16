Set WshShell = CreateObject("WScript.Shell")
strProjectDir = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".")

Dim strArg
strArg = ""
If WScript.Arguments.Count > 0 Then
    strArg = " """ & WScript.Arguments(0) & """"
End If

WshShell.Run """" & strProjectDir & "\node_modules\electron\dist\electron.exe"" """ & strProjectDir & """" & strArg, 1, False
