import { createHash } from "crypto";
import { IncomingMessage, Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import env from "../config";
import { logger } from "../config/logger";

interface JwtPayload { sub?: string; }
interface SocketClient { socket: import("stream").Duplex; userId: number; buffer: Buffer; }
const clients = new Map<number, Set<SocketClient>>();

function acceptKey(key: string): string {
  return createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
}
function frameText(payload: string): Buffer {
  const data = Buffer.from(payload);
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  if (data.length < 65536) { const h = Buffer.alloc(4); h[0]=0x81; h[1]=126; h.writeUInt16BE(data.length,2); return Buffer.concat([h,data]); }
  const h = Buffer.alloc(10); h[0]=0x81; h[1]=127; h.writeBigUInt64BE(BigInt(data.length),2); return Buffer.concat([h,data]);
}
function frameClose(code=1000): Buffer { const d=Buffer.alloc(2); d.writeUInt16BE(code,0); return Buffer.concat([Buffer.from([0x88,0x02]),d]); }
function parseFrames(client: SocketClient): Array<{opcode:number;payload:Buffer}> {
  const frames=[] as Array<{opcode:number;payload:Buffer}>;
  while(client.buffer.length>=2){
    const first=client.buffer[0], second=client.buffer[1]; const masked=Boolean(second&0x80); let length=second&0x7f; let offset=2;
    if(length===126){if(client.buffer.length<4)break;length=client.buffer.readUInt16BE(2);offset=4;}
    else if(length===127){if(client.buffer.length<10)break;const n=client.buffer.readBigUInt64BE(2);if(n>BigInt(10*1024*1024))throw new Error("WebSocket frame too large");length=Number(n);offset=10;}
    if(masked){if(client.buffer.length<offset+4)break;offset+=4;}
    if(client.buffer.length<offset+length)break;
    const payload=Buffer.from(client.buffer.subarray(offset,offset+length));
    if(masked){const ms=offset-4;for(let i=0;i<payload.length;i++)payload[i]^=client.buffer[ms+(i%4)];}
    client.buffer=client.buffer.subarray(offset+length);frames.push({opcode:first&0x0f,payload});
  } return frames;
}
function removeClient(client:SocketClient):void{const set=clients.get(client.userId);if(!set)return;set.delete(client);if(!set.size)clients.delete(client.userId);}
export function emitNotification(userId:number,notification:Record<string,unknown>):void{
  const set=clients.get(Number(userId)); if(!set?.size)return; const payload=frameText(JSON.stringify({type:"notification",notification}));
  for(const client of set)if(!client.socket.destroyed)client.socket.write(payload);
}
export function attachNotificationSocket(server:HttpServer):void{
  server.on("upgrade",(req:IncomingMessage,socket)=>{
    const url=new URL(req.url||"/","http://"+(req.headers.host||"localhost")); if(url.pathname!=="/ws/notifications"){socket.destroy();return;}
    const key=req.headers["sec-websocket-key"]; if(!key||Array.isArray(key)){socket.destroy();return;}
    socket.write(["HTTP/1.1 101 Switching Protocols","Upgrade: websocket","Connection: Upgrade","Sec-WebSocket-Accept: "+acceptKey(key),"",""].join("\r\n"));
    const client:SocketClient={socket,userId:0,buffer:Buffer.alloc(0)};
    const close=(code=1000)=>{if(!socket.destroyed)socket.write(frameClose(code));removeClient(client);socket.destroy();};
    socket.on("data",(chunk)=>{try{client.buffer=Buffer.concat([client.buffer,chunk]);for(const frame of parseFrames(client)){
      if(frame.opcode===8){close();return;}
      if(frame.opcode===9){const p=frame.payload;const header=p.length<126?Buffer.from([0x8a,p.length]):null;if(header)socket.write(Buffer.concat([header,p]));continue;}
      if(frame.opcode!==1)continue; const message=JSON.parse(frame.payload.toString("utf8")) as {type?:string;token?:string};
      if(message.type!=="auth"||!message.token){close(1008);return;}
      try{const decoded=jwt.verify(message.token,env.jwt.secret) as JwtPayload;const userId=Number(decoded.sub);if(!Number.isInteger(userId)||userId<=0)throw new Error("Invalid user");
        client.userId=userId;const set=clients.get(userId)??new Set<SocketClient>();set.add(client);clients.set(userId,set);socket.write(frameText(JSON.stringify({type:"ready"})));
      }catch{close(1008);return;}
    }}catch(err){logger.warn("Notification WebSocket closed: "+String(err));close(1002);}});
    socket.on("close",()=>removeClient(client));socket.on("error",()=>removeClient(client));
  });
}