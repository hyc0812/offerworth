const provinces = {
  AB:"Alberta", BC:"British Columbia", MB:"Manitoba", NB:"New Brunswick",
  NL:"Newfoundland and Labrador", NS:"Nova Scotia", NT:"Northwest Territories",
  NU:"Nunavut", ON:"Ontario", PE:"Prince Edward Island", SK:"Saskatchewan",
  YT:"Yukon"
};

const amountBases = {
  annual:{label:"Annual", multiplier:1},
  monthly:{label:"Monthly", multiplier:12},
  semimonthly:{label:"Semi-monthly (24/year)", multiplier:24},
  biweekly:{label:"Biweekly (26/year)", multiplier:26},
  weekly:{label:"Weekly (52/year)", multiplier:52}
};

const paySchedules = {
  monthly:{label:"Monthly (12 pays/year)", pays:12},
  semimonthly:{label:"Semi-monthly (24 pays/year)", pays:24},
  biweekly:{label:"Biweekly (26 pays/year)", pays:26},
  weekly:{label:"Weekly (52 pays/year)", pays:52}
};

const STATUTORY_2026 = {
  cpp:{basicExemption:3500,ympe:74600,yampe:85000,rate:.0595,max:4230.45,cpp2Rate:.04,cpp2Max:416},
  ei:{maxInsurableEarnings:68900,rate:.0163,max:1123.07}
};

function fillSelect(select, entries, selected){
  Object.entries(entries).forEach(([value,item])=>{
    const o=document.createElement("option");
    o.value=value; o.textContent=typeof item==="string"?item:item.label;
    o.selected=value===selected; select.appendChild(o);
  });
}

const provinceA=document.querySelector("#provinceA"), provinceB=document.querySelector("#provinceB");
const basisA=document.querySelector("#basisA"), basisB=document.querySelector("#basisB");
const scheduleA=document.querySelector("#payScheduleA"), scheduleB=document.querySelector("#payScheduleB");

fillSelect(basisA,amountBases,"annual"); fillSelect(basisB,amountBases,"annual");
fillSelect(scheduleA,paySchedules,"biweekly"); fillSelect(scheduleB,paySchedules,"biweekly");

function money(v,cents=false){
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",
    minimumFractionDigits:cents?2:0,maximumFractionDigits:cents?2:0}).format(v);
}
function annualize(amount,basis){ return amount*amountBases[basis].multiplier; }

function calculateCPP2026(salary){
  const c=STATUTORY_2026.cpp;
  const first=Math.max(0,Math.min(salary,c.ympe)-c.basicExemption);
  const cpp=Math.min(first*c.rate,c.max);
  const second=Math.max(0,Math.min(salary,c.yampe)-c.ympe);
  const cpp2=Math.min(second*c.cpp2Rate,c.cpp2Max);
  return {cpp,cpp2,total:cpp+cpp2};
}
function calculateEI2026(salary){
  const e=STATUTORY_2026.ei;
  return Math.min(Math.max(0,Math.min(salary,e.maxInsurableEarnings))*e.rate,e.max);
}

// 2026 federal income tax estimate for regular employment income.
// Assumptions for V0.4: resident employee, standard federal TD1 basic claim,
// no RRSP/RPP/union-dues/other deductions yet.
//
// CRA 2026 federal brackets:
// 14% to $58,523; 20.5% to $117,045; 26% to $181,440;
// 29% to $258,482; 33% above.
//
// Federal non-refundable credits included:
// - Basic Personal Amount (income-tested: max $16,452 / min $14,829)
// - Canada Employment Amount (max $1,501)
// - base CPP contribution credit
// - EI premium credit
//
// Enhanced CPP contributions (1% first additional + CPP2) are deducted
// from taxable income, consistent with the payroll/tax treatment.
function federalBPA2026(netIncome){
  const maxBPA=16452, minBPA=14829;
  const phaseStart=181440, phaseEnd=258482;
  if(netIncome<=phaseStart) return maxBPA;
  if(netIncome>=phaseEnd) return minBPA;
  return maxBPA-(netIncome-phaseStart)*((maxBPA-minBPA)/(phaseEnd-phaseStart));
}

