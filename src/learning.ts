import {applyAction,colors,legalChoices,sizes,type Action,type GameState,type Piece,type Ship,type StarSystem} from './game';
import {pyramid,type ShipSelection} from './tabletop';

export interface LearningOptions {
  ships:Set<string>;captures:Set<string>;buildSystems:Set<string>;destinations:Set<string>;
  trade:boolean;travel:boolean;sacrifice:boolean;
}
export const shipKey=(system:string,index:number)=>`${system}:${index}`;
/** Highlight decisions come from the same reducer as real play, including
 * current sacrifice restrictions and free catastrophes. Never predict legality. */
export function learningOptions(state:GameState,source:ShipSelection|null):LearningOptions {
  const options:LearningOptions={ships:new Set(),captures:new Set(),buildSystems:new Set(),destinations:new Set(),trade:false,travel:false,sacrifice:false};
  for(const system of state.systems)for(const {action}of legalChoices(state,system.id)) {
    if(action.type==='build')options.buildSystems.add(system.id);
    if(action.type==='capture')options.captures.add(shipKey(system.id,action.ship));
    else if('ship'in action) {
      options.ships.add(shipKey(system.id,action.ship));
      if(source?.system===system.id&&source.ship===action.ship) {
        if(action.type==='trade')options.trade=true;
        if(action.type==='sacrifice')options.sacrifice=true;
        if(action.type==='move'){options.travel=true;options.destinations.add(action.destination);}
        if(action.type==='discover')options.travel=true;
      }
    }
  }
  return options;
}

export interface LessonExample {state:GameState;actions:Action[];focus:string[];caption:string;afterCaption:string}
export interface Lesson {title:string;text:string[];tip:string;example?:LessonExample;visual?:'pieces'|'powers'|'setup'|'ready'}
const p=(color:Piece['color'],size:Piece['size']):Piece=>({color,size});
const ship=(color:Piece['color'],size:Piece['size'],owner:Ship['owner']=1):Ship=>({...p(color,size),owner});
const north=():StarSystem=>({id:'north',name:'Quux’s homeworld',homeworld:0,stars:[p('red',2),p('blue',1)],ships:[ship('green',3,0)]});
const south=(stars:Piece[]=[p('blue',3),p('red',1)],ships:Ship[]=[ship('green',3)]):StarSystem=>({id:'south',name:'Your homeworld',homeworld:1,stars,ships});
function example(systems:StarSystem[],actions:Action[],focus:string[],caption:string,afterCaption:string):LessonExample {
  const bank=colors.flatMap(color=>sizes.flatMap(size=>Array.from({length:3},()=>p(color,size))));
  for(const system of systems)for(const piece of [...system.stars,...system.ships]) {
    const index=bank.findIndex(p=>p.color===piece.color&&p.size===piece.size);
    if(index<0)throw Error('Lesson example exceeds the bank supply.');bank.splice(index,1);
  }
  const state:GameState={systems,bank,player:1,turn:1,allowance:{color:null,remaining:1,sacrificed:false},outcome:'playing',nextSystem:1};
  actions.reduce(applyAction,state); // Every animated example is also a real legal turn/prefix.
  return {state,actions,focus,caption,afterCaption};
}
const build=example([north(),south()],[{type:'build',system:'south',color:'green'}],['south'],'One green ship. Green power lets you build.','A small green ship joins your fleet. Your basic action is used.');
const travel=example([north(),south([p('blue',1),p('yellow',2)],[ship('green',3),ship('yellow',3)]),{id:'outpost',name:'Connected frontier',stars:[p('green',3)],ships:[ship('red',1,0)]}],[{type:'move',system:'south',ship:1,destination:'outpost'}],['south','outpost'],'Home stars are sizes 1 and 2. The frontier star is size 3. No sizes overlap.','The yellow ship travels to the frontier. Ships of either player can share a system.');
const discover=example([north(),south([p('blue',1),p('yellow',2)],[ship('green',3),ship('yellow',1)])],[{type:'discover',system:'south',ship:1,star:p('green',3)}],['south','system-1'],'Choose an available size-3 bank star, because your home stars are sizes 1 and 2.','The bank piece becomes a star and the same ship arrives there. Discovery is one yellow action.');
const trade=example([north(),south()],[{type:'trade',system:'south',ship:0,color:'yellow'}],['south'],'The blue star provides trade power. A large yellow piece is available in the bank.','Large green becomes large yellow. The old green piece returns to the bank.');
const capture=example([north(),south(undefined,[ship('green',3),ship('yellow',2,0)])],[{type:'capture',system:'south',ship:1}],['south'],'Your red star supplies capture power. Your large green ship is big enough to take the medium enemy ship.','The captured ship changes direction and belongs to you. It is not destroyed.');
const sacrifice=example([north(),south(undefined,[ship('green',3),ship('green',1)]),{id:'outpost',name:'Your frontier',stars:[p('red',2)],ships:[ship('green',1)]}],[{type:'sacrifice',system:'south',ship:0},{type:'build',system:'south',color:'green'},{type:'build',system:'outpost',color:'green'},{type:'build',system:'south',color:'green'}],['south','outpost'],'Return your large green ship to the bank instead of taking a basic action. Keep other ships to act with.','Three green build actions are used across two systems. No second sacrifice or basic action follows.');
const catastrophe=example([north(),south([p('green',1),p('blue',3)],[ship('green',3),ship('green',1),ship('yellow',1),ship('green',2,0)])],[{type:'catastrophe',system:'south',color:'green'}],['south'],'Count four green pieces together. The star, your green ships, and the enemy green ship all count.','Only green is removed. The blue star survives, so your yellow ship survives too. This costs no action.');
const demolition=example([north(),south(),{id:'outpost',name:'Single-star frontier',stars:[p('green',1)],ships:[ship('green',1),ship('green',2),ship('green',2,0),ship('blue',1)]}],[{type:'catastrophe',system:'outpost',color:'green'}],['outpost'],'This frontier also has four green pieces. Its only star is green.','The last star is destroyed. Every ship here is destroyed, including the blue one. All pieces return to the bank.');
const victory=example([{...north(),ships:[ship('green',3,0),ship('red',3)]},south(),{id:'outpost',name:'Enemy ships elsewhere',stars:[p('yellow',2)],ships:[ship('blue',2,0)]}],[{type:'capture',system:'north',ship:0},{type:'end'}],['north','outpost'],'Your red ship can capture the opponent’s last ship at their homeworld.','You win at End turn. The opponent still has a ship elsewhere, but none of their own remain at home.');

