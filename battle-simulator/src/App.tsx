import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Crown, Flag, Gamepad2, Layers3, LockKeyhole, Maximize, RotateCcw, Search, Settings2, Shield, Sparkles, Swords, Volume2, VolumeX } from 'lucide-react';
import { Brand, Coin, Dialog, PrimaryButton, StatBars } from './components/UI';
import { UnitModel, UnitPortrait } from './components/UnitPortrait';
import { SCENES, STAGES, enemyRoster, loadCleared, stageLabel } from './game/campaign';
import { DEFS, FACTIONS, type Faction, type UnitKind } from './game/units';
import GameScreen, { type GameRequest } from './components/GameScreen';

export type Preferences = { sound: boolean; quality: 'standard' | 'low'; reducedMotion: boolean };
type Page = 'home' | 'campaign' | 'armory' | 'game';
type Modal = 'settings' | 'help' | null;

const DEFAULT_PREFERENCES: Preferences = { sound: false, quality: 'standard', reducedMotion: false };

function readPreferences(): Preferences {
  try { return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem('epic-preferences') ?? '{}') }; } catch { return DEFAULT_PREFERENCES; }
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [modal, setModal] = useState<Modal>(null);
  const [preferences, setPreferences] = useState(readPreferences);
  const [cleared, setCleared] = useState(loadCleared);
  const [request, setRequest] = useState<GameRequest>({ mode: 'campaign', stage: 0 });
  useEffect(() => {
    try { localStorage.setItem('epic-preferences', JSON.stringify(preferences)); } catch { /* Settings still work when browser storage is unavailable. */ }
  }, [preferences]);
  const launch = useCallback((next: GameRequest) => { setRequest(next); setPage('game'); }, []);
  const navigate = (next: Page) => { setPage(next); setCleared(loadCleared()); };
  return <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}>
    <div className={`app ${preferences.reducedMotion ? 'reduce-motion' : ''}`}>
      {page !== 'game' && <>
        <div className={`scene-backdrop ${page === 'home' ? 'home-backdrop' : 'inner-backdrop'}`} />
        <div className={`scene-shade ${page === 'home' ? 'home-shade' : ''}`} />
        <div className="ambient-particles" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ left: `${25 + index * 6.7}%`, bottom: `${4 + index % 4 * 13}%`, animationDelay: `${index * -1.7}s`, animationDuration: `${10 + index % 5 * 2}s` }} />)}</div>
        <header className="main-header">
          <Brand onClick={() => navigate('home')} />
          <nav className="main-nav" aria-label="メインナビゲーション">
            <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>ホーム</button>
            <button className={page === 'campaign' ? 'active' : ''} onClick={() => navigate('campaign')}>キャンペーン</button>
            <button onClick={() => launch({ mode: 'sandbox', stage: 0 })}>カスタム戦</button>
            <button className={page === 'armory' ? 'active' : ''} onClick={() => navigate('armory')}>兵種図鑑</button>
          </nav>
          <div className="header-actions">
            <button className="icon-button sound-button" onClick={() => setPreferences(value => ({ ...value, sound: !value.sound }))} aria-label={preferences.sound ? 'サウンドをオフにする' : 'サウンドをオンにする'} title="サウンド">{preferences.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
            <button className="icon-button" onClick={() => setModal('settings')} aria-label="設定"><Settings2 size={19} /></button>
            <div className="commander"><span className="commander-icon"><Crown size={19} /></span><span>COMMANDER<small>ゲストプレイヤー</small></span></div>
          </div>
        </header>
      </>}
      <div className="page-outlet">
        {page === 'home' && <Home key="home" onCampaign={() => navigate('campaign')} onSandbox={() => launch({ mode: 'sandbox', stage: 0 })} onArmory={() => navigate('armory')} cleared={cleared} />}
        {page === 'campaign' && <Campaign key="campaign" cleared={cleared} onPlay={stage => launch({ mode: 'campaign', stage })} />}
        {page === 'armory' && <Armory key="armory" onTry={unit => launch({ mode: 'sandbox', stage: 0, unit })} />}
        {page === 'game' && <GameScreen key="game" request={request} preferences={preferences} modalOpen={modal !== null} onPreferences={setPreferences} onExit={story => navigate(story ? 'campaign' : 'home')} onHelp={() => setModal('help')} onSettings={() => setModal('settings')} onProgress={() => setCleared(loadCleared())} />}
      </div>
      {page !== 'game' && <footer className="main-footer">
        <div className="footer-left">{page === 'home' ? <><span className="status-light" /><span>キャンペーン進行 {cleared} / {STAGES.length}</span></> : <button className="text-button" onClick={() => navigate('home')}><ArrowLeft size={15} />メインメニュー</button>}</div>
        <span className="footer-copyright">© 2026 EPIC BATTLE SIMULATOR</span>
        <div className="footer-right"><button onClick={() => setModal('help')}><CircleHelp size={15} />操作ガイド</button><span className="version">V.2.0.0</span></div>
      </footer>}
      <AnimatePresence>
        {modal === 'settings' && <SettingsDialog key="settings" preferences={preferences} onChange={setPreferences} onClose={() => setModal(null)} />}
        {modal === 'help' && <HelpDialog key="help" onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  </MotionConfig>;
}

