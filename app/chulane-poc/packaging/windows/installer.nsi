; Install into the current user's Programs folder. The Electron user-data directory has a separate lifecycle.
Unicode True
!include "x64.nsh"
Name "Chulane"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Chulane"
RequestExecutionLevel user
SetCompressor lzma
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Chulane requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd

Section
  SetOutPath "$INSTDIR\runtime"
  File /r "${RUNTIME}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Chulane.lnk" "$INSTDIR\runtime\Chulane.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Chulane" "DisplayName" "Chulane"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Chulane" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Chulane" "DisplayIcon" "$INSTDIR\runtime\Chulane.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Chulane.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Chulane"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