export const lessons:Lesson[]=[
  {title:'Welcome to Homeworlds',text:['You command a fleet of spaceships. Your opponent commands another. You can both see the entire board.','Your goal is to destroy the enemy homeworld or leave it with none of the enemy’s own ships. Keep at least one of your own ships at your homeworld when a turn ends.'],tip:'You will command South. The easy Quux Bot will command North.',example:example([north(),south()],[],['north','south'],'Two homeworlds. Two fleets. A shared bank of spare pieces.','')},
  {title:'Meet the pieces',text:['Each piece has a color and one, two, or three dots. The dots give its size.','A square symbol represents an upright star. A triangle represents a ship. Your ships point up from the South seat. Enemy ships point down. Color is a power, not a player’s team.'],tip:'The walkthrough uses the exact same pieces as the playing board.',visual:'pieces'},
  {title:'Choose your homeworld',text:['A coin flip picks who chooses first and takes the first turn. Each player chooses two stars of any available colors and sizes, then one large ship.','Click two highlighted bank pieces for your stars, then a highlighted large piece for your ship. Review your three choices and press End turn. Your opponent then chooses.'],tip:'Try red and blue stars with a large green ship. Green builds, blue trades, and red provides capture power. Starting tips during setup compares four beginner-friendly combinations and can select one for you.',visual:'setup'},
  {title:'Your turn and the shared bank',text:['Take one basic action, or sacrifice one ship to get several actions of its color. You also need a ship of your own in a system to take a normal action there.','The bank holds three copies of each color and size, 36 pieces in total. Both players use it. You cannot take a piece that is not there.','Undo lets you rethink actions before End turn. End turn confirms the whole turn and gives your opponent control. In this tabletop, it lights up after a valid action.'],tip:'The rulebook also permits passing. This tabletop keeps End turn off until you have acted.',example:build},
  {title:'Four colors, four powers',text:['Green builds. Yellow travels or discovers. Red captures. Blue trades. Any ship can use a power supplied by a star or by another of your own ships in that same system.','An enemy ship never gives you its color power. A red ship can travel using a yellow star, for example. The ship you click does not have to match the action’s color.'],tip:'A sacrifice is the exception to local color access. We will show that shortly.',visual:'powers'},
  {title:'Green means build',text:['To build, you need green power and a ship of your own already in the system. Your new ship must match a color you already own there.','Take the smallest size of that color still available in the bank. You cannot choose a bigger size while a smaller one remains.'],tip:'On the board, select a highlighted system, then click a highlighted bank piece.',example:build},
  {title:'Yellow means travel',text:['Travel moves one of your ships to an existing connected system. The stars must have no sizes in common. Colors, ship sizes, and the distance drawn on the board do not determine connections.','For a two-star homeworld, compare both star sizes. A size-1 and size-2 homeworld connects to a size-3 star, but not a size-1 or size-2 star. You need yellow power to travel.'],tip:'Select your ship. Valid destination systems glow yellow. Moving into enemy territory does not also capture a ship.',example:travel},
  {title:'Discover a new system',text:['Yellow power can also send a ship to a new star. Choose an available piece from the bank to become that star. Its size must connect to the stars you are leaving.','The bank piece becomes a star and your ship moves there in one action. If the last ship of either player leaves an ordinary system, its star returns to the bank immediately. Homeworlds are different and stay on the map when temporarily empty.'],tip:'Select your ship, choose Travel, then click a highlighted bank star.',example:discover},
  {title:'Blue means trade',text:['With blue power, exchange one of your ships for a different color in the bank. The size must stay exactly the same.','The old piece goes back into the shared bank. A trade changes your ship’s color and the powers it can provide on later turns.'],tip:'Select your ship, choose Trade, then choose a highlighted bank piece of the same size.',example:trade},
  {title:'Red means capture',text:['With red power, take control of an enemy ship in a system where you have a ship at least as large as the target. The target turns around and joins your fleet.','The ship supplying red power does not have to be the big one. A small red ship can supply the power while your large ship makes the capture possible.','Travel and capture are separate actions. Moving into an enemy system on a basic turn gives the opponent a turn to respond.'],tip:'Enemy ships you can legally capture glow red. Click one to capture it.',example:capture},
  {title:'Sacrifice for more actions',text:['Instead of your basic action, return one of your own ships to the bank. Its dots give up to that many actions, all in its color. A large green gives up to three builds.','Use those actions in any systems where you still have ships. You do not need local access to the sacrificed color. Other restrictions still apply, such as owning the color you build, exact-size trades, travel connections, and capture sizes.','Sacrifice only once per turn, before a basic action. You may leave some sacrifice actions unused when you end.'],tip:'Free catastrophes can happen before, between, or after these actions. Do not leave your homeworld empty when you confirm.',example:sacrifice},
  {title:'Four of a color can explode',text:['Four or more pieces of one color in a system allow an optional catastrophe. Count the stars and both players’ ships together. Sizes do not matter.','On your turn, you may trigger it for free at any point, even where you have no ships. It is never automatic. Every piece of that color returns to the bank.','If another star survives, ships of other colors remain. A two-star homeworld can survive losing one of its stars.'],tip:'An eligible catastrophe button glows on that system, including enemy-only systems.',example:catastrophe},
  {title:'When the entire system is destroyed',text:['If a catastrophe destroys the last star, every ship in that system is destroyed, even ships of other colors.','If any ordinary system ends up with no ships at all, its star also returns to the bank. A surviving homeworld star stays on the map when temporarily unoccupied.'],tip:'A catastrophe destroys a color first. Losing the last star is what destroys everything else.',example:demolition},
  {title:'Win, lose, or draw',text:['At End turn, a player loses if their homeworld has no surviving star or none of their own ships. Ships elsewhere do not save them. Capture or destroy the home fleet, or destroy both home stars.','You may briefly leave home during a sacrifice turn if you return a ship before confirming. Eliminating both players at the same turn ending is a draw. Resigning also awards the opponent a win.'],tip:'Legal does not always mean safe. Learning mode warns if your staged turn would leave you eliminated.',example:victory},
  {title:'Ready for your first game',text:['Start by choosing your two home stars and a large ship from the highlighted bank. The coin flip still decides the starting player.','Glowing ships can be selected. Red outlines mark legal captures. Yellow outlines mark valid travel destinations. Glowing bank pieces fit the action you are choosing. After each action, the help updates.','Choose Trade or Travel beside a selected ship, or select a system to build. Undo before End turn if you change your mind. You can reopen this walkthrough from Game menu.'],tip:'You will face Quux Bot at difficulty 1. Highlights show legal choices, not a guarantee that a move is strategically good.',visual:'ready'},
];

