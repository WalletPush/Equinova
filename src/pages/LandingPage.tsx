import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain,
  Trophy,
  Shield,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Target,
  Zap,
  TrendingUp,
  CheckCircle2,
  Database,
  LineChart,
  Cpu,
} from 'lucide-react'

/* ──────────────────────────────────────────────
   FAQ Accordion Item
   ────────────────────────────────────────────── */
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden transition-all duration-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-800/60 transition-colors"
      >
        <span className="text-lg font-medium text-white pr-4">{question}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-yellow-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-300 leading-relaxed animate-accordion-down">
          {answer}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   Pricing Card
   ────────────────────────────────────────────── */
function PricingCard({
  title,
  price,
  period,
  features,
  ctaLabel,
  paypalLink,
  highlighted = false,
  badge,
}: {
  title: string
  price: string
  period: string
  features: string[]
  ctaLabel: string
  paypalLink: string
  highlighted?: boolean
  badge?: string
}) {
  return (
    <div
      className={`relative rounded-2xl p-8 flex flex-col h-full transition-all duration-300 hover:scale-[1.02] ${
        highlighted
          ? 'bg-gradient-to-b from-yellow-500/10 to-gray-800/80 border-2 border-yellow-500/60 shadow-xl shadow-yellow-500/10'
          : 'bg-gray-800/80 border border-gray-700'
      }`}
    >
      {badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 text-sm font-bold px-4 py-1.5 rounded-full">
            {badge}
          </span>
        </div>
      )}
      <h4 className="text-lg font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h4>
      <div className="mb-6">
        <span className="text-4xl font-bold text-white">{price}</span>
        <span className="text-gray-400 ml-2">{period}</span>
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
            <span className="text-gray-300">{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={paypalLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full text-center py-3.5 rounded-xl font-semibold text-lg transition-all duration-200 ${
          highlighted
            ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900'
            : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
        }`}
      >
        {ctaLabel}
      </a>
      {title !== 'Limited Lifetime DEAL' && (
        <p className="text-center text-sm text-gray-500 mt-3">
          No contracts — cancel anytime
        </p>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   MAIN LANDING PAGE
   ────────────────────────────────────────────── */
export function LandingPage() {
  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ── HEADER ─────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/90 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/images/eq-logo.png"
              alt="EquiNova"
              className="h-10 w-auto brightness-200"
            />
          </Link>

          {/* Nav buttons */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-gray-300 hover:text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              Log In
            </Link>
            <button
              onClick={scrollToPricing}
              className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900 px-5 py-2 rounded-lg font-semibold transition-all duration-200 text-sm sm:text-base"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────── */}
      <section className="relative pt-24 min-h-[90vh] flex items-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/images/equinova-hero.png"
            alt=""
            className="w-full h-full object-cover object-center opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/70 via-gray-900/80 to-gray-900" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight mb-6">
            The Secret AI Code to
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500">
              Consistent Wins!
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            AI-powered horse racing analysis that transforms raw data into
            winning strategies.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={scrollToPricing}
              className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900 px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 transform hover:scale-105 inline-flex items-center justify-center gap-2"
            >
              Start Winning Today
              <ArrowRight className="w-5 h-5" />
            </button>
            <Link
              to="/login"
              className="border-2 border-gray-600 hover:border-yellow-400 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:bg-gray-800"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── THE SECRET IS IN THE DATA ──────────── */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div>
              <p className="text-yellow-400 font-semibold uppercase tracking-widest text-sm mb-3">
                Data-Driven Intelligence
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                The Secret is in the Data...
                <br />
                <span className="text-gray-400">Stop Guessing, Start Winning</span>
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Predict race outcomes with precision using EquiNova's AI-powered
                analysis.
              </p>
              <p className="text-gray-400 leading-relaxed">
                From horse speed figures to environmental factors, EquiNova's
                machine learning algorithms provide comprehensive insights,
                transforming raw data into strategic, data-backed predictions
                that give you the edge.
              </p>
            </div>
            {/* Image */}
            <div className="flex justify-center">
              <img
                src="/images/equinova-form.png"
                alt="EquiNova form analysis"
                className="max-w-md w-full rounded-2xl border border-gray-700 shadow-2xl shadow-black/40"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── PROFESSIONAL RACING INTELLIGENCE ──── */}
      <section className="py-20 bg-gray-800/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h3 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
            Professional Racing Intelligence
          </h3>
          <p className="text-gray-400 text-center max-w-2xl mx-auto mb-14">
            Cutting-edge tools designed for serious horse racing enthusiasts.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 text-center hover:border-blue-500/40 transition-colors group">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-4">
                AI-Powered Analysis
              </h4>
              <p className="text-gray-300 leading-relaxed">
                Multiple machine learning models analyze 60+ data points per
                horse, delivering predictions with transparent confidence
                indicators.
              </p>
            </div>

            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 text-center hover:border-green-500/40 transition-colors group">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-4">
                Comprehensive Data
              </h4>
              <p className="text-gray-300 leading-relaxed">
                Complete racing intelligence including form, speed figures,
                trainer/jockey statistics, and track conditions analysis.
              </p>
            </div>

            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 text-center hover:border-purple-500/40 transition-colors group">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-4">
                Professional Grade
              </h4>
              <p className="text-gray-300 leading-relaxed">
                Built for serious racing enthusiasts with institutional-grade
                security and professional design patterns.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRANSFORM YOUR APPROACH ────────────── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-yellow-400 font-semibold uppercase tracking-widest text-sm mb-3">
              A New Era
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Transform Your Approach
            </h2>
            <p className="text-gray-300 text-lg max-w-3xl mx-auto leading-relaxed">
              Once in a generation, a breakthrough technology redefines how we
              approach analysis. EquiNova's AI-powered system is that
              breakthrough, giving you the tools to stay one step ahead, make
              smarter, data-driven decisions, and unlock your full potential as
              a serious horse enthusiast.
            </p>
            <p className="text-gray-400 max-w-3xl mx-auto mt-4 leading-relaxed">
              This is your moment to embrace innovation, refine your strategy,
              and experience a more calculated way of predicting race outcomes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Card 1 */}
            <div className="bg-gradient-to-br from-gray-800/80 to-gray-800/40 border border-gray-700 rounded-2xl p-8 sm:p-10 hover:border-yellow-500/30 transition-colors">
              <div className="w-14 h-14 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-xl flex items-center justify-center mb-6">
                <Database className="w-7 h-7 text-gray-900" />
              </div>
              <h4 className="text-2xl font-bold text-white mb-2">
                Why Should You Join the EquiNova Community?
              </h4>
              <h5 className="text-yellow-400 font-semibold mb-4 text-lg">
                Harness Proven, Data-Backed Insights
              </h5>
              <p className="text-gray-300 leading-relaxed">
                Unlock the power of advanced AI analysis. With EquiNova, you'll
                use cutting-edge machine learning to gain clarity, confidence,
                and a data-driven approach to your strategy.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-gradient-to-br from-gray-800/80 to-gray-800/40 border border-gray-700 rounded-2xl p-8 sm:p-10 hover:border-yellow-500/30 transition-colors">
              <div className="w-14 h-14 bg-gradient-to-r from-green-400 to-emerald-500 rounded-xl flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-white mb-2">
                Achieve Consistent, Long-Term Success
              </h4>
              <h5 className="text-green-400 font-semibold mb-4 text-lg">
                Fast-Track Your Results
              </h5>
              <p className="text-gray-300 leading-relaxed">
                Fast-track your success with a system designed for long-term
                consistency. EquiNova helps you identify patterns and make
                smarter choices, so you can see real results faster than ever
                before.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY EQUINOVA IS DIFFERENT ──────────── */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        {/* Decorative background */}
        <div className="absolute -right-40 top-0 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-yellow-400 font-semibold uppercase tracking-widest text-sm mb-3">
              The EquiNova Edge
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              Why EquiNova Is Different
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Built on a Proven System */}
            <div className="relative bg-gradient-to-br from-gray-800 to-gray-800/60 border border-gray-700 rounded-2xl p-8 sm:p-10 overflow-hidden hover:border-yellow-500/30 transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-bl-full pointer-events-none" />
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center mb-6">
                  <Cpu className="w-7 h-7 text-gray-900" />
                </div>
                <h4 className="text-2xl font-bold text-white mb-2">
                  Built on a Proven System
                </h4>
                <p className="text-yellow-400 font-medium mb-4">
                  This isn't just some random betting tool.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  William Benter built a billion-dollar empire by developing the
                  world's most powerful betting algorithm, and EquiNova is built
                  on that same foundation. This is a proven system that's
                  engineered to win consistently — not by chance, but by design.
                </p>
              </div>
            </div>

            {/* Precision, Not Guesswork */}
            <div className="relative bg-gradient-to-br from-gray-800 to-gray-800/60 border border-gray-700 rounded-2xl p-8 sm:p-10 overflow-hidden hover:border-yellow-500/30 transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full pointer-events-none" />
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-xl flex items-center justify-center mb-6">
                  <Target className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-2xl font-bold text-white mb-2">
                  Precision, Not Guesswork
                </h4>
                <p className="text-blue-400 font-medium mb-4">
                  Clear, actionable insights that guide your every bet.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  The problem with betting today is that too many people are
                  relying on gut feelings or bad advice. EquiNova flips the
                  script. It turns all the data you're drowning in into
                  something useful — clear, actionable insights that guide your
                  every bet. You'll stop guessing and start winning.
                </p>
              </div>
            </div>
          </div>

          {/* AI Image */}
          <div className="mt-16 flex justify-center">
            <img
              src="/images/equinova-ai.png"
              alt="EquiNova AI Precision"
              className="max-w-2xl w-full rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────── */}
      <section id="pricing" className="py-20 sm:py-28 bg-gray-800/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-yellow-400 font-semibold uppercase tracking-widest text-sm mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold">
              Choose Your Plan
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              title="Monthly Plan"
              price="£29.00"
              period="Per Month"
              features={[
                'Access to 4 machine learning models',
                'The EquiNova Analyzer',
                'EquiNova Profit Builders',
                'The SafeBet System',
              ]}
              ctaLabel="Choose Monthly"
              paypalLink="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-2B2362947U415753DNC2MBSA"
            />

            <PricingCard
              title="Yearly Plan"
              price="£290.00"
              period="Per Year"
              features={[
                'Access to 4 machine learning models',
                'The EquiNova Analyzer',
                'EquiNova Profit Builders',
                'The SafeBet System',
              ]}
              ctaLabel="Choose Yearly"
              paypalLink="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-74P22738DL238650NNAOM7XI"
              highlighted
              badge="BEST VALUE"
            />

            <PricingCard
              title="Limited Lifetime DEAL"
              price="£290.00"
              period="ONE TIME"
              features={[
                'Access to 4 machine learning models',
                'The EquiNova Analyzer',
                'EquiNova Profit Builders',
                'The SafeBet System',
              ]}
              ctaLabel="Choose Lifetime"
              paypalLink="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=YOUR_LIFETIME_PLAN_ID"
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-yellow-400 font-semibold uppercase tracking-widest text-sm mb-3">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            <FAQItem
              question="What exactly is EquiNova?"
              answer="EquiNova is an AI-powered horse racing analysis platform that uses multiple machine learning models to analyze 60+ data points per horse. It transforms complex racing data into clear, actionable predictions — giving you a serious edge when it comes to understanding race outcomes."
            />
            <FAQItem
              question="How does the AI analysis work?"
              answer="Our system collects data on every runner — speed figures, form history, trainer/jockey stats, track conditions, and more. Multiple ML models process this data independently and produce predictions with transparent confidence scores, so you always know how strong each signal is."
            />
            <FAQItem
              question="Do I need any technical knowledge?"
              answer="Not at all. EquiNova is designed to be intuitive. The platform does all the heavy lifting — you simply log in, view today's races, and see exactly what our AI recommends. No spreadsheets, no manual calculations."
            />
            <FAQItem
              question="What is the SafeBet System?"
              answer="The SafeBet System is our proprietary risk-management framework that identifies lower-risk opportunities based on AI confidence thresholds. It's designed for users who prefer a more conservative, consistent approach to horse racing analysis."
            />
            <FAQItem
              question="Can I cancel my subscription at any time?"
              answer="Absolutely. Monthly and yearly plans can be cancelled at any time through PayPal — no contracts, no hidden fees, no questions asked."
            />
            <FAQItem
              question="What makes EquiNova different from tipster services?"
              answer="Tipster services rely on individual opinion. EquiNova relies on data. Our machine learning models are built on the same principles used by professional quantitative analysts — processing thousands of data points to find patterns that humans simply can't see."
            />
            <FAQItem
              question="Is there a free trial?"
              answer="We don't offer a free trial at this time, but our monthly plan is just £29 with no commitment — you can cancel anytime if it's not for you."
            />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────── */}
      <section className="py-20 bg-gradient-to-b from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h3 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Stop Guessing and Start Winning?
          </h3>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            Join the EquiNova community and let data-driven AI give you the edge.
          </p>
          <button
            onClick={scrollToPricing}
            className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900 px-10 py-4 rounded-xl font-bold text-xl transition-all duration-200 transform hover:scale-105 inline-flex items-center gap-3"
          >
            Get Started Now
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────── */}
      <footer className="border-t border-gray-800 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img
                src="/images/eq-logo.png"
                alt="EquiNova"
                className="h-8 w-auto brightness-200"
              />
            </div>
            <p className="text-gray-500 text-sm text-center">
              © {new Date().getFullYear()} EquiNova. Professional horse racing
              intelligence platform.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-400">
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
