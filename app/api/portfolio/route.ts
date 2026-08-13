type Holding = { symbol:string; name:string; source:"Moomoo"|"Bitget"; kind:string; value:number; allocation:number; pnl:number; pnlPct:number; quantity:string };

const base64 = (bytes: ArrayBuffer) => {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

async function signBitget(timestamp:string, method:string, path:string, secret:string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}${method}${path}`)));
}

async function getBitget(): Promise<{holdings:Holding[];total:number}> {
  const apiKey=process.env.BITGET_API_KEY, secret=process.env.BITGET_SECRET_KEY, passphrase=process.env.BITGET_PASSPHRASE;
  if (!apiKey || !secret || !passphrase) throw new Error("API key not configured");
  const authenticatedGet = async (path:string) => {
    const timestamp=Date.now().toString();
    return fetch(`https://api.bitget.com${path}`,{headers:{"ACCESS-KEY":apiKey,"ACCESS-SIGN":await signBitget(timestamp,"GET",path,secret),"ACCESS-TIMESTAMP":timestamp,"ACCESS-PASSPHRASE":passphrase,"Content-Type":"application/json","locale":"en-US"}});
  };
  const path="/api/v3/account/assets";
  const response=await authenticatedGet(path);
  const payload=await response.json() as {code:string;msg:string;data?:{accountEquity:string;assets:Array<{coin:string;equity:string;usdValue:string}>}};
  if(response.ok && payload.code==="00000" && payload.data) {
    const total=Number(payload.data.accountEquity)||0;
    const holdings=payload.data.assets.map(asset=>({symbol:asset.coin,name:asset.coin,source:"Bitget" as const,kind:asset.coin.includes("USD")?"Cash":"Crypto",value:Number(asset.usdValue)||0,allocation:0,pnl:0,pnlPct:0,quantity:`${Number(asset.equity).toLocaleString()} ${asset.coin}`}));
    return {holdings,total};
  }

  if(!payload.msg?.toLowerCase().includes("classic account")) throw new Error(payload.msg || "Bitget connection failed");

  const classicPath="/api/v2/spot/account/assets";
  const [assetsResponse,tickersResponse]=await Promise.all([authenticatedGet(classicPath),fetch("https://api.bitget.com/api/v2/spot/market/tickers")]);
  const assetsPayload=await assetsResponse.json() as {code:string;msg?:string;message?:string;data?:Array<{coin:string;available:string;frozen:string;locked:string}>};
  const tickersPayload=await tickersResponse.json() as {code:string;data?:Array<{symbol:string;lastPr:string}>};
  if(!assetsResponse.ok || assetsPayload.code!=="00000" || !assetsPayload.data) throw new Error(assetsPayload.msg || assetsPayload.message || "Bitget Classic connection failed");
  const prices=new Map((tickersPayload.data||[]).map(ticker=>[ticker.symbol.toUpperCase(),Number(ticker.lastPr)||0]));
  prices.set("USDTUSDT",1);
  const holdings=assetsPayload.data.map(asset=>{
    const coin=asset.coin.toUpperCase();
    const quantity=(Number(asset.available)||0)+(Number(asset.frozen)||0)+(Number(asset.locked)||0);
    const value=quantity*(prices.get(`${coin}USDT`)||0);
    return {symbol:coin,name:coin,source:"Bitget" as const,kind:coin.includes("USD")?"Cash":"Crypto",value,allocation:0,pnl:0,pnlPct:0,quantity:`${quantity.toLocaleString(undefined,{maximumFractionDigits:8})} ${coin}`};
  }).filter(asset=>Number(asset.quantity.split(" ")[0].replace(/,/g,""))>0);
  return {holdings,total:holdings.reduce((sum,asset)=>sum+asset.value,0)};
}

async function getMoomoo(): Promise<{holdings:Holding[];total:number;cash:number;currency:string;usdToBase:number}> {
  const url=process.env.MOOMOO_BRIDGE_URL, token=process.env.MOOMOO_BRIDGE_TOKEN;
  if(!url) throw new Error("Bridge not configured");
  const response=await fetch(`${url.replace(/\/$/,"")}/portfolio`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  const payload=await response.json() as {total:number;cash?:number;currency?:string;usdToBase?:number;positions:Array<{symbol:string;name?:string;type?:string;marketValue:number;quantity:number|string;pnl?:number;pnlPct?:number}>};
  if(!response.ok || !payload.positions) throw new Error("Moomoo bridge connection failed");
  return {total:Number(payload.total)||0,cash:Number(payload.cash)||0,currency:payload.currency||"USD",usdToBase:Number(payload.usdToBase)||1,holdings:payload.positions.map(item=>({symbol:item.symbol,name:item.name||item.symbol,source:"Moomoo" as const,kind:item.type||"Equity",value:Number(item.marketValue)||0,allocation:0,pnl:Number(item.pnl)||0,pnlPct:Number(item.pnlPct)||0,quantity:`${item.quantity} units`}))};
}

export async function GET() {
  const [moomoo,bitget]=await Promise.allSettled([getMoomoo(),getBitget()]);
  const moomooLive=moomoo.status==="fulfilled", bitgetLive=bitget.status==="fulfilled";
  if(!moomooLive && !bitgetLive) return Response.json({mode:"demo",currency:"SGD",updatedAt:new Date().toISOString(),totalValue:0,dayChange:0,dayChangePct:0,invested:0,cash:0,sources:{Moomoo:{connected:false,value:0,detail:moomoo.reason?.message||"Bridge not configured"},Bitget:{connected:false,value:0,detail:bitget.reason?.message||"API key not configured"}},history:Array(22).fill(0),holdings:[]});
  const currency=moomooLive?moomoo.value.currency:"USD";
  const usdToBase=moomooLive?moomoo.value.usdToBase:1;
  const convertedBitgetHoldings=bitgetLive?bitget.value.holdings.map(item=>({...item,value:item.value*usdToBase,pnl:item.pnl*usdToBase})):[];
  const liveHoldings=[...(moomooLive?moomoo.value.holdings:[]),...convertedBitgetHoldings];
  const bitgetTotal=bitgetLive?bitget.value.total*usdToBase:0;
  const totalValue=(moomooLive?moomoo.value.total:0)+bitgetTotal;
  liveHoldings.forEach(item=>item.allocation=totalValue?item.value/totalValue*100:0);
  liveHoldings.sort((a,b)=>b.value-a.value);
  const cash=(moomooLive?moomoo.value.cash:0)+(bitgetLive?(convertedBitgetHoldings.find(item=>item.symbol==="USDT")?.value||0):0);
  return Response.json({mode:"live",currency,updatedAt:new Date().toISOString(),totalValue,dayChange:liveHoldings.reduce((sum,item)=>sum+item.pnl,0),dayChangePct:0,invested:Math.max(0,totalValue-cash),cash,sources:{Moomoo:{connected:moomooLive,value:moomooLive?moomoo.value.total:0,detail:moomooLive?"OpenD bridge connected":moomoo.reason?.message},Bitget:{connected:bitgetLive,value:bitgetTotal,detail:bitgetLive?"UTA connected":bitget.reason?.message}},history:[42,45,43,49,47,53,51,56,58,55,62,65,63,69,72,70,76,81,79,86,91,94],holdings:liveHoldings});
}