function federalBracketTax2026(taxableIncome){
  const x=Math.max(0,taxableIncome);
  const brackets=[
    [58523,.14],
    [117045,.205],
    [181440,.26],
    [258482,.29],
    [Infinity,.33]
  ];
  let tax=0, lower=0;
  for(const [upper,rate] of brackets){
    const portion=Math.max(0,Math.min(x,upper)-lower);
    tax+=portion*rate;
    if(x<=upper) break;
    lower=upper;
  }
  return tax;
}

function calculateFederalTax2026(salary, cppResult, ei){
  // CPP employee rate is 5.95% = 4.95% base + 1.00% first additional.
  const baseCPP=cppResult.cpp*(.0495/.0595);
  const firstAdditionalCPP=cppResult.cpp-baseCPP;
  const deductibleEnhancedCPP=firstAdditionalCPP+cppResult.cpp2;
  const taxableIncome=Math.max(0,salary-deductibleEnhancedCPP);

  const basicTax=federalBracketTax2026(taxableIncome);
  const bpa=federalBPA2026(taxableIncome);
  const cea=Math.min(1501,salary);
  const creditBase=bpa+cea+baseCPP+ei;
  const nonRefundableCredits=.14*creditBase;
  const tax=Math.max(0,basicTax-nonRefundableCredits);

  return {tax,taxableIncome,bpa,cea,baseCPP,deductibleEnhancedCPP};
}

// 2026 Saskatchewan and Ontario provincial income tax.
// V0.5 assumes standard basic provincial TD1 claim amounts and regular
// employment income. Base CPP + EI receive provincial non-refundable credits.
// Enhanced CPP is already deducted in the taxable-income calculation.

function bracketTax(x, brackets){
  x=Math.max(0,x);
  let tax=0, lower=0;
  for(const [upper,rate] of brackets){
    tax+=Math.max(0,Math.min(x,upper)-lower)*rate;
    if(x<=upper) break;
    lower=upper;
  }
  return tax;
}

function ontarioHealthPremium2026(A){
  if(A<=20000) return 0;
  if(A<=36000) return Math.min(300,.06*(A-20000));
  if(A<=48000) return Math.min(450,300+.06*(A-36000));
  if(A<=72000) return Math.min(600,450+.25*(A-48000));
  if(A<=200000) return Math.min(750,600+.25*(A-72000));
  return Math.min(900,750+.25*(A-200000));
}



function calculateQPP2026(salary){
  const basicExemption=3500, ympe=74600, yampe=85000;
  const firstBase=Math.max(0,Math.min(salary,ympe)-basicExemption);
  const qpp=Math.min(4479.30,firstBase*.063);
  const qpp2=Math.min(416,Math.max(0,Math.min(salary,yampe)-ympe)*.04);
  return {qpp,qpp2,total:qpp+qpp2};
}
function calculateQuebecEI2026(salary){
  return Math.min(895.70,Math.max(0,salary)*.013);
}
function calculateQPIP2026(salary){
  return Math.min(442.90,Math.max(0,salary)*.00430);
}

function calculateFederalTaxQuebec2026(salary,qppResult,ei,qpip){
  const enhancedQPP=(qppResult.qpp*(.01/.063))+qppResult.qpp2;
  const A=Math.max(0,salary-enhancedQPP);

  const gross=bracketTax(A,[
    [58523,.14],[117045,.205],[181440,.26],[258482,.29],[Infinity,.33]
  ]);

  let bpa=16452;
  if(A>181440){
    const t=Math.min(1,(A-181440)/(258482-181440));
    bpa=16452-(16452-14829)*t;
  }
  const K1=.14*bpa;
  const baseQPP=Math.min(3768.30,qppResult.qpp*(.053/.063));
  const K2Q=.14*(baseQPP+Math.min(ei,895.70)+Math.min(qpip,442.90));
  const K4=.14*Math.min(salary,1501);
  const T3=Math.max(0,gross-K1-K2Q-K4);
  const T1=Math.max(0,T3-(.165*T3));
  return {tax:T1,taxableIncome:A,basicFederalTax:T3,abatement:.165*T3};
}

