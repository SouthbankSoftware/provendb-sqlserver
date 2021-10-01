DECLARE @requestId INT
DECLARE @proof NVARCHAR(max)
use provendb
EXEC [dbo].[fanchorrequest] 'provendbdemo.dbo.contractstable'
go
EXEC [dbo].[fanchorrequest] 'provendbdemo.dbo.contractstable' , 'contractid,contractData', 'contractid<100' , 'contractid'
go 
DECLARE @proofid NVARCHAR(max)

SELECT @proofid=proofid from provendbrequests where id=8


Select @proofid

select metadata from provendbcontrol where proofid=@proofid

EXEC [dbo].[fvalidaterequest]  @proofid
go