const enter = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.35 } };

function Home({ onCampaign, onSandbox, onArmory, cleared }: { onCampaign: () => void; onSandbox: () => void; onArmory: () => void; cleared: number }) {
  return <motion.main className="home-page" {...enter}>
    <div className="hero-content">
      <motion.h1 className="hero-title" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.75 }}><span>EPIC BATTLE</span><span>SIMULATOR<span className="title-period">.</span></span></motion.h1>
      <motion.div className="play-menu" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}>
        <button className="campaign-play" onClick={onCampaign}><Swords size={27} strokeWidth={1.4} /><span>{cleared > 0 ? 'キャンペーンを続ける' : 'キャンペーンをはじめる'}<small>PLAY CAMPAIGN</small></span><ArrowRight size={25} strokeWidth={1.4} /></button>
        <button className="menu-row" onClick={onSandbox}><Layers3 size={21} strokeWidth={1.5} /><span>カスタムバトル<small>SANDBOX</small></span><ChevronRight size={19} /></button>
        <button className="menu-row" onClick={onArmory}><BookOpen size={21} strokeWidth={1.5} /><span>兵種図鑑<small>THE ARMORY</small></span><ChevronRight size={19} /></button>
      </motion.div>
    </div>
  </motion.main>;
}

function Campaign({ cleared, onPlay }: { cleared: number; onPlay: (index: number) => void }) {
  const [selected, setSelected] = useState(Math.min(cleared, STAGES.length - 1));
  const stage = STAGES[selected];
  const scene = SCENES[stage.scene - 1];
  const locked = selected > cleared;
  return <motion.main className="inner-page campaign-page" {...enter}>
    <div className="page-heading"><div><span className="eyebrow">THE CAMPAIGN</span><h1>キャンペーン</h1><p>全{STAGES.length}ミッション / 全{SCENES.length}チャプター</p></div><div className="campaign-progress"><span>CAMPAIGN PROGRESS</span><b>{String(cleared).padStart(2, '0')}<small> / {STAGES.length}</small></b><div><i style={{ width: `${cleared / STAGES.length * 100}%` }} /></div></div></div>
    <div className="campaign-layout">
      <nav className="chapter-nav" aria-label="チャプター">{SCENES.map(chapter => <button key={chapter.id} className={stage.scene === chapter.id ? 'active' : ''} onClick={() => setSelected(STAGES.findIndex(item => item.scene === chapter.id))}><span className="chapter-number">0{chapter.id}</span><span><small>CHAPTER 0{chapter.id}</small>{chapter.name}</span><ChevronRight size={16} /></button>)}</nav>
      <section className="stage-list"><div className="section-label"><span>第{stage.scene}章</span><span>{scene.sub}</span></div>{STAGES.map((item, index) => item.scene === stage.scene && <button className={`stage-row ${selected === index ? 'active' : ''} ${index > cleared ? 'locked' : ''}`} key={item.id} onClick={() => setSelected(index)}><span className="stage-number">{String(STAGES.filter(s => s.scene === stage.scene).indexOf(item) + 1).padStart(2, '0')}</span><span><b>{item.name}</b><small>{index < cleared ? 'MISSION COMPLETE' : index === cleared ? 'READY TO DEPLOY' : 'LOCKED MISSION'}</small></span>{index < cleared ? <Check size={19} /> : index > cleared ? <LockKeyhole size={17} /> : <Flag size={18} />}</button>)}</section>
      <motion.aside key={stage.id} className="mission-detail" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <div className="mission-detail-top"><Flag size={18} /><span>MISSION {stageLabel(stage)}</span><span className="mission-level">{stage.scene < 3 ? 'NORMAL' : 'HARD'}</span></div>
        <h2>{stage.name}</h2><p className="mission-description">{stage.hint}</p>
        <div className="mission-resources"><div><span>出撃予算</span><b><Coin size={20} />{stage.budget.toLocaleString()}</b></div><div><span>敵軍勢力</span><b>{stage.enemies.reduce((sum, group) => sum + group.count, 0)}<small>体</small></b></div></div>
        <div className="roster-heading">ENEMY INTELLIGENCE<span>敵軍の編成</span></div><div className="enemy-roster">{enemyRoster(stage).map(([kind, count]) => <div key={kind}><span>{DEFS[kind].name}</span><b>× {count}</b></div>)}</div>
        <div className="unlock-note"><Sparkles size={17} /><span>クリアで解放<b>{stage.unlock.map(kind => DEFS[kind].name).join(' / ') || '全兵種解放済み'}</b></span></div>
        <PrimaryButton onClick={() => onPlay(selected)} disabled={locked}>{locked ? <><LockKeyhole size={16} />未解放のミッション</> : '部隊を編成する'}</PrimaryButton>
        <span className="mission-start-note">{locked ? '前のミッションをクリアすると解放されます' : '戦場で兵種を選び、自軍を配置します'}</span>
      </motion.aside>
    </div>
  </motion.main>;
}