function calculateQuebecTax2026(taxableIncome,qppResult,ei,qpip){
  // Standard/basic Québec personal amount. Enhanced QPP portions are deducted
  // from income upstream; base QPP, EI and QPIP receive applicable credits here.
  const baseQPP=qppResult.qpp*(.053/.063);
  const gross=bracketTax(taxableIncome,[
    [54345,.14],[108680,.19],[132245,.24],[Infinity,.2575]
  ]);
  const credits=.14*(18952+baseQPP+ei+qpip);
  return Math.max(0,gross-credits);
}

const PROVINCIAL_TAX_2026 = {
  SK: {
    name:"Saskatchewan", basicPersonalAmount:20381, creditRate:.105,
    brackets:[[54532,.105],[155805,.125],[Infinity,.145]]
  },
  AB: {
    name:"Alberta", basicPersonalAmount:22769, creditRate:.08,
    brackets:[[61200,.08],[154259,.10],[185111,.12],[246813,.13],[370220,.14],[Infinity,.15]]
  },
  MB: {
    name:"Manitoba", basicPersonalAmount:15780, creditRate:.108,
    brackets:[[47000,.108],[100000,.1275],[Infinity,.174]]
  },
  BC: {
    name:"British Columbia", basicPersonalAmount:13216, creditRate:.056,
    brackets:[[50363,.056],[100728,.077],[115648,.105],[140430,.1229],[190405,.147],[265545,.168],[Infinity,.205]]
  },
  NB: {
    name:"New Brunswick", basicPersonalAmount:13664, creditRate:.094,
    brackets:[[52333,.094],[104666,.14],[193861,.16],[Infinity,.195]]
  },
  NS: {
    name:"Nova Scotia", basicPersonalAmount:11932, creditRate:.0879,
    brackets:[[30995,.0879],[61991,.1495],[97417,.1667],[157124,.175],[Infinity,.21]]
  },
  NL: {
    name:"Newfoundland and Labrador", basicPersonalAmount:13094, creditRate:.087,
    brackets:[[44678,.087],[89354,.145],[159528,.158],[223340,.178],[285319,.198],[570638,.208],[1141275,.213],[Infinity,.218]]
  },
  PE: {
    name:"Prince Edward Island", basicPersonalAmount:15000, creditRate:.095,
    brackets:[[33928,.095],[65820,.1347],[106890,.166],[142520,.1762],[200000,.19],[Infinity,.20]]
  },
  YT: {
    name:"Yukon", basicPersonalAmount:16452, creditRate:.064,
    brackets:[[58523,.064],[117045,.09],[181440,.109],[500000,.128],[Infinity,.15]]
  },
  NT: {
    name:"Northwest Territories", basicPersonalAmount:18198, creditRate:.059,
    brackets:[[53003,.059],[106009,.086],[172346,.122],[Infinity,.1405]]
  },
  NU: {
    name:"Nunavut", basicPersonalAmount:19659, creditRate:.04,
    brackets:[[55801,.04],[111602,.07],[181439,.09],[Infinity,.115]]
  }
};

