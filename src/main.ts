import './style.css';
import {fitBoard} from './board';
import {resultDescription} from './outcome';
import {beforeAction,animateAction} from './effects';
import {setupBank,placeSetupPiece,decodeSetupProgress,confirmSetup,undoSetup,openingFromSetup,setupKey,type Setup} from './setup';
import {bankAction, legal, pyramid, type ShipSelection} from './tabletop';
import { colors, sizes, createInitialState, applyAction, type Piece, type Action, type GameState, type Color, type Size,type Player } from './game';
import {randomStarter,humanPlayer,quuxPlayer,isBotMode,validDifficulty,difficultyLabel,type GameMode} from './match';
import {coachRequest,decodeAnalysis,bestTurn,describeTurn,explainTurn,describeReply,moveRating,type CoachAnalysis} from './coach';
import {askQuux,stopQuux,quuxPosition,quuxSetupPosition,decodeQuuxSetup,quuxActions,QuuxClient} from './quux';
import {introPhase,nextIntroBoundary,nameEntranceMs,coinRevealMs,type IntroPhase} from './intro';
import {learningOptions,shipKey,lessons,lessonVisual,lessonSystem} from './learning';
import {guideRequest,decodeGuide,remainingPlan,explainPlan,nextClick,planSteps,catastropheImpact,winningConfirmation,type GuideResult} from './mentor';
import {startingRecommendations,recommendedStart,nextRecommendedPiece,startingWarnings,useStartingRecommendation} from './openings';
import {createLayout,layoutAfter,layoutBounds,type MapLayout} from './layout';

import {newSession, decodeSession, storageKey, type Session} from './session';

const app = document.querySelector<HTMLDivElement>('#app')!;
const boardResizeObserver=new ResizeObserver(entries=>entries.forEach(entry=>fitBoard(entry.target as HTMLElement)));
let session = newSession();
let state = createInitialState();
let selected = 'north';
let source: ShipSelection | null = null;
let intent: 'build'|'trade'|'discover' = 'build';
let draft: Setup | null = [[],[]];
let setupPlayer:0|1=0;
let mode:GameMode='local';
let difficulty=10;
let starter:Player=0;
let choosingMode=true;
let botBusy=false;
let botError='';
let botEpoch=0;
let coachBusy=false;
let coachEpoch=0;
let coachView:{kind:'hint'|'review';start:GameState;staged:GameState;actions:Action[];analysis?:CoachAnalysis;error?:string}|null=null;
let learningFlow:{screen:'choice'|'walkthrough';index:number;after:boolean;launch:boolean}|null=null;
const mentorClient=new QuuxClient();
let mentorEpoch=0;
let mentor:{start:GameState;turnKey:string;positionKey:string;busy:boolean;analysis?:GuideResult;error?:string;selected:number}|null=null;
let mentorDetails=false;
let catastrophePreview:Extract<Action,{type:'catastrophe'}>|null=null;
let introStartedAt:number|null=null;
let introTimer:ReturnType<typeof setTimeout>|undefined;
let resumeSession: Session | null = null;
let notice = 'Choose another player on this device or play Quux Bot. A coin flip chooses who starts.';
let mapLayout=createLayout();
let history: { state: GameState; log: string[]; actionCount: number;layout:MapLayout }[] = [];
let log: string[] = [];
let announcedResult='';

