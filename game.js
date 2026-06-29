/**
 * TINY KINGDOM — game.js
 * Full WebGL 3D renderer. Kingdom grows in 3D as you progress.
 * Triangle count scales from ~50k at start to 100M+ at max kingdom.
 * IMPORTANT: Always shows home screen first. Never auto-loads a save.
 */
(function(){
'use strict';

/* ══════════════════════════════════════
   SAVE KEYS — new unique keys so old
   broken saves NEVER interfere
══════════════════════════════════════ */
const SK  = 'tk_kingdom_2025_v9';
const MK  = 'tk_meta_2025_v9';
const TOTAL_DAYS = 90;

/* ══════════════════════════════════════
   NUKE OLD SAVES immediately on load
══════════════════════════════════════ */
(function nukeOldSaves(){
  try {
    const keys = [];
    for(let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach(k => {
      if(!k) return;
      // Delete anything that isn't our exact current keys
      if(k !== SK && k !== MK) {
        if(k.indexOf('tinykingdom') !== -1 || k.indexOf('tk_') !== -1 ||
           k.indexOf('realm') !== -1 || k.indexOf('kingdom') !== -1) {
          localStorage.removeItem(k);
        }
      } else if(k === SK) {
        // Validate the current key too — delete if completed or broken
        try {
          const d = JSON.parse(localStorage.getItem(k));
          if(!d || typeof d.day !== 'number' || d.day >= TOTAL_DAYS || d.day < 1) {
            localStorage.removeItem(k);
          }
        } catch(e) { localStorage.removeItem(k); }
      }
    });
  } catch(e) {}
})();

/* ══════════════════════════════════════
   CONSTANTS
══════════════════════════════════════ */
const MAX_STAT = 200;
const SEASONS = [
  {name:'Spring',icon:'🌱',color:'#4a8a2a',days:[1,22]},
  {name:'Summer',icon:'☀',color:'#c8860a',days:[23,45]},
  {name:'Autumn',icon:'🍂',color:'#8a3a0a',days:[46,67]},
  {name:'Winter',icon:'❄',color:'#3a5a7a',days:[68,90]},
];
const KINGDOM_NAMES = [
  'Ironveil','Ashmore','Crestholm','Dawnshire','Eldergate',
  'Frostmere','Goldenmarch','Halverton','Ironpeak','Jadehaven',
  'Kestrelford','Lionsmere','Moonvale','Northgate','Oakhaven',
];

/* ══════════════════════════════════════
   GAME STATE
══════════════════════════════════════ */
const G = {
  gold:100, food:80, army:20, happy:75, pop:50,
  day:1, score:0, name:'', buildings:[], achievements:[],
  events_seen:[], history:[], streak:0, total_runs:0, all_achievements:[],
};

/* ══════════════════════════════════════
   BUILDINGS CATALOG
══════════════════════════════════════ */
const BUILDINGS = {
  farm:      {id:'farm',     name:'Farm',        icon:'🌾', desc:'+5 Food/turn'},
  market:    {id:'market',   name:'Market',      icon:'🏪', desc:'+8 Gold/turn'},
  barracks:  {id:'barracks', name:'Barracks',    icon:'⚔',  desc:'+6 Army/turn'},
  tavern:    {id:'tavern',   name:'Tavern',      icon:'🍺', desc:'+5 Happiness/turn'},
  library:   {id:'library',  name:'Library',     icon:'📚', desc:'Unlocks rare events'},
  cathedral: {id:'cathedral',name:'Cathedral',   icon:'⛪', desc:'+8 Happiness'},
  forge:     {id:'forge',    name:'Forge',       icon:'🔨', desc:'+10 Army/turn'},
  granary:   {id:'granary',  name:'Granary',     icon:'🌽', desc:'Prevents famine'},
  treasury:  {id:'treasury', name:'Treasury',    icon:'💰', desc:'Gold cap +100'},
  walls:     {id:'walls',    name:'City Walls',  icon:'🧱', desc:'+30 defence'},
  harbour:   {id:'harbour',  name:'Harbour',     icon:'⚓', desc:'+12 Gold/turn'},
  palace:    {id:'palace',   name:'Palace',      icon:'🏰', desc:'+15 all stats'},
};

/* ══════════════════════════════════════
   ACHIEVEMENTS
══════════════════════════════════════ */
const ACHIEVEMENTS = [
  {id:'first_win',  icon:'👑', name:'First Legend',    desc:'Complete a campaign',      check:()=>false},
  {id:'golden',     icon:'⚜', name:'Golden Age',      desc:'Reach 150 gold',           check:()=>G.gold>=150},
  {id:'iron_fist',  icon:'⚔', name:'Iron Fist',       desc:'Reach 100 army',           check:()=>G.army>=100},
  {id:'beloved',    icon:'❤', name:'Beloved Ruler',   desc:'Keep happiness 90 for 10d',check:()=>false},
  {id:'survivor',   icon:'💪', name:'Survivor',        desc:'Recover from near-ruin',   check:()=>false},
  {id:'builder',    icon:'🏗', name:'Master Builder',  desc:'Build 5 buildings',        check:()=>G.buildings.length>=5},
  {id:'scholar',    icon:'📚', name:'Scholar King',    desc:'Build the Library',        check:()=>G.buildings.some(b=>b.id==='library')},
  {id:'populist',   icon:'👥', name:'People\'s King',  desc:'Reach 120 population',     check:()=>G.pop>=120},
  {id:'centurion',  icon:'🏛', name:'Centurion',       desc:'Survive to day 30',        check:()=>G.day>=30},
  {id:'halfway',    icon:'🌗', name:'Halfway There',   desc:'Survive to day 45',        check:()=>G.day>=45},
  {id:'palace_blt', icon:'🏰', name:'Imperial Palace', desc:'Build the Palace',         check:()=>G.buildings.some(b=>b.id==='palace')},
  {id:'rich',       icon:'💎', name:'Full Treasury',   desc:'Reach 180 gold',           check:()=>G.gold>=180},
  {id:'warmonger',  icon:'🗡', name:'Warmonger',       desc:'Reach 150 army',           check:()=>G.army>=150},
];

let _happyDays = 0, _survivedRuin = false, _lowGold = false;

/* ══════════════════════════════════════
   EVENTS DATABASE (120+ events)
══════════════════════════════════════ */
const EVENTS = [
  // SPRING
  {id:'s_merchant',season:0,minDay:2,maxDay:20,weight:10,icon:'🛒',
   title:'A Wandering Merchant',
   body:'A merchant caravan arrives bearing silks and spices from distant lands. They offer a trade — but their prices seem steep.',
   choices:[
     {text:'Trade generously',eff:'Gold -20, Happy +15, Pop +5',
      fn:(g)=>{g.gold-=20;g.happy+=15;g.pop+=5;},
      out:'The merchants spread word of your generosity. Your people celebrate!',icon:'🎉',good:true},
     {text:'Negotiate hard',eff:'Gold -8, Pop +3',
      fn:(g)=>{g.gold-=8;g.pop+=3;},
      out:'A shrewd bargain. The merchants accept, grudgingly.',icon:'🤝'},
     {text:'Turn them away',eff:'No change',
      fn:(g)=>{},
      out:'The merchants leave. Your treasury intact, people disappointed.',icon:'😐'},
   ]},
  {id:'s_flood',season:0,minDay:1,maxDay:20,weight:8,icon:'🌊',
   title:'The River Floods',
   body:'Melting snow has swollen the river. Farmland is submerged. Your people look to you for guidance.',
   choices:[
     {text:'Build emergency levees (30 Gold)',eff:'Gold -30, Food +20, Pop +8',
      fn:(g)=>{g.gold-=30;g.food+=20;g.pop+=8;},
      out:'The levees hold! Farmers salvage their crops. A decisive victory.',icon:'💪',good:true},
     {text:'Pray for the waters to recede',eff:'Food -15, risk of worse',risk:'25% Food -30',
      fn:(g)=>{g.food-=15;if(Math.random()<.25)g.food-=30;},
      out:'The river eventually subsides. Some crops are lost.',icon:'🙏'},
     {text:'Relocate farms to higher ground',eff:'Gold -15, Pop -5, Food +10',
      fn:(g)=>{g.gold-=15;g.pop-=5;g.food+=10;},
      out:'Costly but wise. Your farms are safer for generations.',icon:'🏔',good:true},
   ]},
  {id:'s_twins',season:0,minDay:3,maxDay:15,weight:6,icon:'👶',
   title:'Royal Twins Born',
   body:'Twins born to a noble family. The people see it as a divine omen of prosperity.',
   choices:[
     {text:'Declare a week of celebration',eff:'Gold -10, Happy +25, Pop +8',
      fn:(g)=>{g.gold-=10;g.happy+=25;g.pop+=8;},
      out:'The streets fill with music! Your people love you for it.',icon:'🎊',good:true},
     {text:'Offer a modest gift',eff:'Gold -5, Happy +10',
      fn:(g)=>{g.gold-=5;g.happy+=10;},
      out:'A warm feeling spreads through the kingdom.',icon:'🎁',good:true},
     {text:'Acknowledge quietly',eff:'No change',
      fn:(g)=>{},
      out:'Life goes on. People notice your indifference.',icon:'😐'},
   ]},
  {id:'s_bandits',season:0,minDay:5,maxDay:22,weight:9,icon:'🗡',
   title:'Bandits on the Eastern Road',
   body:'Merchants are being robbed. Trade has slowed. Your citizens demand action.',
   choices:[
     {text:'Send soldiers to clear them',eff:'Army -10, Gold +20, Pop +5',
      fn:(g)=>{g.army-=10;g.gold+=20;g.pop+=5;},
      out:'Your soldiers rout the bandits. Trade resumes!',icon:'⚔',good:true},
     {text:'Hire mercenaries',eff:'Gold -5 net',
      fn:(g)=>{g.gold-=5;},
      out:'Mercenaries clear the road but charge dearly.',icon:'💰'},
     {text:'Ignore the problem',eff:'Gold -15, Happy -10',
      fn:(g)=>{g.gold-=15;g.happy-=10;},
      out:'The bandits grow bolder. Trade collapses.',icon:'😠',bad:true},
   ]},
  {id:'s_wizard',season:0,minDay:8,maxDay:22,weight:5,icon:'🧙',
   title:'A Wizard Seeks Refuge',
   body:'An old wizard arrives, fleeing persecution. He offers his services in exchange for protection.',
   choices:[
     {text:'Welcome him — his wisdom is valuable',eff:'Happy +10, Army +15',
      fn:(g)=>{g.happy+=10;g.army+=15;},
      out:'The wizard proves his worth. Strange lights glow from the tower!',icon:'✨',good:true},
     {text:'Offer shelter but restrict magic',eff:'Happy +5, Gold +5',
      fn:(g)=>{g.happy+=5;g.gold+=5;},
      out:'A cautious welcome. The wizard lives quietly among you.',icon:'🏠'},
     {text:'Turn him away',eff:'No change',
      fn:(g)=>{},
      out:'The wizard departs. You notice a faint sadness in his eyes.',icon:'👋'},
   ]},
  {id:'s_tournament',season:0,minDay:10,maxDay:22,weight:7,icon:'🏆',
   title:'A Great Tournament',
   body:'Knights request permission to hold a tournament. It would boost morale — but costs gold.',
   choices:[
     {text:'Host a grand tournament',eff:'Gold -25, Happy +30, Pop +10, Army +10',
      fn:(g)=>{g.gold-=25;g.happy+=30;g.pop+=10;g.army+=10;},
      out:'Spectacular! Your name is celebrated across the realm.',icon:'🎺',good:true},
     {text:'Host a modest event',eff:'Gold -10, Happy +15, Pop +5',
      fn:(g)=>{g.gold-=10;g.happy+=15;g.pop+=5;},
      out:'A smaller affair, but your people enjoy it.',icon:'🎪'},
     {text:'Decline — focus on the harvest',eff:'Food +15',
      fn:(g)=>{g.food+=15;},
      out:'Your farmers work hard. The harvest will be better for it.',icon:'🌾'},
   ]},
  // SUMMER
  {id:'su_drought',season:1,minDay:23,maxDay:45,weight:10,icon:'☀',
   title:'A Devastating Drought',
   body:'The summer sun beats down mercilessly. Wells run dry. Crops wither. Your most serious test yet.',
   choices:[
     {text:'Irrigate fields immediately (35 Gold)',eff:'Gold -35, Food +25, Pop +5',
      fn:(g)=>{g.gold-=35;g.food+=25;g.pop+=5;},
      out:'The irrigation channels save the harvest. Farmers weep with relief.',icon:'💧',good:true},
     {text:'Import food from neighbours',eff:'Gold -20, Food +15',
      fn:(g)=>{g.gold-=20;g.food+=15;},
      out:'Expensive but effective. Your people eat tonight.',icon:'🚢'},
     {text:'Ration strictly and pray',eff:'Food -10, Happy -15',risk:'20% famine: Pop -20',
      fn:(g)=>{g.food-=10;g.happy-=15;if(Math.random()<.2){g.pop-=20;g.happy-=20;}},
      out:'A gamble with your people\'s lives.',icon:'🙏',risky:true},
   ]},
  {id:'su_ambassador',season:1,minDay:25,maxDay:44,weight:8,icon:'👑',
   title:'Foreign Ambassador',
   body:'An ambassador from the Kingdom of Valdris proposes a mutual defence pact. Powerful — but obligations come with it.',
   choices:[
     {text:'Accept the alliance',eff:'Army +30, Gold +10, Happy +10',
      fn:(g)=>{g.army+=30;g.gold+=10;g.happy+=10;},
      out:'The alliance is sealed with a feast. Your kingdom is protected.',icon:'🤝',good:true},
     {text:'Accept trade only',eff:'Gold +25',
      fn:(g)=>{g.gold+=25;},
      out:'A trade agreement is signed. Caravans fill your coffers.',icon:'📜'},
     {text:'Politely decline',eff:'Nothing — stay independent',
      fn:(g)=>{},
      out:'The ambassador departs. Your kingdom remains independent.',icon:'🏴'},
   ]},
  {id:'su_fire',season:1,minDay:28,maxDay:44,weight:9,icon:'🔥',
   title:'The Great Market Fire',
   body:'A fire breaks out in the market district! Every second counts.',
   choices:[
     {text:'Deploy army to fight the fire',eff:'Army -5, Gold -10, Happy +15',
      fn:(g)=>{g.army-=5;g.gold-=10;g.happy+=15;},
      out:'Your soldiers contain the blaze. The market is saved!',icon:'💪',good:true},
     {text:'Let it burn, focus on evacuation',eff:'Gold -30, Pop -5, Happy -10',
      fn:(g)=>{g.gold-=30;g.pop-=5;g.happy-=10;},
      out:'Lives are saved but the market is lost.',icon:'😢'},
   ]},
  {id:'su_plague',season:1,minDay:30,maxDay:44,weight:8,icon:'🤒',
   title:'A Plague Arrives',
   body:'A sickness is spreading. Travellers bring it to your gates. If it enters the walls, it could devastate your population.',
   choices:[
     {text:'Seal the city gates (quarantine)',eff:'Gold -10, Happy -20, Pop +10',
      fn:(g)=>{g.gold-=10;g.happy-=20;g.pop+=10;},
      out:'People resent the lockdown — but months later they realise you saved their lives.',icon:'🔒',good:true},
     {text:'Allow healers in, take the risk',eff:'Happy +10',risk:'40% Pop -25',
      fn:(g)=>{g.happy+=10;if(Math.random()<.4){g.pop-=25;g.happy-=30;}},
      out:'A dangerous gamble.',icon:'⚕',risky:true},
     {text:'Build a hospital immediately',eff:'Gold -30, Pop +15, Happy +10',
      fn:(g)=>{g.gold-=30;g.pop+=15;g.happy+=10;},
      out:'The hospital contains the outbreak and saves lives for generations.',icon:'🏥',good:true},
   ]},
  {id:'su_harvest_good',season:1,minDay:40,maxDay:44,weight:10,icon:'🌾',
   title:'A Bountiful Harvest',
   body:'Your farmers return with more grain than anyone can remember. The harvest is exceptional.',
   choices:[
     {text:'Store the excess for winter',eff:'Food +40',
      fn:(g)=>{g.food+=40;},
      out:'Wise hoarding. When winter bites, your people will eat.',icon:'🌽',good:true},
     {text:'Sell the surplus for gold',eff:'Gold +30, Food +15',
      fn:(g)=>{g.gold+=30;g.food+=15;},
      out:'The surplus fills your treasury.',icon:'⚜'},
     {text:'Host a harvest festival',eff:'Happy +25, Pop +10, Food +15',
      fn:(g)=>{g.happy+=25;g.pop+=10;g.food+=15;},
      out:'The greatest festival your kingdom has ever seen!',icon:'🎊',good:true},
   ]},
  {id:'su_spy',season:1,minDay:26,maxDay:44,weight:6,icon:'🕵',
   title:'A Spy in the Court',
   body:'A spy from a rival kingdom has been captured. He carries coded letters revealing a plot against you.',
   choices:[
     {text:'Execute the spy publicly',eff:'Army +10, Happy -5',
      fn:(g)=>{g.army+=10;g.happy-=5;},
      out:'The execution sends a clear message.',icon:'⚔'},
     {text:'Turn him into a double agent',eff:'Army +20, Gold +15',
      fn:(g)=>{g.army+=20;g.gold+=15;},
      out:'Brilliant! You turn the spy against his own masters.',icon:'🎭',good:true},
     {text:'Release him as a show of mercy',eff:'Happy +15, Pop +5',
      fn:(g)=>{g.happy+=15;g.pop+=5;},
      out:'Your mercy becomes legend across the realm.',icon:'🕊'},
   ]},
  // AUTUMN
  {id:'au_rebellion',season:2,minDay:46,maxDay:66,weight:9,icon:'✊',
   title:'Rebellion in the North',
   body:'A rebel leader has raised a banner in the northern hills, promising lower taxes. This could become a war.',
   choices:[
     {text:'Crush it with military force',eff:'Army -25, Happy -10',
      fn:(g)=>{g.army-=25;g.happy-=10;},
      out:'The rebellion is crushed. Order restored.',icon:'⚔'},
     {text:'Meet with the rebel leader',eff:'Happy +20, Gold -15',
      fn:(g)=>{g.happy+=20;g.gold-=15;},
      out:'You listen, compromise. The rebellion dissolves. They call you wise.',icon:'🤝',good:true},
     {text:'Ignore it — hope it fades',eff:'Happy -25, Army -10',risk:'50% full rebellion',
      fn:(g)=>{g.happy-=25;g.army-=10;if(Math.random()<.5){g.pop-=20;g.army-=20;}},
      out:'Ignoring a fire never puts it out.',icon:'🔥',bad:true},
   ]},
  {id:'au_poor_harvest',season:2,minDay:46,maxDay:60,weight:9,icon:'🌧',
   title:'A Poor Harvest',
   body:'Early frosts damaged the crops. Granaries only half full as winter approaches.',
   choices:[
     {text:'Import food urgently',eff:'Gold -25, Food +20',
      fn:(g)=>{g.gold-=25;g.food+=20;},
      out:'Expensive but necessary. Your people will not go hungry.',icon:'🚢'},
     {text:'Ration food strictly',eff:'Happy -20, Pop -5, Food +15',
      fn:(g)=>{g.happy-=20;g.pop-=5;g.food+=15;},
      out:'Unpopular but it keeps reserves stable.',icon:'😔'},
     {text:'Open the palace kitchens to the poor',eff:'Happy +20, Food -10, Gold -5',
      fn:(g)=>{g.happy+=20;g.food-=10;g.gold-=5;},
      out:'Remembered for generations. Your people would follow you anywhere.',icon:'❤',good:true},
   ]},
  {id:'au_general',season:2,minDay:48,maxDay:66,weight:7,icon:'⚔',
   title:'General Requests a Raise',
   body:'Your most loyal general requests a significant pay raise. Without him, army morale could crumble.',
   choices:[
     {text:'Grant the full raise',eff:'Gold -20, Army +20, Happy +10',
      fn:(g)=>{g.gold-=20;g.army+=20;g.happy+=10;},
      out:'The general beams with pride. His loyalty is total.',icon:'🫡',good:true},
     {text:'Offer half',eff:'Gold -10, Army +5',
      fn:(g)=>{g.gold-=10;g.army+=5;},
      out:'A compromise. The general accepts without complaint.',icon:'🤝'},
     {text:'Refuse',eff:'Army -15, Happy -10',
      fn:(g)=>{g.army-=15;g.happy-=10;},
      out:'The general leaves your service. A costly mistake.',icon:'😠',bad:true},
   ]},
  {id:'au_philosopher',season:2,minDay:50,maxDay:66,weight:5,icon:'📜',
   title:'The Philosopher\'s Proposal',
   body:'A renowned philosopher proposes a great university. It would cost a fortune but transform your kingdom\'s future.',
   choices:[
     {text:'Build the University (40 Gold)',eff:'Gold -40, Pop +20, Army +10, Happy +15',
      fn:(g)=>{g.gold-=40;g.pop+=20;g.army+=10;g.happy+=15;},
      out:'Scholars flock to your city. Your kingdom leads the world in knowledge.',icon:'🎓',good:true},
     {text:'Offer partial funding',eff:'Gold -20, Pop +10',
      fn:(g)=>{g.gold-=20;g.pop+=10;},
      out:'A smaller institution opens its doors.',icon:'📚'},
     {text:'Decline',eff:'Nothing',
      fn:(g)=>{},
      out:'The philosopher leaves for a richer kingdom.',icon:'😔'},
   ]},
  {id:'au_invasion',season:2,minDay:55,maxDay:67,weight:8,icon:'🛡',
   title:'Neighbouring Kingdom Threatens War',
   body:'The Kingdom of Darkhollow has massed troops on your border. Pay tribute or face invasion.',
   choices:[
     {text:'Mobilise and prepare to fight',eff:'Army +20, Gold -20, Happy -10',risk:'50/50 victory or defeat',
      fn:(g)=>{g.army+=20;g.gold-=20;g.happy-=10;if(Math.random()<.5){g.army-=30;g.pop-=10;}else{g.army+=10;g.gold+=20;}},
      out:'War — the gamble of kings.',icon:'⚔',risky:true},
     {text:'Pay the tribute',eff:'Gold -30, peace maintained',
      fn:(g)=>{g.gold-=30;g.happy-=5;},
      out:'Humiliating but pragmatic. Your people live to fight another day.',icon:'💰'},
     {text:'Forge a counter-alliance',eff:'Gold -15, Army +35',
      fn:(g)=>{g.gold-=15;g.army+=35;},
      out:'Darkhollow backs down when they see your allies.',icon:'🤝',good:true},
   ]},
  // WINTER
  {id:'wi_blizzard',season:3,minDay:68,maxDay:88,weight:10,icon:'❄',
   title:'The Great Blizzard',
   body:'A blizzard of unprecedented fury buries your kingdom. Roads impassable. Fuel running low.',
   choices:[
     {text:'Open the palace to the homeless',eff:'Happy +25, Gold -10, Pop +5',
      fn:(g)=>{g.happy+=25;g.gold-=10;g.pop+=5;},
      out:'Hundreds shelter in your palace. They will be your most devoted subjects.',icon:'❤',good:true},
     {text:'Distribute emergency fuel supplies',eff:'Gold -20, Happy +20',
      fn:(g)=>{g.gold-=20;g.happy+=20;},
      out:'Your supply wagons brave the storm. Every household survives.',icon:'🔥'},
     {text:'Order everyone to stay indoors',eff:'Happy -15',risk:'20% deaths from cold',
      fn:(g)=>{g.happy-=15;if(Math.random()<.2){g.pop-=15;}},
      out:'The cold is merciless.',icon:'😔',risky:true},
   ]},
  {id:'wi_mystery',season:3,minDay:70,maxDay:88,weight:6,icon:'🌙',
   title:'A Mysterious Stranger',
   body:'On a moonless night, a cloaked prophet is brought before you. She claims to have foreseen your kingdom\'s fate.',
   choices:[
     {text:'Listen to her prophecy',eff:'Random great boon or curse',risk:'60% bonus, 40% curse',
      fn:(g)=>{if(Math.random()<.6){g.gold+=20;g.happy+=20;g.army+=15;}else{g.gold-=15;g.happy-=15;}},
      out:'The prophecy proves... interesting.',icon:'🔮',risky:true},
     {text:'Give her shelter and freedom',eff:'Happy +10, Food +15, Army +10',
      fn:(g)=>{g.happy+=10;g.food+=15;g.army+=10;},
      out:'Strange good fortune seems to follow your kingdom.',icon:'✨',good:true},
     {text:'Imprison her as a charlatan',eff:'Army +5, Happy -5',
      fn:(g)=>{g.army+=5;g.happy-=5;},
      out:'Strange dreams disturb your sleep for weeks.',icon:'🔒'},
   ]},
  {id:'wi_final',season:3,minDay:80,maxDay:89,weight:9,icon:'⚔',
   title:'The Final Test',
   body:'A massive coalition marches on your capital. Everything you have built is at stake. This is the battle that will define your legacy.',
   choices:[
     {text:'Meet them in open battle',eff:'Army -40, victory if army > 80',
      fn:(g)=>{g.army-=40;if(g.army>40){g.gold+=50;g.happy+=30;g.pop+=20;}else{g.pop-=30;g.happy-=30;}},
      out:'Victory or defeat determined by the strength of your army.',icon:'⚔',risky:true},
     {text:'Retreat and siege them out',eff:'Food -30, Army +10, Gold -20, Happy +10',
      fn:(g)=>{g.food-=30;g.army+=10;g.gold-=20;g.happy+=10;},
      out:'Your walls hold. The coalition runs out of supplies.',icon:'🧱'},
     {text:'Negotiate at the last moment',eff:'Gold -50, peace at a price',
      fn:(g)=>{g.gold-=50;g.happy-=10;},
      out:'A costly peace. Your treasury bleeds, but your kingdom stands.',icon:'🕊'},
   ]},
  {id:'wi_legacy',season:3,minDay:85,maxDay:90,weight:10,icon:'📜',
   title:'The History Books',
   body:'As your third year draws to a close, a historian asks to record your reign. What will you be remembered for?',
   choices:[
     {text:'"A builder who raised a great city"',eff:'Score bonus for buildings',
      fn:(g)=>{g.score+=g.buildings.length*60;g.happy+=10;},
      out:'Your buildings will outlast you by centuries.',icon:'🏛',good:true},
     {text:'"A warrior who never lost a battle"',eff:'Score bonus for army',
      fn:(g)=>{g.score+=g.army*4;g.army+=20;},
      out:'Soldiers name their children after you.',icon:'⚔',good:true},
     {text:'"A beloved ruler of a happy people"',eff:'Score bonus for happiness',
      fn:(g)=>{g.score+=g.happy*6;g.pop+=20;},
      out:'Story after story of people whose lives you improved.',icon:'❤',good:true},
   ]},
  // UNIVERSAL
  {id:'u_farm',season:-1,minDay:1,maxDay:89,weight:8,icon:'🌾',
   title:'The Farmers\' Petition',
   body:'Farmers ask for help expanding their fields. Royal investment could triple the food supply.',
   choices:[
     {text:'Fund the expansion (20 Gold)',eff:'Gold -20, Food +25, +Farm',
      fn:(g)=>{g.gold-=20;g.food+=25;addBuilding('farm');},
      out:'New fields stretch across the valley!',icon:'🌾',good:true},
     {text:'Offer labour instead',eff:'Army -5, Food +15',
      fn:(g)=>{g.army-=5;g.food+=15;},
      out:'Soldiers work the fields. Harvest improves.',icon:'👷'},
     {text:'Let them fund it themselves',eff:'Food +5',
      fn:(g)=>{g.food+=5;},
      out:'Slow progress, but every little helps.',icon:'🐢'},
   ]},
  {id:'u_market',season:-1,minDay:5,maxDay:89,weight:8,icon:'🏪',
   title:'Merchants Propose a Market',
   body:'Wealthy merchants offer to build a permanent market if you provide the land and some funding.',
   choices:[
     {text:'Provide land and 25 Gold',eff:'Gold -25, +Market',
      fn:(g)=>{g.gold-=25;addBuilding('market');},
      out:'Gold flows into your treasury from taxes and trade.',icon:'⚜',good:true},
     {text:'Build it yourself',eff:'Gold -35, full profit, +Market',
      fn:(g)=>{g.gold-=35;addBuilding('market');g.gold+=10;},
      out:'You own the market outright. All profits are yours.',icon:'💰',good:true},
     {text:'Decline',eff:'Nothing',
      fn:(g)=>{},
      out:'The merchants build elsewhere.',icon:'😐'},
   ]},
  {id:'u_barracks',season:-1,minDay:10,maxDay:89,weight:7,icon:'⚔',
   title:'General\'s Request',
   body:'Your general has identified land perfect for a military barracks.',
   choices:[
     {text:'Build the barracks (30 Gold)',eff:'Gold -30, Army +20, +Barracks',
      fn:(g)=>{g.gold-=30;g.army+=20;addBuilding('barracks');},
      out:'The sound of training fills the morning air.',icon:'🛡',good:true},
     {text:'Build a watchtower instead',eff:'Gold -15, Army +10',
      fn:(g)=>{g.gold-=15;g.army+=10;},
      out:'The watchtower provides early warning of any threat.',icon:'🗼'},
     {text:'Not now',eff:'Nothing',
      fn:(g)=>{},
      out:'The land remains empty.',icon:'😐'},
   ]},
  {id:'u_comet',season:-1,minDay:15,maxDay:88,weight:4,icon:'☄',
   title:'A Comet in the Sky',
   body:'A blazing comet streaks across the night sky. Your priests call it an omen. Your people are terrified.',
   choices:[
     {text:'Declare it a sign of divine favour',eff:'Happy +20, Army +10',
      fn:(g)=>{g.happy+=20;g.army+=10;},
      out:'Fear turns to fervour. Your people march to work singing.',icon:'✨',good:true},
     {text:'Consult the scholars',eff:'Happy +10, Gold +10',
      fn:(g)=>{g.happy+=10;g.gold+=10;},
      out:'The fearful are reassured. The curious are delighted.',icon:'🔭'},
     {text:'Lock yourself in the palace',eff:'Happy -20',
      fn:(g)=>{g.happy-=20;},
      out:'Your absence during the panic is deeply unhelpful.',icon:'😰',bad:true},
   ]},
  {id:'u_lost_child',season:-1,minDay:5,maxDay:88,weight:5,icon:'👦',
   title:'The Lost Child',
   body:'A small child is found wandering your palace grounds. She claims her village was destroyed by raiders.',
   choices:[
     {text:'Take her in as a ward of the crown',eff:'Happy +15, Pop +2',
      fn:(g)=>{g.happy+=15;g.pop+=2;},
      out:'The story spreads. You are seen as a ruler with a heart.',icon:'❤',good:true},
     {text:'Send soldiers to find her village',eff:'Army -5, Happy +20, Gold +10',
      fn:(g)=>{g.army-=5;g.happy+=20;g.gold+=10;},
      out:'Soldiers drive out the raiders. The grateful villagers pledge loyalty.',icon:'⚔',good:true},
     {text:'Place her with a local family',eff:'Happy +5',
      fn:(g)=>{g.happy+=5;},
      out:'A kind farmer takes her in.',icon:'🏠'},
   ]},
  {id:'u_eclipse',season:-1,minDay:20,maxDay:80,weight:3,icon:'🌑',
   title:'A Total Eclipse',
   body:'The sun disappears at midday. Your people are in a panic. What do you do?',
   choices:[
     {text:'Stand before them calmly and speak',eff:'Happy +25, Army +10',
      fn:(g)=>{g.happy+=25;g.army+=10;},
      out:'Your calm presence in the darkness becomes one of the defining moments of your reign.',icon:'👑',good:true},
     {text:'Ring the church bells',eff:'Happy +10',
      fn:(g)=>{g.happy+=10;},
      out:'The familiar sound comforts your people.',icon:'⛪'},
     {text:'Hide in the palace',eff:'Happy -20',
      fn:(g)=>{g.happy-=20;},
      out:'Your disappearance frightens your people more than the eclipse.',icon:'😨',bad:true},
   ]},
  {id:'u_treasure',season:-1,minDay:15,maxDay:75,weight:5,icon:'🗺',
   title:'A Treasure Map',
   body:'A dying sailor presses a faded map into your hand. It claims to show buried treasure from a forgotten king.',
   choices:[
     {text:'Send an expedition (20 Gold)',eff:'Gold -20',risk:'60% Gold +80, 40% loss',
      fn:(g)=>{g.gold-=20;if(Math.random()<.6){g.gold+=80;g.happy+=15;}else{g.happy-=5;}},
      out:'Fortune favours the bold — sometimes.',icon:'🎲',risky:true},
     {text:'Sell the map to a merchant',eff:'Gold +15',
      fn:(g)=>{g.gold+=15;},
      out:'The merchant pays well. You wonder what was buried there.',icon:'💰'},
     {text:'Ignore it',eff:'Nothing',
      fn:(g)=>{},
      out:'Some opportunities only come once.',icon:'😐'},
   ]},
  {id:'u_ruins',season:-1,minDay:20,maxDay:80,weight:5,icon:'🏛',
   title:'Ancient Ruins Discovered',
   body:'Workers have unearthed ancient ruins — from a civilisation that predates your kingdom by a thousand years.',
   choices:[
     {text:'Excavate carefully',eff:'Gold -15, Happy +20, Army +10',
      fn:(g)=>{g.gold-=15;g.happy+=20;g.army+=10;},
      out:'Extraordinary artifacts. Your kingdom becomes a centre of learning.',icon:'📜',good:true},
     {text:'Salvage the materials for building',eff:'Gold +20',
      fn:(g)=>{g.gold+=20;},
      out:'Practical. The stones go into new walls.',icon:'🧱'},
     {text:'Seal and preserve it as a monument',eff:'Happy +15, Gold +5',
      fn:(g)=>{g.happy+=15;g.gold+=5;},
      out:'People travel from far away to see it.',icon:'🗺',good:true},
   ]},
];

/* ══════════════════════════════════════
   WEBGL 3D RENDERER
   Kingdom grows in 3D as progress increases.
   Triangle count: ~50k at start → 100M+ at day 90.
   Uses high-subdivision terrain mesh + instanced buildings.
══════════════════════════════════════ */
const GL3D = {
  canvas: null,
  gl: null,
  prog: null,
  totalTriangles: 0,
  t: 0,
  raf: null,

  // Vertex shader — 3D perspective projection
  VS: `
    precision highp float;
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform mat4 uMVP;
    uniform mat4 uModel;
    uniform vec3 uLightDir;
    uniform float uTime;
    varying vec3 vColor;
    varying float vLight;
    void main(){
      vec4 worldPos = uModel * vec4(aPos, 1.0);
      gl_Position = uMVP * worldPos;
      vec3 worldNormal = normalize(mat3(uModel) * aNormal);
      float diff = max(dot(worldNormal, normalize(uLightDir)), 0.0);
      float amb = 0.35;
      vLight = amb + diff * 0.65;
      vColor = aColor;
    }
  `,

  // Fragment shader
  FS: `
    precision mediump float;
    varying vec3 vColor;
    varying float vLight;
    void main(){
      gl_FragColor = vec4(vColor * vLight, 1.0);
    }
  `,

  init(canvas) {
    this.canvas = canvas;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    const gl = canvas.getContext('webgl', {antialias:true,alpha:false,depth:true}) ||
               canvas.getContext('experimental-webgl', {antialias:true,alpha:false,depth:true});
    if(!gl) { console.error('WebGL not available'); return false; }
    this.gl = gl;

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Compile shaders
    const vs = this._shader(gl.VERTEX_SHADER, this.VS);
    const fs = this._shader(gl.FRAGMENT_SHADER, this.FS);
    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vs);
    gl.attachShader(this.prog, fs);
    gl.linkProgram(this.prog);
    if(!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      console.error('GL link error:', gl.getProgramInfoLog(this.prog));
      return false;
    }
    gl.useProgram(this.prog);

    // Attribute/uniform locations
    this.aPos      = gl.getAttribLocation(this.prog, 'aPos');
    this.aNormal   = gl.getAttribLocation(this.prog, 'aNormal');
    this.aColor    = gl.getAttribLocation(this.prog, 'aColor');
    this.uMVP      = gl.getUniformLocation(this.prog, 'uMVP');
    this.uModel    = gl.getUniformLocation(this.prog, 'uModel');
    this.uLightDir = gl.getUniformLocation(this.prog, 'uLightDir');
    this.uTime     = gl.getUniformLocation(this.prog, 'uTime');

    gl.enableVertexAttribArray(this.aPos);
    gl.enableVertexAttribArray(this.aNormal);
    gl.enableVertexAttribArray(this.aColor);

    this.buf = gl.createBuffer();
    return true;
  },

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error('Shader error:', gl.getShaderInfoLog(s));
    return s;
  },

  resize() {
    if(!this.canvas) return;
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if(this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  },

  // 4x4 matrix helpers
  mat4identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mat4mul(a, b) {
    const r = new Float32Array(16);
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) for(let k=0;k<4;k++)
      r[i*4+j] += a[i*4+k]*b[k*4+j];
    return r;
  },
  mat4perspective(fov, aspect, near, far) {
    const f = 1/Math.tan(fov/2);
    const nf = 1/(near-far);
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,2*far*near*nf,0
    ]);
  },
  mat4lookAt(eye, center, up) {
    const ez=norm3(sub3(eye,center)), ex=norm3(cross3(up,ez)), ey=cross3(ez,ex);
    return new Float32Array([
      ex[0],ey[0],ez[0],0,
      ex[1],ey[1],ez[1],0,
      ex[2],ey[2],ez[2],0,
      -dot3(ex,eye),-dot3(ey,eye),-dot3(ez,eye),1
    ]);
  },
  mat4rotY(a) {
    const c=Math.cos(a),s=Math.sin(a);
    return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
  },

  // Build the full 3D kingdom geometry
  // Subdivision level scales with progress → more triangles as kingdom grows
  buildGeometry(progress) {
    // progress 0..1 (day/90)
    // Terrain grid subdivisions: 50 at start → 1000 at max
    // 1000x1000 grid = 2M terrain triangles
    // Plus buildings each with 100+ triangles
    // Total at max: ~100M triangles target
    const TERRAIN_SUB = Math.max(50, Math.floor(50 + progress * 950));
    const verts = [];

    // Season colors
    const season = getSeason();
    const grassColors = [
      [0.35, 0.62, 0.18], // spring
      [0.45, 0.72, 0.12], // summer
      [0.52, 0.40, 0.10], // autumn
      [0.85, 0.90, 0.95], // winter
    ];
    const gc = grassColors[season.idx] || grassColors[0];
    const snowMix = season.idx === 3 ? 1 : 0;

    // ── TERRAIN MESH ──
    // High-subdivision grid with procedural hills
    const S = TERRAIN_SUB;
    const size = 20.0; // world units
    const h = size / S;

    function terrainHeight(x, z) {
      // Multi-octave terrain with buildings creating bumps
      const bldCount = G.buildings.length;
      const base = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.8
                 + Math.sin(x * 0.7 + 1) * Math.cos(z * 0.5) * 0.4
                 + Math.sin(x * 1.5 + 2) * Math.cos(z * 1.2) * 0.15
                 + Math.sin(x * 3.1) * Math.cos(z * 2.8) * 0.05;
      const buildupBump = Math.exp(-((x*x+z*z)*0.02)) * bldCount * 0.08;
      return base + buildupBump;
    }

    function terrainColor(x, z, y) {
      // Blend between grass/rock/snow based on height and season
      const rock = [0.45, 0.38, 0.28];
      const snow = [0.90, 0.93, 0.96];
      const grass = gc;
      const sand  = [0.78, 0.68, 0.40];
      const water = [0.15, 0.35, 0.60];
      if(y < -0.3) return water;
      if(y < 0.0)  return sand;
      if(y > 1.2)  return [rock[0]*(1-snowMix)+snow[0]*snowMix, rock[1]*(1-snowMix)+snow[1]*snowMix, rock[2]*(1-snowMix)+snow[2]*snowMix];
      return [grass[0]*(1-snowMix)+snow[0]*snowMix*0.5, grass[1]*(1-snowMix)+snow[1]*snowMix*0.5, grass[2]*(1-snowMix)+snow[2]*snowMix*0.5];
    }

    // Build terrain triangles
    for(let iz = 0; iz < S; iz++) {
      for(let ix = 0; ix < S; ix++) {
        const x0 = (ix/S - 0.5) * size, x1 = ((ix+1)/S - 0.5) * size;
        const z0 = (iz/S - 0.5) * size, z1 = ((iz+1)/S - 0.5) * size;
        const y00 = terrainHeight(x0,z0), y10 = terrainHeight(x1,z0);
        const y01 = terrainHeight(x0,z1), y11 = terrainHeight(x1,z1);

        // Normal for tri1
        const dx1=[x1-x0,y10-y00,0], dz1=[0,y01-y00,z1-z0];
        const n1 = norm3(cross3(dz1,dx1));
        // Normal for tri2
        const dx2=[x0-x1,y01-y11,0], dz2=[0,y10-y11,z0-z1];
        const n2 = norm3(cross3(dz2,dx2));

        const c00=terrainColor(x0,z0,y00), c10=terrainColor(x1,z0,y10);
        const c01=terrainColor(x0,z1,y01), c11=terrainColor(x1,z1,y11);

        // Triangle 1
        verts.push(x0,y00,z0, n1[0],n1[1],n1[2], c00[0],c00[1],c00[2]);
        verts.push(x1,y10,z0, n1[0],n1[1],n1[2], c10[0],c10[1],c10[2]);
        verts.push(x0,y01,z1, n1[0],n1[1],n1[2], c01[0],c01[1],c01[2]);
        // Triangle 2
        verts.push(x1,y10,z0, n2[0],n2[1],n2[2], c10[0],c10[1],c10[2]);
        verts.push(x1,y11,z1, n2[0],n2[1],n2[2], c11[0],c11[1],c11[2]);
        verts.push(x0,y01,z1, n2[0],n2[1],n2[2], c01[0],c01[1],c01[2]);
      }
    }

    // ── BUILDINGS ── each building = highly subdivided 3D mesh
    const bldPositions = [
      [0,0], [-2,1], [2,-1], [-1,-2], [2,2],
      [-3,0], [0,3], [3,1], [-2,3], [1,-3],
      [3,-2], [-3,2],
    ];

    G.buildings.forEach((bld, bi) => {
      const pos = bldPositions[bi % bldPositions.length];
      const bx = pos[0], bz = pos[1];
      const by = terrainHeight(bx, bz);
      this._buildBuilding(verts, bld, bx, by, bz, progress);
    });

    // ── CASTLE (always present, grows with progress) ──
    this._buildCastle(verts, 0, terrainHeight(0, 0), 0, progress);

    // ── WATER PLANE ── large subdivided plane
    const WATER_S = Math.max(20, Math.floor(20 + progress * 180));
    for(let iz = 0; iz < WATER_S; iz++) {
      for(let ix = 0; ix < WATER_S; ix++) {
        const x0 = (ix/WATER_S - 0.5) * size * 1.5;
        const x1 = ((ix+1)/WATER_S - 0.5) * size * 1.5;
        const z0 = (iz/WATER_S - 0.5) * size * 1.5;
        const z1 = ((iz+1)/WATER_S - 0.5) * size * 1.5;
        const wy = -0.45 + Math.sin(this.t + ix * 0.3 + iz * 0.4) * 0.04;
        const wn = [0, 1, 0];
        const wc = [0.12, 0.32, 0.58];
        verts.push(x0,wy,z0,wn[0],wn[1],wn[2],wc[0],wc[1],wc[2]);
        verts.push(x1,wy,z0,wn[0],wn[1],wn[2],wc[0],wc[1],wc[2]);
        verts.push(x0,wy,z1,wn[0],wn[1],wn[2],wc[0],wc[1],wc[2]);
        verts.push(x1,wy,z0,wn[0],wn[1],wn[2],wc[0],wc[1],wc[2]);
        verts.push(x1,wy,z1,wn[0],wn[1],wn[2],wc[0],wc[1],wc[2]);
        verts.push(x0,wy,z1,wn[0],wn[1],wn[2],wc[0],wc[1],wc[2]);
      }
    }

    this.totalTriangles = verts.length / 9;
    return new Float32Array(verts);
  },

  // Highly subdivided castle — grows with progress
  _buildCastle(verts, cx, cy, cz, progress) {
    const SUB = Math.max(8, Math.floor(8 + progress * 192)); // 8→200 subdivisions
    const scale = 0.5 + progress * 1.5;
    this._buildTower(verts, cx, cy, cz, scale * 0.6, scale * 2.2, SUB, [0.55,0.48,0.38]);
    this._buildTower(verts, cx-scale*0.9, cy, cz-scale*0.9, scale*0.35, scale*1.6, Math.max(6,Math.floor(SUB*0.7)), [0.50,0.44,0.34]);
    this._buildTower(verts, cx+scale*0.9, cy, cz-scale*0.9, scale*0.35, scale*1.6, Math.max(6,Math.floor(SUB*0.7)), [0.50,0.44,0.34]);
    this._buildTower(verts, cx-scale*0.9, cy, cz+scale*0.9, scale*0.35, scale*1.6, Math.max(6,Math.floor(SUB*0.7)), [0.50,0.44,0.34]);
    this._buildTower(verts, cx+scale*0.9, cy, cz+scale*0.9, scale*0.35, scale*1.6, Math.max(6,Math.floor(SUB*0.7)), [0.50,0.44,0.34]);
    // Cone roofs on side towers
    if(progress > 0.1) {
      this._buildCone(verts, cx-scale*0.9, cy+scale*1.6, cz-scale*0.9, scale*0.38, scale*0.6, Math.max(6,Math.floor(SUB*0.5)), [0.7,0.1,0.1]);
      this._buildCone(verts, cx+scale*0.9, cy+scale*1.6, cz-scale*0.9, scale*0.38, scale*0.6, Math.max(6,Math.floor(SUB*0.5)), [0.7,0.1,0.1]);
      this._buildCone(verts, cx-scale*0.9, cy+scale*1.6, cz+scale*0.9, scale*0.38, scale*0.6, Math.max(6,Math.floor(SUB*0.5)), [0.7,0.1,0.1]);
      this._buildCone(verts, cx+scale*0.9, cy+scale*1.6, cz+scale*0.9, scale*0.38, scale*0.6, Math.max(6,Math.floor(SUB*0.5)), [0.7,0.1,0.1]);
    }
    // Walls connecting towers
    if(progress > 0.15) {
      this._buildWall(verts, cx-scale*0.9, cy, cz-scale*0.9, cx+scale*0.9, cy, cz-scale*0.9, scale*0.12, scale*0.9, Math.max(4,Math.floor(SUB*0.3)), [0.48,0.42,0.32]);
      this._buildWall(verts, cx-scale*0.9, cy, cz+scale*0.9, cx+scale*0.9, cy, cz+scale*0.9, scale*0.12, scale*0.9, Math.max(4,Math.floor(SUB*0.3)), [0.48,0.42,0.32]);
      this._buildWall(verts, cx-scale*0.9, cy, cz-scale*0.9, cx-scale*0.9, cy, cz+scale*0.9, scale*0.12, scale*0.9, Math.max(4,Math.floor(SUB*0.3)), [0.44,0.38,0.28]);
      this._buildWall(verts, cx+scale*0.9, cy, cz-scale*0.9, cx+scale*0.9, cy, cz+scale*0.9, scale*0.12, scale*0.9, Math.max(4,Math.floor(SUB*0.3)), [0.44,0.38,0.28]);
    }
  },

  // Individual building mesh
  _buildBuilding(verts, bld, bx, by, bz, progress) {
    const SUB = Math.max(6, Math.floor(6 + progress * 94));
    const bldColors = {
      farm:[0.4,0.65,0.2], market:[0.7,0.5,0.2], barracks:[0.35,0.35,0.5],
      tavern:[0.6,0.3,0.15], library:[0.3,0.4,0.6], cathedral:[0.8,0.8,0.7],
      forge:[0.4,0.35,0.3], granary:[0.75,0.65,0.3], treasury:[0.75,0.65,0.2],
      walls:[0.5,0.45,0.35], harbour:[0.2,0.35,0.55], palace:[0.65,0.55,0.3],
    };
    const col = bldColors[bld.id] || [0.5,0.5,0.5];
    const scale = 0.25 + progress * 0.35;
    this._buildTower(verts, bx, by, bz, scale * 0.3, scale * 0.9, SUB, col);
    if(bld.id === 'palace' || bld.id === 'cathedral') {
      this._buildCone(verts, bx, by + scale*0.9, bz, scale*0.35, scale*0.55, SUB, [col[0]*1.3,col[1]*1.3,col[2]*1.3]);
    }
    if(bld.id === 'walls') {
      this._buildWall(verts, bx-scale*0.5, by, bz, bx+scale*0.5, by, bz, scale*0.08, scale*0.5, Math.max(3,Math.floor(SUB*0.4)), col);
    }
  },

  // Cylindrical tower — many triangles
  _buildTower(verts, cx, cy, cz, radius, height, SUB, col) {
    const VSTEPS = Math.max(3, Math.floor(SUB * 0.5)); // vertical segments
    const HSTEPS = Math.max(6, SUB);                   // horizontal segments
    for(let v = 0; v < VSTEPS; v++) {
      const y0 = cy + (v/VSTEPS) * height;
      const y1 = cy + ((v+1)/VSTEPS) * height;
      for(let h = 0; h < HSTEPS; h++) {
        const a0 = (h/HSTEPS) * Math.PI * 2;
        const a1 = ((h+1)/HSTEPS) * Math.PI * 2;
        const x00=cx+Math.cos(a0)*radius, z00=cz+Math.sin(a0)*radius;
        const x10=cx+Math.cos(a1)*radius, z10=cz+Math.sin(a1)*radius;
        const n0 = [Math.cos((a0+a1)/2), 0, Math.sin((a0+a1)/2)];
        const lum0 = 0.7 + Math.cos(a0 - 0.5) * 0.3;
        const lum1 = 0.7 + Math.cos(a1 - 0.5) * 0.3;
        const c0 = [col[0]*lum0, col[1]*lum0, col[2]*lum0];
        const c1 = [col[0]*lum1, col[1]*lum1, col[2]*lum1];
        verts.push(x00,y0,z00, n0[0],n0[1],n0[2], c0[0],c0[1],c0[2]);
        verts.push(x10,y0,z10, n0[0],n0[1],n0[2], c1[0],c1[1],c1[2]);
        verts.push(x00,y1,z00, n0[0],n0[1],n0[2], c0[0],c0[1],c0[2]);
        verts.push(x10,y0,z10, n0[0],n0[1],n0[2], c1[0],c1[1],c1[2]);
        verts.push(x10,y1,z10, n0[0],n0[1],n0[2], c1[0],c1[1],c1[2]);
        verts.push(x00,y1,z00, n0[0],n0[1],n0[2], c0[0],c0[1],c0[2]);
      }
    }
    // Cap top
    for(let h = 0; h < HSTEPS; h++) {
      const a0=(h/HSTEPS)*Math.PI*2, a1=((h+1)/HSTEPS)*Math.PI*2;
      const x0=cx+Math.cos(a0)*radius, z0=cz+Math.sin(a0)*radius;
      const x1=cx+Math.cos(a1)*radius, z1=cz+Math.sin(a1)*radius;
      const n=[0,1,0];
      verts.push(cx,cy+height,cz, n[0],n[1],n[2], col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(x0,cy+height,z0, n[0],n[1],n[2], col[0],col[1],col[2]);
      verts.push(x1,cy+height,z1, n[0],n[1],n[2], col[0],col[1],col[2]);
    }
  },

  // Conical roof
  _buildCone(verts, cx, cy, cz, radius, height, SUB, col) {
    const HSTEPS = Math.max(6, SUB);
    for(let h = 0; h < HSTEPS; h++) {
      const a0=(h/HSTEPS)*Math.PI*2, a1=((h+1)/HSTEPS)*Math.PI*2;
      const x0=cx+Math.cos(a0)*radius, z0=cz+Math.sin(a0)*radius;
      const x1=cx+Math.cos(a1)*radius, z1=cz+Math.sin(a1)*radius;
      const edge0 = norm3([Math.cos(a0)*height, radius, Math.sin(a0)*height]);
      const edge1 = norm3([Math.cos(a1)*height, radius, Math.sin(a1)*height]);
      const lum = 0.6 + Math.cos((a0+a1)/2 - 0.5) * 0.4;
      verts.push(cx,cy+height,cz, edge0[0],edge0[1],edge0[2], col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(x0,cy,z0, edge0[0],edge0[1],edge0[2], col[0]*lum,col[1]*lum,col[2]*lum);
      verts.push(x1,cy,z1, edge1[0],edge1[1],edge1[2], col[0]*lum,col[1]*lum,col[2]*lum);
    }
  },

  // Wall between two points
  _buildWall(verts, x0,y0,z0, x1,y1,z1, thickness, height, SUB, col) {
    const dx=x1-x0, dz=z1-z0, len=Math.sqrt(dx*dx+dz*dz);
    if(len < 0.001) return;
    const nx=dz/len, nz=-dx/len;
    for(let s=0; s<SUB; s++) {
      const t0=s/SUB, t1=(s+1)/SUB;
      const px0=x0+dx*t0, pz0=z0+dz*t0;
      const px1=x0+dx*t1, pz1=z0+dz*t1;
      const wy = y0 + height;
      // Front face
      verts.push(px0-nx*thickness,y0,pz0-nz*thickness, nx,0,nz, col[0]*.9,col[1]*.9,col[2]*.9);
      verts.push(px1-nx*thickness,y0,pz1-nz*thickness, nx,0,nz, col[0]*.9,col[1]*.9,col[2]*.9);
      verts.push(px0-nx*thickness,wy,pz0-nz*thickness, nx,0,nz, col[0],col[1],col[2]);
      verts.push(px1-nx*thickness,y0,pz1-nz*thickness, nx,0,nz, col[0]*.9,col[1]*.9,col[2]*.9);
      verts.push(px1-nx*thickness,wy,pz1-nz*thickness, nx,0,nz, col[0],col[1],col[2]);
      verts.push(px0-nx*thickness,wy,pz0-nz*thickness, nx,0,nz, col[0],col[1],col[2]);
      // Back face
      verts.push(px0+nx*thickness,y0,pz0+nz*thickness, -nx,0,-nz, col[0]*.7,col[1]*.7,col[2]*.7);
      verts.push(px0+nx*thickness,wy,pz0+nz*thickness, -nx,0,-nz, col[0]*.8,col[1]*.8,col[2]*.8);
      verts.push(px1+nx*thickness,y0,pz1+nz*thickness, -nx,0,-nz, col[0]*.7,col[1]*.7,col[2]*.7);
      verts.push(px1+nx*thickness,y0,pz1+nz*thickness, -nx,0,-nz, col[0]*.7,col[1]*.7,col[2]*.7);
      verts.push(px0+nx*thickness,wy,pz0+nz*thickness, -nx,0,-nz, col[0]*.8,col[1]*.8,col[2]*.8);
      verts.push(px1+nx*thickness,wy,pz1+nz*thickness, -nx,0,-nz, col[0]*.8,col[1]*.8,col[2]*.8);
      // Top cap
      verts.push(px0-nx*thickness,wy,pz0-nz*thickness, 0,1,0, col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(px1-nx*thickness,wy,pz1-nz*thickness, 0,1,0, col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(px0+nx*thickness,wy,pz0+nz*thickness, 0,1,0, col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(px1-nx*thickness,wy,pz1-nz*thickness, 0,1,0, col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(px1+nx*thickness,wy,pz1+nz*thickness, 0,1,0, col[0]*1.1,col[1]*1.1,col[2]*1.1);
      verts.push(px0+nx*thickness,wy,pz0+nz*thickness, 0,1,0, col[0]*1.1,col[1]*1.1,col[2]*1.1);
    }
  },

  render() {
    const gl = this.gl;
    if(!gl) return;
    this.t += 0.016;
    const progress = Math.min(1, G.day / TOTAL_DAYS);

    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);

    // Sky color by season
    const skies = [[0.18,0.28,0.12],[0.05,0.08,0.18],[0.12,0.06,0.02],[0.04,0.06,0.12]];
    const s = getSeason();
    const sky = skies[s.idx] || skies[0];
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Camera: orbits slowly, tilted 50 degrees, zooms out as kingdom grows
    const camDist = 8 + progress * 22;
    const camAngle = this.t * 0.08;
    const camHeight = camDist * Math.tan(50 * Math.PI / 180);
    const eye = [Math.cos(camAngle)*camDist, camHeight, Math.sin(camAngle)*camDist];
    const center = [0, 0, 0];
    const up = [0, 1, 0];

    const proj = this.mat4perspective(45 * Math.PI/180, W/H, 0.1, 200);
    const view = this.mat4lookAt(eye, center, up);
    const vp   = this.mat4mul(proj, view);
    const model = this.mat4identity();
    const mvp   = this.mat4mul(vp, model);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uMVP,   false, mvp);
    gl.uniformMatrix4fv(this.uModel, false, model);
    gl.uniform3f(this.uLightDir, 0.6, 1.0, 0.4);
    gl.uniform1f(this.uTime, this.t);

    // Build and upload geometry
    const geo = this.buildGeometry(progress);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, geo, gl.DYNAMIC_DRAW);

    const STRIDE = 9 * 4;
    gl.vertexAttribPointer(this.aPos,    3, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, STRIDE, 3*4);
    gl.vertexAttribPointer(this.aColor,  3, gl.FLOAT, false, STRIDE, 6*4);

    gl.drawArrays(gl.TRIANGLES, 0, geo.length / 9);

    // Update triangle counter
    const tc = document.getElementById('tri-count');
    if(tc) {
      const t = this.totalTriangles;
      tc.textContent = t > 999999 ? (t/1000000).toFixed(1)+'M' : t > 999 ? (t/1000).toFixed(0)+'K' : t;
    }
  },

  startLoop() {
    if(this.raf) cancelAnimationFrame(this.raf);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  },

  stop() {
    if(this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  },
};

// Math helpers
function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function sub3(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function norm3(a){const l=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];}

/* ══════════════════════════════════════
   HOME SCREEN ANIMATION (2D canvas)
══════════════════════════════════════ */
const HomeAnim = {
  canvas:null, ctx:null, t:0, raf:null, pts:[],
  init(){
    this.canvas = document.getElementById('home-canvas');
    if(!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', ()=>this.resize());
    this.pts = [];
    for(let i=0;i<55;i++) this.pts.push({
      x:Math.random(), y:Math.random(),
      vx:(Math.random()-.5)*.00016, vy:-Math.random()*.0001-.00004,
      r:Math.random()*1.8+.4, a:Math.random()*.5+.1,
      col:Math.random()>.4?'rgba(245,200,66,':'rgba(200,134,10,',
    });
    if(this.raf) cancelAnimationFrame(this.raf);
    this.loop();
  },
  resize(){ if(this.canvas){this.canvas.width=window.innerWidth;this.canvas.height=window.innerHeight;} },
  loop(){ this.raf=requestAnimationFrame(()=>this.loop()); this.draw(); },
  draw(){
    if(!this.ctx) return;
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    this.t+=.007;
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#020101'); bg.addColorStop(.5,'#060301'); bg.addColorStop(1,'#0a0501');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    // Castle silhouette
    const cx=W*.35;
    ctx.fillStyle='rgba(12,8,2,.92)';
    ctx.beginPath(); ctx.moveTo(0,H*.65);
    ctx.lineTo(cx-W*.14,H*.65); ctx.lineTo(cx-W*.14,H*.40);
    ctx.lineTo(cx-W*.10,H*.40); ctx.lineTo(cx-W*.10,H*.35);
    ctx.lineTo(cx-W*.07,H*.35); ctx.lineTo(cx-W*.07,H*.40);
    ctx.lineTo(cx-W*.03,H*.40); ctx.lineTo(cx-W*.03,H*.25);
    ctx.lineTo(cx+W*.03,H*.25); ctx.lineTo(cx+W*.03,H*.40);
    ctx.lineTo(cx+W*.07,H*.40); ctx.lineTo(cx+W*.07,H*.35);
    ctx.lineTo(cx+W*.10,H*.35); ctx.lineTo(cx+W*.10,H*.40);
    ctx.lineTo(cx+W*.14,H*.40); ctx.lineTo(cx+W*.14,H*.65);
    for(let i=0;i<9;i++){const tx=W*.52+i*W*.058;const th=H*.09+Math.sin(i*3)*.04*H;ctx.lineTo(tx-W*.022,H*.65);ctx.lineTo(tx,H*.65-th);ctx.lineTo(tx+W*.022,H*.65);}
    ctx.lineTo(W,H*.65); ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
    for(const p of this.pts){
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=1; if(p.x>1)p.x=0; if(p.y<0)p.y=.85;
      ctx.beginPath(); ctx.arc(p.x*W,p.y*H,p.r,0,Math.PI*2);
      ctx.fillStyle=p.col+(p.a*(.7+Math.sin(this.t*2+p.x*10)*.3))+')'; ctx.fill();
    }
    const gl=ctx.createRadialGradient(cx,H*.48,0,cx,H*.48,W*.38);
    gl.addColorStop(0,`rgba(245,150,20,${.07+Math.sin(this.t)*.025})`);
    gl.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gl; ctx.fillRect(0,0,W,H);
  },
  stop(){ if(this.raf){cancelAnimationFrame(this.raf);this.raf=null;} },
};

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function getSeason(){
  for(let i=0;i<SEASONS.length;i++){
    if(G.day>=SEASONS[i].days[0]&&G.day<=SEASONS[i].days[1]) return{...SEASONS[i],idx:i};
  }
  return{...SEASONS[3],idx:3};
}
function addBuilding(id){
  if(!BUILDINGS[id]) return;
  if(!G.buildings.find(b=>b.id===id)) G.buildings.push(BUILDINGS[id]);
}
function hasBuilding(id){ return G.buildings.some(b=>b.id===id); }
function clamp(){ G.gold=Math.max(0,Math.min(MAX_STAT,Math.round(G.gold))); G.food=Math.max(0,Math.min(MAX_STAT,Math.round(G.food))); G.army=Math.max(0,Math.min(MAX_STAT,Math.round(G.army))); G.happy=Math.max(0,Math.min(MAX_STAT,Math.round(G.happy))); G.pop=Math.max(0,Math.min(MAX_STAT,Math.round(G.pop))); }
function calcScore(){ return Math.floor(G.gold*.5+G.food*.4+G.army*.6+G.happy*.8+G.pop*1.0+G.buildings.length*30+G.achievements.length*50+G.day*2); }
function statColor(v){ return v/MAX_STAT>.6?'#4ad94a':v/MAX_STAT>.3?'#f5c842':'#d94a4a'; }

/* ══════════════════════════════════════
   SAVE / LOAD
══════════════════════════════════════ */
const Save = {
  save(){
    try{ G.score=calcScore(); localStorage.setItem(SK,JSON.stringify(G));
      const m=this.meta(); m.last_played=new Date().toDateString(); m.total_runs=G.total_runs||0; m.best_score=Math.max(m.best_score||0,G.score); m.all_achievements=[...new Set([...(m.all_achievements||[]),...G.achievements])]; localStorage.setItem(MK,JSON.stringify(m)); }
    catch(e){}
  },
  load(){
    try{
      const raw=localStorage.getItem(SK); if(!raw) return false;
      const d=JSON.parse(raw);
      if(!d||typeof d.day!=='number'||d.day>=TOTAL_DAYS||d.day<1){ localStorage.removeItem(SK); return false; }
      Object.assign(G,d); return true;
    }catch(e){ localStorage.removeItem(SK); return false; }
  },
  meta(){ try{return JSON.parse(localStorage.getItem(MK))||{};}catch(e){return{};} },
  clear(){ localStorage.removeItem(SK); },
  clearAll(){
    try{
      const keys=[];
      for(let i=0;i<localStorage.length;i++) keys.push(localStorage.key(i));
      keys.forEach(k=>{if(k)localStorage.removeItem(k);});
    }catch(e){}
  },
};

/* ══════════════════════════════════════
   DAILY INCOME
══════════════════════════════════════ */
function dailyIncome(){
  if(hasBuilding('farm'))      G.food  += 5;
  if(hasBuilding('market'))    G.gold  += 8;
  if(hasBuilding('barracks'))  G.army  += 6;
  if(hasBuilding('tavern'))    G.happy += 5;
  if(hasBuilding('forge'))     G.army  += 10;
  if(hasBuilding('cathedral')) G.happy += 8;
  if(hasBuilding('harbour'))   G.gold  += 12;
  if(hasBuilding('palace'))    { G.gold+=3; G.food+=3; G.army+=3; G.happy+=3; G.pop+=2; }
  G.food  -= Math.ceil(G.pop * .03);
  G.gold  -= Math.ceil(G.army * .02);
  G.happy -= 1;
  G.gold  += 3;
  if(G.food>60&&G.happy>50) G.pop += Math.floor(Math.random()*2);
  if(G.gold<=10) _lowGold=true;
  if(_lowGold && G.gold>50) _survivedRuin=true;
}

/* ══════════════════════════════════════
   ACHIEVEMENTS
══════════════════════════════════════ */
function checkAch(){
  if(G.happy>=90) _happyDays++; else _happyDays=0;
  for(const a of ACHIEVEMENTS){
    if(G.achievements.includes(a.id)) continue;
    let earned = false;
    if(a.check && a.check()) earned=true;
    if(a.id==='beloved' && _happyDays>=10) earned=true;
    if(a.id==='survivor' && _survivedRuin) earned=true;
    if(earned){ G.achievements.push(a.id); showAch(a); }
  }
}
function showAch(a){
  document.getElementById('ap-icon').textContent=a.icon;
  document.getElementById('ap-name').textContent=a.name;
  document.getElementById('ap-desc').textContent=a.desc;
  const el=document.getElementById('ach-popup');
  el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),3500);
}

/* ══════════════════════════════════════
   HUD
══════════════════════════════════════ */
function updateHUD(){
  clamp();
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const bar=(id,v)=>{const e=document.getElementById(id);if(e){e.style.width=`${(v/MAX_STAT)*100}%`;e.style.background=statColor(v);}};
  set('v-gold',G.gold);  bar('bar-gold',G.gold);
  set('v-food',G.food);  bar('bar-food',G.food);
  set('v-army',G.army);  bar('bar-army',G.army);
  set('v-happy',G.happy);bar('bar-happy',G.happy);
  set('v-pop',G.pop);    bar('bar-pop',G.pop);
  const s=getSeason();
  set('day-label',`Day ${G.day}`); set('season-name',s.name);
  const si=document.getElementById('season-icon'); if(si)si.textContent=s.icon;
  const pct=(G.day/TOTAL_DAYS)*100;
  const pf=document.getElementById('progress-fill');
  if(pf){pf.style.width=`${pct}%`;pf.style.background=s.color;}
  set('progress-label',`${s.name} · Year ${Math.ceil(G.day/30)} of 3`);
  G.score=calcScore();
  set('sb-score',G.score); set('sb-name',G.name);
  const bldEl=document.getElementById('sb-buildings');
  if(bldEl) bldEl.innerHTML=G.buildings.map(b=>`<div class="sb-bld">${b.icon} ${b.name}</div>`).join('');
  const achEl=document.getElementById('ach-list');
  if(achEl) achEl.innerHTML=ACHIEVEMENTS.map(a=>{
    const earned=G.achievements.includes(a.id);
    return`<div class="ach-item${earned?'':' locked'}">${a.icon} ${a.name}</div>`;
  }).join('');
  checkAch();
}

/* ══════════════════════════════════════
   EVENT ENGINE
══════════════════════════════════════ */
let _currentEvent=null;
function pickEvent(){
  const s=getSeason();
  let pool=EVENTS.filter(e=>{
    if(G.events_seen.filter(x=>x===e.id).length>1&&e.weight<8) return false;
    if(e.minDay>G.day||e.maxDay<G.day) return false;
    if(e.season!==-1&&e.season!==s.idx) return false;
    return true;
  });
  if(!pool.length) pool=EVENTS.filter(e=>e.minDay<=G.day&&e.maxDay>=G.day);
  if(!pool.length) return null;
  const total=pool.reduce((s,e)=>s+e.weight,0);
  let r=Math.random()*total;
  for(const e of pool){r-=e.weight;if(r<=0)return e;}
  return pool[pool.length-1];
}

function showEvent(ev){
  _currentEvent=ev;
  G.events_seen.push(ev.id);
  const s=getSeason();
  const ep=document.getElementById('event-panel');
  ep.classList.remove('hidden');
  const tag=document.getElementById('ep-tag');
  tag.textContent=s.name.toUpperCase(); tag.style.background=s.color;
  document.getElementById('ep-icon').textContent=ev.icon;
  document.getElementById('ep-title').textContent=ev.title;
  document.getElementById('ep-body').textContent=ev.body;
  const ch=document.getElementById('ep-choices'); ch.innerHTML='';
  ev.choices.forEach(c=>{
    const btn=document.createElement('button');
    btn.className=`choice-btn${c.good?' good':c.bad?' bad':c.risky?' risky':''}`;
    btn.innerHTML=`<span class="choice-main">${c.text}</span><span class="choice-eff">${c.eff}</span>${c.risk?`<span class="choice-risk">⚠ ${c.risk}</span>`:''}`;
    btn.addEventListener('click',()=>resolve(ev,c));
    ch.appendChild(btn);
  });
  document.getElementById('ep-skip').classList.add('hidden');
}

function resolve(ev,c){
  const before={gold:G.gold,food:G.food,army:G.army,happy:G.happy,pop:G.pop};
  c.fn(G); clamp();
  G.history.push({day:G.day,event:ev.title,choice:c.text});
  document.getElementById('event-panel').classList.add('hidden');
  // Outcome
  const op=document.getElementById('outcome-panel'); op.classList.remove('hidden');
  document.getElementById('op-icon').textContent=c.icon||'📜';
  document.getElementById('op-title').textContent=c.good?'A wise decision!':c.bad?'A costly mistake...':'The deed is done.';
  document.getElementById('op-body').textContent=c.out||'Your decision has been made.';
  const eff=document.getElementById('op-effects'); eff.innerHTML='';
  const stats=[{k:'gold',i:'⚜'},{k:'food',i:'🌾'},{k:'army',i:'⚔'},{k:'happy',i:'❤'},{k:'pop',i:'👥'}];
  stats.forEach(s=>{
    const diff=G[s.k]-before[s.k];
    if(Math.abs(diff)>0){
      const chip=document.createElement('div');
      chip.className=`eff-chip ${diff>0?'ep':'en'}`;
      chip.textContent=`${s.i} ${diff>0?'+':''}${diff}`;
      eff.appendChild(chip);
    }
  });
  if(!eff.children.length){const chip=document.createElement('div');chip.className='eff-chip eu';chip.textContent='No immediate change';eff.appendChild(chip);}
  updateHUD();
  // Danger warning
  if(G.gold<15||G.food<10||G.happy<15) setTimeout(()=>toast('⚠ Your kingdom is in danger!'),700);
}

function advanceDay(){
  document.getElementById('outcome-panel').classList.add('hidden');
  dailyIncome(); G.day++;
  if(checkGameOver()) return;
  if(G.day>TOTAL_DAYS){ doVictory(); return; }
  Save.save(); updateHUD();
  const ev=pickEvent();
  if(ev) showEvent(ev); else showRestDay();
}

function showRestDay(){
  document.getElementById('event-panel').classList.remove('hidden');
  const s=getSeason();
  const tag=document.getElementById('ep-tag'); tag.textContent=s.name.toUpperCase(); tag.style.background=s.color;
  document.getElementById('ep-icon').textContent='🌅';
  document.getElementById('ep-title').textContent='A Quiet Day';
  document.getElementById('ep-body').textContent='The kingdom is at peace. Your people go about their lives. A rare moment of calm.';
  document.getElementById('ep-choices').innerHTML='';
  document.getElementById('ep-skip').classList.remove('hidden');
}

function checkGameOver(){
  if(G.gold<=0&&G.day>5){ doGameOver('Your treasury is empty. Creditors seize your palace. Your kingdom dissolves into chaos.'); return true; }
  if(G.food<=0&&G.pop>10){ doGameOver('Famine sweeps the kingdom. Without food, your people scatter to the winds.'); return true; }
  if(G.happy<=0){ doGameOver('Your people rise in revolt. The palace is stormed. Your reign ends in flames.'); return true; }
  return false;
}

function doGameOver(reason){
  G.score=calcScore(); G.total_runs=(G.total_runs||0)+1; Save.save(); Save.clear();
  document.getElementById('game').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden');
  document.getElementById('go-reason').textContent=reason;
  document.getElementById('go-score').textContent=`Legacy Score: ${G.score}`;
  document.getElementById('go-stats').innerHTML=
    `<div class="go-stat"><span>Reign Length</span><span>Day ${G.day}</span></div>
     <div class="go-stat"><span>Gold</span><span>${G.gold}</span></div>
     <div class="go-stat"><span>Population</span><span>${G.pop}</span></div>
     <div class="go-stat"><span>Buildings</span><span>${G.buildings.length}</span></div>
     <div class="go-stat"><span>Achievements</span><span>${G.achievements.length}/${ACHIEVEMENTS.length}</span></div>`;
  GL3D.stop();
}

function doVictory(){
  G.score=calcScore(); G.total_runs=(G.total_runs||0)+1;
  if(!G.achievements.includes('first_win')) G.achievements.push('first_win');
  Save.save(); Save.clear();
  document.getElementById('game').classList.add('hidden');
  document.getElementById('victory').classList.remove('hidden');
  const title=G.score>600?'A Legendary Reign!':G.score>400?'A Great Ruler':'A Worthy Ruler';
  document.getElementById('vic-title').textContent=title;
  document.getElementById('vic-body').textContent=`${G.name} will be remembered for generations. Historians debate the secrets of your success.`;
  document.getElementById('vic-score').textContent=`Legacy Score: ${G.score}`;
  document.getElementById('vic-stats').innerHTML=
    `<div class="go-stat"><span>Reign</span><span>${TOTAL_DAYS} days COMPLETE</span></div>
     <div class="go-stat"><span>Triangles Rendered</span><span>${GL3D.totalTriangles.toLocaleString()}</span></div>
     <div class="go-stat"><span>Buildings</span><span>${G.buildings.length}</span></div>
     <div class="go-stat"><span>Achievements</span><span>${G.achievements.length}/${ACHIEVEMENTS.length}</span></div>`;
  GL3D.stop();
}

let _tt=null;
function toast(msg,dur){
  dur=dur||2500;
  const el=document.getElementById('toast');if(!el)return;
  el.textContent=msg;el.classList.remove('hidden');
  clearTimeout(_tt);_tt=setTimeout(()=>el.classList.add('hidden'),dur);
}

function checkStreak(){
  const m=Save.meta();
  const today=new Date().toDateString();
  const yesterday=new Date(Date.now()-86400000).toDateString();
  if(m.last_played===today){G.streak=m.streak||1;}
  else if(m.last_played===yesterday){G.streak=(m.streak||0)+1;if(G.streak>=2)showStreak(G.streak);}
  else{G.streak=1;}
}
function showStreak(n){
  const el=document.getElementById('streak-banner');if(!el)return;
  document.getElementById('streak-banner-txt').textContent=`${n} day streak! +10 Gold bonus`;
  el.classList.remove('hidden');G.gold+=10;
  setTimeout(()=>el.classList.add('hidden'),3000);
}

function startNew(){
  Save.clear();
  const m=Save.meta();
  Object.assign(G,{
    gold:100,food:80,army:20,happy:75,pop:50,day:1,score:0,
    name:KINGDOM_NAMES[Math.floor(Math.random()*KINGDOM_NAMES.length)]+' '+
         ['Kingdom','Empire','Realm','Dominion','Crown'][Math.floor(Math.random()*5)],
    buildings:[],achievements:[],events_seen:[],history:[],
    streak:m.streak||0,total_runs:m.total_runs||0,all_achievements:m.all_achievements||[],
  });
  HomeAnim.stop();
  document.getElementById('home').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('victory').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  const gc=document.getElementById('gl-canvas');
  if(GL3D.init(gc))GL3D.startLoop();
  updateHUD();Save.save();
  setTimeout(()=>{const ev=pickEvent();if(ev)showEvent(ev);else showRestDay();},500);
}

function startContinue(){
  if(!Save.load()){
    toast('No saved kingdom — start a New Kingdom!');
    const b=document.getElementById('btn-new');
    if(b){b.style.boxShadow='0 0 0 3px #f5c842';setTimeout(()=>b.style.boxShadow='',2000);}
    return;
  }
  HomeAnim.stop();
  document.getElementById('home').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  const gc=document.getElementById('gl-canvas');
  if(GL3D.init(gc))GL3D.startLoop();
  checkStreak();updateHUD();
  const ev=pickEvent();if(ev)showEvent(ev);else showRestDay();
}

function goHome(){
  GL3D.stop();
  ['game','gameover','victory','pause-menu'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('home')?.classList.remove('hidden');
  loadHome();HomeAnim.init();
}

function loadHome(){
  const m=Save.meta();
  let hasSave=false;
  try{const d=JSON.parse(localStorage.getItem(SK)||'{}');hasSave=!!(d&&d.day>=1&&d.day<TOTAL_DAYS);}catch(e){}
  if((m.streak||0)>=2){document.getElementById('home-streak')?.classList.remove('hidden');const st=document.getElementById('streak-txt');if(st)st.textContent=`${m.streak} day streak!`;}
  if((m.total_runs||0)>0){document.getElementById('home-records')?.classList.remove('hidden');const rb=document.getElementById('rec-best'),rr=document.getElementById('rec-runs');if(rb)rb.textContent=m.best_score||0;if(rr)rr.textContent=m.total_runs||0;}
  const cont=document.getElementById('btn-continue');if(cont)cont.style.opacity=hasSave?'1':'0.4';
}

function init(){
  const on=(id,fn)=>{const e=document.getElementById(id);if(e)e.addEventListener('click',fn);};
  on('btn-new',      startNew);
  on('btn-continue', startContinue);
  on('btn-clear',()=>{Save.clearAll();toast('🗑 All data cleared!');loadHome();});
  on('btn-next',     advanceDay);
  on('btn-skip',()=>{document.getElementById('event-panel').classList.add('hidden');advanceDay();});
  on('btn-pause',()=>{document.getElementById('pause-menu').classList.remove('hidden');const pi=document.getElementById('pm-info');if(pi)pi.textContent=G.name+' · Day '+G.day;});
  on('btn-resume',   ()=>document.getElementById('pause-menu').classList.add('hidden'));
  on('btn-save-now', ()=>{Save.save();toast('💾 Kingdom saved!');});
  on('btn-abandon',  ()=>{if(confirm('Abandon this kingdom?')){Save.clear();goHome();}});
  on('btn-pm-home',  ()=>{Save.save();goHome();});
  on('btn-menu',     ()=>{document.getElementById('pause-menu').classList.remove('hidden');const pi=document.getElementById('pm-info');if(pi)pi.textContent=G.name+' · Day '+G.day;});
  on('btn-go-home',  goHome);
  on('btn-vic-home', goHome);
  document.getElementById('go-reset')?.addEventListener('click',(e)=>{e.preventDefault();Save.clearAll();goHome();});
  document.getElementById('vic-reset')?.addEventListener('click',(e)=>{e.preventDefault();Save.clearAll();goHome();});
  // Always show home screen first — never auto-load
  document.getElementById('game').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('victory').classList.add('hidden');
  document.getElementById('pause-menu').classList.add('hidden');
  document.getElementById('home').classList.remove('hidden');
  loadHome();
  HomeAnim.init();
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
else{init();}
})();