function calculateConfiguredProvince2026(config,taxableIncome,cppResult,ei,grossIncome,province){
  const r=config.creditRate;
  const baseCPP=Math.min(3519.45,cppResult.cpp*(.0495/.0595));
  const K1P=r*config.basicPersonalAmount;
  const K2P=r*(baseCPP+Math.min(1123.07,ei));
  const K3P=0;
  let K4P=0, K5P=0;

  if(province==="YT") K4P=r*Math.min(Math.max(0,grossIncome),1501);
  if(province==="AB") K5P=Math.max(0,((K1P+K2P)-4896)*.25);

  let T4=Math.max(0,bracketTax(taxableIncome,config.brackets)-K1P-K2P-K3P-K4P-K5P);
  let S=0;
  if(province==="BC"){
    if(taxableIncome<=25570) S=Math.min(T4,690);
    else if(taxableIncome<=44952) S=Math.min(T4,Math.max(0,690-(taxableIncome-25570)*.0356));
  }
  return Math.max(0,T4-S);
}

function calculateProvincialTax2026(province, taxableIncome, cppResult, ei){
  if(PROVINCIAL_TAX_2026[province]){
    const grossIncome=taxableIncome+(cppResult.cpp*(.01/.0595))+cppResult.cpp2;
    return calculateConfiguredProvince2026(PROVINCIAL_TAX_2026[province],taxableIncome,cppResult,ei,grossIncome,province);
  }

  if(province==="ON"){
    const baseCPP=Math.min(3519.45,cppResult.cpp*(.0495/.0595));
    const K1P=.0505*12989;
    const K2P=.0505*(baseCPP+Math.min(1123.07,ei));
    const gross=bracketTax(taxableIncome,[
      [53891,.0505],[107785,.0915],[150000,.1116],[220000,.1216],[Infinity,.1316]
    ]);
    const T4=Math.max(0,gross-K1P-K2P);
    let V1=0;
    if(T4>5818) V1+=.20*(T4-5818);
    if(T4>7446) V1+=.36*(T4-7446);
    const S=Math.max(0,Math.min(T4+V1,600-(T4+V1)));
    const V2=ontarioHealthPremium2026(taxableIncome);
    return Math.max(0,T4+V1+V2-S);
  }
  return null;
}

function prototypeCalculation(salary,province){
  if(province==="QC"){
    const qppResult=calculateQPP2026(salary);
    const pension=qppResult.total;
    const ei=calculateQuebecEI2026(salary);
    const qpip=calculateQPIP2026(salary);
    const federalResult=calculateFederalTaxQuebec2026(salary,qppResult,ei,qpip);
    const federal=federalResult.tax;
    const taxableIncome=federalResult.taxableIncome;
    const provincial=calculateQuebecTax2026(taxableIncome,qppResult,ei,qpip);
    const net=Math.max(0,salary-federal-provincial-pension-ei-qpip);
    return {salary,federal,provincial,provincialSupported:true,cpp:pension,ei,qpip,net,isQuebec:true};
  }

  const cppResult=calculateCPP2026(salary);
  const cpp=cppResult.total;
  const ei=calculateEI2026(salary);
  const federalResult=calculateFederalTax2026(salary,cppResult,ei);
  const federal=federalResult.tax;
  const provincial=calculateProvincialTax2026(province,federalResult.taxableIncome,cppResult,ei);
  const provincialSafe=provincial===null ? 0 : provincial;
  const net=Math.max(0,salary-federal-provincialSafe-cpp-ei);
  return {salary,federal,provincial:provincialSafe,provincialSupported:provincial!==null,cpp,ei,qpip:0,net,isQuebec:false};
}
function setText(id,v){document.querySelector(id).textContent=v}

function offerState(side){
  const amount=Number(document.querySelector(`#amount${side}`).value);
  const basis=document.querySelector(`#basis${side}`).value;
  const schedule=document.querySelector(`#paySchedule${side}`).value;
  const province=document.querySelector(`#province${side}`).value;
  return {amount,basis,schedule,province,
    annual:annualize(Number.isFinite(amount)?Math.max(0,amount):0,basis)};
}
function refresh(side){
  const o=offerState(side);
  setText(`#annualized${side}`,money(o.annual,true));
  setText(`#code${side}`,o.province);
}
["A","B"].forEach(side=>{
  ["amount","basis","paySchedule","province"].forEach(prefix=>{
    const el=document.querySelector(`#${prefix}${side}`);
    el.addEventListener(prefix==="amount"?"input":"change",()=>refresh(side));
  });
  refresh(side);
});

