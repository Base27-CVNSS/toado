/**
 * Cloudflare Worker API for TOADO. Set GEOAPIFY_API_KEY via wrangler secret.
 * Optional: ALLOWED_ORIGIN = "https://base27-cvnss.github.io"
 * The Worker is intentionally NOT deployed from GitHub Pages.
 */
export default {
  async fetch(req,env){
    const origin=req.headers.get("Origin")||"";
    const allowed=(env.ALLOWED_ORIGIN||"").replace(/\/$/,"");
    const cors={
      "Access-Control-Allow-Origin":allowed||origin||"null",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type",
      "Vary":"Origin",
      "Cache-Control":"no-store"
    };
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors}});
    if(allowed&&origin&&origin!==allowed)return json({error:"Origin not allowed"},403);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(req.method!=="POST"||new URL(req.url).pathname!=="/api/geocode")return json({error:"Not found"},404);
    if(!env.GEOAPIFY_API_KEY)return json({error:"GEOAPIFY_API_KEY is not configured"},503);
    if(Number(req.headers.get("Content-Length")||0)>2048)return json({error:"Body too large"},413);
    let body;try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
    const address=String(body?.address||"").trim();
    if(address.length<3||address.length>350)return json({error:"Address must be 3..350 characters"},400);
    const u=new URL("https://api.geoapify.com/v1/geocode/search");
    u.searchParams.set("text",address);
    u.searchParams.set("filter","countrycode:vn");
    u.searchParams.set("format","json");
    u.searchParams.set("lang","vi");
    u.searchParams.set("limit","1");
    u.searchParams.set("apiKey",env.GEOAPIFY_API_KEY);
    try{
      const resp=await fetch(u.toString(),{headers:{"Accept":"application/json"}});
      if(!resp.ok)return json({error:"Geocoder provider HTTP "+resp.status},resp.status===429?429:502);
      const result=(await resp.json())?.results?.[0];
      if(!result)return json({found:false});
      const lat=Number(result.lat),lon=Number(result.lon);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<7.5||lat>24.5||lon<101||lon>117.6)return json({found:false});
      return json({lat,lon,formatted:result.formatted||"",precision:"geocode",provider:"Geoapify",confidence:result.rank?.confidence??null});
    }catch{return json({error:"Provider unavailable"},502);}
  }
};
