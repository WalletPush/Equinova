import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  BarChart3,
  Database,
  Brain,
  TrendingUp,
  Activity,
  Target,
  LineChart,
  Shield,
  X,
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' as const } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
}

const winningPicks = [
  { src: '/images/win-falco.png', horse: 'Falco Des Pins', edge: '+24.2%', profit: '+£35.00', odds: '5/2', venue: 'Leicester' },
  { src: '/images/win-ohsoperfect.png', horse: 'Oh So Perfect', edge: '+65.8%', profit: '+£80.00', odds: '11/2', venue: 'Chelmsford' },
  { src: '/images/win-goodoldbill.png', horse: 'Goodoldbill', edge: '+33.9%', profit: '+£40.25', odds: '10/1', venue: 'Newcastle' },
  { src: '/images/win-smurfette.png', horse: 'Smurfette', edge: '+17.6%', profit: '+£25.13', odds: '9/4', venue: 'Southwell' },
  { src: '/images/win-lawsupreme.png', horse: 'Law Supreme', edge: '+36.0%', profit: '+£45.00', odds: '4/1', venue: 'Wolverhampton' },
  { src: '/images/win-faycequevoudras.png', horse: 'Fay Ce Que Voudras', edge: '+19.0%', profit: '+£25.68', odds: '3/1', venue: 'Leicester' },
]

function Lightbox({ picks, startIndex, onClose }: { picks: typeof winningPicks; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex)
  const pick = picks[index]

  const prev = () => setIndex((i) => (i === 0 ? picks.length - 1 : i - 1))
  const next = () => setIndex((i) => (i === picks.length - 1 ? 0 : i + 1))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-7 h-7" />
        </button>

        <button
          onClick={prev}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 text-gray-400 hover:text-white transition-colors hidden sm:block"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        <button
          onClick={next}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 text-gray-400 hover:text-white transition-colors hidden sm:block"
        >
          <ChevronRight className="w-8 h-8" />
        </button>

        <motion.img
          key={pick.src}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          src={pick.src}
          alt={`${pick.horse} — WON`}
          className="w-full rounded-2xl border border-gray-700/60 shadow-2xl"
        />

        <div className="flex justify-center gap-2 mt-4 sm:hidden">
          <button onClick={prev} className="bg-gray-800 rounded-lg p-2 text-gray-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={next} className="bg-gray-800 rounded-lg p-2 text-gray-400 hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className="text-lg font-medium text-white pr-4">{question}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-amber-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-400 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  )
}

