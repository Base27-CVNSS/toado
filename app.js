/* Toado Vietnam — client-only CSV processing, optional separately hosted geocoder. */
(() => {
  "use strict";
  const LIMIT = 10000;
  const API_DATA = "https://raw.githubusercontent.com/open-admin-data/vietnam-administrative-divisions/main/data/";
  const $ = id => document.getElementById(id);
  const state = { rows: [], output: [], addressKey: "", latKey: "", lonKey: "", admin: null, filename: "", run: 0, running: false, done: 0, memo: new Map() };
  const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const canonical = v => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi,"d").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  const display = n => Number(n || 0).toLocaleString("vi-VN");
  const intNum = v => { if(v === null || v === undefined || String(v).trim() === "") return NaN; const t=String(v).trim().replace(",","."); return /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };
  const isVN = (lat,lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat>=7.5 && lat<=24.5 && lon>=101.0 && lon<=117.6;
  const escXlsx = v => (typeof v==="string" && /^[\s]*[=+@-]/.test(v)) ? "'" + v : (v ?? "");
  const classify = r => !r || !r.lat ? "missing" : r.precision==="csv" || r.precision==="geocode" ? "exact" : "approx";
  function notify(s){ const el=$("notification"); el.textContent=s; el.classList.toggle("hidden",!s); }
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  function bind(){
    $("browse").addEventListener("click",()=> $("file").click());
    $("file").addEventListener("change",e=>{ if(e.target.files[0]) load(e.target.files[0]); e.target.value=""; });
    $("sample").addEventListener("click",sample);
    $("rerun").addEventListener("click",run);
    $("stop").addEventListener("click",()=>{ state.run++;state.running=false;$("stop").classList.add("hidden");$("rerun").disabled=false; render();$("runstatus").textContent="Đã dừng. Có thể xuất các dòng hiện có."; });
    $("export").addEventListener("click",exportXlsx);
    $("statusfilter").addEventListener("change",renderTable);
    const zone=$("dropzone");
    for(const name of ["dragenter","dragover"]) zone.addEventListener(name,e=>{e.preventDefault();zone.classList.add("dragging");});
    for(const name of ["dragleave","drop"]) zone.addEventListener(name,e=>{e.preventDefault();zone.classList.remove("dragging");});
    zone.addEventListener("drop",e=>{const f=e.dataTransfer.files[0];if(f)load(f);});
  }
  function unwrap(payload){return Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:[];}
  const nameLocal = x => String(x?.name?.local ?? x?.name ?? "");
  const ident = x => String(x?.id ?? x?.code?.id ?? "");
  function buildAdmin(pdata,wdata){
    const provinces=unwrap(pdata), wards=unwrap(wdata);
    if(provinces.length!==34 || wards.length<3000) throw new Error("Danh mục không đầy đủ.");
    const byCode=new Map(provinces.map(x=>[ident(x),x]));
    const pByName=new Map();
    const wByName=new Map();
    function push(m,key,item){if(!key)return;const a=m.get(key)||[];a.push(item);m.set(key,a);}
    for(const p of provinces) push(pByName,canonical(nameLocal(p)),p);
    for(const w of wards){
      const key=canonical(nameLocal(w));
      push(wByName,key,w);
      const short=key.replace(/^(xa|phuong|dac khu|thi tran|thi xa)\s+/,"");
      if(short!==key) push(wByName,short,w);
    }
    return {provinces,wards,byCode,pByName,wByName};
  }
  async function adminLoad(){
    const text=$("datasetStatus");
    try{
      const [p,w]=await Promise.all(["all-province.json","all-ward.json"].map(async n=>{
        const r=await fetch(API_DATA+n,{cache:"force-cache"});
        if(!r.ok)throw new Error("HTTP "+r.status);
        return r.json();
      }));
      state.admin=buildAdmin(p,w);
      text.textContent="✓ Danh mục 34 tỉnh/thành · "+display(state.admin.wards.length)+" xã/phường (2025)";
      text.style.color="#148261";
    }catch(e){text.textContent="⚠ Không tải được danh mục hành chính (cần Internet).";text.style.color="#ae6a1a";notify("Không tải được danh mục hành chính. Kiểm tra kết nối Internet rồi bấm “Chạy lại”; các tọa độ CSV có sẵn vẫn được giữ.");}
  }
  const aliases={"tp hcm":"ho chi minh","tphcm":"ho chi minh","hcm":"ho chi minh","hcmc":"ho chi minh","sai gon":"ho chi minh","tphcmc":"ho chi minh","tp hn":"ha noi","hn":"ha noi","tp da nang":"da nang"};
  function cleanedPart(x){let v=canonical(x); return aliases[v]||v.replace(/^(tinh|thanh pho|tp|tp )\s+/,"");}
  function segments(addr){return String(addr||"").split(/[,;|\n]+/).map(x=>String(x).trim()).filter(Boolean);}
  function provinceMatch(parts,adm){
    let hits=[];
    for(const part of parts){
      const t=cleanedPart(part);
      hits.push(...(adm.pByName.get(t)||[]));
      const raw=canonical(part); if(aliases[raw])hits.push(...(adm.pByName.get(aliases[raw])||[]));
    }
    const uniq=[...new Map(hits.map(x=>[ident(x),x])).values()];
    return uniq.length===1 ? uniq[0] : null;
  }
  function parentCode(w){
    const p=w?.parent;
    const code=typeof p==="string"?p:p?.id??p?.code?.id??p?.code??p?.parent_id??w?.parent_id;
    if(code!==undefined&&code!==null&&typeof code!=="object")return String(code);
    const arr=Array.isArray(w?.ancestors)?w.ancestors:[];
    const a=arr.find(x=>x?.level===1)??arr[0];
    return String(a?.id??a?.code?.id??"");
  }
  function resolve(addr){
    const a=state.admin;
    if(!a)return {province:null,ward:null,reason:"Không có dữ liệu hành chính"};
    const parts=segments(addr);
    const province=provinceMatch(parts,a);
    let candidates=[];
    for(const raw of parts){
      const part=canonical(raw);
      if(!part || part.length<3)continue;
      // Prefer explicit xã/phường/đặc khu; no substring matching inside a street name.
      const wardPart=part.match(/^(phuong|xa|dac khu|thi tran)\s+.+$/);
      if(wardPart || parts.length>1){
        candidates.push(...(a.wByName.get(part)||[]));
        if(wardPart) candidates.push(...(a.wByName.get(part.replace(/^(phuong|xa|dac khu|thi tran)\s+/,""))||[]));
      }
    }
    candidates=[...new Map(candidates.map(x=>[ident(x),x])).values()];
    if(province)candidates=candidates.filter(w=>parentCode(w)===ident(province));
    // Never guess a commune from a non-unique name.
    const ward=candidates.length===1?candidates[0]:null;
    const wardProvince=ward?a.byCode.get(parentCode(ward)):null;
    return {province:province||wardProvince||null,ward,reason:candidates.length>1?"Trùng tên đơn vị cấp xã; cần xác minh":""};
  }
  function latLon(item){
    const lat=intNum(item?.geo?.lat),lon=intNum(item?.geo?.lon);
    return isVN(lat,lon)?{lat,lon}:null;
  }
  function findColumn(columns,variants){
    const normalized=new Map(columns.map(c=>[canonical(c).replace(/\s+/g,""),c]));
    for(const v of variants){const result=normalized.get(canonical(v).replace(/\s+/g,""));if(result!==undefined)return result;}
    return "";
  }
  function readInputCols(cols){
    return {
      addressKey:findColumn(cols,["dia_chi","địa chỉ","địa chỉ đầy đủ","full_address","address","dia diem","địa điểm","address_full","địa chỉ khách hàng","location"]),
      latKey:findColumn(cols,["vi_do","vĩ độ","latitude","lat","gps_lat","y_wgs84"]),
      lonKey:findColumn(cols,["kinh_do","kinh độ","longitude","long","lon","lng","gps_lon","x_wgs84"])
    };
  }
  function parseCsv(file){
    return new Promise((resolve,reject)=>{
      if(!window.Papa){reject(new Error("Không tải được thư viện CSV; kiểm tra mạng."));return;}
      Papa.parse(file,{header:true,skipEmptyLines:"greedy",worker:false,transformHeader:h=>h.replace(/^\ufeff/,"").trim(),
        complete:r=>{if(r.errors.some(x=>x.code==="MissingQuotes"))reject(new Error("CSV có lỗi dấu ngoặc kép: dòng "+(r.errors[0]?.row+2)));else resolve(r);},
        error:e=>reject(e)});
    });
  }
  async function load(file){
    notify("");
    if(!/\.csv$/i.test(file.name)){notify("Chỉ hỗ trợ tệp CSV (.csv).");return;}
    state.run++;state.running=false;
    try{
      const parsed=await parseCsv(file);
      if(!parsed.data.length)throw new Error("Tệp CSV không có dữ liệu.");
      if(parsed.data.length>LIMIT)throw new Error("Tệp vượt giới hạn 10.000 dòng. Hãy chia tệp.");
      const cols=(parsed.meta.fields||[]).filter(Boolean);
      const mapping=readInputCols(cols);
      if(!mapping.addressKey && !(mapping.latKey&&mapping.lonKey))throw new Error("Thiếu cột địa chỉ (dia_chi / address) hoặc cặp latitude + longitude.");
      state.rows=parsed.data.map((o,i)=>({ ...o,__row:i+2 }));
      state.addressKey=mapping.addressKey;state.latKey=mapping.latKey;state.lonKey=mapping.lonKey;
      state.filename=file.name;state.output=Array(state.rows.length).fill(null);state.done=0;state.memo.clear();
      $("workspace").classList.remove("hidden");$("filename").textContent=file.name;
      $("filemeta").textContent=display(state.rows.length)+" dòng · "+display(cols.length)+" cột · "+(mapping.addressKey||"Tọa độ CSV")+" · "+(file.size/1024).toFixed(1)+" KB";
      if(parsed.errors.length)notify("CSV có "+parsed.errors.length+" cảnh báo phân tích cú pháp; vui lòng kiểm tra các dòng trước khi dùng kết quả.");
      render();await run();
    }catch(e){notify(e.message||String(e));}
  }
  function sample(){
    const content="\ufeffid,dia_chi,ghi_chu\r\n1,\"Phường Sài Gòn, Thành phố Hồ Chí Minh\",Mẫu đơn vị hành chính\r\n2,\"Phường Bến Thành, Thành phố Hồ Chí Minh\",Mẫu đối chiếu\r\n3,\"Hà Nội\",Chỉ nhận diện cấp tỉnh\r\n";
    const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="toado_mau.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function inputCoordinate(row){
    const lat=intNum(state.latKey?row[state.latKey]:null),lon=intNum(state.lonKey?row[state.lonKey]:null);
    return isVN(lat,lon)?{lat,lon}:null;
  }
  function record(row,index){
    const address=String(row[state.addressKey]??"").trim();
    const admin=resolve(address);
    const province=admin.province,ward=admin.ward;
    const r={number:index+1,original:row,address,lat:null,lon:null,province:nameLocal(province),provinceCode:ident(province),ward:nameLocal(ward),wardCode:ident(ward),precision:"missing",source:"",status:"Chưa xác định",confidence:null,note:admin.reason||"",formatted:""};
    const coords=inputCoordinate(row);
    if(coords){Object.assign(r,coords,{precision:"csv",source:"CSV",status:"Tọa độ từ CSV",confidence:1});if(!province)r.note="Chưa kiểm chứng hành chính từ tọa độ; cần lớp ranh giới";return r;}
    if(ward){const g=latLon(ward);if(g){Object.assign(r,g,{precision:"ward",source:"Điểm tham chiếu cấp xã",status:"Tọa độ đại diện (không phải vị trí nhà)",confidence:null});return r;}}
    if(province){const g=latLon(province);if(g){Object.assign(r,g,{precision:"province",source:"Điểm tham chiếu cấp tỉnh",status:"Tọa độ đại diện (không phải vị trí nhà)",confidence:null,note:r.note||"Chưa xác định vị trí trong tỉnh"});return r;}}
    r.note=r.note||"Không tìm thấy địa chỉ hoặc đơn vị hành chính tương ứng";
    return r;
  }
  let nextSlot=0;
  async function geocode(address,endpoint,pace,turn){
    const key=canonical(address);
    if(!key)return null;
    if(state.memo.has(key))return state.memo.get(key);
    const task=(async()=>{
      const slot=Math.max(Date.now(),nextSlot);nextSlot=slot+pace;
      if(slot>Date.now())await wait(slot-Date.now());
      if(turn!==state.run)return null;
      for(let attempt=0;attempt<3;attempt++){
        try{
          const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),25000);
          let res;
          try{res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address}),signal:ctrl.signal});}
          finally{clearTimeout(timeout);}
          if(res.status===429 || res.status>=500){if(attempt<2){await wait(1500*(attempt+1));continue;}return {error:"API quá tải / giới hạn quota ("+res.status+")"};}
          if(!res.ok)return {error:"HTTP "+res.status};
          const body=await res.json();
          const lat=Number(body?.lat),lon=Number(body?.lon);
          if(!isVN(lat,lon))return {error:"Không có tọa độ Việt Nam hợp lệ"};
          return {lat,lon,formatted:String(body.formatted||""),confidence:Number.isFinite(Number(body.confidence))?Number(body.confidence):null,precision:String(body.precision||"geocode"),source:String(body.provider||"API riêng")};
        }catch(e){if(attempt===2)return {error:e.name==="AbortError"?"API hết thời gian phản hồi":e.message};await wait(1000*(attempt+1));}
      }
      return null;
    })();
    state.memo.set(key,task);return task;
  }
  async function run(){
    if(!state.rows.length)return;
    const turn=++state.run;state.running=true;state.done=0;state.output=Array(state.rows.length).fill(null);state.memo.clear();nextSlot=0;
    $("rerun").disabled=true;$("stop").classList.remove("hidden");
    const endpoint=$("endpoint").value.trim();
    const pace=Math.max(100,Math.min(10000,Number($("pace").value)||500));
    if(endpoint && !/^https:\/\/[^ ]+$/i.test(endpoint) && !/^http:\/\/localhost(:\d+)?\//.test(endpoint)){
      state.running=false;$("rerun").disabled=false;$("stop").classList.add("hidden");notify("URL API phải dùng HTTPS (hoặc http://localhost khi thử nghiệm).");return;
    }
    const remote=!!endpoint;
    if(!state.admin)await adminLoad();
    $("runstatus").textContent=remote?"Đang định vị qua API riêng…":"Đang đối chiếu hành chính…";
    render();
    const n=state.rows.length;
    // A single worker and controlled pacing avoid uncontrolled bulk API traffic.
    for(let i=0;i<n;i++){
      if(turn!==state.run)break;
      const r=record(state.rows[i],i);
      if(remote && r.precision!=="csv" && r.address){
        const result=await geocode(r.address,endpoint,pace,turn);
        if(turn!==state.run)break;
        if(result&&result.lat&&result.lon){
          r.lat=result.lat;r.lon=result.lon;r.precision="geocode";r.source=result.source;r.status="Geocode API";r.confidence=result.confidence;r.formatted=result.formatted;
          r.note=r.province?"Đơn vị hành chính suy ra từ chuỗi địa chỉ, chưa đối chiếu polygon":"Chưa xác minh đơn vị hành chính theo tọa độ";
        }else if(result?.error){r.note=[r.note,result.error].filter(Boolean).join(" · ");}
      }
      state.output[i]=r;state.done=i+1;
      if(i%75===0 || i===n-1){render();if(!remote)await wait(0);}
    }
    if(turn!==state.run)return;
    state.running=false;$("rerun").disabled=false;$("stop").classList.add("hidden");
    $("runstatus").textContent=remote?"Đã xử lý xong · API riêng":"Đã xử lý xong · đối chiếu hành chính (không có API địa chỉ)";
    render();
  }
  function render(){
    const out=state.output.filter(Boolean);const n=state.rows.length;
    const located=out.filter(r=>r.lat!==null).length;
    const review=out.filter(r=>r.precision!=="csv" && r.precision!=="geocode").length;
    $("total").textContent=display(n);$("processed").textContent=display(state.done);$("located").textContent=display(located);$("review").textContent=display(review);
    $("percent").textContent=n?Math.round(state.done/n*100)+"%":"0%";
    $("progress").style.width=(n?state.done/n*100:0)+"%";$("progressNumber").textContent=display(state.done)+" / "+display(n);
    $("export").disabled=out.length===0||!window.ExcelJS;
    renderTable();
  }
  function renderTable(){
    const filter=$("statusfilter").value;
    const shown=state.output.filter(r=>r&&(filter==="all"||classify(r)===filter)).slice(0,100);
    $("results").innerHTML=shown.map(r=>{
      const klass=classify(r),tag=klass==="exact"?"Tọa độ nhập/API":klass==="approx"?"Điểm đại diện":"Chưa có tọa độ";
      return "<tr><td>"+r.number+"</td><td class='address'>"+safe(r.address||"(không có địa chỉ)")+"</td><td>"+(r.lat===null?"—":r.lat.toFixed(6))+"</td><td>"+(r.lon===null?"—":r.lon.toFixed(6))+"</td><td>"+safe(r.province||"—")+"</td><td>"+safe(r.ward||"—")+"</td><td><span class='quality "+klass+"'>"+tag+"</span></td></tr>";
    }).join("")||"<tr><td colspan='7'>Chưa có dòng phù hợp.</td></tr>";
  }
  async function exportXlsx(){
    if(!window.ExcelJS){notify("Không tải được thư viện ExcelJS. Kiểm tra Internet.");return;}
    const rows=state.output.filter(Boolean);
    if(!rows.length){notify("Chưa có dữ liệu để xuất.");return;}
    const button=$("export");button.disabled=true;button.textContent="Đang tạo Excel…";
    try{
      const book=new ExcelJS.Workbook();book.creator="TOADO — Long Ngo 2026";book.created=new Date();
      const names=Object.keys(state.rows[0]).filter(k=>k!=="__row"&&!k.startsWith("__"));
      const calculated=[
        ["stt","STT"],["dia_chi_xu_ly","Địa chỉ xử lý"],["vi_do_wgs84","Vĩ độ (WGS84)"],["kinh_do_wgs84","Kinh độ (WGS84)"],
        ["tinh_thanh_2025","Tỉnh/thành 2025"],["ma_tinh_2025","Mã tỉnh/thành"],["xa_phuong_2025","Xã/phường 2025"],["ma_xa_2025","Mã xã/phường"],
        ["loai_toa_do","Loại tọa độ"],["nguon_toa_do","Nguồn tọa độ"],["do_tin_cay_nha_cung_cap","Độ tin cậy API"],["trang_thai","Trạng thái"],["ghi_chu_kiem_tra","Ghi chú"],["dia_chi_chuan_hoa_api","Địa chỉ API trả về"],["google_maps","Liên kết bản đồ"]
      ];
      const cols=[...names.map(k=>({header:k,key:"orig_"+k,width:Math.min(40,Math.max(15,k.length+5))})),...calculated.map(([k,header])=>({header,key:k,width:/dia_chi|ghi_chu|trang_thai/.test(k)?42:21}))];
      const sheet=book.addWorksheet("Ket_qua",{views:[{state:"frozen",ySplit:1}]});sheet.columns=cols;
      function makeValues(r){
        const values={};for(const k of names)values["orig_"+k]=escXlsx(r.original[k]);
        Object.assign(values,{stt:r.number,dia_chi_xu_ly:escXlsx(r.address),vi_do_wgs84:r.lat,kinh_do_wgs84:r.lon,tinh_thanh_2025:escXlsx(r.province),ma_tinh_2025:escXlsx(r.provinceCode),xa_phuong_2025:escXlsx(r.ward),ma_xa_2025:escXlsx(r.wardCode),loai_toa_do:r.precision,nguon_toa_do:escXlsx(r.source),do_tin_cay_nha_cung_cap:r.confidence,trang_thai:escXlsx(r.status),ghi_chu_kiem_tra:escXlsx(r.note),dia_chi_chuan_hoa_api:escXlsx(r.formatted),google_maps:r.lat===null?"":"https://www.google.com/maps?q="+r.lat+","+r.lon});
        return values;
      }
      rows.forEach(r=>sheet.addRow(makeValues(r)));
      sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:cols.length}};
      for(const k of ["vi_do_wgs84","kinh_do_wgs84"])sheet.getColumn(k).numFmt="0.000000";
      formatSheet(sheet);
      const issues=book.addWorksheet("Can_kiem_tra",{views:[{state:"frozen",ySplit:1}]});
      issues.columns=calculated.map(([k,h])=>({header:h,key:k,width:/dia_chi|ghi_chu|trang_thai/.test(k)?44:22}));
      rows.filter(r=>r.precision!=="csv"&&r.precision!=="geocode").forEach(r=>{
        const all=makeValues(r);const filtered={};for(const [k] of calculated)filtered[k]=all[k];issues.addRow(filtered);
      });
      formatSheet(issues);
      const stats=book.addWorksheet("Thong_ke");stats.columns=[{header:"Chỉ tiêu",key:"k",width:42},{header:"Giá trị",key:"v",width:23}];
      [
        ["Tệp nguồn",state.filename],["Số dòng CSV",state.rows.length],["Số dòng đã xử lý",rows.length],
        ["Tọa độ từ CSV",rows.filter(r=>r.precision==="csv").length],["Tọa độ từ API",rows.filter(r=>r.precision==="geocode").length],
        ["Điểm đại diện cấp xã",rows.filter(r=>r.precision==="ward").length],["Điểm đại diện cấp tỉnh",rows.filter(r=>r.precision==="province").length],
        ["Chưa có tọa độ",rows.filter(r=>r.precision==="missing").length],["Cần kiểm tra",rows.filter(r=>r.precision!=="csv"&&r.precision!=="geocode").length],
        ["CRS","EPSG:4326 (WGS84)"],["Ngày xuất",new Date().toISOString()],["Lưu ý","Điểm đại diện hành chính KHÔNG phải tọa độ nhà; địa giới chưa xác nhận bằng point-in-polygon."]
      ].forEach(([k,v])=>stats.addRow({k,v}));formatSheet(stats);
      const source=book.addWorksheet("Nguon_du_lieu");source.columns=[{header:"Nguồn / lưu ý",key:"item",width:35},{header:"Thông tin",key:"detail",width:90}];
      [
        ["Danh mục hành chính","Open Admin Data · CC BY 4.0 · https://github.com/open-admin-data/vietnam-administrative-divisions"],
        ["Cơ sở pháp lý","Quyết định 19/2025/QĐ-TTg; 34 tỉnh/thành và 3.321 xã/phường, hiệu lực 01/07/2025."],
        ["Định nghĩa điểm đại diện","Tọa độ tham chiếu của đơn vị hành chính; không phải vị trí địa chỉ cụ thể và không thay thế địa giới."],
        ["Định nghĩa CSV","Tọa độ do người dùng cung cấp; ứng dụng kiểm tra phạm vi Việt Nam nhưng không xác minh thực địa."],
        ["Định nghĩa geocode","Tọa độ do API riêng trả về; kiểm tra độ chính xác theo từng kết quả và điều khoản nhà cung cấp."],
        ["Giới hạn dữ liệu","Chỉ suy ra đơn vị hành chính khi tên cấp tỉnh/xã khớp rõ ràng; không tự khẳng định theo điểm nếu thiếu polygon."],
        ["Nhà phát triển","Long Ngo 2026 · https://github.com/Base27-CVNSS/toado"]
      ].forEach(([item,detail])=>source.addRow({item,detail}));formatSheet(source);
      const buffer=await book.xlsx.writeBuffer();
      const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const href=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=href;a.download="toado_vietnam_"+new Date().toISOString().slice(0,10)+".xlsx";a.click();
      setTimeout(()=>URL.revokeObjectURL(href),15000);
      notify("Đã tạo file Excel gồm "+display(rows.length)+" dòng, 4 trang tính. Kiểm tra trang “Can_kiem_tra” trước khi sử dụng.");
    }catch(e){notify("Xuất Excel thất bại: "+e.message);}
    finally{button.disabled=false;button.textContent="↓ Xuất Excel (.xlsx)";}
  }
  function formatSheet(ws){
    ws.getRow(1).eachCell(cell=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF143E53"}};cell.font={bold:true,color:{argb:"FFFFFFFF"}};cell.alignment={vertical:"middle",wrapText:true};});
    ws.getRow(1).height=27;
    ws.eachRow((row,n)=>{if(n>1&&n%2===0)row.eachCell(c=>{c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF3F8FB"}};});});
  }
  bind();adminLoad();
})();