function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function save(): void {
  try {localStorage.setItem(storageKey, JSON.stringify(session));}
  catch {notice += ' Browser storage unavailable; export a save to keep this game.';}
}
function clearCoach():void {coachEpoch++;if(coachBusy)stopQuux();coachBusy=false;coachView=null;}
function clearMentor():void {mentorEpoch++;mentorClient.stop();mentor=null;mentorDetails=false;catastrophePreview=null;}
function cancelBot():void {clearMentor();learningFlow=null;clearCoach();botEpoch++;stopQuux();botBusy=false;botError='';clearTimeout(introTimer);introStartedAt=null;}
function playerName(player:number):string {return isBotMode(mode)?(player===humanPlayer?'You':'Quux Bot'):`Player ${player+1}`;}
function outcomeText():string {
  const text=resultDescription(state);
  return isBotMode(mode)?text.replaceAll('Player 1','Quux Bot').replaceAll('Player 2','You').replaceAll('You has','You have').replaceAll('You wins','You win'):text;
}
function botTurn():boolean {return !learningFlow&&!choosingMode&&introStartedAt===null&&isBotMode(mode)&&(draft?setupPlayer===quuxPlayer:state.outcome==='playing'&&state.player===quuxPlayer);}
function locked():boolean {return !!learningFlow||choosingMode||introStartedAt!==null||botBusy||coachBusy||botTurn();}
function restore(next: Session,cancel=true): void {
  if(cancel)cancelBot();
  session = next;mode=next.mode??'local';difficulty=next.difficulty??10;starter=next.starter??0;choosingMode=false;draft=null;resumeSession=null;announcedResult='';
  try {localStorage.removeItem(setupKey);} catch { /* Storage optional. */ }
  state = createInitialState(session.opening,session.starter);
  mapLayout=createLayout(session.opening);
  history = []; log = [];
  session.actions.forEach((action, index) => {
    if (['end', 'resign', 'draw'].includes(action.type)) history = [];
    else history.push({state, log: [...log], actionCount: index,layout:mapLayout});
    log.push(`Turn ${state.turn} · Player ${state.player + 1}: ${action.type}`);
    const nextState=applyAction(state, action);mapLayout=layoutAfter(mapLayout,state,action,nextState);state=nextState;
  });
  selected = state.player === 0 ? 'north' : 'south';
  source = null; intent = 'build';
}
try {
  const stored=localStorage.getItem(storageKey);
  if(stored)resumeSession=decodeSession(stored);
  const partial=localStorage.getItem(setupKey);
  if(partial){const progress=decodeSetupProgress(partial);draft=progress.pieces;setupPlayer=progress.player;starter=progress.starter??0;mode=progress.mode??'local';difficulty=progress.difficulty??(mode==='learning'?1:10);introStartedAt=progress.introStartedAt===undefined?null:Math.min(progress.introStartedAt,Date.now());choosingMode=false;selected=setupPlayer===0?'north':'south';notice=introStartedAt===null?'Your homeworld selection has been restored.':'';}
} catch {notice='Choose your starting pieces. A previous save could not be loaded.';}
function saveSetup():void {try {if(draft)localStorage.setItem(setupKey,JSON.stringify({pieces:draft,player:setupPlayer,starter,mode,...(isBotMode(mode)?{humanPlayer,difficulty}:{}),...(introStartedAt!==null?{introStartedAt}:{})}));} catch {notice='Browser storage unavailable; keep this page open during setup.';}}
function beginSetup(nextMode:GameMode):void {
  cancelBot();mode=nextMode;starter=randomStarter();setupPlayer=starter;choosingMode=false;
  if(mode==='learning')difficulty=1;
  draft=[[],[]];announcedResult='';source=null;selected=starter===0?'north':'south';mapLayout=createLayout();
  introStartedAt=Date.now();notice='';saveSetup();advanceIntro();
}
function advanceIntro():void {
  clearTimeout(introTimer);
  if(introStartedAt===null)return;
  const now=Date.now();
  if(introPhase(introStartedAt,now)==='complete'){introStartedAt=null;notice='';saveSetup();render();return;}
  introTimer=setTimeout(advanceIntro,Math.max(1,introStartedAt+nextIntroBoundary(introStartedAt,now)-now));
  render();
}
function chooseNewGame():void {
  cancelBot();choosingMode=true;draft=[[],[]];source=null;state=createInitialState();mapLayout=createLayout();
  try {const saved=localStorage.getItem(storageKey);resumeSession=saved?decodeSession(saved):null;} catch {resumeSession=null;}
  notice='Choose another player on this device or play Quux Bot. A coin flip chooses who starts.';render();
}
function confirmHomeworld():void {
  if(!draft)return;
  const next=confirmSetup({pieces:draft,player:setupPlayer,starter,mode});
  if(next){draft=next.pieces;setupPlayer=next.player;selected=setupPlayer===0?'north':'south';notice=`Homeworld confirmed. ${playerName(setupPlayer)}: choose your homeworld.`;saveSetup();}
  else {const opening=openingFromSetup(draft);restore(newSession(opening,{starter,mode,difficulty}),false);notice=`Both homeworlds confirmed. ${playerName(starter)} ${isBotMode(mode)&&starter===humanPlayer?'begin':'begins'}.`;save();}
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function scheduleBot():void {
  if(!botTurn()||botBusy||botError)return;
  const epoch=botEpoch;botBusy=true;
  queueMicrotask(async()=>{
    try {
      render();
      if(draft) {
        if(draft[quuxPlayer].length!==3){
          const answer=await askQuux('setup',quuxSetupPosition(draft),quuxPlayer);
          if(epoch!==botEpoch)return;
          for(const piece of decodeQuuxSetup(answer))draft=placeSetupPiece({pieces:draft!,player:quuxPlayer,starter,mode},piece).pieces;
          saveSetup();render();
        }
        await pause(450);if(epoch!==botEpoch)return;
        confirmHomeworld();
      } else {
        const answer=await askQuux('move',quuxPosition(state).text,quuxPlayer,difficulty);
        if(epoch!==botEpoch)return;
        const actions=quuxActions(state,answer); // Entire native turn must validate first.
        for(const action of actions){
          await pause(action.type==='end'?1000:650);if(epoch!==botEpoch)return;
          if(!act(action,action.type==='end'?'Quux Bot ended its turn':`Quux Bot: ${action.type}`,true))throw Error('Could not apply Quux Bot’s turn.');
        }
      }
    } catch(error){if(epoch===botEpoch){botError=(error as Error).message;notice=botError;}}
    finally {if(epoch===botEpoch){botBusy=false;render();}}
  });
}
function act(action:Action,label:string,fromBot=false):boolean {
  if(!fromBot&&locked())return false;
  if(!fromBot&&action.type==='end'&&!history.length){notice='Make a valid action before ending your turn.';render();return false;}
  try {
    const visual=beforeAction(state,action);
    const next=applyAction(state,action);
    if(['end','resign','draw'].includes(action.type)) history=[];
    else history.push({state,log:[...log],actionCount:session.actions.length,layout:mapLayout});
    log.push(`Turn ${state.turn} · Player ${state.player+1}: ${label}`);
    const discovered=action.type==='discover'?`system-${state.nextSystem}`:null;
    mapLayout=layoutAfter(mapLayout,state,action,next);
    session.actions.push(action);state=next;notice=label;
    if(discovered)selected=discovered;
    source=null;intent='build';
    if(action.type==='end') selected=state.player===0?'north':'south';
    if(!state.systems.some(s=>s.id===selected)) selected=state.systems[0]?.id??'';
    // A browser reload retries an unfinished bot turn from its saved turn boundary.
    if(!fromBot||action.type==='end')save();render();animateAction(visual,state,action,fromBot?1.8:1);
    return true;
  } catch(error) {notice=(error as Error).message;render();return false;}
}
function chooseBank(piece:Piece):void {
  if(locked())return;
  try {
    if(draft) {
      draft=placeSetupPiece({pieces:draft,player:setupPlayer},piece).pieces;
      saveSetup();
      render();return;
    }
    const action=bankAction(state,selected,piece,source,intent);
    act(action,action.type==='discover'?'Discovered a new star system':`${action.type==='trade'?'Traded for':'Built'} ${piece.color} ${piece.size}`);
  } catch(error) {notice=(error as Error).message;render();}
}
async function requestCoach(kind:'hint'|'review'):Promise<void> {
  if(mode!=='practice'||draft||locked()||state.outcome!=='playing'||state.player!==humanPlayer||(kind==='review'&&!history.length))return;
  const start=history[0]?.state??state;
  const actions=history.length?session.actions.slice(history[0].actionCount):[];
  const epoch=++coachEpoch;
  coachView={kind,start,staged:state,actions};coachBusy=true;source=null;render();
  try {
    const response=await askQuux('coach',coachRequest(start,kind==='review'?state:undefined),humanPlayer);
    if(epoch!==coachEpoch)return;
    const analysis=decodeAnalysis(response);
    bestTurn(start,analysis); // Validate the full recommendation against our rules.
    if(kind==='review'&&!analysis.candidate)throw Error('Quux did not return a move review.');
    coachView={kind,start,staged:state,actions,analysis};
  } catch(error) {
    if(epoch!==coachEpoch)return;
    coachView={kind,start,staged:state,actions,error:`Could not finish the analysis. ${(error as Error).message.replace('Retry its turn or start a new game.','Close this window and try again.')}`};
  } finally {if(epoch===coachEpoch){coachBusy=false;render();}}
}
function coachDialog():string {
  if(!coachView)return '';
  const {kind,start,staged,actions,analysis,error}=coachView;
  const paragraphs=(lines:string[])=>lines.map(line=>`<p>${escape(line)}</p>`).join('');
  const steps=(lines:string[])=>`<ol class="coach-steps">${lines.map(line=>`<li>${escape(line)}</li>`).join('')}</ol>`;
  let body='';
  if(coachBusy)body='<p class="coach-thinking" role="status">Quux is checking complete turns and immediate winning replies…</p>';
  else if(error)body=`<p role="alert">${escape(error)}</p><button id="coach-retry">Try again</button>`;
  else if(analysis) {
    const recommended=bestTurn(start,analysis);
    const hint=kind==='hint',review=hint?analysis.best:analysis.candidate!;
    const chosen=hint?recommended:[...actions,{type:'end'}as Action];
    const projected=chosen.reduce(applyAction,start);
    if(hint)body+=`<p>${actions.length?'This is Quux’s best complete turn from before your staged actions. Undo those actions to follow this line.':'Quux’s preferred complete turn for your current position.'}</p>${recommended.length===1?'<p>Quux recommends passing. This board requires an action before End turn, so you cannot play that recommendation directly.</p>':''}`;
    else {
      const rating=moveRating(analysis.best,review,humanPlayer);
      body+=`<div class="coach-rating ${rating<=3?'danger':rating>=8?'strong':''}"><strong>${rating}<small>/10</small></strong><span>${rating===10?'Excellent by Quux’s evaluation':rating>=8?'Strong turn':rating>=5?'Room to improve':rating>=3?'A costly turn':'Serious danger'}</span></div><p>This rates your staged turn as if you pressed End turn now.${staged.allowance.remaining>0?` You still have ${staged.allowance.remaining} action${staged.allowance.remaining===1?'':'s'} available.`:''}</p>`;
      if(analysis.best.outcome===humanPlayer&&review.outcome!==humanPlayer)body+='<p>Quux found a turn that wins immediately. Your staged turn misses that win.</p>';
    }
    body+=steps(describeTurn(start,chosen));
    body+=`<h3>${hint?'The idea':'What this does'}</h3>${paragraphs(explainTurn(start,chosen,review))}`;
    if(review.losesNext)body+=`<details><summary>Opponent’s winning reply</summary>${steps(describeReply(projected,review))}</details>`;
    if(!hint)body+='<button id="coach-alternative">Show Quux’s best turn</button>';
    body+=`<details class="coach-method"><summary>About this analysis</summary><p>The original Quux engine chooses the hint. The rating compares its position score with your turn and checks immediate wins, losses, and winning replies. It is a 1–10 practice scale, not a win probability or a proof of best play.</p><p>The explanation describes changes on the board and verified threats. It does not claim to reveal Quux’s internal reasoning or a guaranteed long-term plan.</p><p>Quux score for its turn ${analysis.best.score}${analysis.candidate?`. Quux score for your turn ${analysis.candidate.score}`:''}. Higher is better for you.</p></details>`;
  }
  return `<dialog id="coach-dialog" aria-labelledby="coach-title"><p class="result-eyebrow">QUUX PRACTICE</p><h2 id="coach-title">${kind==='hint'?'Best turn':'Move review'}</h2>${body}<button id="coach-close">${coachBusy?'Cancel analysis':'Back to board'}</button></dialog>`;
}
function difficultyControl(id:string,disabled=false):string {
  return `<div class="difficulty-control"><label for="${id}">Quux difficulty <output data-difficulty-label>${difficulty} / 10 · ${difficultyLabel(difficulty)}</output></label><input id="${id}" data-difficulty type="range" min="1" max="10" step="1" value="${difficulty}" ${disabled?'disabled':''}><div class="difficulty-ends"><span>Learning</span><span>Full strength</span></div></div>`;
}
function openLearning(launch:boolean):void {
  if(!launch&&locked())return;
  document.querySelector<HTMLDialogElement>('#game-menu')?.close();
  learningFlow={screen:launch?'choice':'walkthrough',index:0,after:false,launch};render();
}
function finishLearning():void {
  const launch=learningFlow?.launch;learningFlow=null;
  if(launch)beginSetup('learning');else render();
}
function changeLesson(direction:number):void {
  if(!learningFlow||learningFlow.screen!=='walkthrough')return;
  const index=learningFlow.index+direction;
  if(index<0||index>=lessons.length)return;
  learningFlow={...learningFlow,index,after:false};render();
}
function learningDialog():string {
  if(!learningFlow)return '';
  if(learningFlow.screen==='choice')return `<dialog id="learning-dialog" class="learning-dialog" aria-labelledby="learning-title"><p class="result-eyebrow">LEARNING MODE</p><h2 id="learning-title">Learn the rules first?</h2><p>Take a visual walkthrough using the same stars and ships you will play with. Go at your own pace with Next and Back.</p><div class="lesson-choice-pieces" aria-hidden="true">${pyramid({color:'blue',size:3},true)}${pyramid({color:'green',size:3},false,1)}${pyramid({color:'yellow',size:2},false,1)}</div><div class="lesson-choice-buttons"><button id="walkthrough-yes" class="primary">Show walkthrough</button><button id="walkthrough-no">Skip walkthrough</button></div><p>Either choice starts a game against an easy Quux Bot at level 1, with legal choices highlighted.</p><button id="learning-close">Back to modes</button></dialog>`;
  const {index,after,launch}=learningFlow,lesson=lessons[index];
  return `<dialog id="learning-dialog" class="learning-dialog walkthrough" aria-labelledby="learning-title"><header class="lesson-header"><span>LEARNING MODE</span><span>Lesson ${index+1} of ${lessons.length}</span></header><div class="lesson-progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin="1" aria-valuemax="${lessons.length}" aria-valuenow="${index+1}"><i style="width:${(index+1)/lessons.length*100}%"></i></div><h2 id="learning-title" tabindex="-1">${lesson.title}</h2>${lessonVisual(lesson,after)}${lesson.example?.actions.length?`<button id="lesson-example" class="lesson-example-button">${after?'↶ Reset example':'▶ Show move'}</button>`:''}<div class="lesson-copy">${lesson.text.map(t=>`<p>${t}</p>`).join('')}<p class="lesson-tip">${lesson.tip}</p></div><footer class="lesson-navigation"><button id="lesson-back" aria-label="Previous lesson" ${index===0?'disabled':''}>← Back</button>${index===lessons.length-1?`<button id="lesson-finish" class="primary">${launch?'Start learning game':'Return to game'}</button>`:'<button id="lesson-next" aria-label="Next lesson" class="primary">Next →</button>'}</footer><button id="learning-close" class="lesson-exit">${launch?'Skip to game':'Back to game'}</button></dialog>`;
}
function mentorLines() {
  if(!mentor?.analysis)return [];
  return mentor.analysis.choices.flatMap((choice,index)=>{
    const remaining=remainingPlan(mentor!.start,choice.actions,state);
    return remaining?[{...choice,index,remaining}]:[];
  });
}
function mentorStep() {
  const win=winningConfirmation(state,history.length>0);if(win)return win;
  const lines=mentorLines(),line=lines.find(l=>l.index===mentor?.selected)??lines[0];
  const baseline=mentor?.analysis?.baseline;
  if(history.length&&baseline&&!baseline.losesNext&&baseline.outcome!==1-humanPlayer&&(!line||baseline.score-line.review.score>24))return {text:'Quux found a stronger turn before your staged actions. Consider Undo to try it instead of confirming this line.',selector:'#undo'};
  return line?nextClick(state,line.remaining,selected,source,intent):null;
}
function scheduleMentor():void {
  if(mode!=='learning'||draft||locked()||state.outcome!=='playing'||state.player!==humanPlayer) {
    if(mentor)clearMentor();return;
  }
  const start=history[0]?.state??state,turnKey=JSON.stringify(start),positionKey=JSON.stringify(state);
  if(mentor?.turnKey===turnKey&&(mentor.positionKey===positionKey||mentorLines().length))return;
  mentorClient.stop();const epoch=++mentorEpoch;
  mentor={start,turnKey,positionKey,busy:true,selected:0};
  const current=state;
  const delay=history.length?450:0;
  queueMicrotask(async()=>{
    if(delay)await pause(delay);
    if(epoch!==mentorEpoch)return;
    render();
    try {
      const text=await mentorClient.ask('guide',guideRequest(start,current),humanPlayer);
      if(epoch!==mentorEpoch)return;
      mentor={start,turnKey,positionKey,busy:false,selected:0,analysis:decodeGuide(start,current,text)};
    }catch(error) {
      if(epoch!==mentorEpoch)return;
      mentor={start,turnKey,positionKey,busy:false,selected:0,error:(error as Error).message};
    }
    render();
  });
}
function mentorDialog():string {
  if(!mentorDetails||mode!=='learning'||draft)return '';
  if(winningConfirmation(state,history.length>0))return `<dialog id="mentor-dialog" aria-labelledby="mentor-title"><p class="result-eyebrow">LEARNING ADVICE</p><h2 id="mentor-title">Your staged turn wins</h2><p>The rules confirm that your opponent is eliminated and your homeworld survives. You do not need any more actions. Go back to the board and press End turn to confirm your victory.</p><button id="close-mentor">Back to board</button></dialog>`;
  const lines=mentorLines();
  return `<dialog id="mentor-dialog" aria-labelledby="mentor-title"><p class="result-eyebrow">LEARNING ADVICE</p><h2 id="mentor-title">Suggested turn and alternatives</h2><p>Gold marks the next click in your chosen line. Other outlines only mean legal. Advice uses full-strength Quux, even against the easy bot.</p>${lines.map((line,i)=>{
    const explanation=explainPlan(mentor!.start,line.actions,line.review);
    return `<article class="mentor-line"><h3>${mentorStep()?.selector==='#undo'?'Your staged line':i===0?'Quux’s suggestion':'Reasonable alternative '+i}</h3>${mentorStep()?.selector==='#undo'?'<p class="mentor-risk">Quux preferred a stronger turn before these actions. Consider Undo to return to that choice.</p>':''}<ol>${planSteps(state,line.remaining).map(s=>`<li>${escape(s)}</li>`).join('')}</ol><h4>Why consider it</h4>${explanation.benefits.length?explanation.benefits.map(s=>`<p>${escape(s)}</p>`).join(''):'<p>This completes the line you have already staged.</p>'}${explanation.risks.length?`<h4>Watch out for</h4>${explanation.risks.map(s=>`<p class="mentor-risk">${escape(s)}</p>`).join('')}`:'<p>No immediate winning reply was found for your opponent after this complete line.</p>'}<button data-follow-line="${line.index}">Guide this line</button></article>`;
  }).join('')}${lines.length===1?'<p>No similar-strength alternative was found among the checked lines.</p>':''}${!lines.length?'<p>No immediate-loss-free continuation was found for your staged position. Try Undo or review your homeworld before confirming. This does not prove that no better move exists.</p>':''}${history.length&&mentor?.analysis?.baseline&&!mentor.analysis.baseline.losesNext?`<details><summary>Quux’s original suggestion before your staged actions</summary><ol>${describeTurn(mentor.start,quuxActions(mentor.start,mentor.analysis.baselineMove)).map(s=>`<li>${escape(s)}</li>`).join('')}</ol><p>Undo your staged actions to follow this different line.</p></details>`:''}<p class="mentor-footnote">Recommendations compare complete turns using Quux’s evaluation and immediate winning-reply checks. They are useful guidance, not a guarantee of best play. You choose and perform every action.</p><button id="close-mentor">Back to board</button></dialog>`;
}
function catastropheDialog():string {
  if(!catastrophePreview)return '';
  const impact=catastropheImpact(state,catastrophePreview);
  return `<dialog id="catastrophe-preview" aria-labelledby="catastrophe-title"><p class="result-eyebrow">OPTIONAL CATASTROPHE</p><h2 id="catastrophe-title">Before you destroy these pieces</h2><p>A catastrophe is available, but that does not make it a good move. It will remove ${impact.own} of your ships, ${impact.enemy} enemy ships, and ${impact.stars} star${impact.stars===1?'':'s'} at ${escape(impact.before.name)}.</p><div class="catastrophe-comparison"><div><h3>Before</h3>${lessonSystem(impact.before)}</div><div><h3>After</h3>${lessonSystem(impact.system)}</div></div>${impact.wholeSystem?'<p>The last star is destroyed, so every ship in this system is destroyed, even other colors.</p>':'<p>A star survives. Any ships of other colors are spared.</p>'}${impact.loses?'<p class="mentor-risk">Ending your turn after this would lose your homeworld. Undo or restore a ship before confirming.</p>':''}${impact.draws?'<p class="mentor-risk">Ending here would eliminate both players and draw the game.</p>':''}${impact.own>0&&impact.enemy===0?'<p class="mentor-risk">This destroys your ships without removing an enemy ship. Consider keeping the pieces.</p>':''}<button id="keep-pieces" class="primary">Keep pieces</button><button id="confirm-catastrophe">Trigger catastrophe</button></dialog>`;
}
function learningCue():string {
  if(mode!=='learning'||choosingMode||introStartedAt!==null)return '';
  let text='';
  const next=draft?nextRecommendedPiece({pieces:draft,player:setupPlayer}):undefined;
  if(draft)text=botTurn()?'Quux is choosing its homeworld.':startingWarnings({pieces:draft,player:setupPlayer})[0]??(draft[setupPlayer].length===3?'Your homeworld is ready. Press End turn to confirm.':draft[setupPlayer].length===2?`Choose a large ship.${next?' ★ marks the recommended green ship.':''}`:`Choose star ${draft[setupPlayer].length+1}.${next?' ★ marks a recommended bank piece.':''}`);
  else if(state.outcome!=='playing')text='Game finished. Start another learning game whenever you are ready.';
  else if(botTurn())text='Watch Quux’s turn. Your legal choices will light up when it is your turn.';
  else if(applyAction(state,{type:'end'}).outcome===(1-humanPlayer))text='Your homeworld is empty or destroyed. Undo or restore a ship before End turn to avoid losing.';
  else {
    const step=mentorStep();
    const prefix=state.allowance.remaining===0?'Your action is complete. ':'';
    text=prefix+(step?.text??(mentor?.busy?'Checking good moves. Other outlines show legal options only.':mentor?.error?'Advice unavailable. Outlines show legal options only.':'No safe continuation found in the checked lines. Consider Undo before ending.'));
  }
  const line=mentorLines().find(l=>l.index===mentor?.selected)??mentorLines()[0];
  const explanation=!draft&&line&&mentor?explainPlan(mentor.start,line.actions,line.review):null;
  const idea=mentorStep()?.selector==='#undo'?explanation?.risks[0]:explanation?.benefits[0];
  return `<section class="learning-cue" aria-label="Learning help"><span>${draft?'STARTING HELP':'MOVE ADVICE · GOLD = SUGGESTED'}</span><p role="status">${text}</p>${idea?`<p class="mentor-summary">${escape(idea)}</p>`:''}${draft&&!botTurn()?'<button id="starting-tips">Starting tips</button>':''}${!draft&&!botTurn()&&state.outcome==='playing'?`<button id="explain-moves" ${mentor?.busy?'disabled':''}>Why / alternatives</button>${!mentor?.busy&&(mentor?.error||!mentorLines().length)?'<button id="retry-advice">Retry advice</button>':''}`:''}</section>`;
}
function startingTipsDialog():string {
  if(mode!=='learning'||!draft)return '';
  const progress={pieces:draft,player:setupPlayer,starter,mode},preferred=recommendedStart(progress),warnings=startingWarnings(progress);
  return `<dialog id="starting-guide" aria-labelledby="starting-title"><p class="result-eyebrow">A GOOD FIRST HOMEWORLD</p><h2 id="starting-title">Recommended starts</h2><p>Start with a large green ship and two differently sized stars. Blue lets you trade into other colors. Red gives your homeworld capture power. Yellow gives travel power.</p>${warnings.length?`<div class="starting-warnings"><strong>About your current choices</strong>${warnings.map(w=>`<p>${w}</p>`).join('')}</div>`:''}<div class="starting-cards">${startingRecommendations.map(r=>{
    let available=true;try {useStartingRecommendation(progress,r.id);}catch{available=false;}
    return `<article class="starting-card"><h3>${r.name}${preferred?.id===r.id?'<span>Suggested for you</span>':''}</h3><div class="starting-pieces" aria-label="${r.pieces[0].color} star ${r.pieces[0].size}, ${r.pieces[1].color} star ${r.pieces[1].size}, large green ship">${r.pieces.map((p,i)=>pyramid(p,i<2,i<2?-1:humanPlayer)).join('')}</div><p>${r.summary}</p><small>Connects to size-${r.connection} stars</small><button data-starting-preset="${r.id}" ${!available||locked()?'disabled':''}>${available?'Use '+r.name:'Pieces unavailable'}</button></article>`;
  }).join('')}</div><p>Green builds your fleet. With a red-and-blue start, you can later trade a ship for yellow to gain travel. Build a second ship before sending your only home ship away.</p><p class="starting-note">These are beginner-friendly choices based on Rules13, pp. 4 and 20–22. There is no single proven best start. Same-size stars or matching your opponent’s size pair can create a cramped map.</p><p>Choosing one replaces only your unconfirmed pieces. You can still change them and must press End turn to confirm.</p><button id="close-starting-guide">Back to choosing pieces</button></dialog>`;
}
function starfield():string {
  let seed=93;
  return Array.from({length:160},(_,i)=>{seed=(seed*16807)%2147483647;const x=seed%10000/100;seed=(seed*16807)%2147483647;const y=seed%10000/100;return `<i style="left:${x}%;top:${y}%;--light:${i%9===0?'.9':'.35'};--radius:${i%9===0?'2':'1'}px"></i>`;}).join('');
}
function playerPlate(player:Player,phase:IntroPhase|null):string {
  const over=state.outcome!=='playing'&&!draft;
  const active=phase?phase==='revealed'&&starter===player:draft?setupPlayer===player:over?state.outcome===player:state.player===player;
  let detail='';
  if(phase)detail=phase==='revealed'&&active?'GOES FIRST':'';
  else if(over)detail=state.outcome==='draw'?'DRAW':state.outcome===player?'WINNER':'GAME OVER';
  else if(draft&&active)detail=botTurn()?'Choosing homeworld…':draft[player].length===3?'Confirm with End turn':draft[player].length===2?'Choose a large ship':`Choose star ${draft[player].length+1}`;
  else if(active&&botTurn())detail=botError?'Waiting to retry':'Thinking…';
  const allowance=!phase&&!draft&&!over&&active?`<span class="player-allowance">${state.allowance.remaining} ${state.allowance.sacrificed?state.allowance.color+' ':''}action${state.allowance.remaining===1?'':'s'}</span>`:'';
  return `<div class="player-nameplate ${player===0?'north':'south'} ${active?'is-active':''} ${phase==='names'?'arriving':''}" data-player-name="${player}" aria-label="${player===0?'North':'South'} player"><small>${player===0?'NORTH':'SOUTH'}</small><strong>${playerName(player)}</strong>${detail?`<span class="player-detail">${detail}</span>`:''}${allowance}</div>`;
}
function coinIntro(phase:IntroPhase|null):string {
  if(!phase||phase==='complete'||introStartedAt===null)return '';
  const revealed=phase==='revealed',elapsed=Math.max(0,Date.now()-introStartedAt-nameEntranceMs);
  const icon='<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 39 25 59 32 39 39 32 59 25 39 5 32 25 25Z"/><circle cx="32" cy="32" r="7"/></svg>';
  return `<section class="coin-intro ${phase}" aria-label="Starting-player coin toss" aria-live="polite" style="--coin-finish:${2160+starter*180}deg;--flip-delay:-${elapsed}ms;--flip-duration:${coinRevealMs-nameEntranceMs}ms"><div class="coin-presentation"><p class="coin-eyebrow">FIRST CONTACT</p><div class="coin-stage" aria-hidden="true"><div class="coin-halo"></div><div class="coin-disc"><div class="coin-face coin-north">${icon}<span>${playerName(0)}</span></div><div class="coin-face coin-south">${icon}<span>${playerName(1)}</span></div></div><div class="coin-shadow"></div></div><h2 class="coin-title">${revealed?`${playerName(starter)} ${isBotMode(mode)&&starter===humanPlayer?'go':'goes'} first`:'Flipping for first turn'}</h2><p class="coin-caption">${revealed?'Choose a homeworld. Then command the galaxy.':'Let the universe decide.'}</p></div></section>`;
}
let lastNotice='',noticeUntil=0,noticeTimer:ReturnType<typeof setTimeout>|undefined;
function boardNotice():string {
  if(choosingMode||introStartedAt!==null)return '';
  if(notice!==lastNotice){lastNotice=notice;noticeUntil=Date.now()+4500;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{if(notice===lastNotice)notice='';lastNotice='';document.querySelector('#notice')?.replaceChildren();},4500);}
  return !choosingMode&&introStartedAt===null&&Date.now()<noticeUntil?escape(notice):'';
}
function render():void {
  const openDialog=document.querySelector<HTMLDialogElement>('dialog[open]')?.id;
  const over=state.outcome!=='playing';
  const inputLocked=locked();
  const phase=introStartedAt===null?null:introPhase(introStartedAt,Date.now());
  const teaching=mode==='learning';
  const guide=teaching&&!draft&&!over&&!inputLocked?learningOptions(state,source):null;
  const suggested=teaching&&draft&&!inputLocked?nextRecommendedPiece({pieces:draft,player:setupPlayer}):undefined;
  const systems=draft?draft.flatMap((p,i)=>p.length?[{id:i===0?'north':'south',name:i===0?'North homeworld':'South homeworld',homeworld:i,stars:p.slice(0,2),ships:p[2]?[{...p[2],owner:i}]:[]}]:[]):state.systems;
  const bank=draft?setupBank(draft):state.bank;
  const status=phase?'Choosing first player':draft?`${playerName(setupPlayer)} · Setup`:over?state.outcome==='draw'?'Game over · Draw':isBotMode(mode)&&state.outcome===humanPlayer?'You win':`${playerName(Number(state.outcome))} wins`:`Turn ${state.turn} · ${playerName(state.player)}`;
  const catastrophes=draft||over?[]:state.systems.flatMap(s=>colors.flatMap(color=>{const count=[...s.stars,...s.ships].filter(p=>p.color===color).length;return count>=4?[{system:s.id,name:s.name,color,count}]:[];}));
  const {minColumn,columns}=layoutBounds(mapLayout);
  const slotStyle=(id:string)=>{const slot=mapLayout.slots[id];return `grid-row:${slot.row+1};grid-column:${id==='north'||id==='south'?'1 / -1':slot.column-minColumn+1}`;};
  const actionMenu=source&&!inputLocked?`<div class="ship-actions context-actions" aria-label="Selected ship actions"><button data-intent="trade" ${intent==='trade'?'class="active"':''} ${teaching&&!guide?.trade?'disabled':''}>Trade</button><button data-intent="discover" ${intent==='discover'?'class="active"':''} ${teaching&&!guide?.travel?'disabled':''}>Travel</button><button id="sacrifice" ${legal(state,{type:'sacrifice',...source})?'':'disabled'}>Sacrifice</button><button id="clear">Cancel</button></div>`:'';
  const controls=`<section class="rail-controls" aria-label="Turn controls"><div class="status ${!phase&&(draft?setupPlayer:state.player)===1?'south-turn':''}">${status}</div><nav><button id="undo" aria-label="Undo action" ${inputLocked||(draft?!draft[setupPlayer].length:!history.length)?'disabled':''}>↶ Undo</button><button id="end" aria-label="End turn" class="primary" ${inputLocked||(draft?draft[setupPlayer].length!==3:over||!history.length)?'disabled':''}>End turn →</button><button id="menu" aria-label="Game menu">☰</button></nav>${mode==='practice'?`<div class="coach-controls"><button id="hint" ${inputLocked||draft||over?'disabled':''}>Hint</button><button id="evaluate" ${inputLocked||draft||over||!history.length?'disabled':''}>Evaluate move</button></div>`:''}</section>`;
  app.innerHTML=`<main class="tabletop ${teaching?'learning-mode':''}"><div class="play-area"><section class="board-region" aria-label="Game board"><section class="space" id="space" aria-label="Space playing surface"><div class="starfield" aria-hidden="true">${starfield()}</div><div class="map-label">SECTOR 01 <span>LOCAL EXPLORATION</span></div><div id="universe" class="universe" style="--map-columns:${columns}">
  ${['north','south'].filter(id=>!systems.some(s=>s.id===id)).map(id=>`<div class="layout-anchor" data-layout-anchor="${id}" style="${slotStyle(id)}" aria-hidden="true"></div>`).join('')}
  ${systems.map(s=>{
    const slot=mapLayout.slots[s.id];
    const destination=source&&source.system!==s.id&&legal(state,{type:'move',...source,destination:s.id});
    return `<article class="system ${selected===s.id?'selected':''} ${destination?'destination':''} ${guide?.buildSystems.has(s.id)?'learn-build-system':''}" data-system="${s.id}" data-map-row="${slot.row}" data-map-column="${slot.column}" style="${slotStyle(s.id)}" aria-label="${s.name}"><div class="system-title"><button data-select="${s.id}" aria-label="Select ${s.name}">${s.homeworld===undefined?'✧':'⌂'} ${s.name}</button></div><div class="system-pieces"><div class="stars">${s.stars.map((p,j)=>`<button class="piece-button" data-star="${s.id}" aria-label="${s.name} ${p.color} star ${p.size}">${pyramid(p,true)}<span class="piece-caption">${j===0?'':' '}</span></button>`).join('')||'<span class="destroyed">No stars</span>'}</div><div class="fleets">${[0,1].map(owner=>`<div class="fleet" data-player="${owner}" aria-label="Player ${owner+1} fleet">${s.ships.map((p,j)=>{
      if(p.owner!==owner)return '';
      const key=shipKey(s.id,j),canSelect=guide?.ships.has(key),canCapture=guide?.captures.has(key);
      return `<button class="piece-button ${source?.system===s.id&&source.ship===j?'picked':''} ${canSelect||canCapture?'learn-option':''} ${canCapture?'learn-capture':''}" data-ship="${j}" data-source="${s.id}" ${canSelect||canCapture?'data-legal-option="'+(canCapture?'capture':'select')+'"':''} ${teaching&&!canSelect&&!canCapture?'disabled':''} aria-label="Player ${owner+1} ${p.color} ship ${p.size} at ${s.name}" ${canSelect||canCapture?'aria-description="'+(canCapture?'Legal capture. Click to take this ship.':'Legal actions available. Click to choose one.')+'"':''}>${pyramid(p,false,owner)}</button>`;
    }).join('')}</div>`).join('')}</div></div><div class="system-meta">${s.homeworld===undefined?'FRONTIER':`PLAYER ${s.homeworld+1} HOMEWORLD`}${destination?'<span>MOVE HERE ↗</span>':guide?.buildSystems.has(s.id)&&!source?'<span class="learn-build-label">BUILD HERE +</span>':''}</div>${catastrophes.filter(c=>c.system===s.id).map(c=>`<button class="system-catastrophe ${teaching?'optional-catastrophe':''}" data-cat="${c.color}" data-cat-system="${c.system}" aria-label="${c.color} catastrophe at ${c.name}" ${inputLocked?'disabled':''}>${teaching?'Optional · ':'✹ '}${c.color} catastrophe · ${c.count}</button>`).join('')}</article>`;
  }).join('')}
  </div></section><div class="board-overlay">${actionMenu}${!choosingMode?playerPlate(0,phase)+playerPlate(1,phase):''}<p id="notice" class="board-notice" role="status" aria-live="polite">${boardNotice()}</p>${botError?'<button id="retry-bot" class="board-retry">Retry Quux Bot</button>':''}${coinIntro(phase)}</div></section>
  <aside class="sidebar" aria-label="Game sidebar">${controls}${learningCue()}<section class="bank" aria-label="Piece bank"><div class="bank-heading"><h2>THE BANK</h2><span>${bank.length} PIECES</span></div><p>Click a pyramid to bring it into play.</p>${colors.map(color=>`<div class="bank-color ${color}"><h3>${color}<span>${{red:'CAPTURE',yellow:'MOVE',green:'BUILD',blue:'TRADE'}[color]}</span></h3><div class="bank-row">${sizes.map(size=>{
    const p={color,size},count=bank.filter(b=>b.color===color&&b.size===size).length;
    const recommended=suggested?.color===color&&suggested.size===size;
    let available=false;try {available=!inputLocked&&(draft?!!placeSetupPiece({pieces:draft,player:setupPlayer},p):legal(state,bankAction(state,selected,p,source,intent)));} catch { /* Not a legal bank choice. */ }
    return `<button class="bank-piece ${available?'available':''} ${teaching&&available?'learn-option':''} ${recommended?'recommended':''}" ${recommended?'data-recommended="true"':''} data-color="${color}" data-size="${size}" aria-label="Bank ${color} ${size}" ${teaching&&available?`data-legal-option="bank" aria-description="Legal bank choice for your current action.${recommended?' Recommended next piece.':''}"`:''} ${inputLocked||!count||teaching&&!available||(draft?draft[setupPlayer].length===3:over)?'disabled':''} title="${color} size ${size}: ${count} available">${pyramid(p)}<span>×${count}</span>${recommended?'<span class="recommended-mark" aria-label="Recommended next piece">★</span>':''}</button>`;
  }).join('')}</div></div>`).join('')}</section>
  </aside></div>
  ${catastropheDialog()}${mentorDialog()}${startingTipsDialog()}${learningDialog()}${coachDialog()}<dialog id="result" aria-labelledby="result-title"><p class="result-eyebrow">GAME OVER</p><h2 id="result-title">${over?status:''}</h2><p>${over?outcomeText():''}</p><button id="result-new" class="primary">New game</button><button id="result-close">View final board</button></dialog>
  <dialog id="game-menu"><h2>Mission control</h2>${isBotMode(mode)&&!choosingMode?difficultyControl('game-difficulty',botBusy):''}<div class="menu-buttons"><button id="reset">New game</button>${draft&&resumeSession&&!choosingMode?'<button id="resume">Resume saved game</button>':''}<button id="help">How to play</button>${teaching?`<button id="learn-rules" ${inputLocked?'disabled':''}>Rules walkthrough</button>`:''}<button id="export" ${draft||botBusy?'disabled':''}>Export save</button><button id="import">Import save</button><button id="resign" ${over||draft||inputLocked?'disabled':''}>Resign</button><button id="draw" ${over||draft||isBotMode(mode)?'disabled':''}>Agree draw</button><button id="close-menu">Back to space</button></div><input type="file" id="save-file" accept=".json,application/json" hidden><details><summary>Flight log (${log.length})</summary><ol>${log.map(l=>`<li>${escape(l)}</li>`).join('')}</ol></details><p>Your game saves automatically on this device.</p></dialog>
  <dialog id="opponent-picker" aria-labelledby="opponent-title"><p class="result-eyebrow">A NEW EXPEDITION</p><h2 id="opponent-title">Choose your opponent</h2><p>Explore the galaxy with another person, or challenge Quux Bot.</p>${difficultyControl('new-difficulty')}<div class="opponent-options"><button id="play-local" aria-label="Another player"><strong>Another player</strong><span>Two people on this device</span></button><button id="play-quux" aria-label="Quux Bot"><strong>Quux Bot</strong><span>You command South. The bot commands North.</span></button><button id="play-practice" aria-label="Quux practice"><strong>Quux practice</strong><span>Play Quux Bot with hints, move ratings, and explanations.</span></button><button id="play-learning" aria-label="Learning mode"><strong>Learning mode</strong><span>Optional visual rules tour, legal-move highlights, and an easy bot.</span></button></div><p class="coin-note">A coin flip chooses who sets up and takes the first turn.</p>${resumeSession&&choosingMode?'<button id="resume">Resume saved game</button>':''}</dialog>
  <dialog id="rules"><h2>Your fleet. Your universe.</h2><p><b>Build:</b> click a system, then the smallest available bank piece of a color you already own there. You need green power.</p><p><b>Travel:</b> click your ship, then a connected system. Systems connect when their stars share no sizes. You need yellow power.</p><p><b>Trade:</b> click your ship, then Trade, then a different bank color of exactly the same size. You need blue power.</p><p><b>Discover a new star:</b> click your ship, Travel, a bank pyramid for the new star. It appears automatically in its star-size row. You need yellow power.</p><p><b>Capture:</b> click an enemy ship. You need red power and an equal or larger ship in that system.</p><p><b>Sacrifice:</b> click your ship, then Sacrifice. Instead of a basic action, gain its pip count in actions of its color anywhere you still have ships.</p><p><b>Catastrophe:</b> whenever any system has four or more pieces of one color, its catastrophe button appears on that system, even if you have no ships there. Count stars and both fleets. The active player may choose to remove that color. If the last star is removed, every ship there is destroyed; a surviving binary-star half protects other colors. Optional and free at any point in your turn.</p><p>Power comes from stars or your own local ships, never enemy ships. Confirm with End turn. An empty or destroyed homeworld loses at turn end. Undo works until you confirm. Systems have fixed positions. Same-size stars share a horizontal row; travel still depends on star sizes, not physical distance.</p><p>Based on Homeworlds Rules13, pp. 4–12. Game: John Cooper. Pyramid system: Andrew Looney. Unofficial implementation.</p><p>Quux Bot: original engine by Arthur O’Dwyer. <a href="./quux-LICENSE.txt" target="_blank" rel="noopener">License</a> · <a href="https://github.com/Quuxplusone/Homeworlds" target="_blank" rel="noopener">Engine source</a>.</p><button id="close-rules">Back to space</button></dialog></main>`;
  bindBoard();bindTools();
  document.querySelector('#play-local')!.addEventListener('click',()=>beginSetup('local'));
  document.querySelector('#play-quux')!.addEventListener('click',()=>beginSetup('quux'));
  document.querySelector('#play-practice')!.addEventListener('click',()=>beginSetup('practice'));
  document.querySelector('#explain-moves')?.addEventListener('click',()=>{mentorDetails=true;render();});
  document.querySelector('#close-mentor')?.addEventListener('click',()=>{document.querySelector<HTMLDialogElement>('#mentor-dialog')!.close();mentorDetails=false;render();});
  document.querySelector('#mentor-dialog')?.addEventListener('cancel',()=>{mentorDetails=false;});
  document.querySelector('#retry-advice')?.addEventListener('click',()=>{if(mentor)mentor.positionKey='';render();});
  document.querySelectorAll<HTMLElement>('[data-follow-line]').forEach(button=>button.addEventListener('click',()=>{
    if(mentor)mentor.selected=Number(button.dataset.followLine);
    document.querySelector<HTMLDialogElement>('#mentor-dialog')!.close();mentorDetails=false;render();
  }));
  const keepPieces=()=>{document.querySelector<HTMLDialogElement>('#catastrophe-preview')?.close();catastrophePreview=null;render();};
  document.querySelector('#keep-pieces')?.addEventListener('click',keepPieces);
  document.querySelector('#catastrophe-preview')?.addEventListener('cancel',event=>{event.preventDefault();keepPieces();});
  document.querySelector('#confirm-catastrophe')?.addEventListener('click',()=>{
    const action=catastrophePreview;document.querySelector<HTMLDialogElement>('#catastrophe-preview')!.close();catastrophePreview=null;
    if(action)act(action,`Invoked ${action.color} catastrophe`);
  });
  document.querySelector('#starting-tips')?.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#starting-guide')!.showModal());
  document.querySelector('#close-starting-guide')?.addEventListener('click',()=>document.querySelector<HTMLDialogElement>('#starting-guide')!.close());
  document.querySelectorAll<HTMLElement>('[data-starting-preset]').forEach(button=>button.addEventListener('click',()=>{
    if(!draft||locked()||setupPlayer!==humanPlayer)return;
    try {
      draft=useStartingRecommendation({pieces:draft,player:setupPlayer,starter,mode},button.dataset.startingPreset!).pieces;
      document.querySelector<HTMLDialogElement>('#starting-guide')!.close();
      notice='Recommended homeworld selected. Review it, then press End turn to confirm.';saveSetup();render();
    } catch(error){notice=(error as Error).message;render();}
  }));
  document.querySelector('#play-learning')!.addEventListener('click',()=>openLearning(true));
  document.querySelector('#learn-rules')?.addEventListener('click',()=>openLearning(false));
  document.querySelector('#walkthrough-yes')?.addEventListener('click',()=>{learningFlow!.screen='walkthrough';render();});
  document.querySelector('#walkthrough-no')?.addEventListener('click',finishLearning);
  document.querySelector('#lesson-back')?.addEventListener('click',()=>changeLesson(-1));
  document.querySelector('#lesson-next')?.addEventListener('click',()=>changeLesson(1));
  document.querySelector('#lesson-finish')?.addEventListener('click',finishLearning);
  document.querySelector('#lesson-example')?.addEventListener('click',()=>{learningFlow!.after=!learningFlow!.after;render();});
  const closeLearning=()=>{if(learningFlow?.screen==='choice'){learningFlow=null;render();}else finishLearning();};
  document.querySelector('#learning-close')?.addEventListener('click',closeLearning);
  document.querySelector('#learning-dialog')?.addEventListener('cancel',event=>{event.preventDefault();closeLearning();});
  document.querySelector('#hint')?.addEventListener('click',()=>void requestCoach('hint'));
  document.querySelector('#evaluate')?.addEventListener('click',()=>void requestCoach('review'));
  const closeCoach=()=>{document.querySelector<HTMLDialogElement>('#coach-dialog')?.close();clearCoach();render();};
  document.querySelector('#coach-close')?.addEventListener('click',closeCoach);
  document.querySelector('#coach-dialog')?.addEventListener('cancel',event=>{event.preventDefault();closeCoach();});
  document.querySelector('#coach-retry')?.addEventListener('click',()=>{const kind=coachView!.kind;clearCoach();void requestCoach(kind);});
  document.querySelector('#coach-alternative')?.addEventListener('click',()=>{coachView!.kind='hint';render();});
  document.querySelectorAll<HTMLInputElement>('[data-difficulty]').forEach(input=>input.addEventListener('input',()=>{
    const level=Number(input.value);if(!validDifficulty(level))return;
    difficulty=level;
    document.querySelectorAll<HTMLInputElement>('[data-difficulty]').forEach(control=>control.value=String(level));
    document.querySelectorAll('[data-difficulty-label]').forEach(label=>label.textContent=`${level} / 10 · ${difficultyLabel(level)}`);
    if(!choosingMode){if(draft)saveSetup();else {session.difficulty=level;save();}}
  }));
  document.querySelector('#opponent-picker')!.addEventListener('cancel',event=>event.preventDefault());
  document.querySelector('#retry-bot')?.addEventListener('click',()=>{botError='';render();});
  if(catastrophePreview)document.querySelector<HTMLDialogElement>('#catastrophe-preview')!.showModal();
  else if(mentorDetails)document.querySelector<HTMLDialogElement>('#mentor-dialog')?.showModal();
  else if(learningFlow)document.querySelector<HTMLDialogElement>('#learning-dialog')!.showModal();
  else if(coachView)document.querySelector<HTMLDialogElement>('#coach-dialog')!.showModal();
  else if(choosingMode)document.querySelector<HTMLDialogElement>('#opponent-picker')!.showModal();
  else if(openDialog&&openDialog!=='opponent-picker'&&openDialog!=='learning-dialog')document.querySelector<HTMLDialogElement>('#'+openDialog)?.showModal();
  const space=document.querySelector<HTMLElement>('#space')!;
  boardResizeObserver.disconnect();boardResizeObserver.observe(space);fitBoard(space);
  const suggestedMove=mode==='learning'&&!inputLocked&&!draft?mentorStep():null;
  if(suggestedMove) {
    const target=app.querySelector<HTMLElement>(suggestedMove.selector);
    target?.classList.add('mentor-recommended');
    if(target){target.dataset.moveAdvice='recommended';target.setAttribute('aria-description',suggestedMove.text);}
  }
  scheduleBot();scheduleMentor();
  if(over&&!draft&&announcedResult!==`${state.turn}:${state.outcome}`){announcedResult=`${state.turn}:${state.outcome}`;document.querySelector<HTMLDialogElement>('#result')!.showModal();}
}
function bindBoard():void {
  const space=document.querySelector<HTMLElement>('#space')!;
  space.addEventListener('click',event=>{
    const target=event.target as Element;
    if(target.closest('.ship-actions,[data-cat]')) return;
    if(draft||locked()) return;
    const shipButton=target.closest<HTMLElement>('[data-ship]');
    if(shipButton) {
      const system=shipButton.dataset.source!,index=Number(shipButton.dataset.ship);
      const ship=state.systems.find(s=>s.id===system)!.ships[index];
      if(ship.owner!==state.player) {act({type:'capture',system,ship:index},`Captured ${ship.color} ship`);return;}
      source={system,ship:index};selected=system;intent='build';
      notice='Ship selected. Click a destination to move, or choose an action beside the ship.';render();return;
    }
    const system=target.closest<HTMLElement>('.system')?.dataset.system;
    if(system) {
      if(source&&source.system!==system&&!target.closest('[data-star]')) act({type:'move',...source,destination:system},'Moved ship');
      else {selected=system;source=null;intent='build';notice='Click a bank pyramid to build here, or select a ship.';render();}
      return;
    }
    source=null;intent='build';render();
  });
  document.querySelectorAll<HTMLElement>('[data-color]').forEach(button=>button.addEventListener('click',()=>chooseBank({color:button.dataset.color as Color,size:Number(button.dataset.size) as Size})));
  document.querySelectorAll<HTMLElement>('[data-intent]').forEach(button=>button.addEventListener('click',()=>{intent=button.dataset.intent as 'trade'|'discover';notice=intent==='trade'?'Click a different bank color of the same size.':'Click a connected system to travel there, or choose a bank star to discover one automatically.';render();}));
  document.querySelector('#clear')?.addEventListener('click',()=>{source=null;intent='build';render();});
  document.querySelector('#sacrifice')?.addEventListener('click',()=>{if(source)act({type:'sacrifice',...source},'Sacrificed ship');});
  document.querySelectorAll<HTMLElement>('[data-cat]').forEach(button=>button.addEventListener('click',()=>{
    const action:Extract<Action,{type:'catastrophe'}>={type:'catastrophe',system:button.dataset.catSystem!,color:button.dataset.cat as Color};
    if(mode==='learning'&&!locked()){catastrophePreview=action;render();}
    else act(action,`Invoked ${button.dataset.cat} catastrophe`);
  }));
  document.querySelector('#resume')?.addEventListener('click',()=>{if(resumeSession){restore(resumeSession);notice='Your saved game has been restored.';render();}});
}
function bindTools():void {
  const result=document.querySelector<HTMLDialogElement>('#result')!;
  document.querySelector('#result-close')!.addEventListener('click',()=>result.close());
  document.querySelector('#result-new')!.addEventListener('click',chooseNewGame);
  const menu=document.querySelector<HTMLDialogElement>('#game-menu')!;
  const rules=document.querySelector<HTMLDialogElement>('#rules')!;
  document.querySelector('#menu')!.addEventListener('click',()=>menu.showModal());
  document.querySelector('#close-menu')!.addEventListener('click',()=>menu.close());
  document.querySelector('#help')!.addEventListener('click',()=>{menu.close();rules.showModal();});
  document.querySelector('#close-rules')!.addEventListener('click',()=>rules.close());
  document.querySelector('#reset')!.addEventListener('click',()=>{if(draft||window.confirm('Start a new game? Export your current game first to keep a copy.'))chooseNewGame();});
  document.querySelector('#end')!.addEventListener('click',()=>{
    if(locked())return;
    if(!draft){act({type:'end'},'Ended turn');return;}
    try {
      confirmHomeworld();
      render();
    } catch(error){notice=(error as Error).message;render();}
  });
  document.querySelector('#undo')!.addEventListener('click',()=>{if(locked())return;if(draft){draft=undoSetup({pieces:draft,player:setupPlayer}).pieces;notice='Starting piece returned to the bank.';saveSetup();render();return;}const previous=history.pop();if(previous){state=previous.state;mapLayout=previous.layout;log=previous.log;session.actions.length=previous.actionCount;source=null;intent='build';notice='Action undone.';save();render();}});
  document.querySelector('#resign')!.addEventListener('click',()=>{if(window.confirm(`${playerName(state.player)}: resign and award the other player the win?`)){menu.close();act({type:'resign'},'Resigned');}});
  document.querySelector('#draw')!.addEventListener('click',()=>{if(window.confirm('Player 1: do you agree to a draw?')&&window.confirm('Player 2: do you also agree to a draw?')){menu.close();act({type:'draw'},'Both players agreed to a draw');}});
  document.querySelector('#export')!.addEventListener('click',()=>{
    menu.close();
    const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`homeworlds-turn-${state.turn}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice='Save exported.';render();
  });
  document.querySelector('#import')!.addEventListener('click',()=>document.querySelector<HTMLInputElement>('#save-file')!.click());
  document.querySelector('#save-file')!.addEventListener('change',async event=>{
    const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
    try {if(file.size>2_000_000)throw Error('Save file is too large.');const imported=decodeSession(await file.text());if(!window.confirm('Replace the current game with this imported save?'))return;menu.close();restore(imported);draft=null;notice='Saved game imported.';save();render();}
    catch(error){menu.close();notice=`Import failed: ${(error as Error).message}`;render();}
  });
}
document.addEventListener('keydown',event=>{
  if(learningFlow?.screen==='walkthrough'&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();changeLesson(event.key==='ArrowLeft'?-1:1);return;}
  if(event.key==='Escape'&&!document.querySelector('dialog[open]')){source=null;intent='build';render();}
});
if(introStartedAt!==null)advanceIntro();else render();