function Armory({ onTry }: { onTry: (kind: UnitKind) => void }) {
  const [faction, setFaction] = useState<Faction>('kingdom');
  const [picked, setPicked] = useState<UnitKind>('swordsman');
  const [query, setQuery] = useState('');
  const def = DEFS[picked];
  const units = query ? FACTIONS.flatMap(group => group.units).filter(kind => `${DEFS[kind].name} ${DEFS[kind].en}`.toLowerCase().includes(query.toLowerCase())) : FACTIONS.find(group => group.id === faction)!.units;
  return <motion.main className="inner-page armory-page" {...enter}>
    <div className="page-heading"><div><span className="eyebrow">THE ARMORY</span><h1>兵種図鑑<span className="heading-count">43</span></h1><p>全43兵種の能力と役割を確認できます。</p></div><div className="armory-heading-note"><Shield size={18} /><span>6勢力 / 43兵種</span></div></div>
    <div className="armory-tabs"><div role="tablist" aria-label="勢力">{FACTIONS.map(group => <button role="tab" aria-selected={faction === group.id} className={faction === group.id ? 'active' : ''} key={group.id} onClick={() => { setFaction(group.id); setPicked(group.units[0]); setQuery(''); }}>{group.name}<small>{group.en}</small></button>)}</div><label className="unit-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="兵種を検索" aria-label="兵種を検索" /></label></div>
    <div className="armory-layout"><section className="armory-grid" aria-label="兵種一覧">{units.map(kind => <button className={`armory-unit ${picked === kind ? 'active' : ''}`} key={kind} onClick={() => setPicked(kind)} aria-pressed={picked === kind}><UnitPortrait kind={kind} /><span>{DEFS[kind].name}</span><small><Coin size={12} />{DEFS[kind].cost}</small>{picked === kind && <Check className="unit-picked" size={14} />}</button>)}{units.length === 0 && <p className="no-units">該当する兵種が見つかりません。</p>}</section>
      <div className="model-stage"><div className="model-stage-ring" /><UnitModel kind={picked} /><span className="model-number">{def.en}</span><div className="model-instruction"><RotateCcw size={13} />ドラッグして回転</div></div>
      <motion.aside key={picked} className="armory-detail" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}><span className="eyebrow">{FACTIONS.find(group => group.id === def.faction)?.en} / {def.role}</span><h2>{def.name}</h2><span className="unit-english-name">{def.en}</span><p>{def.desc}</p><StatBars hp={def.hp} damage={def.dmg} range={def.range} speed={def.speed} /><div className="unit-special"><Shield size={18} /><div><small>特性 / SPECIALTY</small><b>{def.fly ? '飛行で前線を越え、後衛を急襲' : def.brace ? '槍衾で敵の突撃を食い止める' : def.shield ? `正面のダメージを${Math.round(def.shield * 100)}%軽減` : def.heal ? '周囲の味方を回復して戦線を維持' : def.aoe || def.cleave ? '範囲攻撃で密集した敵を一掃' : def.ranged ? '前衛の後ろから敵軍を攻撃' : def.hunter ? '機動力で敵の後衛を狙う' : '味方と連携して前線を押し上げる'}</b></div></div><PrimaryButton onClick={() => onTry(picked)}>この兵種を試す</PrimaryButton><span className="mission-start-note">カスタム戦では全43兵種を使用できます</span></motion.aside>
    </div>
  </motion.main>;
}

