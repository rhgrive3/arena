import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Eye, Flag, Hand, Layers3, LockKeyhole, Map, Maximize, Minus, MousePointer2, Move, Pause, Play, Plus, RotateCcw, Settings2, Shield, Sparkles, Star, Swords, Trash2, Trophy, Undo2, Users, Volume2, VolumeX, X } from 'lucide-react';
import type { Preferences } from '../App';
import { Engine, type EndStats, type HudState } from '../game/engine';
import { SCENES, STAGES, enemyRoster, loadCleared, saveCleared, stageLabel, unlockedThrough } from '../game/campaign';
import { DEFS, FACTIONS, MAX_PER_TEAM, type UnitKind } from '../game/units';
import { Brand, Coin, Dialog, PrimaryButton, fmtTime } from './UI';
import { UnitPortrait } from './UnitPortrait';
import { UnitEmblem } from './UnitEmblem';

export type GameRequest = { mode: 'campaign' | 'sandbox'; stage: number; unit?: UnitKind };
type Props = {
  request: GameRequest; preferences: Preferences; modalOpen: boolean;
  onPreferences: (preferences: Preferences) => void; onExit: (story: boolean) => void;
  onHelp: () => void; onSettings: () => void; onProgress: () => void;
};

const INITIAL_HUD: HudState = {
  phase: 'menu', time: 0, speed: 1, budget: [0, 0], counts: [0, 0], kills: [0, 0], losses: [0, 0],
  sel: 0, deploy: null, deployTeam: 0, faction: 'kingdom', batch: false, boxMode: false, mode: 'place',
  story: false, stageIndex: 0, sceneId: 1, stageName: '', stageHint: '', showcase: false, muted: false,
  canUndo: false, resolving: null, notice: null, quality: 'standard', fps: 60, deployFail: 0,
};

declare global { interface Window { __engine?: Engine } }

