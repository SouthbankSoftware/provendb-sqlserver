provendb-sqlserver install `
 --dbaPassword=DBEnvy2016 --dbaUserName=SA `
 --sqlConnect='Server=guy13;1433;Encrypt=false;Trusted_Connection=True;TrustServerCertificate=True' `
 --provendbPassword=DBEnvy2016 `
 --provendbUser=provendb --dropExisting `
 --createDemoAccount --config=provendb.yaml