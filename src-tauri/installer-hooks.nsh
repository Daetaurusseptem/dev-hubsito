!macro DEVHUBSITO_STOP_INSTANCES
  Push $R0

  ; Close the desktop shell and its full child tree before files are replaced.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM devhubsito.exe'
  Pop $R0

  ; Clean up an orphaned sidecar left behind by a crash or forced shutdown.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM devhubsito-server.exe'
  Pop $R0

  Sleep 700
  Pop $R0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro DEVHUBSITO_STOP_INSTANCES
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro DEVHUBSITO_STOP_INSTANCES
!macroend
