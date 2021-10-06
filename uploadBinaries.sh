cd dist
gsutil cp *.gz *.zip gs://provendb-prd/provendb-sqlserver
gsutil acl -r ch -u AllUsers:R gs://provendb-prd/provendb-sqlserver