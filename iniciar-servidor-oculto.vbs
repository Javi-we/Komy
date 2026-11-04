Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\ASUS VIVOBOOK PRO\Documents\KomaRead"
' Ejecuta el servidor de Komy en segundo plano sin mostrar ninguna ventana de terminal (0 = oculto)
WshShell.Run "cmd /c npm run dev", 0, False