document.querySelector("#compareBtn").addEventListener("click",()=>{
  const oa=offerState("A"), ob=offerState("B");
  if(oa.amount<=0||ob.amount<=0){alert("Please enter an offer amount greater than $0 for both offers.");return;}
  if(!oa.province||!ob.province){alert("Please select a province or territory for both offers.");return;}
  const a=prototypeCalculation(oa.annual,oa.province);
  const b=prototypeCalculation(ob.annual,ob.province);
  const pensionLabel=document.querySelector("[data-pension-label]") || [...document.querySelectorAll("td")].find(x=>x.textContent.includes("CPP / CPP2"));
  if(pensionLabel){
    const hasQC=oa.province==="QC" || ob.province==="QC";
    pensionLabel.childNodes[0].nodeValue=hasQC ? "CPP / QPP " : "CPP / CPP2 ";
  }
  if(!a.provincialSupported || !b.provincialSupported){
    alert("V0.6.5 supports 2026 tax for all provinces and territories, including the Quebec-specific QPP/QPIP and federal abatement path.");
    return;
  }

  [["gross","salary"],["provincial","provincial"],["cpp","cpp"],["ei","ei"],["net","net"]]
  .forEach(([id,key])=>{
    setText(`#${id}A`,(key==="salary"||key==="net")?money(a[key]):`−${money(a[key])}`);
    setText(`#${id}B`,(key==="salary"||key==="net")?money(b[key]):`−${money(b[key])}`);
  });

  const effectiveRate=(amount,gross)=>gross>0?(amount/gross*100):0;
  setText("#federalA",`−${money(a.federal)} (${effectiveRate(a.federal,a.salary).toFixed(1)}%)`);
  setText("#federalB",`−${money(b.federal)} (${effectiveRate(b.federal,b.salary).toFixed(1)}%)`);
  setText("#provincialA",`−${money(a.provincial)} (${effectiveRate(a.provincial,a.salary).toFixed(1)}%)`);
  setText("#provincialB",`−${money(b.provincial)} (${effectiveRate(b.provincial,b.salary).toFixed(1)}%)`);
  setText("#cppA",`−${money(a.cpp)} (${effectiveRate(a.cpp,a.salary).toFixed(1)}%)`);
  setText("#cppB",`−${money(b.cpp)} (${effectiveRate(b.cpp,b.salary).toFixed(1)}%)`);
  setText("#eiA",`−${money(a.ei)} (${effectiveRate(a.ei,a.salary).toFixed(1)}%)`);
  setText("#eiB",`−${money(b.ei)} (${effectiveRate(b.ei,b.salary).toFixed(1)}%)`);

  setText("#monthlyA",money(a.net/12)); setText("#monthlyB",money(b.net/12));
  setText("#perPayA",money(a.net/paySchedules[oa.schedule].pays));
  setText("#perPayB",money(b.net/paySchedules[ob.schedule].pays));
  setText("#resultProvinceA",oa.province); setText("#resultProvinceB",ob.province);
  setText("#scheduleA",paySchedules[oa.schedule].label);
  setText("#scheduleB",paySchedules[ob.schedule].label);
  setText("#payLabelA","Based on each employer's actual pay schedule");

  const monthlyDiff=(b.net-a.net)/12;
  const annualDiff=b.net-a.net;
  const higher=monthlyDiff>=0?"Offer B":"Offer A";
  setText("#differenceAmount",`${money(Math.abs(monthlyDiff))} more / month`);
  setText("#differenceText",`${higher} has the higher estimated take-home — about ${money(Math.abs(annualDiff))} more per year.`);
  document.querySelector("#results").classList.remove("hidden");
  document.querySelector("#results").scrollIntoView({behavior:"smooth",block:"start"});
});


