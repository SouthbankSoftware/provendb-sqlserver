./node_modules/@oclif/dev-cli/bin/run readme

 
cp node_modules/open/xdg-open dist 
cp node_modules/keytar/build/Release/keytar.node dist
pkg  --options max_old_space_size=8192 -t node12-linux -o dist/provendb-sqlserver-linux . 
cd dist
mv provendb-sqlserver-linux provendb-sqlserver
chmod 755 provendb-sqlserver
tar zcvf provendb-sqlserver-linux.tar.gz provendb-sqlserver xdg-open keytar.node

cd ..

pkg  --options max_old_space_size=8192 -t node12-darwin -o dist/provendb-sqlserver-darwin . 
cd dist
mv provendb-sqlserver-darwin provendb-sqlserver
chmod 755 provendb-sqlserver
tar zcvf provendb-sqlserver-mac.tar.gz provendb-sqlserver

rm provendb-sqlserver