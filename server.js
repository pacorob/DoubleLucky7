const http=require("http"),fs=require("fs"),crypto=require("crypto");
const PORT=process.env.PORT||3000,rooms=new Map();
const SUITS=["♠","♥","♦","♣"];
const uid=()=>crypto.randomUUID(), code=()=>crypto.randomBytes(2).toString("hex").toUpperCase();
function send(res,status,obj){res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(obj))}
function shuffle(a){return a.sort(()=>Math.random()-.5)}
function makeDeck(){let d=[];for(let s=0;s<4;s++)for(let v=1;v<=14;v++)d.push({s,v});d.push({joker:true});return shuffle(d)}
function nCards(round){return round<7?round+1:14-round}
function pub(r){return {code:r.code,started:r.started,finished:r.finished,round:r.round+1,totalRounds:14,cards:nCards(r.round),dealer:r.dealer,turn:r.turn,phase:r.phase,trump:r.trump,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score,connected:!!p.res})),bids:r.bids,won:r.won,trick:r.trick}}
function push(r){const msg=`data: ${JSON.stringify({type:"state",state:pub(r)})}\n\n`;r.players.forEach(p=>p.res?.write(msg))}
function pushPrivate(r,p){if(p.res)p.res.write(`data: ${JSON.stringify({type:"hand",hand:r.hands[r.players.indexOf(p)]})}\n\n`)}
function deal(r){r.deck=makeDeck();const n=nCards(r.round);r.hands=r.players.map(()=>[]);r.bids=r.players.map(()=>null);r.won=r.players.map(()=>0);r.trick=[];for(let k=0;k<n;k++)for(let i=0;i<r.players.length;i++)r.hands[i].push(r.deck.pop());const t=r.deck.pop();r.trump=t?.joker?null:t;r.turn=(r.dealer+1)%r.players.length;r.phase="bid";r.players.forEach(p=>pushPrivate(r,p));push(r)}
function beats(a,b,lead,trump){if(a.joker)return !b.joker;if(b.joker)return false;if(trump&&a.s===trump.s&&b.s!==trump.s)return true;if(trump&&b.s===trump.s&&a.s!==trump.s)return false;if(a.s===b.s)return a.v>b.v;return a.s===lead.s&&b.s!==lead.s}
function legal(r,i,c){if(!r.trick.length||c.joker)return true;const lead=r.trick[0].c;if(lead.joker)return true;const has=r.hands[i].some(x=>!x.joker&&x.s===lead.s);return !has||c.s===lead.s}
function finishRound(r){r.players.forEach((p,i)=>{if(r.won[i]===r.bids[i]){let pts=10+2*r.won[i];if(r.round===6)pts*=2;p.score+=pts}});if(r.round===13){r.finished=true;push(r);return}r.round++;r.dealer=(r.dealer+1)%r.players.length;deal(r)}
const server=http.createServer((req,res)=>{
 if(req.url==="/"){res.writeHead(200,{"Content-Type":"text/html"});return res.end(fs.readFileSync(__dirname+"/index.html"))}
 if(req.url==="/health")return send(res,200,{ok:true});
 if(req.url==="/create"){let c=code();while(rooms.has(c))c=code();rooms.set(c,{code:c,players:[],started:false,finished:false,round:0,dealer:0,turn:0,phase:"lobby"});return send(res,200,{code:c})}
 if(req.url.startsWith("/join")){const u=new URL(req.url,"http://x"),r=rooms.get((u.searchParams.get("code")||"").toUpperCase());if(!r)return send(res,404,{error:"Kamer niet gevonden"});if(r.started)return send(res,409,{error:"Spel al gestart"});if(r.players.length>=7)return send(res,409,{error:"Kamer vol"});const p={id:uid(),name:(u.searchParams.get("name")||"Speler").slice(0,20),score:0,res:null};r.players.push(p);push(r);return send(res,200,{id:p.id,code:r.code,state:pub(r)})}
 if(req.url.startsWith("/events")){const u=new URL(req.url,"http://x"),r=rooms.get((u.searchParams.get("code")||"").toUpperCase()),p=r?.players.find(x=>x.id===u.searchParams.get("id"));if(!p)return send(res,404,{error:"Speler niet gevonden"});res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"});p.res=res;res.write(`data: ${JSON.stringify({type:"state",state:pub(r)})}\n\n`);pushPrivate(r,p);req.on("close",()=>{p.res=null;push(r)});return}
 if(req.method==="POST"&&(req.url==="/start"||req.url==="/action")){let b="";req.on("data",x=>b+=x);req.on("end",()=>{let q=JSON.parse(b),r=rooms.get(q.code),p=r?.players.find(x=>x.id===q.id);if(!r||!p)return send(res,404,{error:"Kamer/speler onbekend"});
   if(req.url==="/start"){if(r.players.length<2)return send(res,400,{error:"Minimaal 2 spelers"});r.started=true;r.round=0;r.dealer=0;r.players.forEach(x=>x.score=0);deal(r);return send(res,200,{ok:true})}
   const i=r.players.indexOf(p);if(r.finished)return send(res,400,{error:"Spel afgelopen"});if(i!==r.turn)return send(res,400,{error:"Niet jouw beurt"});
   if(q.action==="bid"){if(r.phase!=="bid"||r.bids[i]!==null)return send(res,400,{error:"Ongeldige inzet"});if(q.value<0||q.value>nCards(r.round))return send(res,400,{error:"Ongeldige inzet"});r.bids[i]=q.value;if(r.bids.every(x=>x!==null)){r.phase="play";r.turn=(r.dealer+1)%r.players.length}else r.turn=(r.turn+1)%r.players.length;push(r);return send(res,200,{ok:true})}
   if(q.action==="play"){if(r.phase!=="play")return send(res,400,{error:"Nog niet spelen"});let c=r.hands[i][q.index];if(!c||!legal(r,i,c))return send(res,400,{error:"Je moet kleur bekennen als dat kan"});r.hands[i].splice(q.index,1);r.trick.push({p:i,c});r.players.forEach(x=>pushPrivate(r,x));if(r.trick.length<r.players.length){r.turn=(r.turn+1)%r.players.length;push(r);return send(res,200,{ok:true})}let w=r.trick[0],lead=r.trick[0].c;for(const x of r.trick.slice(1))if(beats(x.c,w.c,lead,r.trump))w=x;r.won[w.p]++;r.trick=[];if(r.hands.every(h=>h.length===0))finishRound(r);else{r.turn=w.p;push(r)}return send(res,200,{ok:true})}
   return send(res,400,{error:"Onbekende actie"});
 });return}
 send(res,404,{error:"Niet gevonden"});
});
server.listen(PORT,()=>console.log("Double Lucky 7 listening on "+PORT));
