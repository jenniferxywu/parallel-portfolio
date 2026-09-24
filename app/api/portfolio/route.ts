import { getFundingSummary, saveSnapshots, seedKnownHistory, type SnapshotAccount } from "@/db/finance";
import { accountValue } from "@/lib/financial-model.js";

type Holding = { symbol:string; name:string; source:"Moomoo"|"Bitget"; kind:string; value:number; allocation:number; pnl:number|null; pnlPct:number|null; quantity:string };
type FuturesPosition = { category:string; symbol:string; side:"long"|"short"; marginCoin:string; marginMode:string; quantity:number; leverage:number; avgPrice:number; markPrice:number; margin:number; pnl:number; liquidationPrice:number|null };
type SourcePortfolio = { holdings:Holding[]; total:number; cash:number; positions:FuturesPosition[]; positionsConnected:boolean; positionsDetail:string; snapshot:SnapshotAccount };

const cashSymbols = new Set(["USD","USDT","USDC","SGD","CNY"]);
const base64 = (bytes:ArrayBuffer) => { let binary=""; for(const byte of new Uint8Array(bytes)) binary+=String.fromCharCode(byte); return btoa(binary); };

async function signBitget(timestamp:string, method:string, path:string, secret:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return base64(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}${method}${path}`)));
}

async function getBitget():Promise<SourcePortfolio> {
  const apiKey=process.env.BITGET_API_KEY, secret=process.env.BITGET_SECRET_KEY, passphrase=process.env.BITGET_PASSPHRASE;
  if(!apiKey||!secret||!passphrase) throw new Error("API key not configured");
  const authenticatedGet=async(path:string)=>{const timestamp=Date.now().toString();return fetch(`https://api.bitget.com${path}`,{headers:{"ACCESS-KEY":apiKey,"ACCESS-SIGN":await signBitget(timestamp,"GET",path,secret),"ACCESS-TIMESTAMP":timestamp,"ACCESS-PASSPHRASE":passphrase,"Content-Type":"application/json","locale":"en-US"}});};
  const asOf=Date.now();
  const path="/api/v3/account/assets";
  const response=await authenticatedGet(path);
  const payload=await response.json() as {code:string;msg:string;data?:{accountEquity:string;assets:Array<{coin:string;equity:string;usdValue:string}>}};

  if(response.ok&&payload.code==="00000"&&payload.data){
    const total=Number(payload.data.accountEquity)||0;
    const holdings=payload.data.assets.map(asset=>({symbol:asset.coin,name:asset.coin,source:"Bitget" as const,kind:cashSymbols.has(asset.coin)?"Cash":"Crypto",value:Number(asset.usdValue)||0,allocation:0,pnl:null,pnlPct:null,quantity:`${Number(asset.equity).toLocaleString()} ${asset.coin}`}));
    const categories=["USDT-FUTURES","USDC-FUTURES","COIN-FUTURES"];
    const positionResults=await Promise.allSettled(categories.map(async category=>{
      const positionPath=`/api/v3/position/current-position?category=${category}`;
      const positionResponse=await authenticatedGet(positionPath);
      const positionPayload=await positionResponse.json() as {code:string;msg?:string;data?:{list?:Array<{category:string;symbol:string;marginCoin:string;posSide:"long"|"short";marginMode:string;positionBalance:string;total:string;leverage:string;avgPrice:string;unrealisedPnl:string;liquidationPrice:string;markPrice:string}>}};
      if(!positionResponse.ok||positionPayload.code!=="00000") throw new Error(positionPayload.msg||`Unable to read ${category}`);
      return (positionPayload.data?.list||[]).filter(item=>Number(item.total)!==0).map(item=>({category:item.category,symbol:item.symbol,side:item.posSide,marginCoin:item.marginCoin,marginMode:item.marginMode,quantity:Number(item.total)||0,leverage:Number(item.leverage)||0,avgPrice:Number(item.avgPrice)||0,markPrice:Number(item.markPrice)||0,margin:Number(item.positionBalance)||0,pnl:Number(item.unrealisedPnl)||0,liquidationPrice:Number(item.liquidationPrice)>0?Number(item.liquidationPrice):null}));
    }));
    const successful=positionResults.filter((result):result is PromiseFulfilledResult<FuturesPosition[]>=>result.status==="fulfilled");
    const failed=positionResults.find((result):result is PromiseRejectedResult=>result.status==="rejected");
    const positions=successful.flatMap(result=>result.value);
    const snapshot:SnapshotAccount={accountId:"bitget",source:"BITGET_API",asOf,valuation:{amount:payload.data.accountEquity,currency:"USD"},cash:payload.data.assets.filter(asset=>cashSymbols.has(asset.coin)).map(asset=>({currency:asset.coin,amount:asset.equity})),positions:[
      ...payload.data.assets.filter(asset=>!cashSymbols.has(asset.coin)).map(asset=>({symbol:asset.coin,name:asset.coin,assetType:"CRYPTO",externalPositionId:`spot:${asset.coin}`,quantity:asset.equity,currentPrice:Number(asset.equity)?String(Number(asset.usdValue)/Number(asset.equity)):undefined,priceCurrency:"USD",marketValue:asset.usdValue})),
      ...positions.map(position=>({symbol:position.symbol,name:position.symbol,assetType:"FUTURES",externalPositionId:`${position.category}:${position.symbol}:${position.side}`,quantity:String(position.quantity),averageCost:String(position.avgPrice),costCurrency:position.marginCoin,currentPrice:String(position.markPrice),priceCurrency:position.marginCoin,unrealizedPnl:String(position.pnl),metadata:{category:position.category,side:position.side,leverage:position.leverage,margin:position.margin,marginMode:position.marginMode,liquidationPrice:position.liquidationPrice}})),
    ]};
    return {holdings,total,cash:holdings.filter(item=>item.kind==="Cash").reduce((sum,item)=>sum+item.value,0),positions,positionsConnected:successful.length>0,positionsDetail:successful.length>0?"UTA futures positions connected":failed?.reason?.message||"UTA Trade (Read) permission needed",snapshot};
  }

  if(!payload.msg?.toLowerCase().includes("classic account")) throw new Error(payload.msg||"Bitget connection failed");
  const classicPath="/api/v2/spot/account/assets";
  const [assetsResponse,tickersResponse]=await Promise.all([authenticatedGet(classicPath),fetch("https://api.bitget.com/api/v2/spot/market/tickers")]);
  const assetsPayload=await assetsResponse.json() as {code:string;msg?:string;message?:string;data?:Array<{coin:string;available:string;frozen:string;locked:string}>};
  const tickersPayload=await tickersResponse.json() as {code:string;data?:Array<{symbol:string;lastPr:string}>};
  if(!assetsResponse.ok||assetsPayload.code!=="00000"||!assetsPayload.data) throw new Error(assetsPayload.msg||assetsPayload.message||"Bitget Classic connection failed");
  const prices=new Map((tickersPayload.data||[]).map(ticker=>[ticker.symbol.toUpperCase(),Number(ticker.lastPr)||0])); prices.set("USDTUSDT",1); prices.set("USDCUSDT",1); prices.set("USDUSDT",1);
  const raw=assetsPayload.data.map(asset=>{const coin=asset.coin.toUpperCase(),quantity=(Number(asset.available)||0)+(Number(asset.frozen)||0)+(Number(asset.locked)||0),value=quantity*(prices.get(`${coin}USDT`)||0);return{coin,quantity,value};}).filter(asset=>asset.quantity>0);
  const holdings=raw.map(asset=>({symbol:asset.coin,name:asset.coin,source:"Bitget" as const,kind:cashSymbols.has(asset.coin)?"Cash":"Crypto",value:asset.value,allocation:0,pnl:null,pnlPct:null,quantity:`${asset.quantity.toLocaleString(undefined,{maximumFractionDigits:8})} ${asset.coin}`}));
  const total=holdings.reduce((sum,asset)=>sum+asset.value,0);
  return {holdings,total,cash:holdings.filter(item=>item.kind==="Cash").reduce((sum,item)=>sum+item.value,0),positions:[],positionsConnected:false,positionsDetail:"Futures positions require a UTA account",snapshot:{accountId:"bitget",source:"BITGET_API",asOf,valuation:{amount:String(total),currency:"USD"},cash:raw.filter(asset=>cashSymbols.has(asset.coin)).map(asset=>({currency:asset.coin,amount:String(asset.quantity)})),positions:raw.filter(asset=>!cashSymbols.has(asset.coin)).map(asset=>({symbol:asset.coin,name:asset.coin,assetType:"CRYPTO",externalPositionId:`spot:${asset.coin}`,quantity:String(asset.quantity),currentPrice:String(prices.get(`${asset.coin}USDT`)||0),priceCurrency:"USD",marketValue:String(asset.value)}))}};
}