document.querySelectorAll(".info").forEach(btn=>{btn.addEventListener("click",e=>{e.stopPropagation();const open=!btn.classList.contains("is-open");document.querySelectorAll(".info.is-open").forEach(x=>{x.classList.remove("is-open");x.setAttribute("aria-expanded","false")});if(open){btn.classList.add("is-open");btn.setAttribute("aria-expanded","true")}})});document.addEventListener("click",()=>document.querySelectorAll(".info.is-open").forEach(x=>{x.classList.remove("is-open");x.setAttribute("aria-expanded","false")}));document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".info.is-open").forEach(x=>{x.classList.remove("is-open");x.setAttribute("aria-expanded","false")})});


function updateOfferAmountPlaceholders(){
  document.querySelectorAll(".card").forEach(card=>{
    const input=card.querySelector('input[type="number"]');
    const selects=card.querySelectorAll("select");
    if(!input || !selects.length) return;
    const examples={annual:"100,000",monthly:"8,333.33",semimonthly:"4,166.67",biweekly:"3,846.15",weekly:"1,923.08"};
    const refresh=()=>{ input.placeholder=examples[selects[0].value.toLowerCase()] || "Enter amount"; };
    refresh();
    selects[0].addEventListener("change",refresh);
  });
}
document.addEventListener("DOMContentLoaded",updateOfferAmountPlaceholders);


// V0.7.8: share and restore the user's current comparison.
function buildComparisonShareURL(){
  const oa=offerState("A");
  const ob=offerState("B");

  const url=new URL(window.location.origin + window.location.pathname);

  url.searchParams.set("a", String(oa.amount));
  url.searchParams.set("ab", oa.basis);
  url.searchParams.set("as", oa.schedule);
  url.searchParams.set("ap", oa.province);

  url.searchParams.set("b", String(ob.amount));
  url.searchParams.set("bb", ob.basis);
  url.searchParams.set("bs", ob.schedule);
  url.searchParams.set("bp", ob.province);

  return url.toString();
}

function trackShareComparison(method){
  if(typeof window.gtag==="function"){
    window.gtag("event","share_comparison",{
      method: method
    });
  }
}

async function shareComparison(){
  const oa=offerState("A");
  const ob=offerState("B");
  const status=document.querySelector("#shareStatus");

  if(oa.amount<=0 || ob.amount<=0 || !oa.province || !ob.province){
    alert("Please complete both offers before sharing.");
    return;
  }

  const url=buildComparisonShareURL();

  /*
   * V0.7.10
   *
   * Send the comparison as ordinary text rather than using the
   * Web Share API "url" member. This is more compatible with
   * messaging targets that do not handle URL-only share payloads
   * consistently.
   *
   * The URL itself still contains the user's current Offer A and
   * Offer B inputs.
   */
  const shareText=
    "Compare these two Canadian job offers on OfferWorth:\n" +
    url;

  try{
    if(navigator.share){
      const shareData={
        text: shareText
      };

      if(!navigator.canShare || navigator.canShare(shareData)){
        await navigator.share(shareData);

        status.textContent="Shared.";
        trackShareComparison("native_share_text");
        return;
      }
    }

    await navigator.clipboard.writeText(shareText);

    status.textContent=
      "Comparison link copied — paste it into a message.";

    trackShareComparison("copy_text");

  }catch(err){

    if(err && err.name==="AbortError"){
      status.textContent="";
      return;
    }

    try{
      await navigator.clipboard.writeText(shareText);

      status.textContent=
        "Comparison link copied — paste it into a message.";

      trackShareComparison("copy_text");

    }catch(copyErr){

      window.prompt(
        "Copy this comparison and send it to your friend:",
        shareText
      );

      status.textContent="Comparison ready to copy.";

      trackShareComparison("manual_copy");
    }
  }
}