export function lessonSystem(system:StarSystem|undefined,missingName='System removed'):string {
  if(!system)return `<div class="lesson-system lesson-removed"><span>✧ ${missingName}</span><p>No star or ships remain</p></div>`;
  return `<div class="lesson-system"><strong>${system.homeworld===undefined?'✧':'⌂'} ${system.name}</strong><div class="lesson-pieces"><div class="lesson-fleet enemy">${system.ships.filter(p=>p.owner===0).map(p=>pyramid(p,false,0)).join('')}</div><div class="lesson-stars">${system.stars.map(p=>pyramid(p,true)).join('')}</div><div class="lesson-fleet own">${system.ships.filter(p=>p.owner===1).map(p=>pyramid(p,false,1)).join('')}</div></div></div>`;
}
const token=(piece:Piece,star=false,owner=1,label='')=>`<figure>${pyramid(piece,star,owner)}<figcaption>${label}</figcaption></figure>`;
export function lessonVisual(lesson:Lesson,after:boolean):string {
  if(lesson.example) {
    const {state,actions,focus,caption,afterCaption}=lesson.example;
    const shown=after?actions.reduce(applyAction,state):state;
    return `<div class="lesson-scene ${after?'after':''}" aria-label="${after?'After':'Before'} example"><span class="lesson-stage-label">${after?'AFTER':'BEFORE'}</span><div class="lesson-systems">${focus.map(id=>lessonSystem(shown.systems.find(s=>s.id===id),id==='system-1'?'Not discovered yet':'System removed')).join('')}</div><p class="lesson-caption">${after?afterCaption:caption}</p>${after&&actions.some(a=>a.type==='sacrifice')?`<span class="lesson-action-count">${shown.allowance.remaining} sacrifice actions left</span>`:''}</div>`;
  }
  if(lesson.visual==='pieces')return `<div class="lesson-scene"><div class="lesson-tokens">${token(p('blue',2),true,1,'Star')}${token(p('green',3),false,1,'Your ship')}${token(p('green',3),false,0,'Enemy ship')}</div><div class="lesson-tokens lesson-sizes">${[1,2,3].map(n=>token(p('yellow',n as Piece['size']),false,1,['','Small · 1','Medium · 2','Large · 3'][n])).join('')}</div></div>`;
  if(lesson.visual==='powers')return `<div class="lesson-scene"><div class="lesson-power-grid">${colors.map(color=>`<div class="lesson-power ${color}">${pyramid(p(color,2))}<strong>${{green:'Build',yellow:'Travel',red:'Capture',blue:'Trade'}[color]}</strong></div>`).join('')}</div><div class="lesson-power-example">${pyramid(p('yellow',2),true)}<span>gives travel power to</span>${pyramid(p('red',3))}</div></div>`;
  if(lesson.visual==='setup')return `<div class="lesson-scene"><div class="lesson-tokens">${token(p('red',1),true,1,'Star 1')}${token(p('blue',3),true,1,'Star 2')}<span class="lesson-plus">+</span>${token(p('green',3),false,1,'Large ship')}</div><p class="lesson-caption">Two stars + one large ship = your starting homeworld</p></div>`;
  return `<div class="lesson-scene"><div class="lesson-tokens">${token(p('green',1),false,1,'Build')}${token(p('yellow',2),false,1,'Travel')}${token(p('red',3),false,1,'Capture')}${token(p('blue',2),false,1,'Trade')}</div><p class="lesson-caption">The same pieces. The same rules. Legal choices will glow.</p></div>`;
}
