@echo on
cp node_modules/open/xdg-open dist 
cp node_modules/keytar/build/Release/keytar.node dist

 pkg --options max_old_space_size=8192 --out-path dist -t node12-win . 

cd dist

 "c:\program files\7-zip\7z" a -y  provendb-sqlserver-windows.zip provendb-sqlserver.exe  keytar.node xdg-open

 del provendb-sqlserver.exe

 