function SettingsDialog({ preferences, onChange, onClose }: { preferences: Preferences; onChange: (value: Preferences) => void; onClose: () => void }) {
  const [fullscreenError, setFullscreenError] = useState('');
  return <Dialog title="ゲーム設定" eyebrow="SETTINGS" onClose={onClose}>
    <div className="settings-row"><div><b>サウンド</b><small>戦場の効果音とバトルドラム</small></div><button className={`switch ${preferences.sound ? 'on' : ''}`} role="switch" aria-checked={preferences.sound} aria-label="サウンド" onClick={() => onChange({ ...preferences, sound: !preferences.sound })}><i /></button></div>
    <div className="settings-row"><div><b>グラフィック品質</b><small>動作が重い場合は軽量に設定</small></div><div className="segmented-control">{(['standard', 'low'] as const).map(quality => <button className={preferences.quality === quality ? 'active' : ''} key={quality} onClick={() => onChange({ ...preferences, quality })}>{quality === 'standard' ? '標準' : '軽量'}</button>)}</div></div>
    <div className="settings-row"><div><b>アニメーションを抑える</b><small>画面遷移と背景の動きを軽減</small></div><button className={`switch ${preferences.reducedMotion ? 'on' : ''}`} role="switch" aria-checked={preferences.reducedMotion} aria-label="アニメーションを抑える" onClick={() => onChange({ ...preferences, reducedMotion: !preferences.reducedMotion })}><i /></button></div>
    <div className="settings-row"><div><b>全画面表示</b><small>戦場をより大きな画面で</small></div><button className="outline-button" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setFullscreenError('このブラウザーでは全画面表示を利用できません。'); } }}><Maximize size={15} />切り替え</button></div>
    {fullscreenError && <p className="settings-error" role="status">{fullscreenError}</p>}
    <div className="dialog-footnote"><Check size={14} />設定は自動で保存されます</div><PrimaryButton onClick={onClose} icon={false}>設定を閉じる</PrimaryButton>
  </Dialog>;
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'deploy' | 'battle'>('deploy');
  return <Dialog title="操作方法" eyebrow="CONTROLS" onClose={onClose} className="help-dialog">
    <div className="help-tabs" role="tablist"><button role="tab" aria-selected={tab === 'deploy'} className={tab === 'deploy' ? 'active' : ''} onClick={() => setTab('deploy')}><Layers3 size={16} />部隊の配置</button><button role="tab" aria-selected={tab === 'battle'} className={tab === 'battle' ? 'active' : ''} onClick={() => setTab('battle')}><Swords size={16} />戦闘とカメラ</button></div>
    {tab === 'deploy' ? <><div className="help-steps">{[['01', '兵種を選ぶ', '画面下の兵種一覧から選択。勢力タブで切り替えられます。'], ['02', '自陣に配置する', '青いエリアをクリック。ドラッグで連続配置、5体ずつ配置も可能です。'], ['03', '戦闘を開始する', '残り資金と敵軍の編成を確認し、「戦闘開始」で出撃しましょう。']].map(([number, title, text]) => <div key={number}><span>{number}</span><div><b>{title}</b><p>{text}</p></div></div>)}</div><div className="help-key-row"><span>直前の配置を取り消し</span><kbd>Ctrl</kbd><span>+</span><kbd>Z</kbd></div><div className="help-key-row"><span>配置モードを解除</span><kbd>Esc</kbd></div><div className="help-key-row"><span>兵種を選択 / 5体ずつ配置</span><kbd>1 - 9</kbd><kbd>B</kbd></div></> : <div className="battle-help">{[['戦闘開始 / 一時停止', 'Space'], ['カメラを移動', 'W A S D'], ['カメラ回転', '右ドラッグ'], ['拡大 / 縮小', 'ホイール'], ['全軍を選択', 'Ctrl + A'], ['総攻撃 / 待機', 'G / H'], ['選択部隊を追従', 'V'], ['カメラをリセット', 'Home']].map(([label, key]) => <div className="help-key-row" key={label}><span>{label}</span><kbd>{key}</kbd></div>)}<p className="touch-help"><Gamepad2 size={17} />タッチ操作にも対応。タップで配置、2本指で移動・ピンチズームできます。</p></div>}
    <PrimaryButton onClick={onClose} icon={false}>閉じる</PrimaryButton>
  </Dialog>;
}
