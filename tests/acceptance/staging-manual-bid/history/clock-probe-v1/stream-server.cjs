const http=require('node:http');
const server=http.createServer((req,res)=>{
 const data=JSON.stringify({workerNow:Date.now(),workerConstructorNow:new Date().getTime(),explicit:new Date('2000-01-01T00:00:00.000Z').getTime()});
 res.setHeader('content-type','application/json');
 if(req.url==='/end')return res.end(data);
 if(req.url==='/explicit'){res.writeHead(200);res.write(data.slice(0,1));return setImmediate(()=>res.end(data.slice(1)));}
 if(req.url==='/array'){res.writeHead(200,['content-type','application/json']);res.write(data.slice(0,1));return setImmediate(()=>res.end(data.slice(1)));}
 if(req.url==='/flush'){res.flushHeaders();res.write(data.slice(0,1));return setImmediate(()=>res.end(data.slice(1)));}
 res.write(data.slice(0,1));setImmediate(()=>res.end(data.slice(1)));
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port})+'\n'));