function PricingCard({
  title,
  price,
  period,
  features,
  ctaLabel,
  paypalLink,
  highlighted = false,
  badge,
  note,
}: {
  title: string
  price: string
  period: string
  features: string[]
  ctaLabel: string
  paypalLink: string
  highlighted?: boolean
  badge?: string
  note?: string
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`relative rounded-2xl p-8 flex flex-col h-full transition-all duration-300 hover:scale-[1.02] ${
        highlighted
          ? 'bg-gradient-to-b from-amber-500/10 to-gray-800/80 border-2 border-amber-500/50 shadow-xl shadow-amber-500/10'
          : 'bg-gray-800/60 border border-gray-700/60'
      }`}
    >
      {badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
            {badge}
          </span>
        </div>
      )}
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h4>
      <div className="mb-2">
        <span className="text-5xl font-bold text-white tracking-tight">{price}</span>
        <span className="text-gray-500 ml-2 text-sm">{period}</span>
      </div>
      {note && (
        <p className="text-amber-400/80 text-sm mb-6">{note}</p>
      )}
      {!note && <div className="mb-6" />}
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <span className="text-gray-300 text-sm">{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={paypalLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full text-center py-3.5 rounded-xl font-semibold transition-all duration-200 ${
          highlighted
            ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-gray-900'
            : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
        }`}
      >
        {ctaLabel}
      </a>
      <p className="text-center text-xs text-gray-500 mt-3">
        Cancel anytime. No contracts. No questions.
      </p>
    </motion.div>
  )
}

export function LandingPage() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-x-hidden">
      {/* ── LIGHTBOX ─────────────────────────── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            picks={winningPicks}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>

      {/* ── HEADER ─────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-lg border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/images/eq-logo.png"
              alt="EquiNova"
              className="h-9 w-auto brightness-200"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-gray-400 hover:text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              Log In
            </Link>
            <button
              onClick={scrollToPricing}
              className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-gray-900 px-5 py-2 rounded-lg font-semibold transition-all text-sm"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────── */}
      <section className="relative pt-16 min-h-[95vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/images/hero-racing.png"
            alt=""
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/60 via-gray-900/80 to-gray-900" />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/70 via-transparent to-gray-900/70" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight mb-6">
              Beat the bookmakers
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">
                with a better algorithm.
              </span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            EquiNova scans every UK and Irish race card to find where the
            bookmakers have priced it wrong&nbsp;&mdash; then tells you exactly
            how much to stake.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <button
              onClick={scrollToPricing}
              className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-gray-900 px-10 py-4 rounded-xl font-bold text-lg transition-all duration-200 transform hover:scale-105 inline-flex items-center gap-3 shadow-lg shadow-amber-500/20"
            >
              See Today's Picks
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ─────────────────── */}
      <div className="bg-gray-800/50 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>Analysing <strong className="text-white">every UK &amp; Irish race</strong> daily</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span><strong className="text-white">60+ features</strong> per runner</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-400" />
              <span><strong className="text-white">4 independent ML models</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Kelly criterion <strong className="text-white">staking built in</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ── PROBLEM AGITATION ──────────────────── */}
      <section className="py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="max-w-3xl mx-auto px-4 sm:px-6 text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8">
            Most punters lose for the same reasons.
          </h2>
          <div className="space-y-4 text-lg text-gray-400 leading-relaxed">
            <p>
              They follow tipsters who show no working. Chase losses with bigger stakes.
              Pick horses on gut feeling, jockey silks, or whatever the Racing Post
              headline says. There's no model. No edge calculation. No staking discipline.
            </p>
            <p>
              The bookmakers have teams of quantitative analysts pricing every race.
              You're betting against <em>them</em>&nbsp;&mdash; and you're doing it blind.
            </p>
            <p className="text-white font-medium text-xl pt-2">
              EquiNova levels the field.
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── PRODUCT REVEAL ─────────────────────── */}
      <section className="py-20 sm:py-28 bg-gray-800/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center"
          >
            <motion.div variants={fadeUp} className="flex justify-center lg:justify-start">
              <img
                src="/images/top-pick-card.png"
                alt="EquiNova Top Pick — Kingcormac, +31.4% edge, WON"
                className="w-full max-w-md rounded-2xl border border-gray-700/60 shadow-2xl shadow-black/50"
              />
            </motion.div>

            <motion.div variants={fadeUp}>
              <p className="text-amber-400 font-semibold uppercase tracking-widest text-xs mb-4">
                Real Pick. Real Result.
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 leading-tight">
                This is what a data-driven
                <br />
                pick looks like.
              </h2>
              <div className="space-y-4 text-gray-400 leading-relaxed">
                <p>
                  Kingcormac. Hereford, 2:00 Chase. The Benter model gave it a
                  <strong className="text-white"> 62.2% win probability</strong> against the market's 30.8%.
                  That's a <strong className="text-emerald-400">+31.4% edge</strong>.
                </p>
                <p>
                  All four models agreed&nbsp;&mdash; LightGBM at 93%, Random Forest at 94%, XGBoost at 94%.
                  Kelly sizing calculated a <strong className="text-white">£13.50 stake</strong>.
                </p>
                <p>
                  The horse won at 9/4. That's
                  <strong className="text-emerald-400"> +£43.88 profit</strong> on a single race.
                </p>
                <p className="text-white font-medium">
                  No guesswork. No tipster opinion. Just maths.
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* ── EVIDENCE GALLERY ──────────────── */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="mt-24 text-center"
          >
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              That wasn't a fluke. Here's the evidence.
            </h3>
            <p className="text-gray-500 mb-10">
              Click any card to expand.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {winningPicks.map((pick, i) => (
              <motion.button
                key={pick.horse}
                variants={fadeUp}
                onClick={() => setLightboxIndex(i)}
                className="rounded-xl overflow-hidden border border-gray-700/40 hover:border-amber-500/40 transition-all duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <img
                  src={pick.src}
                  alt={`${pick.horse} — WON`}
                  className="w-full"
                />
              </motion.button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── THE BENTER STORY ───────────────────── */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute -left-40 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="max-w-3xl mx-auto px-4 sm:px-6 relative z-10"
        >
          <p className="text-amber-400 font-semibold uppercase tracking-widest text-xs mb-4 text-center">
            The Foundation
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8 text-center">
            Built on a billion-dollar algorithm.
          </h2>
          <div className="space-y-5 text-gray-400 text-lg leading-relaxed">
            <p>
              In the 1990s, a mathematician named William Benter built a model that
              extracted over <strong className="text-white">$1 billion</strong> from Hong Kong horse racing.
              His system wasn't luck. It was a conditional logit model that combined
              horse form data with real-time market odds to find value the public
              couldn't see.
            </p>
            <p>
              EquiNova is built on that same mathematical framework&nbsp;&mdash; adapted
              for UK and Irish racing, powered by modern machine learning. A two-stage
              Benter model runs at the core: Stage 1 calculates raw probabilities from
              60+ features. Stage 2 integrates live market odds to find where the
              bookmakers have it wrong.
            </p>
            <p className="text-white font-medium">
              This isn't a tipster with opinions. It's an engine with equations.
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────── */}
      <section className="py-20 sm:py-28 bg-gray-800/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <p className="text-amber-400 font-semibold uppercase tracking-widest text-xs mb-4">
              Three Steps
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              How EquiNova works.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              {
                step: '01',
                icon: Database,
                title: 'We collect everything.',
                desc: 'Form history, speed figures, jockey and trainer stats by distance and course, track conditions, market movements. 60+ features per runner, refreshed daily across every UK and Irish meeting.',
              },
              {
                step: '02',
                icon: Brain,
                title: '4 models analyse independently.',
                desc: 'LightGBM, XGBoost, Random Forest, and the Benter conditional logit model each produce their own probability estimate. When multiple models agree on a pick, confidence is high.',
              },
              {
                step: '03',
                icon: Target,
                title: 'You get picks with exact stakes.',
                desc: 'Edge percentages, confidence scores, and Kelly criterion stakes sized to your bankroll. You see exactly why each pick was selected and how much to risk.',
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <motion.div
                key={step}
                variants={fadeUp}
                className="relative bg-gray-800/60 border border-gray-700/60 rounded-2xl p-8 group hover:border-amber-500/30 transition-colors"
              >
                <span className="text-5xl font-black text-gray-800 absolute top-6 right-6 group-hover:text-gray-700 transition-colors">
                  {step}
                </span>
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-5">
                  <Icon className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
                <p className="text-gray-400 leading-relaxed text-sm">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── AI INTELLIGENCE DEEP-DIVE ──────────── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center"
          >
            <motion.div variants={fadeUp} className="order-2 lg:order-1">
              <p className="text-amber-400 font-semibold uppercase tracking-widest text-xs mb-4">
                Pattern Intelligence
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 leading-tight">
                It doesn't just predict winners.
                <br />
                <span className="text-gray-500">It discovers profitable patterns.</span>
              </h2>
              <div className="space-y-4 text-gray-400 leading-relaxed">
                <p>
                  EquiNova's signal scanner tests thousands of 2-way and 3-way signal
                  combinations against historical race data. It finds combinations that
                  have consistently produced positive ROI&nbsp;&mdash; not once, but across
                  hundreds of bets.
                </p>
                <p>
                  Every pick you see has been matched against these proven patterns. You
                  get a trust score, the specific pattern that triggered, its historical
                  ROI, win count, and stability rating.
                </p>
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-5 mt-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-emerald-400">86</p>
                      <p className="text-xs text-gray-500 mt-1">Trust Score</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-400">+55.6%</p>
                      <p className="text-xs text-gray-500 mt-1">Pattern ROI</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">310</p>
                      <p className="text-xs text-gray-500 mt-1">Historical Bets</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="order-1 lg:order-2 flex justify-center lg:justify-end">
              <img
                src="/images/ai-intelligence.png"
                alt="EquiNova AI Intelligence — Trust score, bet decision, lifetime patterns"
                className="w-full max-w-sm rounded-2xl border border-gray-700/60 shadow-2xl shadow-black/50"
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── WHAT YOU GET ───────────────────────── */}
      <section className="py-20 sm:py-28 bg-gray-800/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <p className="text-amber-400 font-semibold uppercase tracking-widest text-xs mb-4">
              What's Included
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need. Nothing you don't.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[
              {
                icon: BarChart3,
                title: 'Daily race analysis',
                desc: 'Every UK and Irish meeting analysed automatically. Predictions ready before the first race.',
              },
              {
                icon: Brain,
                title: '4 independent ML models',
                desc: 'LightGBM, XGBoost, Random Forest, and Benter. Transparent confidence bars show where models agree.',
              },
              {
                icon: Target,
                title: 'Kelly criterion staking',
                desc: 'Exact stake sizes calculated for your bankroll. No guesswork on how much to risk.',
              },
              {
                icon: Activity,
                title: 'Live odds tracking',
                desc: 'Market movement detection shows which horses are steaming or drifting. Probabilities recalculate with late money.',
              },
              {
                icon: LineChart,
                title: 'AI signal scanner',
                desc: 'Discovers profitable 2-way and 3-way signal combinations backed by hundreds of historical bets.',
              },
              {
                icon: Shield,
                title: 'Full performance tracking',
                desc: 'Equity curves, ROI tracking, and model accuracy metrics. See exactly how the system performs over time.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <motion.div
                key={title}
                variants={fadeUp}
                className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-6 hover:border-amber-500/20 transition-colors"
              >
                <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────── */}
      <section id="pricing" className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <p className="text-amber-400 font-semibold uppercase tracking-widest text-xs mb-4">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Less than a pound a day.
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              One winning pick pays for your entire month. Choose the plan that works for you.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto"
          >
            <PricingCard
              title="Monthly"
              price="£29"
              period="/ month"
              features={[
                'Daily analysis for every UK & Irish meeting',
                '4 independent ML model predictions',
                'Kelly criterion stake sizing',
                'AI signal scanner with pattern matching',
                'Live odds tracking & market movement',
                'Full performance dashboard',
              ]}
              ctaLabel="Start Monthly"
              paypalLink="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-2B2362947U415753DNC2MBSA"
            />

            <PricingCard
              title="Yearly"
              price="£290"
              period="/ year"
              note="Save £58 — two months free"
              features={[
                'Everything in Monthly',
                'Daily analysis for every UK & Irish meeting',
                '4 independent ML model predictions',
                'Kelly criterion stake sizing',
                'AI signal scanner with pattern matching',
                'Full performance dashboard',
              ]}
              ctaLabel="Start Yearly"
              paypalLink="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-74P22738DL238650NNAOM7XI"
              highlighted
              badge="Best Value"
            />
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-gray-800/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center mb-14"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Questions? Answers.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="space-y-3"
          >
            {[
              {
                q: 'What exactly is EquiNova?',
                a: 'An AI platform that analyses every UK and Irish horse race using four independent machine learning models. It identifies value bets — where our models see a higher win probability than the market implies — and tells you exactly how much to stake using Kelly criterion sizing.',
              },
              {
                q: 'How is this different from a tipster?',
                a: 'Tipsters give you opinions. EquiNova gives you maths. Every prediction comes with transparent model probabilities, edge percentages, confidence scores, and pattern-matched historical data. You can see exactly why each pick was selected.',
              },
              {
                q: 'Do I need technical knowledge?',
                a: 'None. You log in, see today\'s races, and the picks are ready. Confidence bars, edge percentages, and stake sizes are all calculated for you. The AI does the heavy lifting.',
              },
              {
                q: 'What is the Benter model?',
                a: 'A two-stage system based on the work of William Benter, who used conditional logit models to extract over $1 billion from Hong Kong racing. Stage 1 calculates raw probabilities from 60+ horse features. Stage 2 integrates live market odds to find mispriced runners.',
              },
              {
                q: 'Can I cancel at any time?',
                a: 'Yes. Both monthly and yearly plans cancel instantly through PayPal. No contracts, no hidden fees, no questions asked.',
              },
              {
                q: 'How are stake sizes calculated?',
                a: 'Using the Kelly criterion — a mathematical formula that determines the optimal bet size based on your edge and bankroll. It maximises long-term growth while limiting downside risk. Stakes are rounded to the nearest 50p for practicality.',
              },
            ].map(({ q, a }) => (
              <motion.div key={q} variants={fadeUp}>
                <FAQItem question={q} answer={a} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────── */}
      <section className="relative py-28 sm:py-36 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/images/jockey-closeup.png"
            alt=""
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/70 via-gray-900/80 to-gray-900" />
          <div className="absolute inset-0 bg-gray-900/40" />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center"
        >
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-6">
            Your edge is waiting.
          </h2>
          <p className="text-xl text-gray-300 mb-10 max-w-xl mx-auto">
            Stop betting blind. Start betting with four machine learning models behind every pick.
          </p>
          <button
            onClick={scrollToPricing}
            className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-gray-900 px-10 py-4 rounded-xl font-bold text-lg transition-all duration-200 transform hover:scale-105 inline-flex items-center gap-3 shadow-lg shadow-amber-500/20"
          >
            Get Started Now
            <ArrowRight className="w-6 h-6" />
          </button>
        </motion.div>
      </section>

      {/* ── FOOTER ─────────────────────────────── */}
      <footer className="border-t border-white/5 py-10 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <img
              src="/images/eq-logo.png"
              alt="EquiNova"
              className="h-8 w-auto brightness-200"
            />
            <p className="text-gray-600 text-sm text-center">
              &copy; {new Date().getFullYear()} EquiNova. AI-powered horse racing intelligence.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