export default function GameScreen({ request, preferences, modalOpen, onPreferences, onExit, onHelp, onSettings, onProgress }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hudRef = useRef(INITIAL_HUD);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const [hud, setHud] = useState(INITIAL_HUD);
  const [end, setEnd] = useState<EndStats | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'exit' | 'clear' | null>(null);
  const [intelOpen, setIntelOpen] = useState(true);
  const [intro, setIntro] = useState(false);
  const [mobileIntel, setMobileIntel] = useState(false);
  const resumeAfterModal = useRef(false);
  const previousPhase = useRef(INITIAL_HUD.phase);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!boxRef.current || !overlayRef.current || !miniRef.current) return;
      try {
        const engine = new Engine(boxRef.current, overlayRef.current, miniRef.current, {
          onHud: next => { if (active) { hudRef.current = next; setHud(next); } },
          onEnd: result => {
            if (!active) return;
            if (result.winner === 0 && hudRef.current.story) {
              saveCleared(Math.max(loadCleared(), hudRef.current.stageIndex + 1));
              progressRef.current();
            }
            setEnd(result);
          },
          onError: message => { if (active) setError(message); },
        });
        engineRef.current = engine;
        if ((import.meta as unknown as { env: { DEV: boolean } }).env.DEV) window.__engine = engine;
        if (request.mode === 'campaign') engine.startStage(request.stage); else engine.startSandbox();
        engine.setDeploy(request.unit ?? 'spear');
        if (!preferencesRef.current.sound) engine.toggleMute();
        if (preferencesRef.current.quality === 'low') engine.toggleQuality();
        setReady(true);
      } catch {
        setError('3D戦場を起動できませんでした。WebGL 2対応ブラウザーで、ハードウェアアクセラレーションを有効にしてください。');
      }
    }, 50);
    return () => { active = false; clearTimeout(timer); engineRef.current?.dispose(); engineRef.current = null; delete window.__engine; };
  }, [request]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (hudRef.current.muted === preferences.sound) engine.toggleMute();
    if (hudRef.current.quality !== preferences.quality) engine.toggleQuality();
  }, [preferences.sound, preferences.quality, ready]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (modalOpen && hudRef.current.phase === 'playing') { resumeAfterModal.current = true; engine.togglePause(); }
    engine.setInputBlocked(modalOpen || !!confirm || mobileIntel);
    if (!modalOpen && resumeAfterModal.current) {
      resumeAfterModal.current = false;
      if (hudRef.current.phase === 'paused') engine.togglePause();
    }
  }, [modalOpen, confirm, mobileIntel, ready]);

  useEffect(() => {
    if (hud.phase === 'playing' && previousPhase.current === 'setup') {
      setIntro(true);
    }
    previousPhase.current = hud.phase;
  }, [hud.phase]);

  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => setIntro(false), 2000);
    return () => clearTimeout(timer);
  }, [intro]);

  const engine = engineRef.current;
  const setup = hud.phase === 'setup' || hud.phase === 'menu';
  const story = ready ? hud.story : request.mode === 'campaign';
  const stage = STAGES[ready ? hud.stageIndex : request.stage];
  const picked = hud.deploy ? DEFS[hud.deploy] : null;
  const canBegin = ready && hud.counts[0] > 0 && hud.counts[1] > 0;
  const unlocked = useMemo(() => new Set(story ? unlockedThrough(loadCleared()) : FACTIONS.flatMap(group => group.units)), [story, hud.stageIndex, end]);
  const restart = (next?: number) => {
    setEnd(null); setConfirm(null);
    if (story) engine?.startStage(next ?? hud.stageIndex); else engine?.startSandbox();
    engine?.setDeploy('spear');
  };
  const requestExit = () => {
    if (hud.phase === 'playing') engine?.togglePause();
    setConfirm('exit');
  };
  const step = !hud.deploy && hud.counts[0] === 0 ? 0 : hud.counts[0] === 0 ? 1 : 2;

  return <motion.main className={`game-screen ${setup ? 'is-setup' : 'is-live'}`} data-phase={hud.phase} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <header className="game-header"><div className="game-brand-group"><button className="icon-button back-to-menu" onClick={requestExit} aria-label="メニューに戻る"><ArrowLeft size={20} /></button><Brand compact onClick={requestExit} /></div>
      {setup ? <ol className="deployment-steps" aria-label="配置の手順">{['兵種を選ぶ', '自陣に配置', '戦闘開始'].map((label, index) => <li key={label} className={index < step ? 'complete' : index === step ? 'active' : ''}><span>{index < step ? <Check size={13} /> : `0${index + 1}`}</span>{label}{index < 2 && <ChevronRight size={15} />}</li>)}</ol> : <div className="live-heading"><span className={hud.phase === 'playing' ? 'status-light' : 'status-light stopped'} /><span>{hud.phase === 'paused' ? 'BATTLE PAUSED' : hud.phase === 'over' ? 'BATTLE COMPLETE' : 'BATTLE IN PROGRESS'}</span><b>{fmtTime(hud.time)}</b></div>}
      <div className="game-header-actions"><button className="icon-button" onClick={() => { engine?.toggleMute(); onPreferences({ ...preferences, sound: hud.muted }); }} aria-label={hud.muted ? 'サウンドをオンにする' : 'サウンドをオフにする'}>{hud.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button className="icon-button" onClick={onHelp} aria-label="操作ガイド"><CircleHelp size={19} /></button><button className="icon-button" onClick={onSettings} aria-label="設定"><Settings2 size={19} /></button></div>
    </header>

    {setup && <div className="deployment-heading"><div><span className="eyebrow">{story ? `CAMPAIGN / MISSION ${stageLabel(stage)}` : 'CUSTOM BATTLE / SANDBOX'}</span><h1>部隊を配置する<span>{story ? stage.name : '敵味方を自由に配置できます'}</span></h1></div><div className="deployment-resources"><div className="resource-gold"><span>残り資金</span><b data-testid="active-gold"><Coin size={23} />{hud.budget[hud.deployTeam].toLocaleString()}</b></div><div className="resource-count"><span>{hud.deployTeam === 0 ? '自軍の部隊数' : '敵軍の部隊数'}</span><b><Users size={20} /><span data-testid={hud.deployTeam === 0 ? 'blue-count' : 'red-count'}>{hud.counts[hud.deployTeam]}</span><small> / {MAX_PER_TEAM}</small></b></div></div></div>}

    <div className="battle-body">
      <aside className="battle-sidebar"><div className="sidebar-brief">
        <div className="section-label"><span>UNIT INTELLIGENCE</span><Shield size={14} /></div>
        {picked ? <div className="selected-unit-details"><div className="selected-unit-title"><UnitEmblem kind={picked.kind} /><div><small>{picked.role}</small><h2>{picked.name}</h2><span><Coin size={13} />{picked.cost}<small> / 体</small></span></div></div><p>{picked.desc}</p><div className="compact-stats"><span>HP<b>{picked.hp}</b></span><span>攻撃<b>{picked.dmg}</b></span><span>射程<b>{picked.range}m</b></span></div></div> : <div className="selection-empty"><MousePointer2 size={26} /><b>{hud.sel ? `${hud.sel}体の部隊を選択中` : '兵種を選択してください'}</b><p>{hud.sel ? '右クリックで移動命令。削除ボタンで選択した部隊を撤去できます。' : '下の兵種一覧から、配置したい兵種を選びましょう。'}</p></div>}
        <div className="enemy-intel"><button className="intel-toggle" onClick={() => setIntelOpen(value => !value)} aria-expanded={intelOpen}><span><Flag size={14} />敵軍の編成<b>{hud.counts[1]}体</b></span><ChevronDown size={15} className={intelOpen ? '' : 'collapsed'} /></button>{intelOpen && (story ? <div className="enemy-roster compact-roster">{enemyRoster(stage).map(([kind, count]) => <div key={kind}><span>{DEFS[kind].name}</span><b>× {count}</b></div>)}</div> : <p className="sandbox-intel">「敵軍を配置」に切り替えると、赤いエリアに敵の部隊を配置できます。</p>)}</div>
        {story && <div className="tactical-tip"><Sparkles size={14} /><p>{stage.hint}</p></div>}
        {story && stage.kindCap && <p className="expedition-rule">遠征軍規: 同じ兵種は{stage.kindCap}体まで</p>}
      </div><div className="mini-map"><div className="section-label"><span>TACTICAL MAP</span><Map size={12} /></div><canvas ref={miniRef} width="190" height="104" aria-label="戦場マップ。クリックでカメラを移動" /><div className="minimap-caption"><span>クリックで移動</span><span>{hud.fps} FPS</span></div></div></aside>
      <div className="battle-viewport" data-team={hud.deployTeam}>
        <div ref={boxRef} className="engine-container" /><canvas ref={overlayRef} className="battle-overlay" />
        <div className="viewport-vignette" />
        {setup && <button className="mobile-intel-button" onClick={() => setMobileIntel(true)} aria-label="兵種と敵軍の情報"><Shield size={13} />編成情報</button>}
        {setup && <div className="map-top-controls"><div className="team-selector">{!story ? <>{([0, 1] as const).map(team => <button key={team} className={`${team === 0 ? 'blue' : 'red'} ${hud.deployTeam === team ? 'active' : ''}`} onClick={() => engine?.setDeployTeam(team)}><i />{team === 0 ? '自軍を配置' : '敵軍を配置'}<span>{hud.counts[team]}</span></button>)}</> : <span className="team-label"><i />自軍の配置エリア</span>}</div><div className="map-camera-actions"><button className={hud.mode === 'camera' ? 'active' : ''} onClick={() => engine?.setMode(hud.mode === 'camera' ? 'place' : 'camera')} title="カメラ操作 (C)" aria-label="カメラ操作"><Move size={17} /></button><button onClick={() => engine?.zoom(0.8)} aria-label="ズームイン"><Plus size={17} /></button><button onClick={() => engine?.zoom(1.25)} aria-label="ズームアウト"><Minus size={17} /></button><button onClick={() => engine?.resetCamera()} aria-label="カメラをリセット"><Maximize size={16} /></button></div></div>}
        {!setup && <><BattleScore hud={hud} /><div className="live-map-tools"><button className={hud.mode === 'place' ? 'active' : ''} aria-pressed={hud.mode === 'place'} onClick={() => engine?.setMode('place')}><MousePointer2 size={14} />部隊選択</button><button className={hud.mode === 'camera' ? 'active' : ''} aria-pressed={hud.mode === 'camera'} onClick={() => engine?.setMode('camera')} title="左半分のドラッグで移動、右半分で回転"><Move size={14} />カメラ</button><button className="live-camera-reset" onClick={() => engine?.resetCamera()} aria-label="カメラをリセット"><Maximize size={14} /></button></div></>}
        {setup && !story && <label className="map-scene-select"><Map size={14} /><select aria-label="戦場を選択" value={hud.sceneId} onChange={event => engine?.setCustomScene(Number(event.target.value))}>{SCENES.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select><ChevronDown size={12} /></label>}
        <div className={`battle-notice ${hud.notice?.error ? 'error' : ''}`} role="status" aria-live="polite">{hud.notice?.error ? <><X size={15} />{hud.notice.text}</> : setup ? <><MousePointer2 size={15} />{hud.mode === 'camera' ? 'ドラッグで移動・回転 / ホイールでズーム' : picked ? `${picked.name}を選択中。${hud.deployTeam === 0 ? '青' : '赤'}いエリアをクリックして配置` : hud.sel ? '右クリックで部隊を移動 / Deleteで撤去' : '画面下の兵種を選んで配置しましょう'}</> : hud.resolving !== null ? `決着まで ${hud.resolving}` : hud.notice?.text}</div>
        {!ready && !error && <div className="battle-loading"><span className="loading-spinner" /><span>戦場を準備しています</span><small>PREPARING THE BATTLEFIELD</small></div>}
        <AnimatePresence>{intro && <motion.div className="battle-intro" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}><Swords size={32} /><span>BATTLE COMMENCE</span></motion.div>}</AnimatePresence>
      </div>
    </div>

    {setup && <section className="unit-dock" aria-label="兵種の選択"><div className="dock-toolbar"><div className="dock-heading"><Layers3 size={17} /><b>兵種を選択</b><span>SELECT YOUR UNITS</span></div><div className="faction-tabs" role="tablist" aria-label="勢力">{FACTIONS.map(group => <button role="tab" aria-selected={hud.faction === group.id} key={group.id} className={hud.faction === group.id ? 'active' : ''} onClick={() => engine?.setFaction(group.id)}>{group.name}</button>)}</div><div className="batch-control"><button className={!hud.batch ? 'active' : ''} onClick={() => { if (hud.batch) engine?.toggleBatch(); }}>1体ずつ</button><button className={hud.batch ? 'active' : ''} onClick={() => { if (!hud.batch) engine?.toggleBatch(); }}>5体ずつ</button></div></div><div className="unit-card-row">{FACTIONS.find(group => group.id === hud.faction)!.units.map((kind, index) => {
      const def = DEFS[kind], open = hud.deployTeam === 1 || unlocked.has(kind), affordable = hud.budget[hud.deployTeam] >= def.cost;
      return <button key={kind} className={`deploy-unit ${hud.deploy === kind ? 'selected' : ''} ${!open ? 'locked' : !affordable ? 'unaffordable' : ''}`} onClick={() => engine?.setDeploy(kind)} disabled={!open || !affordable || hud.counts[hud.deployTeam] >= MAX_PER_TEAM || !ready} aria-label={`${def.name}を配置${!open ? '。ストーリーで解放' : !affordable ? '。資金不足' : ''}`} aria-pressed={hud.deploy === kind} data-testid={`unit-${kind}`} title={!open ? 'キャンペーンを進めると解放' : !affordable ? '資金が不足しています' : def.desc}><span className="unit-shortcut">{index + 1}</span><UnitEmblem kind={kind} /><span className="deploy-unit-name">{def.name}</span><span className="deploy-unit-meta">{open && <span className="deploy-unit-role">{def.role}</span>}<span className="deploy-unit-cost">{open ? <><Coin size={12} />{def.cost}</> : <><LockKeyhole size={11} />未解放</>}</span></span>{hud.deploy === kind && <span className="deploy-check"><Check size={11} /></span>}</button>;
    })}</div></section>}

    <footer className="game-footer">{setup ? <><div className="deployment-tools"><button className={!hud.deploy && hud.mode === 'place' ? 'active' : ''} onClick={() => { engine?.setDeploy(null); engine?.setMode('place'); }}><MousePointer2 size={16} /><span>選択</span></button><button disabled={!hud.canUndo} onClick={() => engine?.undoDeploy()} title="取り消し (Ctrl+Z)"><Undo2 size={16} /><span>取り消し</span></button>{hud.sel > 0 && <button className="delete-selected" onClick={() => engine?.removeSelected()}><Trash2 size={16} /><span>選択を撤去</span></button>}<button className="reset-team" disabled={!hud.counts[hud.deployTeam]} onClick={() => setConfirm('clear')}><RotateCcw size={15} /><span>{hud.deployTeam === 0 ? '自軍' : '敵軍'}をリセット</span></button></div><div className="deploy-start"><span className="start-hint">{!hud.counts[0] ? 'まずは自軍の部隊を配置しましょう' : !hud.counts[1] ? '敵軍を1体以上配置してください' : <><Check size={14} />出撃準備が整いました</>}</span><button className="start-battle-button" disabled={!canBegin} onClick={() => engine?.beginBattle()}><Swords size={19} /><span>戦闘開始<small>START BATTLE</small></span><kbd>SPACE</kbd><ArrowRight size={20} /></button></div></> : <><div className="combat-tools"><button onClick={() => engine?.selectAll()}><Users size={17} /><span>全軍選択</span></button><button onClick={() => engine?.issueOrder('auto')}><Swords size={17} /><span>総攻撃</span></button><button onClick={() => engine?.issueOrder('hold')}><Hand size={17} /><span>待機</span></button><button className={hud.following ? 'active' : ''} onClick={() => engine?.toggleFollow()}><Eye size={17} /><span>追従</span></button><button onClick={() => engine?.cycleFormation()}><Layers3 size={17} /><span>陣形: {({ box: '方陣', line: '横陣', wedge: '楔陣', scatter: '散開' })[hud.formation ?? 'box']}</span></button></div><div className="battle-playback"><div className="speed-controls">{[0.5, 1, 2, 4].map(speed => <button key={speed} className={hud.speed === speed ? 'active' : ''} aria-label={`${speed}倍速`} aria-pressed={hud.speed === speed} onClick={() => engine?.setSpeed(speed)}>{speed}×</button>)}</div><button className="pause-button" onClick={() => engine?.togglePause()} aria-label="一時停止"><Pause size={18} /><span>一時停止</span><kbd>SPACE</kbd></button></div></>}</footer>

    <AnimatePresence>
      {mobileIntel && <Dialog key="intel" title="部隊と敵軍の情報" eyebrow="TACTICAL INTELLIGENCE" onClose={() => setMobileIntel(false)}>{picked && <><div className="mobile-intel-unit"><UnitEmblem kind={picked.kind} /><div><span className="eyebrow">{picked.en}</span><h3>{picked.name}</h3><span><Coin size={14} />{picked.cost} / 体</span></div></div><p className="confirm-copy">{picked.desc}</p><div className="compact-stats"><span>体力<b>{picked.hp}</b></span><span>攻撃力<b>{picked.dmg}</b></span><span>射程<b>{picked.range}m</b></span></div></>}<div className="mobile-enemy-heading"><Flag size={15} />敵軍の編成<span>{hud.counts[1]}体</span></div>{story ? <><div className="enemy-roster">{enemyRoster(stage).map(([kind, count]) => <div key={kind}><span>{DEFS[kind].name}</span><b>× {count}</b></div>)}</div><div className="field-tip"><Sparkles size={16} /><p>{stage.hint}</p></div>{stage.kindCap && <p className="expedition-rule">遠征軍規: 同じ兵種は{stage.kindCap}体まで</p>}</> : <p className="confirm-copy">敵軍は「敵軍を配置」から変更できます。予算は両軍それぞれ3,000、配置上限は各50体です。</p>}<PrimaryButton onClick={() => setMobileIntel(false)} icon={false}>配置に戻る</PrimaryButton></Dialog>}
      {hud.phase === 'paused' && !modalOpen && !confirm && <Dialog key="pause" title="一時停止" eyebrow="BATTLE PAUSED" onClose={() => engine?.togglePause()} className="pause-dialog"><div className="pause-symbol"><Pause size={35} /></div><PrimaryButton onClick={() => engine?.togglePause()}><Play size={16} />戦闘を再開</PrimaryButton><button className="outline-button full-width" onClick={() => restart()}><RotateCcw size={16} />編成からやり直す</button><button className="text-button pause-exit" onClick={requestExit}><ArrowLeft size={15} />メニューに戻る</button></Dialog>}
      {confirm && <Dialog key="confirm" title={confirm === 'exit' ? '戦場を離れますか？' : `${hud.deployTeam === 0 ? '自軍' : '敵軍'}の配置をリセット？`} eyebrow={confirm === 'exit' ? 'LEAVE BATTLEFIELD' : 'RESET DEPLOYMENT'} onClose={() => setConfirm(null)}><p className="confirm-copy">{confirm === 'exit' ? '現在の編成と戦闘状況は保存されません。キャンペーンのクリア記録は保持されます。' : '選択中の軍の部隊をすべて撤去し、使用した資金を戻します。相手の配置は変わりません。'}</p><div className="confirm-actions"><button className="outline-button" onClick={() => setConfirm(null)}>キャンセル</button><PrimaryButton onClick={() => { if (confirm === 'exit') onExit(story); else { engine?.clearTeamUnits(hud.deployTeam); setConfirm(null); } }}>{confirm === 'exit' ? 'メニューに戻る' : 'リセットする'}</PrimaryButton></div></Dialog>}
      {end && <Result key="result" end={end} story={story} stageIndex={hud.stageIndex} onNext={() => restart(hud.stageIndex + 1)} onRetry={() => restart()} onExit={() => onExit(story)} />}
      {error && <Dialog key="error" title="3D戦場を起動できません" eyebrow="RENDERING ERROR" onClose={() => onExit(story)}><p className="confirm-copy">{error}</p><PrimaryButton onClick={() => window.location.reload()}>再読み込み</PrimaryButton><button className="text-button pause-exit" onClick={() => onExit(story)}>メニューへ戻る</button></Dialog>}
    </AnimatePresence>
  </motion.main>;
}

