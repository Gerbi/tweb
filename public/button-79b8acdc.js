import{M as w,j as L,h as I,I as k,L as y,ac as M,i as A}from"./index-852a9d91.js";import{i as D,l as x,f as O}from"./page-18869f8e.js";class P{constructor(){this.promises={},this.raf=L.bind(null),this.scheduled=!1}do(e,t){let a=this.promises[e];return a||(this.scheduleFlush(),a=this.promises[e]=I()),t!==void 0&&a.then(()=>t()),a}measure(e){return this.do("read",e)}mutate(e){return this.do("write",e)}mutateElement(e,t){const a=D(e),n=a?this.mutate():Promise.resolve();return t!==void 0&&(a?n.then(()=>t()):t()),n}scheduleFlush(){this.scheduled||(this.scheduled=!0,this.raf(()=>{this.promises.read&&this.promises.read.resolve(),this.promises.write&&this.promises.write.resolve(),this.scheduled=!1,this.promises={}}))}}const E=new P;w&&(w.sequentialDom=E);let U=0;function B(s,e=()=>Promise.resolve(),t=null,a=!1,n=s){if(s.querySelector(".c-ripple"))return;s.classList.add("rp");const l=document.createElement("div");l.classList.add("c-ripple"),s.classList.contains("rp-square")&&l.classList.add("is-square"),s[a?"prepend":"append"](l);let d;const v=(i,c)=>{const p=Date.now(),r=document.createElement("div"),f=U++,m=+window.getComputedStyle(l).getPropertyValue("--ripple-duration").replace("s","")*1e3,S=d=()=>{const o=Date.now()-p,h=()=>{E.mutate(()=>{r.remove()}),t?.(f)};if(o<m){const b=Math.max(m-o,m/2);setTimeout(()=>r.classList.add("hiding"),Math.max(b-m/2,0)),setTimeout(h,b)}else r.classList.add("hiding"),setTimeout(h,m/2);k||(window.removeEventListener("contextmenu",d),window.removeEventListener("mousemove",d)),d=null,u=!1};e?.(f),L(()=>{if(S!==d)return;const o=l.getBoundingClientRect();r.classList.add("c-ripple__circle");const h=i-o.left,b=c-o.top,_=Math.sqrt((Math.abs(b-o.height/2)+o.height/2)**2+(Math.abs(h-o.width/2)+o.width/2)**2),C=h-_/2,q=b-_/2;r.style.width=r.style.height=_+"px",r.style.left=C+"px",r.style.top=q+"px",l.append(r)})},g=i=>i.target!==s&&(["BUTTON","A"].includes(i.target.tagName)||y(i.target,"c-ripple")!==l)&&(n===s||!O(i.target,n))&&!y(i.target,"checkbox-field");let u=!1;if(k){const i=()=>{d?.()};n.addEventListener("touchstart",c=>{if(!x.isAvailable("animations")||c.touches.length>1||u||g(c))return;u=!0;const{clientX:p,clientY:r}=c.touches[0];v(p,r),n.addEventListener("touchend",i,{once:!0}),window.addEventListener("touchmove",f=>{f.cancelBubble=!0,f.stopPropagation(),i(),n.removeEventListener("touchend",i)},{once:!0})},{passive:!0})}else n.addEventListener("mousedown",i=>{if(![0,2].includes(i.button)||!x.isAvailable("animations")||n.dataset.ripple==="0"||g(i))return;if(u){u=!1;return}const{clientX:c,clientY:p}=i;v(c,p),window.addEventListener("mouseup",d,{once:!0,passive:!0}),window.addEventListener("contextmenu",d,{once:!0,passive:!0})},{passive:!0})}const R={check:"e900",checks:"e901",activesessions:"e902",add:"e903",add_reaction:"e904",addmember_filled:"e905",adduser:"e906",admin:"e907",animals:"e908",animations:"e909",archive:"e90a",arrow_down:"e90b",arrow_next:"e90c",arrowcircle:"e90d",attach:"e90e",audio_repeat:"e90f",audio_repeat_single:"e910",avatarnext:"e911",avatarprevious:"e912",binfilled:"e913",bold:"e914",bomb:"e915",botcom:"e916",bots:"e917",bug:"e918",calendar:"e919",calendarfilter:"e91a",camera:"e91b",cameraadd:"e91c",car:"e91d",card:"e91e",card_outline:"e91f",channel:"e920",channelviews:"e921",chatspinned:"e922",chatsplaceholder:"e923",check1:"e924",checkbox:"e925",checkboxblock:"e926",checkboxempty:"e927",checkboxon:"e928",checkretract:"e929",checkround:"e92a",clock:"e92b",close:"e92c",clouddownload:"e92d",colorize:"e92e",comments:"e92f",commentssticker:"e930",copy:"e931",crossround:"e932",darkmode:"e933",data:"e934",delete:"e935",delete_filled:"e936",deletedaccount:"e937",deleteleft:"e938",deleteuser:"e939",devices:"e93a",document:"e93b",down:"e93c",download:"e93d",dragfiles:"e93e",dragmedia:"e93f",eats:"e940",edit:"e941",email:"e942",endcall_filled:"e943",enter:"e944",eye1:"e945",eye2:"e946",fast_forward:"e947",fast_rewind:"e948",favourites:"e949",flag:"e94a",flip:"e94b",folder:"e94c",fontsize:"e94d",forward:"e94e",forward_filled:"e94f",fullscreen:"e950",gc_microphone:"e951",gc_microphoneoff:"e952",gifs:"e953",gift:"e954",group:"e955",groupmedia:"e956",groupmediaoff:"e957",help:"e958",hide:"e959",image:"e95a",info:"e95b",info2:"e95c",italic:"e95d",keyboard:"e95e",lamp:"e95f",language:"e960",largepause:"e961",largeplay:"e962",left:"e963",limit_chat:"e964",limit_chats:"e965",limit_file:"e966",limit_folders:"e967",limit_link:"e968",limit_pin:"e969",link:"e96a",list:"e96b",listscreenshare:"e96c",livelocation:"e96d",location:"e96e",lock:"e96f",lockoff:"e970",loginlogodesktop:"e971",loginlogomobile:"e972",logout:"e973",mediaspoiler:"e974",mediaspoileroff:"e975",mention:"e976",menu:"e977",message:"e978",messageunread:"e979",microphone:"e97a",microphone_crossed:"e97b",microphone_crossed_filled:"e97c",microphone_filled:"e97d",minus:"e97e",monospace:"e97f",more:"e980",multistories:"e981",mute:"e982",muted:"e983",newchannel:"e984",newchannel_filled:"e985",newchat_filled:"e986",newgroup:"e987",newgroup_filled:"e988",newprivate:"e989",newprivate_filled:"e98a",newtab:"e98b",next:"e98c",noncontacts:"e98d",nosound:"e98e",online:"e98f",passwordoff:"e990",pause:"e991",permissions:"e992",phone:"e993",phone_filled:"e994",pin:"e995",pinlist:"e996",pinned_filled:"e997",pinnedchat:"e998",pip:"e999",play:"e99a",playback_05:"e99b",playback_15:"e99c",playback_1x:"e99d",playback_2x:"e99e",plus:"e99f",plusround:"e9a0",poll:"e9a1",premium_addone:"e9a2",premium_double:"e9a3",premium_lock:"e9a4",premium_unlock:"e9a5",previous:"e9a6",promote:"e9a7",radiooff:"e9a8",radioon:"e9a9",reactions:"e9aa",readchats:"e9ab",recent:"e9ac",replace:"e9ad",reply:"e9ae",reply_filled:"e9af",restrict:"e9b0",rightpanel:"e9b1",rotate_left:"e9b2",rotate_right:"e9b3",saved:"e9b4",savedmessages:"e9b5",schedule:"e9b6",scheduled:"e9b7",search:"e9b8",select:"e9b9",send:"e9ba",send2:"e9bb",sending:"e9bc",sendingerror:"e9bd",settings:"e9be",settings_filled:"e9bf",sharescreen_filled:"e9c0",shipping:"e9c1",shuffle:"e9c2",smallscreen:"e9c3",smile:"e9c4",speaker:"e9c5",speakerfilled:"e9c6",speakeroff:"e9c7",speakerofffilled:"e9c8",spoiler:"e9c9",sport:"e9ca",star:"e9cb",star_filled:"e9cc",stickers:"e9cd",stickers_face:"e9ce",stop:"e9cf",stories:"e9d0",storyreply:"e9d1",strikethrough:"e9d2",textedit:"e9d3",timer:"e9d4",tip:"e9d5",tools:"e9d6",topics:"e9d7",transcribe:"e9d8",unarchive:"e9d9",underline:"e9da",unmute:"e9db",unpin:"e9dc",unread:"e9dd",up:"e9de",user:"e9df",username:"e9e0",videocamera:"e9e1",videocamera_crossed_filled:"e9e2",videocamera_filled:"e9e3",videochat:"e9e4",volume_down:"e9e5",volume_mute:"e9e6",volume_off:"e9e7",volume_up:"e9e8",webview:"e9e9",zoomin:"e9ea",zoomout:"e9eb"};function T(s,...e){const t=document.createElement("span");return t.classList.add(M,...e),t.textContent=String.fromCharCode(parseInt(R[s],16)),t}function j(s,e={}){const t=document.createElement(e.asLink?"a":e.asDiv?"div":"button");return t.className=s,e.noRipple||(e.rippleSquare&&t.classList.add("rp-square"),B(t)),e.icon&&z(t,e.icon),e.onlyMobile&&t.classList.add("only-handhelds"),e.disabled&&t.setAttribute("disabled","true"),e.text&&t.append(A(e.text,e.textArgs)),t}function z(s,e,t=s.querySelector(".button-icon")){const a=T(e,"button-icon");return t?t.replaceWith(a):s.append(a),a}export{j as B,T as I,z as a,B as r,E as s};
//# sourceMappingURL=button-79b8acdc.js.map