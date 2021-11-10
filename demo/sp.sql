
:setvar SQLCMDMAXVARTYPEWIDTH 256
:setvar SQLCMDMAXFIXEDTYPEWIDTH 256

use provendb

EXEC [dbo].[fanchorrequest] 'provendbdemo.dbo.contractstable' , 'contractData,metaData', 'contractId BETWEEN 0 and 100' , 'CONTRACTID'

select * from provendbdemo.dbo.contractstable  
go 

/* Run this until task is complete*/

DECLARE @requestId INT

SELECT @requestId=MAX(id) from provendbrequests WHERE requestType='ANCHOR'

SELECT * FROM provendbrequests where id=@requestId

/* Now validate */

DECLARE @proofid VARCHAR(512)

SELECT @proofid=proofId from provendbrequests where id=(
     SELECT MAX(id) FROM provendbrequests
      WHERE requestType='ANCHOR'
        AND status='SUCCESS'
)

EXEC [dbo].[fvalidaterequestId]  @proofid


/* Run this until the validate is complete */

DECLARE @requestId INT

SELECT @requestId=MAX(id) from provendbrequests WHERE requestType='VALIDATE'

SELECT * FROM provendbrequests where id=@requestId

/* Tampering */
UPDATE provendbdemo.dbo.contractstable
   SET METADATA='{"info":"'+CAST(getDate() AS VARCHAR(100))+'"}'
WHERE CONTRACTID=11;

UPDATE provendbdemo.dbo.contractstable
   SET mytimestamp=getdate()
WHERE CONTRACTID=49;

select * from provendbdemo.dbo.contractstable
 where CONTRACTID IN (1,49);

/* Now validate */

DECLARE @proofid VARCHAR(512)

SELECT @proofid=proofId from provendbrequests where id=(
     SELECT MAX(id) FROM provendbrequests
      WHERE requestType='ANCHOR'
        AND status='SUCCESS'
)

EXEC [dbo].[fvalidaterequest]  @proofid 

/* Run this until the validate is complete */

DECLARE @requestId INT

SELECT @requestId=MAX(id) from provendbrequests WHERE requestType='VALIDATE'

SELECT * FROM provendbrequests where id=@requestId