async function getMoomoo():Promise<SourcePortfolio&{currency:string;usdToBase:number}> {
  const url=process.env.MOOMOO_BRIDGE_URL,token=process.env.MOOMOO_BRIDGE_TOKEN;
  if(!url) throw new Error("Bridge not configured");
  const response=await fetch(`${url.replace(/\/$/,"")}/portfolio`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  const payload=await response.json() as {asOf?:number;total:number;cash?:number;currency?:string;usdToBase?:number;cashBalances?:Array<{currency:string;amount:number|string}>;fxRates?:Array<{base:string;quote:string;rate:number|string;source:string}>;positions:Array<{externalPositionId?:string;symbol:string;name?:string;type?:string;currency?:string;marketValueNative?:number;marketValue:number;quantity:number|string;averageCost?:number;currentPrice?:number;pnlNative?:number;pnl?:number;pnlPct?:number}>};
  if(!response.ok||!payload.positions) throw new Error("Moomoo bridge connection failed");
  const currency=payload.currency||"SGD",asOf=payload.asOf||Date.now();
  const holdings=payload.positions.map(item=>({symbol:item.symbol,name:item.name||item.symbol,source:"Moomoo" as const,kind:item.type||"Equity",value:Number(item.marketValue)||0,allocation:0,pnl:Number(item.pnl)||0,pnlPct:Number(item.pnlPct)||0,quantity:`${item.quantity} units`}));
  return {total:Number(payload.total)||0,cash:Number(payload.cash)||0,currency,usdToBase:Number(payload.usdToBase)||1,holdings,positions:[],positionsConnected:false,positionsDetail:"",snapshot:{accountId:"moomoo",source:"MOOMOO_API",asOf,valuation:{amount:String(payload.total),currency},cashStatus:"PARTIAL",cash:(payload.cashBalances||[{currency,amount:payload.cash||0}]).map(item=>({currency:item.currency,amount:String(item.amount)})),positions:payload.positions.map(item=>({symbol:item.symbol,name:item.name||item.symbol,assetType:item.type?.toUpperCase()||"EQUITY",externalPositionId:item.externalPositionId||item.symbol,quantity:String(item.quantity),averageCost:item.averageCost==null?undefined:String(item.averageCost),costCurrency:item.currency||currency,currentPrice:item.currentPrice==null?undefined:String(item.currentPrice),priceCurrency:item.currency||currency,marketValue:item.marketValueNative==null?String(item.marketValue):String(item.marketValueNative),unrealizedPnl:item.pnlNative==null?String(item.pnl||0):String(item.pnlNative)})),fxRates:(payload.fxRates||[]).map(rate=>({...rate,rate:String(rate.rate)}))}};
}

export async function GET() {
  const [moomoo,bitget]=await Promise.allSettled([getMoomoo(),getBitget()]);
  const moomooLive=moomoo.status==="fulfilled",bitgetLive=bitget.status==="fulfilled";
  let funding:Array<{accountId:string;currency:string;amount:number;status:string}>=[],ledgerStatus="UNAVAILABLE";
  try{await seedKnownHistory();await saveSnapshots([...(moomooLive?[moomoo.value.snapshot]:[]),...(bitgetLive?[bitget.value.snapshot]:[])]);funding=await getFundingSummary();ledgerStatus="PARTIAL";}catch(error){console.error("Financial ledger unavailable",error);}
  if(!moomooLive&&!bitgetLive) return Response.json({mode:"demo",currency:"SGD",updatedAt:new Date().toISOString(),totalValue:0,dayChange:null,dayChangePct:null,invested:0,cash:0,dataQuality:ledgerStatus,sources:{Moomoo:{connected:false,value:0,detail:moomoo.reason?.message||"Bridge not configured"},Bitget:{connected:false,value:0,detail:bitget.reason?.message||"API key not configured"}},history:[],holdings:[],positions:[],positionsConnected:false,positionsDetail:"Bitget is not connected",funding});
  const currency=moomooLive?moomoo.value.currency:"USD",usdToBase=moomooLive?moomoo.value.usdToBase:1;
  const convertedBitgetHoldings=bitgetLive?bitget.value.holdings.map(item=>({...item,value:item.value*usdToBase,pnl:item.pnl==null?null:item.pnl*usdToBase})):[];
  const liveHoldings=[...(moomooLive?moomoo.value.holdings:[]),...convertedBitgetHoldings];
  const bitgetTotal=bitgetLive?bitget.value.total*usdToBase:0;
  const totalValue=accountValue({authoritativeTotal:(moomooLive?moomoo.value.total:0)+bitgetTotal});
  liveHoldings.forEach(item=>item.allocation=totalValue?item.value/totalValue*100:0); liveHoldings.sort((a,b)=>b.value-a.value);
  const cash=(moomooLive?moomoo.value.cash:0)+(bitgetLive?bitget.value.cash*usdToBase:0);
  return Response.json({mode:"live",currency,updatedAt:new Date().toISOString(),totalValue,dayChange:null,dayChangePct:null,invested:Math.max(0,totalValue-cash),cash,dataQuality:ledgerStatus,reportingCurrencyStatus:moomooLive?"CURRENT_FX":"PARTIAL_USD_FALLBACK",sources:{Moomoo:{connected:moomooLive,value:moomooLive?moomoo.value.total:0,detail:moomooLive?"OpenD bridge connected":moomoo.reason?.message},Bitget:{connected:bitgetLive,value:bitgetTotal,detail:bitgetLive?"UTA connected":bitget.reason?.message}},history:[],holdings:liveHoldings,positions:bitgetLive?bitget.value.positions:[],positionsConnected:bitgetLive?bitget.value.positionsConnected:false,positionsDetail:bitgetLive?bitget.value.positionsDetail:"Bitget is not connected",funding});
}