function restoreSharedComparison(){
  const params=new URLSearchParams(window.location.search);

  const required=["a","ab","as","ap","b","bb","bs","bp"];
  if(!required.every(key=>params.has(key))) return;

  const validBasis=value=>Object.prototype.hasOwnProperty.call(amountBases,value);
  const validSchedule=value=>Object.prototype.hasOwnProperty.call(paySchedules,value);
  const validProvince=value=>[...provinceA.options].some(o=>o.value===value);

  const a=Number(params.get("a"));
  const b=Number(params.get("b"));
  const ab=params.get("ab");
  const as=params.get("as");
  const ap=params.get("ap");
  const bb=params.get("bb");
  const bs=params.get("bs");
  const bp=params.get("bp");

  if(
    !Number.isFinite(a) || a<=0 ||
    !Number.isFinite(b) || b<=0 ||
    !validBasis(ab) || !validBasis(bb) ||
    !validSchedule(as) || !validSchedule(bs) ||
    !validProvince(ap) || !validProvince(bp)
  ){
    return;
  }

  document.querySelector("#amountA").value=a;
  document.querySelector("#basisA").value=ab;
  document.querySelector("#payScheduleA").value=as;
  document.querySelector("#provinceA").value=ap;

  document.querySelector("#amountB").value=b;
  document.querySelector("#basisB").value=bb;
  document.querySelector("#payScheduleB").value=bs;
  document.querySelector("#provinceB").value=bp;

  refresh("A");
  refresh("B");

  document.querySelector("#compareBtn").click();
}

const shareBtn=document.querySelector("#shareBtn");
if(shareBtn){
  shareBtn.addEventListener("click",shareComparison);
}

restoreSharedComparison();


// V0.7.10: mobile information modal.
// Desktop keeps the existing hover/focus tooltip.
// Mobile copies the tooltip content into a top-level modal so
// iOS Safari does not have to position a tooltip inside a table.

(function setupMobileInfoModal(){

  const modal=document.querySelector("#mobileInfoModal");
  const title=document.querySelector("#mobileInfoTitle");
  const body=document.querySelector("#mobileInfoBody");
  const closeBtn=document.querySelector("#mobileInfoClose");

  if(!modal || !title || !body || !closeBtn) return;

  const mobileQuery=window.matchMedia("(max-width: 720px)");

  function closeMobileInfo(){
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden","true");

    document.body.classList.remove("mobile-info-open");

    title.textContent="";
    body.innerHTML="";
  }

  function openMobileInfo(infoButton){

    if(!mobileQuery.matches) return;

    const tooltip=infoButton.querySelector(".tooltip");

    if(!tooltip) return;

    /*
     * Existing tooltip structure begins with <strong>Title</strong>.
     * Reuse that content instead of duplicating explanatory text.
     */
    const strong=tooltip.querySelector("strong");

    title.textContent=
      strong ? strong.textContent.trim() : "About this estimate";

    const clone=tooltip.cloneNode(true);

    const cloneStrong=clone.querySelector("strong");

    if(cloneStrong){
      cloneStrong.remove();
    }

    body.innerHTML=clone.innerHTML.trim();

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden","false");

    document.body.classList.add("mobile-info-open");

    closeBtn.focus({
      preventScroll:true
    });
  }

  document.querySelectorAll(".info").forEach(infoButton=>{

    infoButton.addEventListener("click",event=>{

      if(!mobileQuery.matches) return;

      event.preventDefault();
      event.stopPropagation();

      openMobileInfo(infoButton);
    });

  });

  closeBtn.addEventListener(
    "click",
    closeMobileInfo
  );

  modal
    .querySelectorAll("[data-close-mobile-info]")
    .forEach(element=>{
      element.addEventListener(
        "click",
        closeMobileInfo
      );
    });

  document.addEventListener("keydown",event=>{
    if(
      event.key==="Escape" &&
      modal.classList.contains("is-open")
    ){
      closeMobileInfo();
    }
  });

  mobileQuery.addEventListener?.("change",event=>{
    if(!event.matches){
      closeMobileInfo();
    }
  });

})();