function BattleScore({ hud }: { hud: HudState }) {
  return <div className="battle-score">{([0, 1] as const).map(team => {
    const hp = hud.teamHp?.[team], percent = hp && hp[1] > 0 ? hp[0] / hp[1] * 100 : 0;
    return <div className={`team-score team-score-${team}`} key={team}><div><Shield size={17} /><span>{team === 0 ? '自軍' : '敵軍'}</span><b>{hud.counts[team]}<small> 体</small></b></div><div className="team-hp"><i style={{ width: `${percent}%` }} /></div><span>撃破 {hud.kills[team]}<span>損失 {hud.losses[team]}</span></span></div>;
  })}<div className="score-vs">VS</div></div>;
}

function Result({ end, story, stageIndex, onNext, onRetry, onExit }: { end: EndStats; story: boolean; stageIndex: number; onNext: () => void; onRetry: () => void; onExit: () => void }) {
  const won = end.winner === 0;
  const stars = end.losses[0] <= end.spawned[0] * 0.35 ? 3 : end.losses[0] <= end.spawned[0] * 0.7 ? 2 : 1;
  return <Dialog title={won ? 'VICTORY' : end.winner === null ? 'DRAW' : 'DEFEAT'} eyebrow="BATTLE REPORT" onClose={onExit} className={`result-dialog ${won ? 'victory' : 'defeat'}`}>
    <div className="result-emblem">{won ? <Trophy size={46} strokeWidth={1.2} /> : <Swords size={46} strokeWidth={1.2} />}</div>{won && <div className="result-stars">{[0, 1, 2].map(index => <Star key={index} size={22} fill={index < stars ? 'currentColor' : 'none'} className={index < stars ? 'earned' : ''} />)}</div>}
    <div className="result-stats"><div><span>戦闘時間</span><b>{fmtTime(end.time)}</b></div><div><span>敵軍撃破</span><b>{end.kills[0]}<small>体</small></b></div><div><span>自軍損失</span><b>{end.losses[0]}<small>体</small></b></div></div>
    {end.mvp && <div className="mvp-row"><UnitPortrait kind={end.mvp.kind} /><div><span>MOST VALUABLE UNIT</span><b>{DEFS[end.mvp.kind].name}</b><small>{end.mvp.kills}撃破 / {end.mvp.damage.toLocaleString()}ダメージ</small></div><Trophy size={20} /></div>}
    {story && won && STAGES[stageIndex].unlock.length > 0 && <div className="result-unlock"><Sparkles size={17} /><span>新たな兵種を解放<b>{STAGES[stageIndex].unlock.map(kind => DEFS[kind].name).join(' / ')}</b></span></div>}
    <PrimaryButton onClick={story && won && stageIndex + 1 < STAGES.length ? onNext : onRetry}>{story && won && stageIndex + 1 < STAGES.length ? '次のミッションへ' : 'もう一度挑戦する'}</PrimaryButton><div className="result-actions">{story && won && stageIndex + 1 < STAGES.length && <button className="text-button" onClick={onRetry}><RotateCcw size={14} />再挑戦</button>}<button className="text-button" onClick={onExit}><ArrowLeft size={14} />{story ? 'ミッション選択へ' : 'メインメニューへ'}</button></div>
  </Dialog>;
}